import fs from "node:fs";
import path from "node:path";

/**
 * Tiny JSON-file database. Good enough for a mini project and it keeps the
 * backend free of native dependencies. Writes are atomic (tmp file + rename).
 *
 * Shape:
 *   lastProcessedBlock  number | null
 *   invoices            { [id]: Invoice }
 *   proposals           { [id]: Proposal }
 *   events              Event[]            (chronological feed)
 *   outbox              WebhookDelivery[]
 */
export class Store {
  constructor(file) {
    this.file = file;
    this.data = { lastProcessedBlock: null, invoices: {}, proposals: {}, events: [], outbox: [] };
    this.seen = new Set();
    this.saveTimer = null;
    this.#load();
  }

  #load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) {
      try {
        this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.file, "utf8")) };
      } catch (e) {
        console.warn(`[store] could not parse ${this.file}, starting fresh:`, e.message);
      }
    }
    for (const ev of this.data.events) this.seen.add(ev.key);
  }

  /** Debounced atomic save. */
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.saveNow(), 100);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // ── events (idempotent: same txHash+logIndex is never stored twice) ──
  hasEvent(key) {
    return this.seen.has(key);
  }
  addEvent(ev) {
    if (this.seen.has(ev.key)) return false;
    this.seen.add(ev.key);
    this.data.events.push(ev);
    this.save();
    return true;
  }

  get lastProcessedBlock() {
    return this.data.lastProcessedBlock;
  }
  set lastProcessedBlock(n) {
    this.data.lastProcessedBlock = n;
    this.save();
  }

  get invoices() {
    return this.data.invoices;
  }
  get proposals() {
    return this.data.proposals;
  }
  get events() {
    return this.data.events;
  }
  get outbox() {
    return this.data.outbox;
  }
}
