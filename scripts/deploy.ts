
import { network } from "hardhat";

async function main() {
  const connection = await network.connect();
  const ethers = connection.ethers;

  const [deployer, owner1, owner2] = await ethers.getSigners();

  console.log("Deploying contracts...");
  console.log("Deployer:", deployer.address);

  // 1. Deploy MockStablecoin
  const Token = await ethers.getContractFactory("MockStablecoin");
  const token = await Token.deploy();
  await token.waitForDeployment();

  console.log("MockStablecoin:", await token.getAddress());

  // 2. Deploy MerchantPayment
  const Payment = await ethers.getContractFactory("MerchantPayment");
  const payment = await Payment.deploy(await token.getAddress());
  await payment.waitForDeployment();

  console.log("MerchantPayment:", await payment.getAddress());

  // 3. Deploy MultiSigWallet (2 of 3 owners)
  const owners = [
    deployer.address,
    owner1.address,
    owner2.address,
  ];

  const MultiSig = await ethers.getContractFactory("MultiSigWallet");
  const multisig = await MultiSig.deploy(owners, 2);
  await multisig.waitForDeployment();

  console.log("MultiSigWallet:", await multisig.getAddress());

  console.log("\nAll contracts deployed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
