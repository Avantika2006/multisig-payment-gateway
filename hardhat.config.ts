import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    // `npx hardhat node` (JSON-RPC on :8545) - use with --network localhost
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    // Secrets resolve in this order: ENV VAR > dev keystore > keystore.
    // A leftover $env:SEPOLIA_RPC_URL silently overrides `keystore set`.
    // Check with:  npm run check:sepolia
    sepolia: {
      type: "http",
      chainType: "l1",
      // Hard guard: Hardhat refuses to send anything if the RPC is not Sepolia
      // (protects every script/task, not only deploy.ts).
      chainId: 11155111,
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
