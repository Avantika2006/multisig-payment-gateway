import { Contract, Interface, formatUnits } from "ethers";

/**
 * Event indexer.
 *
 *  - polls the chain, reads the logs of the 3 contracts in chunks
 *  - only processes blocks that have `confirmations` blocks on top (reorg safety)
 *  - is idempotent: every log is keyed by txHash:logIndex
 *  - remembers lastProcessedBlock, so a restart never misses (or repeats) events
 *  - turns raw events into invoices / proposals and queues webhooks
 */

/** Works out what a multi-sig proposal actually does by decoding its calldata. */
export function classify({ addresses, ifaces }, to, value, data) {
  const lc = (a) => String(a).toLowerCase();
  try {
    if (data && data !== "0x") {
      if (lc(to) === lc(addresses.MockStablecoin)) {
        const parsed = ifaces.token.parseTransaction({ data });
        if (parsed?.name === "transfer") {
          return {
            kind: "token_transfer",
            recipient: parsed.args[0],
            amount: parsed.args[1].toString(),
          };
        }
      }
      if (lc(to) === lc(addresses.MerchantPayment)) {
        const parsed = ifaces.gateway.parseTransaction({ data });
        if (parsed?.name === "createInvoice") {
          return { kind: "create_invoice", amount: parsed.args[0].toString() };
        }
      }
      return { kind: "other" };
    }
  } catch {
    return { kind: "other" };
  }
  return value > 0n ? { kind: "eth_transfer", amount: value.toString() } : { kind: "other" };
}

export class Indexer {
  constructor({ provider, store, config, abis, dispatcher }) {
    this.provider = provider;
    this.store = store;
    this.cfg = config;
    this.dispatcher = dispatcher;

    this.ifaces = {
      token: new Interface(abis.MockStablecoin),
      gateway: new Interface(abis.MerchantPayment),
      wallet: new Interface(abis.MultiSigWallet),
    };
    this.byAddress = {
      [config.addresses.MerchantPayment.toLowerCase()]: { name: "MerchantPayment", iface: this.ifaces.gateway },
      [config.addresses.MultiSigWallet.toLowerCase()]: { name: "MultiSigWallet", iface: this.ifaces.wallet },
    };
    this.wallet = new Contract(config.addresses.MultiSigWallet, abis.MultiSigWallet, provider);
    this.timer = null;
    this.running = false;
    this.latestBlock = null;
    this.blockTimes = new Map();
  }

  fmt(raw) {
    return formatUnits(BigInt(raw), this.cfg.tokenDecimals);
  }

  start() {
    const loop = async () => {
      try {
        await this.tick();
      } catch (e) {
        console.error("[indexer] tick failed:", e.shortMessage ?? e.message);
      }
    };
    loop();
    this.timer = setInterval(loop, this.cfg.pollIntervalMs);
  }

