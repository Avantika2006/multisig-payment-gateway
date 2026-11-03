import crypto from "node:crypto";

/**
 * HMAC signature scheme (same idea as Stripe):
 *   X-Quorum-Timestamp: <unix seconds>
 *   X-Quorum-Signature: sha256=<hex hmac of `${timestamp}.${rawBody}`>
 */
export function sign(secret, timestamp, rawBody) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verify(secret, timestamp, rawBody, signatureHeader, toleranceSec = 300) {
  if (!timestamp || !signatureHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) return false;
  const expected = Buffer.from(`sha256=${sign(secret, timestamp, rawBody)}`);
  const received = Buffer.from(signatureHeader);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/** exponential backoff: 1s, 2s, 4s, 8s ... capped at 60s */
export function backoffMs(attempt) {
  return Math.min(1000 * 2 ** (attempt - 1), 60_000);
}

export class WebhookDispatcher {
  constructor({ store, config }) {
    this.store = store;
    this.cfg = config.webhook;
    this.network = config.network;
    this.timer = null;
    this.busy = false;
  }

  get enabled() {
    return Boolean(this.cfg.url);
  }

  /** Queue a webhook. It is delivered (with retries) by the background loop. */
  enqueue(type, data, chain) {
    if (!this.enabled) return null;
    const id = crypto.randomUUID();
    const item = {
      id,
      type,
      status: "pending",
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: new Date().toISOString(),
      payload: { id, type, createdAt: new Date().toISOString(), data, chain },
    };
    this.store.outbox.push(item);
    this.store.save();
    return item;
  }

  start(intervalMs = 1000) {
    this.timer = setInterval(() => this.processDue().catch(() => {}), intervalMs);
  }
  stop() {
    clearInterval(this.timer);
  }

  async processDue() {
    if (this.busy) return;
    this.busy = true;
    try {
      const due = this.store.outbox.filter(
        (o) => o.status === "pending" && o.nextAttemptAt <= Date.now()
      );
      for (const item of due) await this.#attempt(item);
    } finally {
      this.busy = false;
    }
  }

  /** manual retry from the API */
  async retry(id) {
    const item = this.store.outbox.find((o) => o.id === id);
    if (!item) return null;
    item.status = "pending";
    item.attempts = 0;
    item.nextAttemptAt = Date.now();
    await this.#attempt(item);
    return item;
  }

  async #attempt(item) {
    item.attempts += 1;
    const body = JSON.stringify(item.payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    try {
      const res = await fetch(this.cfg.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quorum-event": item.type,
          "x-quorum-delivery": item.id,
          "x-quorum-timestamp": ts,
          "x-quorum-signature": `sha256=${sign(this.cfg.secret, ts, body)}`,
        },
        body,
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
      item.lastStatus = res.status;
      if (res.ok) {
        item.status = "delivered";
        item.deliveredAt = new Date().toISOString();
        item.lastError = null;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      item.lastError = e.message;
      if (item.attempts >= this.cfg.maxAttempts) {
        item.status = "failed";
      } else {
        item.nextAttemptAt = Date.now() + backoffMs(item.attempts);
      }
    }
    this.store.save();
  }
}
