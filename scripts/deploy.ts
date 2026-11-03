import fs from "node:fs";
import path from "node:path";
import { network } from "hardhat";

/**
 * Deploys MockStablecoin, MerchantPayment and a 2-of-3 MultiSigWallet, then:
 *   1. writes deployments/<network>.json   (read by the backend + demo script)
 *   2. rewrites frontend/contractAddresses.ts so the UI points at the new contracts
 *
 * Local:   npx hardhat node                                  (terminal 1)
 *          npx hardhat run scripts/deploy.ts --network localhost
 * Sepolia: npx hardhat run scripts/deploy.ts --network sepolia
 */
async function main() {
  const connection = await network.create();
  const { ethers, networkName } = connection;

  const signers = await ethers.getSigners();
  const [deployer, owner1, owner2] = signers;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const startBlock = await ethers.provider.getBlockNumber();

  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}\n`);

  // 1. MockStablecoin (6 decimals, 1,000,000 mUSDC minted to the deployer)
  const token = await ethers.deployContract("MockStablecoin");
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("MockStablecoin :", tokenAddr);

  // 2. MerchantPayment (invoices + payments in mUSDC)
  const payment = await ethers.deployContract("MerchantPayment", [tokenAddr]);
  await payment.waitForDeployment();
  const paymentAddr = await payment.getAddress();
  console.log("MerchantPayment:", paymentAddr);

  // 3. MultiSigWallet (2-of-3). On a real network pass your own owner
  //    addresses via MULTISIG_OWNERS="0xA,0xB,0xC" in the environment.
  const envOwners = process.env.MULTISIG_OWNERS?.split(",").map((s) => s.trim());
  const owners = envOwners && envOwners.length >= 2
    ? envOwners
    : [deployer.address, owner1.address, owner2.address];
  const required = Number(process.env.MULTISIG_REQUIRED ?? 2);

  const multisig = await ethers.deployContract("MultiSigWallet", [owners, required]);
  await multisig.waitForDeployment();
  const multisigAddr = await multisig.getAddress();
  console.log(`MultiSigWallet : ${multisigAddr}  (${required}-of-${owners.length})`);

  // 4. Local convenience: give the next few test accounts 10,000 mUSDC
  const isLocal = ["localhost", "hardhatMainnet", "hardhatOp"].includes(networkName);
  if (isLocal) {
    for (const s of signers.slice(1, 6)) {
      await (await token.transfer(s.address, 10_000n * 10n ** 6n)).wait();
    }
    console.log("\nFunded 5 test accounts with 10,000 mUSDC each.");
  }

  // 4b. Any network: send 10,000 mUSDC to extra wallets (e.g. your Sepolia
  //     customer account): FUND_ADDRESSES="0xCustomer1,0xCustomer2"
  const fundList = (process.env.FUND_ADDRESSES ?? "")
    .split(",").map((a) => a.trim()).filter(Boolean);
  for (const addr of fundList) {
    await (await token.transfer(addr, 10_000n * 10n ** 6n)).wait();
    console.log(`Sent 10,000 mUSDC to ${addr}`);
  }

  // 5. Persist addresses
  const deployment = {
    network: networkName,
    chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    startBlock,
    contracts: {
      MockStablecoin: tokenAddr,
      MerchantPayment: paymentAddr,
      MultiSigWallet: multisigAddr,
    },
    multisig: { owners, required },
  };

  const dir = path.resolve("deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${networkName}.json`);
  fs.writeFileSync(file, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`\nSaved ${path.relative(process.cwd(), file)}`);

  const frontendFile = path.resolve("frontend", "contractAddresses.ts");
  if (fs.existsSync(path.dirname(frontendFile))) {
    fs.writeFileSync(
      frontendFile,
      [
        "export const CONTRACT_ADDRESSES = {",
        `  MOCK_STABLECOIN: "${tokenAddr}",`,
        `  MERCHANT_PAYMENT: "${paymentAddr}",`,
        `  MULTISIG_WALLET: "${multisigAddr}",`,
        `  START_BLOCK: ${startBlock}, // first block to scan for events (keeps Sepolia queries fast)`,
        "};",
        "",
      ].join("\n")
    );
    console.log("Updated frontend/contractAddresses.ts");
  }

  console.log("\nAll contracts deployed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
