import fs from "node:fs";
import hre from "hardhat";
import { HDNodeWallet, Wallet, formatEther, getAddress, isAddress } from "ethers";
import type { NetworkConnection } from "hardhat/types/network";

/**
 * Pre-deployment checks for real networks (Sepolia).
 *
 * Runs BEFORE anything is signed or sent, collects every problem at once and
 * prints exactly where each config value came from, so a wrong RPC URL or a
 * wrong private key can be traced to its real source.
 *
 * Why this exists: Hardhat 3 resolves configVariable("X") in this order
 *   1. environment variable  X           <- wins over everything
 *   2. development keystore  (--dev)
 *   3. production keystore   (password prompt)
 * So `npx hardhat keystore set X --force` has NO effect while an environment
 * variable with the same name exists (PowerShell $env:X, a Windows user /
 * system variable, or one inherited by VS Code's terminal).
 */

export const EXPECTED_CHAIN_IDS: Record<string, number> = { sepolia: 11155111 };
export const LOCAL_NETWORKS = ["localhost", "hardhatMainnet", "hardhatOp"];

const KNOWN_CHAINS: Record<number, string> = {
  1: "Ethereum MAINNET (real ETH!)",
  11155111: "Sepolia testnet",
  17000: "Holesky testnet",
  560048: "Hoodi testnet",
  31337: "local Hardhat node",
  137: "Polygon mainnet",
  80002: "Polygon Amoy testnet",
  8453: "Base mainnet",
  84532: "Base Sepolia",
  10: "OP mainnet",
  11155420: "OP Sepolia",
  42161: "Arbitrum One",
  421614: "Arbitrum Sepolia",
};

// Public mnemonic used by every Hardhat / Anvil dev node. Keys derived from it are
// published on the internet: funds sent to them are swept by bots within seconds.
const HARDHAT_TEST_MNEMONIC = "test test test test test test test test test test test junk";

function hardhatTestAccounts(count = 20): Set<string> {
  const root = HDNodeWallet.fromPhrase(HARDHAT_TEST_MNEMONIC, undefined, "m/44'/60'/0'/0");
  const set = new Set<string>();
  for (let i = 0; i < count; i++) set.add(root.deriveChild(i).address.toLowerCase());
  return set;
}

/** Hides the API key part of an RPC URL so it is safe to print. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    const masked = parts.map((p, i) =>
      i === parts.length - 1 && p.length > 8 ? `${p.slice(0, 4)}…${p.slice(-3)}` : p
    );
    return `${u.protocol}//${u.host}/${masked.join("/")}`;
  } catch {
    return "<not a valid URL>";
  }
}

function describeChain(id: number): string {
  return KNOWN_CHAINS[id] ?? "unknown chain";
}

/** Which keystore(s) contain a key, read from the plaintext key names (no password needed). */
function keystoresContaining(name: string): string[] {
  const ks = (hre.config as unknown as { keystore?: { filePath?: string; devFilePath?: string } })
    .keystore;
  const found: string[] = [];
  const check = (file: string | undefined, label: string) => {
    if (!file || !fs.existsSync(file)) return;
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      if (json?.secrets && name in json.secrets) found.push(label);
    } catch {
      /* unreadable keystore -> ignore, Hardhat will report it */
    }
  };
  check(ks?.devFilePath, "dev keystore");
  check(ks?.filePath, "keystore");
  return found;
}

/** Human-readable description of where Hardhat took a config variable from. */
function sourceOf(name: string): { label: string; fromEnv: boolean; fromDev: boolean } {
  if (process.env[name] !== undefined) {
    return {
      label: `ENVIRONMENT VARIABLE $env:${name}  (this overrides the keystore!)`,
      fromEnv: true,
      fromDev: false,
    };
  }
  const stores = keystoresContaining(name);
  if (stores[0] === "dev keystore") {
    return {
      label: `Hardhat DEV keystore (overrides the normal keystore)`,
      fromEnv: false,
      fromDev: true,
    };
  }
  if (stores.length) return { label: "Hardhat keystore", fromEnv: false, fromDev: false };
  return { label: "not set", fromEnv: false, fromDev: false };
}

