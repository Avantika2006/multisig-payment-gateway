
import { expect } from "chai";
import { network } from "hardhat";

describe("Multi-Signature Payment Gateway", function () {

    // Shared Hardhat 3 connection
    async function getEthers() {
        const connection = await network.connect();
        return connection.ethers;
    }

    // TEST 1: MockStablecoin
    describe("MockStablecoin", function () {

        it("should assign initial tokens to the deployer", async function () {
            const ethers = await getEthers();
            const [owner] = await ethers.getSigners();

            const token = await ethers.deployContract("MockStablecoin");
            await token.waitForDeployment();

            const balance = await token.balanceOf(owner.address);

            expect(balance).to.equal(1_000_000n * 10n ** 6n);
        });

        it("should transfer tokens between users", async function () {
            const ethers = await getEthers();
            const [owner, user] = await ethers.getSigners();

            const token = await ethers.deployContract("MockStablecoin");
            await token.waitForDeployment();

            const amount = 1000n * 10n ** 6n;

            await token.transfer(user.address, amount);

            expect(await token.balanceOf(user.address)).to.equal(amount);
        });
    });


    // TEST 2: MerchantPayment
    describe("MerchantPayment", function () {

        it("should allow a customer to pay an invoice", async function () {
            const ethers = await getEthers();
            const [deployer, merchant, customer] = await ethers.getSigners();

            const token = await ethers.deployContract("MockStablecoin");
            await token.waitForDeployment();

            const gateway = await ethers.deployContract(
                "MerchantPayment",
                [await token.getAddress()]
            );
            await gateway.waitForDeployment();

            const amount = 100n * 10n ** 6n;

            // Give tokens to customer
            await token.transfer(customer.address, amount);

            // Merchant creates invoice
            await gateway.connect(merchant).createInvoice(amount);

            // Customer approves gateway
            await token.connect(customer).approve(
                await gateway.getAddress(),
                amount
            );

            // Customer pays invoice
            await gateway.connect(customer).payInvoice(0);

            // Verify merchant received payment
            expect(await token.balanceOf(merchant.address)).to.equal(amount);
        });
    });


    // TEST 3: MultiSigWallet
    describe("MultiSigWallet", function () {


        it("should execute a transaction after 2 approvals", async function () {
            const ethers = await getEthers();
            const [owner1, owner2, owner3, recipient] =
                await ethers.getSigners();

            const owners = [
                owner1.address,
                owner2.address,
                owner3.address
            ];

            const wallet = await ethers.deployContract(
                "MultiSigWallet",
                [owners, 2]
            );

            await wallet.waitForDeployment();

            const amount = ethers.parseEther("1");

            // Fund the multisig wallet
            await owner1.sendTransaction({
                to: await wallet.getAddress(),
                value: amount
            });

            // Submit transaction
            await wallet.connect(owner1).submitTransaction(
                recipient.address,
                amount,
                "0x"
            );

            // First approval
            await wallet.connect(owner1).approveTransaction(0);

            // Second approval
            await wallet.connect(owner2).approveTransaction(0);

            // Record recipient's balance before execution
            const balanceBefore = await ethers.provider.getBalance(
                recipient.address
            );

            // Execute transaction ONLY ONCE
            await wallet.connect(owner3).executeTransaction(0);

            // Record recipient's balance after execution
            const balanceAfter = await ethers.provider.getBalance(
                recipient.address
            );

            // Verify the received amount
            expect(balanceAfter - balanceBefore).to.equal(amount);

            // Verify transaction status
            const transaction = await wallet.getTransaction(0);

            expect(transaction.executed).to.equal(true);
            expect(transaction.approvalCount).to.equal(2);
        });



        it("should reject execution without enough approvals", async function () {
            const ethers = await getEthers();
            const [owner1, owner2, owner3, recipient] =
                await ethers.getSigners();

            const wallet = await ethers.deployContract(
                "MultiSigWallet",
                [[owner1.address, owner2.address, owner3.address], 2]
            );

            await wallet.waitForDeployment();

            const amount = ethers.parseEther("1");

            await owner1.sendTransaction({
                to: await wallet.getAddress(),
                value: amount
            });

            await wallet.connect(owner1).submitTransaction(
                recipient.address,
                amount,
                "0x"
            );

            // Only one approval
            await wallet.connect(owner1).approveTransaction(0);

            // Execution must fail
            await expect(
                wallet.connect(owner1).executeTransaction(0)
            ).to.be.revertedWith("Not enough approvals");
        });


        it("should reject duplicate approvals", async function () {
            const ethers = await getEthers();
            const [owner1, owner2] = await ethers.getSigners();

            const wallet = await ethers.deployContract(
                "MultiSigWallet",
                [[owner1.address, owner2.address], 2]
            );

            await wallet.waitForDeployment();

            await wallet.connect(owner1).submitTransaction(
                owner2.address,
                0,
                "0x"
            );

            await wallet.connect(owner1).approveTransaction(0);

            // Duplicate approval must fail
            await expect(
                wallet.connect(owner1).approveTransaction(0)
            ).to.be.revertedWith("Already approved");
        });

    });

});