  stop() {
    clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const latest = await this.provider.getBlockNumber();
      this.latestBlock = latest;
      const safe = latest - this.cfg.confirmations;
      let from =
        this.store.lastProcessedBlock === null
          ? this.cfg.startBlock
          : this.store.lastProcessedBlock + 1;

      while (from <= safe) {
        const to = Math.min(from + this.cfg.blockChunk - 1, safe);
        await this.#processRange(from, to);
        this.store.lastProcessedBlock = to;
        from = to + 1;
      }
    } finally {
      this.running = false;
    }
  }

  async #blockTime(n) {
    if (!this.blockTimes.has(n)) {
      const b = await this.provider.getBlock(n);
      this.blockTimes.set(n, b ? b.timestamp : Math.floor(Date.now() / 1000));
      if (this.blockTimes.size > 500) this.blockTimes.delete(this.blockTimes.keys().next().value);
    }
    return this.blockTimes.get(n);
  }

  async #processRange(fromBlock, toBlock) {
    const logs = await this.provider.getLogs({
      address: [this.cfg.addresses.MerchantPayment, this.cfg.addresses.MultiSigWallet],
      fromBlock,
      toBlock,
    });
    logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

    for (const log of logs) {
      const key = `${log.transactionHash}:${log.index}`;
      if (this.store.hasEvent(key)) continue;

      const src = this.byAddress[log.address.toLowerCase()];
      if (!src) continue;
      const parsed = src.iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) continue;

      const timestamp = await this.#blockTime(log.blockNumber);
      const chain = {
        network: this.cfg.network,
        chainId: this.cfg.chainId,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.index,
        timestamp,
      };

      const record = await this.#handle(src.name, parsed, chain);
      this.store.addEvent({
        key,
        contract: src.name,
        name: parsed.name,
        ...chain,
        summary: record ?? {},
      });
    }
  }

  // ───────────────────────── handlers ─────────────────────────
  async #handle(contract, parsed, chain) {
    const a = parsed.args;
    const iso = new Date(chain.timestamp * 1000).toISOString();

    // ── MerchantPayment ──
    if (contract === "MerchantPayment" && parsed.name === "InvoiceCreated") {
      const id = a.invoiceId.toString();
      const existing = this.store.invoices[id] ?? {};
      const invoice = {
        ...existing,
        id,
        merchant: a.merchant,
        amount: a.amount.toString(),
        amountFormatted: this.fmt(a.amount),
        symbol: this.cfg.tokenSymbol,
        status: existing.status === "paid" ? "paid" : "created",
        createdAt: iso,
        createTx: { hash: chain.txHash, block: chain.blockNumber },
      };
      this.store.invoices[id] = invoice;
      this.dispatcher.enqueue("invoice.created", invoice, chain);
      return { invoiceId: id, amount: invoice.amountFormatted };
    }

    if (contract === "MerchantPayment" && parsed.name === "PaymentReceived") {
      const id = a.invoiceId.toString();
      const invoice = {
        ...(this.store.invoices[id] ?? { id, merchant: a.merchant }),
        amount: a.amount.toString(),
        amountFormatted: this.fmt(a.amount),
        symbol: this.cfg.tokenSymbol,
        status: "paid",
        customer: a.customer,
        paidAt: iso,
        payTx: { hash: chain.txHash, block: chain.blockNumber },
      };
      this.store.invoices[id] = invoice;
      this.dispatcher.enqueue("payment.confirmed", invoice, chain);
      return { invoiceId: id, customer: a.customer, amount: invoice.amountFormatted };
    }

    // ── MultiSigWallet ──
    if (contract === "MultiSigWallet" && parsed.name === "TransactionSubmitted") {
      const id = a.transactionId.toString();
      const tx = await this.wallet.getTransaction(a.transactionId); // to/value/data never change
      const details = classify(
        { addresses: this.cfg.addresses, ifaces: this.ifaces },
        tx.to, tx.value, tx.data
      );
      const proposal = {
        id,
        submitter: a.submitter,
        to: a.to,
        value: a.value.toString(),
        ...details,
        ...(details.amount ? { amountFormatted: this.fmt(details.amount) } : {}),
        approvals: [],
        approvalCount: 0,
        required: this.cfg.multisig.required,
        status: "pending",
        submittedAt: iso,
        submitTx: { hash: chain.txHash, block: chain.blockNumber },
      };
      this.store.proposals[id] = proposal;
      this.dispatcher.enqueue("approval.pending", proposal, chain);
      return { proposalId: id, kind: details.kind };
    }

    if (contract === "MultiSigWallet" && parsed.name === "TransactionApproved") {
      const id = a.transactionId.toString();
      const p = this.store.proposals[id];
      if (p && !p.approvals.includes(a.owner)) {
        p.approvals.push(a.owner);
        p.approvalCount = p.approvals.length;
        this.dispatcher.enqueue(
          "approval.added",
          { ...p, approvedBy: a.owner, remaining: Math.max(p.required - p.approvalCount, 0) },
          chain
        );
      }
      return { proposalId: id, owner: a.owner };
    }

    if (contract === "MultiSigWallet" && parsed.name === "TransactionExecuted") {
      const id = a.transactionId.toString();
      const p = this.store.proposals[id];
      if (p) {
        p.status = "executed";
        p.executedAt = iso;
        p.executeTx = { hash: chain.txHash, block: chain.blockNumber };

        // Heuristic: a token transfer back to a customer that paid one of OUR
        // invoices (for no more than they paid) is a refund, otherwise a withdrawal.
        let type = "transaction.executed";
        if (p.kind === "token_transfer") {
          const paidInvoice = Object.values(this.store.invoices).find(
            (inv) =>
              inv.status === "paid" &&
              inv.customer?.toLowerCase() === p.recipient.toLowerCase() &&
              inv.merchant?.toLowerCase() === this.cfg.addresses.MultiSigWallet.toLowerCase() &&
              BigInt(p.amount) <= BigInt(inv.amount)
          );
          if (paidInvoice) {
            type = "refund.executed";
            p.refundOfInvoice = paidInvoice.id;
          } else {
            type = "withdrawal.executed";
          }
        }
        this.dispatcher.enqueue(type, p, chain);
      }
      return { proposalId: id };
    }

    if (contract === "MultiSigWallet" && parsed.name === "Deposit") {
      return { sender: a.sender, amountWei: a.amount.toString() };
    }

    return {};
  }
}
