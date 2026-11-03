import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "./config.js";

/**
 * Loads a contract ABI from the Hardhat artifacts (preferred) or from the
 * copy the frontend keeps in frontend/src/contracts.
 */
export function loadAbi(name) {
  const candidates = [
    path.join(ROOT_DIR, "artifacts", "contracts", `${name}.sol`, `${name}.json`),
    path.join(ROOT_DIR, "frontend", "src", "contracts", `${name}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      return json.abi ?? json;
    }
  }
  throw new Error(
    `ABI for ${name} not found. Run "npx hardhat compile" in the project root first.`
  );
}
