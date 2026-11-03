/**
 * Demo "merchant server" that receives Quorum webhooks.
 * Shows how a merchant verifies the HMAC signature before trusting a payload.
 *
 *   WEBHOOK_SECRET=<same secret as the backend> node receiver/server.js
 */
import "dotenv/config";
import express from "express";
import { verify } from "../src/webhooks.js";

const PORT = Number(process.env.RECEIVER_PORT || 4000);
const SECRET = process.env.WEBHOOK_SECRET || "dev-secret";

const app = express();
// IMPORTANT: verify against the RAW body, not the parsed JSON
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const raw = req.body.toString("utf8");
  const ok = verify(
    SECRET,
    req.header("x-quorum-timestamp"),
    raw,
    req.header("x-quorum-signature")
  );
  if (!ok) {
    console.log("✗ rejected webhook: bad signature");
    return res.status(401).json({ error: "invalid signature" });
  }
  const evt = JSON.parse(raw);
  console.log(`✓ ${evt.type.padEnd(20)} ${JSON.stringify(evt.data).slice(0, 140)}`);
  res.json({ received: true });
});

app.listen(PORT, () => console.log(`Webhook receiver listening on http://localhost:${PORT}/webhook`));
