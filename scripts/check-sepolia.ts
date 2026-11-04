import { network } from "hardhat";
import { preflight } from "./preflight.js";

/**
 * Dry run: shows which RPC URL / deployer Hardhat will use and where each value
 * comes from (env var vs keystore). Sends no transactions.
 *
 *   npm run check:sepolia
 */
async function main() {
  const connection = await network.create();
  await preflight(connection);
  console.log("Ready to deploy:  npm run deploy:sepolia");
}

main().catch((error) => {
  console.error(error?.name === "PreflightError" ? error.message : error);
  process.exitCode = 1;
});
