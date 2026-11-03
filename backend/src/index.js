import { JsonRpcProvider } from "ethers";
import { config } from "./config.js";
import { loadAbi } from "./abi.js";
import { Store } from "./store.js";
import { WebhookDispatcher } from "./webhooks.js";
import { Indexer } from "./indexer.js";
import { createApi } from "./api.js";

const provider = new JsonRpcProvider(config.rpcUrl, undefined, { staticNetwork: true });

const abis = {
  MockStablecoin: loadAbi("MockStablecoin"),
  MerchantPayment: loadAbi("MerchantPayment"),
  MultiSigWallet: loadAbi("MultiSigWallet"),
};

const store = new Store(config.dataFile);
const dispatcher = new WebhookDispatcher({ store, config });
const indexer = new Indexer({ provider, store, config, abis, dispatcher });
const app = createApi({ store, config, indexer, dispatcher });

const server = app.listen(config.port, () => {
  console.log(`Quorum backend`);
  console.log(`  network       : ${config.network} (chainId ${config.chainId})`);
  console.log(`  rpc           : ${config.rpcUrl}`);
  console.log(`  confirmations : ${config.confirmations}`);
  console.log(`  api           : http://localhost:${config.port}/api/status`);
  console.log(`  webhooks      : ${dispatcher.enabled ? config.webhook.url : "disabled (set WEBHOOK_URL)"}`);
  console.log(`  contracts     : ${JSON.stringify(config.addresses)}`);
});

indexer.start();
dispatcher.start();

function shutdown() {
  console.log("\nShutting down...");
  indexer.stop();
  dispatcher.stop();
  store.saveNow();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
