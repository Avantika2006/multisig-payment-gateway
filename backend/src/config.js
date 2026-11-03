import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = path.resolve(__dirname, "..");
export const ROOT_DIR = path.resolve(BACKEND_DIR, "..");

const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

const network = process.env.NETWORK || "localhost";
const deploymentFile =
  process.env.DEPLOYMENT_FILE || path.join(ROOT_DIR, "deployments", `${network}.json`);

if (!fs.existsSync(deploymentFile)) {
  console.error(
    `\nDeployment file not found: ${deploymentFile}\n` +
      `Run the deploy script first, e.g.\n` +
      `  npx hardhat run scripts/deploy.ts --network ${network}\n`
  );
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

export const config = {
  network,
  chainId: deployment.chainId,
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  confirmations: num(process.env.CONFIRMATIONS, 0),
  pollIntervalMs: num(process.env.POLL_INTERVAL_MS, 2000),
  blockChunk: num(process.env.BLOCK_CHUNK, 2000),
  startBlock: num(process.env.START_BLOCK, deployment.startBlock ?? 0),
  port: num(process.env.PORT, 4001),
  explorerUrl: (process.env.EXPLORER_URL || "").replace(/\/$/, ""),
  addresses: deployment.contracts,
  multisig: deployment.multisig,
  webhook: {
    url: process.env.WEBHOOK_URL || "",
    secret: process.env.WEBHOOK_SECRET || "dev-secret",
    maxAttempts: num(process.env.WEBHOOK_MAX_ATTEMPTS, 6),
    timeoutMs: 5000,
  },
  dataFile: process.env.DATA_FILE || path.join(BACKEND_DIR, "data", `db-${network}.json`),
  tokenDecimals: 6,
  tokenSymbol: "mUSDC",
};
