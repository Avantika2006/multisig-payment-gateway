import { expect } from "chai";
import { network } from "hardhat";

/**
 * Extended test-suite: edge cases + the full "multi-sig as merchant" flow.
 *
 * Design note: MerchantPayment pays whoever called createInvoice(). If that
 * caller is the MultiSigWallet contract, every incoming payment lands in the
 * multi-sig, and every refund / withdrawal must be approved by M of N owners.
 */
describe("Gateway - extended tests", function () {
  const USDC = (n: number) => BigInt(n) * 10n ** 6n;

  async function setup() {
    const { ethers } = await network.create();
    const [deployer, owner1, owner2, owner3, customer, outsider] =
      await ethers.getSigners();

    const token = await ethers.deployContract("MockStablecoin");
    const gateway = await ethers.deployContract("MerchantPayment", [
      await token.getAddress(),
    ]);
    const wallet = await ethers.deployContract("MultiSigWallet", [
      [owner1.address, owner2.address, owner3.address],
      2,
    ]);

    // Give the customer some mUSDC
    await token.transfer(customer.address, USDC(10_000));

    return {
      ethers, deployer, owner1, owner2, owner3, customer, outsider,
      token, gateway, wallet,
    };
  }

  // ───────────────────────── MerchantPayment ─────────────────────────
  describe("MerchantPayment - edge cases", function () {
    it("emits InvoiceCreated with the right arguments", async function () {
      const { gateway, owner1 } = await setup();
      await expect(gateway.connect(owner1).createInvoice(USDC(50)))
        .to.emit(gateway, "InvoiceCreated")
        .withArgs(0n, owner1.address, USDC(50));
    });

    it("increments invoice ids", async function () {
      const { gateway, owner1 } = await setup();
      await gateway.connect(owner1).createInvoice(USDC(1));
      await gateway.connect(owner1).createInvoice(USDC(2));
      expect(await gateway.nextInvoiceId()).to.equal(2n);
      expect((await gateway.invoices(1)).amount).to.equal(USDC(2));
    });

    it("rejects a zero-amount invoice", async function () {
      const { gateway, owner1 } = await setup();
      await expect(
        gateway.connect(owner1).createInvoice(0)
      ).to.be.revertedWith("Amount must be greater than zero");
    });

    it("emits PaymentReceived and marks the invoice as paid", async function () {
      const { gateway, token, owner1, customer } = await setup();
      await gateway.connect(owner1).createInvoice(USDC(100));
      await token.connect(customer).approve(await gateway.getAddress(), USDC(100));

      await expect(gateway.connect(customer).payInvoice(0))
        .to.emit(gateway, "PaymentReceived")
        .withArgs(0n, customer.address, owner1.address, USDC(100));

      expect((await gateway.invoices(0)).paid).to.equal(true);
    });

    it("rejects paying a non-existent invoice", async function () {
      const { gateway, customer } = await setup();
      await expect(
        gateway.connect(customer).payInvoice(99)
      ).to.be.revertedWith("Invoice does not exist");
    });

    it("rejects paying the same invoice twice", async function () {
      const { gateway, token, owner1, customer } = await setup();
      await gateway.connect(owner1).createInvoice(USDC(10));
      await token.connect(customer).approve(await gateway.getAddress(), USDC(20));
      await gateway.connect(customer).payInvoice(0);
      await expect(
        gateway.connect(customer).payInvoice(0)
      ).to.be.revertedWith("Invoice already paid");
    });

    it("rejects a merchant paying their own invoice", async function () {
      const { gateway, owner1 } = await setup();
      await gateway.connect(owner1).createInvoice(USDC(10));
      await expect(
        gateway.connect(owner1).payInvoice(0)
      ).to.be.revertedWith("Merchant cannot pay own invoice");
    });

    it("rejects payment without enough allowance", async function () {
      const { gateway, owner1, customer } = await setup();
      await gateway.connect(owner1).createInvoice(USDC(10));
      await expect(
        gateway.connect(customer).payInvoice(0)
      ).to.be.revertedWith("Insufficient allowance");
    });

    it("rejects payment without enough token balance", async function () {
      const { gateway, token, owner1, outsider } = await setup();
      await gateway.connect(owner1).createInvoice(USDC(10));
      await token.connect(outsider).approve(await gateway.getAddress(), USDC(10));
      await expect(
        gateway.connect(outsider).payInvoice(0)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("rejects a zero-address token in the constructor", async function () {
      const { ethers } = await setup();
      await expect(
        ethers.deployContract("MerchantPayment", [ethers.ZeroAddress])
      ).to.be.revertedWith("Invalid token address");
    });
  });

  // ───────────────────────── MultiSigWallet ─────────────────────────
  describe("MultiSigWallet - validation & access control", function () {
    it("requires at least 2 owners", async function () {
      const { ethers, owner1 } = await setup();
      await expect(
        ethers.deployContract("MultiSigWallet", [[owner1.address], 1])
      ).to.be.revertedWith("At least 2 owners required");
    });

    it("rejects an invalid threshold (0 or > owners)", async function () {
      const { ethers, owner1, owner2 } = await setup();
      const owners = [owner1.address, owner2.address];
      await expect(
        ethers.deployContract("MultiSigWallet", [owners, 0])
      ).to.be.revertedWith("Invalid approval threshold");
      await expect(
        ethers.deployContract("MultiSigWallet", [owners, 3])
      ).to.be.revertedWith("Invalid approval threshold");
    });

    it("rejects duplicate owners and the zero address", async function () {
      const { ethers, owner1, owner2 } = await setup();
      await expect(
        ethers.deployContract("MultiSigWallet", [
          [owner1.address, owner2.address, owner1.address], 2,
        ])
      ).to.be.revertedWith("Duplicate owner");
      await expect(
        ethers.deployContract("MultiSigWallet", [
          [owner1.address, ethers.ZeroAddress], 2,
        ])
      ).to.be.revertedWith("Invalid owner address");
    });

    it("blocks non-owners from submit / approve / execute", async function () {
      const { wallet, owner1, outsider } = await setup();
      await wallet.connect(owner1).submitTransaction(outsider.address, 0, "0x");

      await expect(
        wallet.connect(outsider).submitTransaction(outsider.address, 0, "0x")
      ).to.be.revertedWith("Not an authorized owner");
      await expect(
        wallet.connect(outsider).approveTransaction(0)
      ).to.be.revertedWith("Not an authorized owner");
      await expect(
        wallet.connect(outsider).executeTransaction(0)
      ).to.be.revertedWith("Not an authorized owner");
    });

    it("rejects actions on a non-existent transaction", async function () {
      const { wallet, owner1 } = await setup();
      await expect(
        wallet.connect(owner1).approveTransaction(7)
      ).to.be.revertedWith("Transaction does not exist");
      await expect(
        wallet.connect(owner1).executeTransaction(7)
      ).to.be.revertedWith("Transaction does not exist");
    });

    it("rejects a zero-address recipient", async function () {
      const { ethers, wallet, owner1 } = await setup();
      await expect(
        wallet.connect(owner1).submitTransaction(ethers.ZeroAddress, 0, "0x")
      ).to.be.revertedWith("Invalid recipient");
    });

    it("cannot execute the same transaction twice", async function () {
      const { wallet, owner1, owner2, outsider } = await setup();
      await wallet.connect(owner1).submitTransaction(outsider.address, 0, "0x");
      await wallet.connect(owner1).approveTransaction(0);
      await wallet.connect(owner2).approveTransaction(0);
      await wallet.connect(owner1).executeTransaction(0);
      await expect(
        wallet.connect(owner1).executeTransaction(0)
      ).to.be.revertedWith("Already executed");
      await expect(
        wallet.connect(owner2).approveTransaction(0)
      ).to.be.revertedWith("Already executed");
    });

    it("reverts when the underlying call fails (e.g. no ETH)", async function () {
      const { ethers, wallet, owner1, owner2, outsider } = await setup();
      await wallet
        .connect(owner1)
        .submitTransaction(outsider.address, ethers.parseEther("5"), "0x");
      await wallet.connect(owner1).approveTransaction(0);
      await wallet.connect(owner2).approveTransaction(0);
      await expect(
        wallet.connect(owner1).executeTransaction(0)
      ).to.be.revertedWith("Transaction execution failed");
    });

    it("emits Deposit, Submitted, Approved and Executed events", async function () {
      const { ethers, wallet, owner1, owner2, outsider } = await setup();
      const walletAddr = await wallet.getAddress();
      const one = ethers.parseEther("1");

      await expect(owner1.sendTransaction({ to: walletAddr, value: one }))
        .to.emit(wallet, "Deposit")
        .withArgs(owner1.address, one);

      await expect(
        wallet.connect(owner1).submitTransaction(outsider.address, one, "0x")
      )
        .to.emit(wallet, "TransactionSubmitted")
        .withArgs(0n, owner1.address, outsider.address, one);

      await expect(wallet.connect(owner1).approveTransaction(0))
        .to.emit(wallet, "TransactionApproved")
        .withArgs(0n, owner1.address);
      await wallet.connect(owner2).approveTransaction(0);

      await expect(wallet.connect(owner2).executeTransaction(0))
        .to.emit(wallet, "TransactionExecuted")
        .withArgs(0n);
    });

    it("exposes owners and the threshold", async function () {
      const { wallet, owner1, owner2, owner3 } = await setup();
      expect(await wallet.getOwners()).to.deep.equal([
        owner1.address, owner2.address, owner3.address,
      ]);
      expect(await wallet.requiredApprovals()).to.equal(2n);
    });
  });

  // ─────────────── Integration: multi-sig acting as the merchant ───────────────
  describe("Integration - multi-sig as merchant (invoice -> payment -> refund)", function () {
    /** submit -> approve x N -> execute, all through the multi-sig */
    async function runThroughMultisig(
      wallet: any, submitter: any, approvers: any[], executor: any,
      to: string, data: string, value = 0n
    ) {
      await wallet.connect(submitter).submitTransaction(to, value, data);
      const id = (await wallet.getTransactionCount()) - 1n;
      for (const a of approvers) await wallet.connect(a).approveTransaction(id);
      await wallet.connect(executor).executeTransaction(id);
      return id;
    }

    it("multi-sig creates an invoice, customer pays it, funds land in the multi-sig", async function () {
      const { token, gateway, wallet, owner1, owner2, owner3, customer } = await setup();
      const walletAddr = await wallet.getAddress();

      // 1. Merchant side: 2-of-3 owners approve createInvoice()
      const data = gateway.interface.encodeFunctionData("createInvoice", [USDC(500)]);
      await runThroughMultisig(
        wallet, owner1, [owner1, owner2], owner3, await gateway.getAddress(), data
      );

      const invoice = await gateway.invoices(0);
      expect(invoice.merchant).to.equal(walletAddr);
      expect(invoice.amount).to.equal(USDC(500));

      // 2. Customer pays
      await token.connect(customer).approve(await gateway.getAddress(), USDC(500));
      await gateway.connect(customer).payInvoice(0);

      // 3. Money is held by the multi-sig, not by any single person
      expect(await token.balanceOf(walletAddr)).to.equal(USDC(500));
    });

    it("a refund needs 2-of-3 approvals before the customer gets the money back", async function () {
      const { token, gateway, wallet, owner1, owner2, owner3, customer } = await setup();
      const walletAddr = await wallet.getAddress();

      await runThroughMultisig(
        wallet, owner1, [owner1, owner2], owner3, await gateway.getAddress(),
        gateway.interface.encodeFunctionData("createInvoice", [USDC(500)])
      );
      await token.connect(customer).approve(await gateway.getAddress(), USDC(500));
      await gateway.connect(customer).payInvoice(0);

      const before = await token.balanceOf(customer.address);
      const refundData = token.interface.encodeFunctionData("transfer", [
        customer.address, USDC(500),
      ]);

      // propose the refund + one approval
      await wallet.connect(owner1).submitTransaction(
        await token.getAddress(), 0, refundData
      );
      const id = (await wallet.getTransactionCount()) - 1n;
      await wallet.connect(owner1).approveTransaction(id);

      // not enough approvals yet
      await expect(
        wallet.connect(owner1).executeTransaction(id)
      ).to.be.revertedWith("Not enough approvals");
      expect(await token.balanceOf(walletAddr)).to.equal(USDC(500));

      // second approval -> executes
      await wallet.connect(owner2).approveTransaction(id);
      await wallet.connect(owner3).executeTransaction(id);

      expect(await token.balanceOf(customer.address)).to.equal(before + USDC(500));
      expect(await token.balanceOf(walletAddr)).to.equal(0n);
    });

    it("supports a partial refund and keeps the rest in the multi-sig", async function () {
      const { token, gateway, wallet, owner1, owner2, owner3, customer } = await setup();
      const walletAddr = await wallet.getAddress();

      await runThroughMultisig(
        wallet, owner1, [owner1, owner2], owner3, await gateway.getAddress(),
        gateway.interface.encodeFunctionData("createInvoice", [USDC(200)])
      );
      await token.connect(customer).approve(await gateway.getAddress(), USDC(200));
      await gateway.connect(customer).payInvoice(0);

      await runThroughMultisig(
        wallet, owner2, [owner2, owner3], owner1, await token.getAddress(),
        token.interface.encodeFunctionData("transfer", [customer.address, USDC(50)])
      );

      expect(await token.balanceOf(walletAddr)).to.equal(USDC(150));
    });

    it("a single compromised owner cannot drain the funds", async function () {
      const { token, gateway, wallet, owner1, owner2, owner3, customer, outsider } =
        await setup();
      const walletAddr = await wallet.getAddress();

      await runThroughMultisig(
        wallet, owner1, [owner1, owner2], owner3, await gateway.getAddress(),
        gateway.interface.encodeFunctionData("createInvoice", [USDC(300)])
      );
      await token.connect(customer).approve(await gateway.getAddress(), USDC(300));
      await gateway.connect(customer).payInvoice(0);

      // attacker = owner1 tries to send everything to himself
      await wallet.connect(owner1).submitTransaction(
        await token.getAddress(), 0,
        token.interface.encodeFunctionData("transfer", [outsider.address, USDC(300)])
      );
      const id = (await wallet.getTransactionCount()) - 1n;
      await wallet.connect(owner1).approveTransaction(id);

      await expect(
        wallet.connect(owner1).executeTransaction(id)
      ).to.be.revertedWith("Not enough approvals");
      expect(await token.balanceOf(walletAddr)).to.equal(USDC(300));
      expect(await token.balanceOf(outsider.address)).to.equal(0n);
    });
  });
});