/** PowerShell commands that make Hardhat read `name` from the normal keystore again. */
function fixSourceCommands(name: string, src: { fromEnv: boolean; fromDev: boolean }): string[] {
  const cmds: string[] = [];
  if (src.fromEnv) {
    cmds.push(
      `Remove-Item Env:${name}    # this terminal`,
      `[Environment]::SetEnvironmentVariable("${name}", $null, "User")    # permanently (then restart VS Code)`
    );
  }
  if (src.fromDev) cmds.push(`npx hardhat keystore delete --dev ${name}`);
  return cmds;
}

export interface PreflightResult {
  networkName: string;
  chainId: number;
  isLocal: boolean;
  owners?: string[];
  required: number;
  fundList: string[];
}

export async function preflight(connection: NetworkConnection): Promise<PreflightResult> {
  const { ethers, networkName, networkConfig } = connection;
  const isLocal = LOCAL_NETWORKS.includes(networkName);
  const problems: string[] = [];

  // ── 1. Chain: use eth_chainId first. It is the only call Hardhat's built-in
  //       chainId guard lets through, so we can explain a mismatch ourselves.
  let rpcUrl = "";
  if (networkConfig.type === "http") {
    try {
      rpcUrl = await networkConfig.url.get();
    } catch {
      /* resolution errors surface below via eth_chainId */
    }
  }
  const chainId = Number(await connection.provider.request({ method: "eth_chainId" }));

  const urlVar = networkName === "sepolia" ? "SEPOLIA_RPC_URL" : undefined;
  const keyVar = networkName === "sepolia" ? "SEPOLIA_PRIVATE_KEY" : undefined;
  const urlSrc = urlVar ? sourceOf(urlVar) : undefined;
  const keySrc = keyVar ? sourceOf(keyVar) : undefined;

  console.log(`Network:  ${networkName}`);
  if (rpcUrl) console.log(`RPC URL:  ${redactUrl(rpcUrl)}`);
  if (urlSrc) console.log(`          ↳ from ${urlSrc.label}`);
  console.log(`Chain:    ${chainId}  (${describeChain(chainId)})`);

  const expectedChain = EXPECTED_CHAIN_IDS[networkName];
  if (expectedChain !== undefined && chainId !== expectedChain) {
    const hints: string[] = [];
    if (chainId === 1) {
      hints.push(
        "That is an Ethereum MAINNET endpoint (Alchemy's default is eth-mainnet). In the Alchemy\n" +
          '     dashboard open your app, switch the network to "Ethereum Sepolia" and copy that URL:\n' +
          "     https://eth-sepolia.g.alchemy.com/v2/<key>"
      );
    }
    hints.push(...(urlSrc ? fixSourceCommands(urlVar!, urlSrc) : []));
    hints.push(`npx hardhat keystore set ${urlVar ?? "<RPC var>"} --force     # paste the eth-sepolia URL`);
    problems.push(
      `Wrong chain: "${networkName}" must be chain ${expectedChain} (${describeChain(expectedChain)}),\n` +
        `   but ${redactUrl(rpcUrl) || "the RPC URL"} is chain ${chainId} (${describeChain(chainId)}).\n` +
        `   Hardhat read the URL from: ${urlSrc?.label ?? "network config"}\n` +
        hints.map((h) => `   → ${h}`).join("\n")
    );
  }

  // ── 2. Deployer account
  //    On a wrong chain any other RPC call would be blocked by Hardhat's chainId
  //    guard, so the address is derived offline from the configured key instead.
  const chainOk = expectedChain === undefined || chainId === expectedChain;
  let deployer: { address: string } | undefined;
  if (chainOk) {
    deployer = (await ethers.getSigners())[0];
  } else if (networkConfig.type === "http" && Array.isArray(networkConfig.accounts)) {
    const first = networkConfig.accounts[0];
    if (first) {
      const key = await first.getHexString();
      deployer = { address: new Wallet(key).address };
    }
  }
  console.log(`Deployer: ${deployer?.address ?? "<none>"}`);
  if (keySrc) console.log(`          ↳ from ${keySrc.label}`);

  if (!isLocal) {
    if (!deployer) {
      problems.push(`No deployer account. Run: npx hardhat keystore set ${keyVar ?? "<KEY var>"}`);
    } else if (hardhatTestAccounts().has(deployer.address.toLowerCase())) {
      problems.push(
        `${keyVar ?? "The private key"} is a PUBLIC Hardhat test key (from "test test … junk").\n` +
          "   Everybody knows it; anything sent to it on a real chain is stolen by bots.\n" +
          "   You probably copied it from `npx hardhat node` output.\n" +
          [
            ...(keySrc ? fixSourceCommands(keyVar!, keySrc) : []),
            "MetaMask → your deployer account → ⋮ → Account details → Show private key",
            `npx hardhat keystore set ${keyVar ?? "<KEY var>"} --force     # paste it (with or without 0x)`,
          ]
            .map((h) => `   → ${h}`)
            .join("\n")
      );
    } else if (chainOk) {
      // Only query a balance on the right chain (on a wrong chain it means nothing
      // and Hardhat's chainId guard would throw before our report).
      const balance = await ethers.provider.getBalance(deployer.address);
      console.log(`Balance:  ${formatEther(balance)} ETH`);
      if (balance === 0n) {
        problems.push(
          `Deployer ${deployer.address} has 0 ETH on ${networkName}.\n` +
            "   → Get Sepolia ETH from a faucet (e.g. Google Cloud Web3 faucet or the Alchemy Sepolia faucet)."
        );
      } else if (balance < 10n ** 16n) {
        console.log("          ⚠ less than 0.01 ETH, deployment may run out of gas");
      }
    }
  }

  // ── 3. Multi-sig owners / funding list (validated BEFORE any contract is deployed)
  const rawOwners = process.env.MULTISIG_OWNERS?.split(",").map((s) => s.trim()).filter(Boolean);
  const required = Number(process.env.MULTISIG_REQUIRED ?? 2);
  let owners: string[] | undefined;

  if (rawOwners && rawOwners.length > 0) {
    const bad = rawOwners.filter((a) => !isAddress(a));
    if (bad.length) problems.push(`MULTISIG_OWNERS has invalid address(es): ${bad.join(", ")}`);
    else owners = rawOwners.map((a) => getAddress(a));
  }
  if (!isLocal && !owners && !problems.some((p) => p.startsWith("MULTISIG_OWNERS"))) {
    problems.push(
      "MULTISIG_OWNERS is not set. In PowerShell:\n" +
        '   → $env:MULTISIG_OWNERS="0xOwner1,0xOwner2,0xOwner3"\n' +
        '   → $env:MULTISIG_REQUIRED="2"'
    );
  }
  if (owners) {
    if (new Set(owners.map((o) => o.toLowerCase())).size !== owners.length)
      problems.push("MULTISIG_OWNERS contains the same address twice.");
    if (!isLocal) {
      const test = hardhatTestAccounts();
      const pub = owners.filter((o) => test.has(o.toLowerCase()));
      if (pub.length) problems.push(`MULTISIG_OWNERS contains public Hardhat test accounts: ${pub.join(", ")}`);
    }
    if (!Number.isInteger(required) || required < 1 || required > owners.length)
      problems.push(`MULTISIG_REQUIRED=${process.env.MULTISIG_REQUIRED} must be between 1 and ${owners.length}.`);
  }

  const fundList = (process.env.FUND_ADDRESSES ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  const badFund = fundList.filter((a) => !isAddress(a));
  if (badFund.length) problems.push(`FUND_ADDRESSES has invalid address(es): ${badFund.join(", ")}`);

  if (problems.length) {
    const report =
      `\n✖ Pre-flight failed: ${problems.length} problem(s). Nothing was deployed and no gas was spent.\n\n` +
      problems.map((p, i) => `${i + 1}. ${p}`).join("\n\n") +
      "\n\nCheck again with:  npm run check:sepolia\n";
    const err = new Error(report);
    err.name = "PreflightError";
    throw err;
  }

  if (owners) console.log(`Owners:   ${owners.join(", ")}  (${required}-of-${owners.length})`);
  console.log("✔ Pre-flight checks passed\n");
  return { networkName, chainId, isLocal, owners, required, fundList };
}
