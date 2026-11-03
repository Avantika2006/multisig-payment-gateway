import { network } from "hardhat";

/**
 * End-to-end demo on a LOCAL chain. Uses the contracts already deployed by
 * scripts/deploy.ts (reads deployments/<network>.json), so the backend and the
 * frontend see every step.
 *
 *   npx hardhat run scripts/demo.ts --network localhost
 *
 * Story:
 *   1. The multi-sig (2-of-3) creates a 500 mUSDC invoice
 *   2. A customer pays it            -> receipt event + webhook
 *   3. The customer asks for a refund -> multi-sig proposal
 *   4. One owner approving is NOT enough (execute reverts)
 *   5. The second owner approves -> refund executes
 *   6. A non-owner tries to approve  -> rejected
 *   7. A new refund proposal is left half-approved so the UI has a pending item
 *
 * It also prints a gas table you can paste into the report.
 */
import fs from "node:fs";

const USDC = (n: number) => BigInt(n) * 10n ** 6n;
const gasRows: [string, bigint][] = [];

async function main() {
  const { ethers, networkName } = await network.create();
  const file = `deployments/${networkName}.json`;
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found. Run scripts/deploy.ts on this network first.`);
  }
  const d = JSON.parse(fs.readFileSync(file, "utf8"));

  const signers = await ethers.getSigners();
  const byAddr = new Map(signers.map((s) => [s.address.toLowerCase(), s]));
  const owners = d.multisig.owners.map((a: string) => byAddr.get(a.toLowerCase())!);
  if (owners.some((o: unknown) => !o)) {
    throw new Error("Multi-sig owners are not local signers; the demo needs a local chain.");
  }
  const [o1, o2, o3] = owners;
  const customer = signers[4];
  const outsider = signers[5];

  const token = await ethers.getContractAt("MockStablecoin", d.contracts.MockStablecoin);
  const gateway = await ethers.getContractAt("MerchantPayment", d.contracts.MerchantPayment);
  const wallet = await ethers.getContractAt("MultiSigWallet", d.contracts.MultiSigWallet);
  const walletAddr = d.contracts.MultiSigWallet as string;

  const track = async (label: string, txPromise: Promise<any>) => {
    const tx = await txPromise;
    const rc = await tx.wait();
    gasRows.push([label, rc.gasUsed]);
    return rc;
  };
  const step = (n: number, msg: string) => console.log(`\n[${n}] ${msg}`);

  // make sure the customer has funds (deploy.ts funds them, but be safe)
  if ((await token.balanceOf(customer.address)) < USDC(1000)) {
    await token.transfer(customer.address, USDC(1000));
  }

  // 1. Multi-sig creates an invoice
  step(1, "Multi-sig creates a 500 mUSDC invoice (2-of-3)");
  const createData = gateway.interface.encodeFunctionData("createInvoice", [USDC(500)]);
  await track("submitTransaction (createInvoice)",
    wallet.connect(o1).submitTransaction(d.contracts.MerchantPayment, 0, createData));
  let id = (await wallet.getTransactionCount()) - 1n;
  await track("approveTransaction", wallet.connect(o1).approveTransaction(id));
  await track("approveTransaction", wallet.connect(o2).approveTransaction(id));
  await track("executeTransaction (createInvoice)", wallet.connect(o3).executeTransaction(id));
  const invoiceId = (await gateway.nextInvoiceId()) - 1n;
  console.log(`    invoice #${invoiceId} created, merchant = multi-sig ${walletAddr}`);

  // 2. Customer pays
  step(2, "Customer pays the invoice");
  await track("token.approve", token.connect(customer).approve(d.contracts.MerchantPayment, USDC(500)));
  await track("payInvoice", gateway.connect(customer).payInvoice(invoiceId));
  console.log(`    multi-sig balance: ${ethers.formatUnits(await token.balanceOf(walletAddr), 6)} mUSDC`);

  // 3-5. Refund needing 2 approvals
  step(3, "Refund of 200 mUSDC is proposed");
  const refundData = token.interface.encodeFunctionData("transfer", [customer.address, USDC(200)]);
  await track("submitTransaction (refund)",
    wallet.connect(o1).submitTransaction(d.contracts.MockStablecoin, 0, refundData));
  id = (await wallet.getTransactionCount()) - 1n;
  await track("approveTransaction", wallet.connect(o1).approveTransaction(id));

  step(4, "Only 1 of 2 approvals -> execute must fail");
  try {
    await wallet.connect(o1).executeTransaction(id);
    throw new Error("expected revert");
  } catch (e: any) {
    console.log(`    reverted as expected: ${e.shortMessage ?? e.message}`);
  }

  step(5, "Second owner approves -> refund executes");
  await track("approveTransaction", wallet.connect(o2).approveTransaction(id));
  await track("executeTransaction (refund)", wallet.connect(o3).executeTransaction(id));
  console.log(`    multi-sig balance: ${ethers.formatUnits(await token.balanceOf(walletAddr), 6)} mUSDC`);

  // 6. Non-owner
  step(6, "A non-owner tries to approve");
  try {
    await wallet.connect(outsider).approveTransaction(id);
  } catch (e: any) {
    console.log(`    rejected: ${e.shortMessage ?? e.message}`);
  }

  // 7. Leave a pending proposal for the UI
  step(7, "Leaving a half-approved 50 mUSDC refund pending for the UI");
  const pendingData = token.interface.encodeFunctionData("transfer", [customer.address, USDC(50)]);
  await wallet.connect(o1).submitTransaction(d.contracts.MockStablecoin, 0, pendingData);
  id = (await wallet.getTransactionCount()) - 1n;
  await wallet.connect(o1).approveTransaction(id);
  console.log(`    proposal #${id} waiting for 1 more approval`);

  console.log("\nGas used (paste into the report's Table 8):");
  console.log("| Operation | Gas |\n|---|---|");
  for (const [label, gas] of gasRows) console.log(`| ${label} | ${gas.toLocaleString()} |`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
