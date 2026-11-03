import express from "express";
import cors from "cors";

export function createApi({ store, config, indexer, dispatcher }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const explorer = (hash) => (config.explorerUrl ? `${config.explorerUrl}/tx/${hash}` : null);

  const byNewest = (arr, key = "id") => [...arr].sort((a, b) => Number(b[key]) - Number(a[key]));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/status", (_req, res) => {
    res.json({
      network: config.network,
      chainId: config.chainId,
      contracts: config.addresses,
      multisig: config.multisig,
      indexer: {
        lastProcessedBlock: store.lastProcessedBlock,
        latestBlock: indexer.latestBlock,
        confirmations: config.confirmations,
        lag:
          indexer.latestBlock !== null && store.lastProcessedBlock !== null
            ? indexer.latestBlock - store.lastProcessedBlock
            : null,
      },
      webhooks: {
        enabled: dispatcher.enabled,
        pending: store.outbox.filter((o) => o.status === "pending").length,
        failed: store.outbox.filter((o) => o.status === "failed").length,
      },
      counts: {
        invoices: Object.keys(store.invoices).length,
        proposals: Object.keys(store.proposals).length,
        events: store.events.length,
      },
    });
  });

  // ── Invoices ──
  app.get("/api/invoices", (req, res) => {
    let list = Object.values(store.invoices);
    if (req.query.status) list = list.filter((i) => i.status === req.query.status);
    if (req.query.merchant)
      list = list.filter((i) => i.merchant.toLowerCase() === String(req.query.merchant).toLowerCase());
    res.json(byNewest(list));
  });

  app.get("/api/invoices/:id", (req, res) => {
    const inv = store.invoices[req.params.id];
    if (!inv) return res.status(404).json({ error: "invoice not found" });
    res.json(inv);
  });

  // ── Receipts (public, verifiable proof of payment) ──
  app.get("/api/receipts/:id", (req, res) => {
    const inv = store.invoices[req.params.id];
    if (!inv || inv.status !== "paid") {
      return res.status(404).json({ error: "no receipt: invoice not found or not paid" });
    }
    res.json({
      receiptId: `RCPT-${String(inv.id).padStart(4, "0")}`,
      invoiceId: inv.id,
      merchant: inv.merchant,
      customer: inv.customer,
      amount: inv.amount,
      amountFormatted: inv.amountFormatted,
      symbol: inv.symbol,
      paidAt: inv.paidAt,
      network: config.network,
      chainId: config.chainId,
      txHash: inv.payTx.hash,
      blockNumber: inv.payTx.block,
      contract: config.addresses.MerchantPayment,
      explorerUrl: explorer(inv.payTx.hash),
      note: "This receipt is derived from the on-chain PaymentReceived event.",
    });
  });

  // ── Multi-sig proposals ──
  app.get("/api/proposals", (req, res) => {
    let list = Object.values(store.proposals);
    if (req.query.status) list = list.filter((p) => p.status === req.query.status);
    if (req.query.kind) list = list.filter((p) => p.kind === req.query.kind);
    res.json(byNewest(list));
  });

  app.get("/api/proposals/:id", (req, res) => {
    const p = store.proposals[req.params.id];
    if (!p) return res.status(404).json({ error: "proposal not found" });
    res.json(p);
  });

  // ── Raw activity feed ──
  app.get("/api/events", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    let list = store.events;
    if (req.query.name) list = list.filter((e) => e.name === req.query.name);
    res.json([...list].reverse().slice(0, limit));
  });

  // ── Webhook delivery log ──
  app.get("/api/webhooks", (req, res) => {
    let list = store.outbox;
    if (req.query.status) list = list.filter((o) => o.status === req.query.status);
    res.json([...list].reverse().slice(0, 100).map(({ payload, ...rest }) => ({ ...rest, event: payload.type })));
  });

  app.post("/api/webhooks/:id/retry", async (req, res) => {
    const item = await dispatcher.retry(req.params.id);
    if (!item) return res.status(404).json({ error: "delivery not found" });
    res.json({ id: item.id, status: item.status, attempts: item.attempts, lastError: item.lastError });
  });

  app.use((_req, res) => res.status(404).json({ error: "not found" }));
  return app;
}
