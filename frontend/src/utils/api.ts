import { ethers } from "ethers";

import * as deployInfo from "../../contractAddresses";
import { getMerchantPaymentContract } from "./contracts";

// Quorum backend (indexer + REST API). Override with VITE_API_URL in frontend/.env.
export const API_URL: string = (
  import.meta.env.VITE_API_URL ?? "http://localhost:4001"
).replace(/\/$/, "");

// deploy.ts writes a separate START_BLOCK export so we do not scan the whole
// chain on Sepolia. Older contractAddresses.ts files do not have it, hence the fallback.
const START_BLOCK: number =
  (deployInfo as unknown as { START_BLOCK?: number }).START_BLOCK ?? 0;

// Public RPCs (including MetaMask's) reject eth_getLogs over large block ranges.
const LOG_CHUNK = 5_000;

export interface Invoice {
  id: string;
  merchant: string;
  amountRaw: bigint;
  amount: string;
  createdBlock: number;
  createTx: string;
  paid: boolean;
  customer?: string;
  payTx?: string;
  payBlock?: number;
}

interface ApiInvoice {
  id: string;
  merchant: string;
  amount: string;
  amountFormatted: string;
  status: string;
  createTx: { hash: string; block: number };
  customer?: string;
  payTx?: { hash: string; block: number };
}

/** One indexed contract event from GET /api/events (newest first). */
export interface ChainEvent {
  key: string;
  contract: "MerchantPayment" | "MultiSigWallet";
  name: string;
  chainId: number;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  summary: Record<string, string>;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`Backend responded ${res.status}`);
  return res.json();
}

export function fetchEvents(limit = 50): Promise<ChainEvent[]> {
  return getJson(`/api/events?limit=${limit}`);
}

export interface IndexerStatus {
  lastProcessedBlock: number | null;
  latestBlock: number | null;
  confirmations: number;
  lag: number | null;
}

export async function fetchIndexerStatus(): Promise<IndexerStatus> {
  return (await getJson<{ indexer: IndexerStatus }>("/api/status")).indexer;
}

const EXPLORERS: Record<number, string> = { 11155111: "https://sepolia.etherscan.io" };

/** Etherscan link for a transaction, or undefined on a local chain. */
export function explorerTxUrl(chainId: number, txHash: string): string | undefined {
  const base = EXPLORERS[chainId];
  return base ? `${base}/tx/${txHash}` : undefined;
}

async function fromBackend(): Promise<Invoice[]> {
  const data = await getJson<ApiInvoice[]>("/api/invoices");
  return data.map((i) => ({
    id: i.id,
    merchant: i.merchant,
    amountRaw: BigInt(i.amount),
    amount: i.amountFormatted,
    createdBlock: i.createTx.block,
    createTx: i.createTx.hash,
    paid: i.status === "paid",
    customer: i.customer,
    payTx: i.payTx?.hash,
    payBlock: i.payTx?.block,
  }));
}

/** Same data rebuilt from InvoiceCreated / PaymentReceived events, in small block ranges. */
async function fromChain(provider: ethers.BrowserProvider): Promise<Invoice[]> {
  const gateway = getMerchantPaymentContract(provider);
  const latest = await provider.getBlockNumber();

  const created: ethers.EventLog[] = [];
  const paid: ethers.EventLog[] = [];
  for (let from = START_BLOCK; from <= latest; from += LOG_CHUNK) {
    const to = Math.min(from + LOG_CHUNK - 1, latest);
    const [c, p] = await Promise.all([
      gateway.queryFilter(gateway.filters.InvoiceCreated(), from, to),
      gateway.queryFilter(gateway.filters.PaymentReceived(), from, to),
    ]);
    created.push(...(c as ethers.EventLog[]));
    paid.push(...(p as ethers.EventLog[]));
  }

  const paidMap = new Map(paid.map((log) => [log.args.invoiceId.toString(), log]));
  return created.map((log) => {
    const id = log.args.invoiceId.toString();
    const p = paidMap.get(id);
    return {
      id,
      merchant: log.args.merchant,
      amountRaw: log.args.amount,
      amount: ethers.formatUnits(log.args.amount, 6),
      createdBlock: log.blockNumber,
      createTx: log.transactionHash,
      paid: Boolean(p),
      customer: p?.args.customer,
      payTx: p?.transactionHash,
      payBlock: p?.blockNumber,
    };
  });
}

/**
 * All invoices, newest first. Reads the backend's index (fast, no RPC limits) and
 * falls back to the chain when the backend is not running.
 */
export async function fetchInvoices(provider: ethers.BrowserProvider | null): Promise<Invoice[]> {
  let list: Invoice[];
  try {
    list = await fromBackend();
  } catch (err) {
    if (!provider) throw err;
    console.warn(`Quorum backend unavailable at ${API_URL}, reading the chain instead.`, err);
    list = await fromChain(provider);
  }
  return list.sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)));
}
