import test from "node:test";
import assert from "node:assert/strict";
import { sign, verify, backoffMs } from "../src/webhooks.js";

const secret = "s3cret";
const body = JSON.stringify({ type: "payment.confirmed" });

test("a correctly signed payload verifies", () => {
  const ts = Math.floor(Date.now() / 1000).toString();
  assert.equal(verify(secret, ts, body, `sha256=${sign(secret, ts, body)}`), true);
});

test("a tampered body is rejected", () => {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = `sha256=${sign(secret, ts, body)}`;
  assert.equal(verify(secret, ts, body.replace("payment", "refund"), sig), false);
});

test("a wrong secret is rejected", () => {
  const ts = Math.floor(Date.now() / 1000).toString();
  assert.equal(verify("other", ts, body, `sha256=${sign(secret, ts, body)}`), false);
});

test("an old timestamp (replay) is rejected", () => {
  const ts = (Math.floor(Date.now() / 1000) - 3600).toString();
  assert.equal(verify(secret, ts, body, `sha256=${sign(secret, ts, body)}`), false);
});

test("backoff grows exponentially and is capped", () => {
  assert.equal(backoffMs(1), 1000);
  assert.equal(backoffMs(3), 4000);
  assert.equal(backoffMs(20), 60000);
});
