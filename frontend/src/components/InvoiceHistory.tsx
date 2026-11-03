import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { CreditCard, Loader2, Receipt, RefreshCw, Copy } from "lucide-react";

import { useWallet } from "../context/WalletContext";
import {
  getMerchantPaymentContract,
  getMockStablecoinContract,
} from "../utils/contracts";
import { CONTRACT_ADDRESSES } from "../../contractAddresses";
import "./InvoiceHistory.css";

// deploy.ts writes START_BLOCK so we do not scan the whole chain on Sepolia
const START_BLOCK: number =
  (CONTRACT_ADDRESSES as unknown as { START_BLOCK?: number }).START_BLOCK ?? 0;

interface InvoiceRow {
  id: string;
  merchant: string;
  amountRaw: bigint;
  amount: string;
  createdBlock: number;
  createTx: string;
  paid: boolean;
  customer?: string;
  payTx?: string;
}

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/**
 * Permanent record of invoices, rebuilt from the contract's InvoiceCreated and
 * PaymentReceived events (nothing is stored off-chain).
 * Also lets a customer wallet pay an unpaid invoice (approve + payInvoice).
 */
export default function InvoiceHistory({ refreshKey = "" }: { refreshKey?: string }) {
  const { account, provider } = useWallet();

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [loading, setLoading] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    if (!provider) return;
    try {
      setLoading(true);
      setError("");

      const gateway = getMerchantPaymentContract(provider);
      const [created, paid] = await Promise.all([
        gateway.queryFilter(gateway.filters.InvoiceCreated(), START_BLOCK, "latest"),
        gateway.queryFilter(gateway.filters.PaymentReceived(), START_BLOCK, "latest"),
      ]);

      const paidMap = new Map<string, { customer: string; tx: string }>();
      for (const e of paid) {
        const log = e as ethers.EventLog;
        paidMap.set(log.args.invoiceId.toString(), {
          customer: log.args.customer,
          tx: log.transactionHash,
        });
      }

      const list: InvoiceRow[] = created.map((e) => {
        const log = e as ethers.EventLog;
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
          customer: p?.customer,
          payTx: p?.tx,
        };
      });

      setRows(list.reverse());
    } catch (err) {
      console.error(err);
      setError("Could not load invoices. Check that your wallet is on the right network.");
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    load();
  }, [load, account, refreshKey]);

  const isMine = (r: InvoiceRow) =>
    same(r.merchant, account) || same(r.merchant, CONTRACT_ADDRESSES.MULTISIG_WALLET);

  const visible = scope === "mine" && account ? rows.filter(isMine) : rows;

  async function payInvoice(row: InvoiceRow) {
    if (!provider || !account) return;
    try {
      setPayingId(row.id);
      setError("");
      setSuccess("");

      const signer = await provider.getSigner();
      const token = getMockStablecoinContract(signer);
      const gateway = getMerchantPaymentContract(signer);

      const allowance: bigint = await token.allowance(
        account,
        CONTRACT_ADDRESSES.MERCHANT_PAYMENT
      );
      if (allowance < row.amountRaw) {
        const approveTx = await token.approve(
          CONTRACT_ADDRESSES.MERCHANT_PAYMENT,
          row.amountRaw
        );
        await approveTx.wait();
      }

      const payTx = await gateway.payInvoice(row.id);
      await payTx.wait();

      setSuccess(`Invoice #${row.id} paid (${row.amount} mUSDC).`);
      await load();
    } catch (err: any) {
      setError(err?.reason || err?.shortMessage || err?.message || "Payment failed.");
    } finally {
      setPayingId(null);
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="panel invoice-history">
      <div className="panel-heading">
        <h3>
          <Receipt size={18} /> Invoice history
        </h3>

        <div className="invoice-history-tools">
          <div className="period-selector">
            <button
              className={scope === "mine" ? "selected" : ""}
              onClick={() => setScope("mine")}
            >
              Mine
            </button>
            <button
              className={scope === "all" ? "selected" : ""}
              onClick={() => setScope("all")}
            >
              All
            </button>
          </div>

          <button className="secondary-button" onClick={load} disabled={loading || !provider}>
            <RefreshCw size={16} className={loading ? "spin-icon" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {!provider ? (
        <div className="empty-state">Connect your wallet to load invoices.</div>
      ) : loading && rows.length === 0 ? (
        <div className="empty-state">Loading invoices from the blockchain...</div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <Receipt size={32} />
          <h3>No invoices yet</h3>
          <p>Invoices you create will be listed here permanently.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Amount</th>
                <th>Merchant</th>
                <th>Status</th>
                <th>Paid by</th>
                <th>Block</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td>{r.amount} mUSDC</td>
                  <td>
                    {same(r.merchant, account)
                      ? "You"
                      : same(r.merchant, CONTRACT_ADDRESSES.MULTISIG_WALLET)
                        ? "Multisig"
                        : short(r.merchant)}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${r.paid ? "completed-badge" : "pending-badge"}`}
                    >
                      {r.paid ? "Paid" : "Awaiting payment"}
                    </span>
                  </td>
                  <td>{r.customer ? short(r.customer) : "-"}</td>
                  <td>{r.createdBlock}</td>
                  <td>
                    <div className="invoice-row-actions">
                      {!r.paid && account && !same(r.merchant, account) && (
                        <button
                          className="primary-button"
                          disabled={payingId === r.id}
                          onClick={() => payInvoice(r)}
                        >
                          {payingId === r.id ? (
                            <Loader2 size={14} className="spin-icon" />
                          ) : (
                            <CreditCard size={14} />
                          )}
                          Pay
                        </button>
                      )}
                      <button
                        className="text-link"
                        onClick={() => copy(r.payTx ?? r.createTx, r.id)}
                        title="Copy transaction hash"
                      >
                        <Copy size={13} />
                        {copied === r.id ? "Copied" : (r.payTx ?? r.createTx).slice(0, 8) + "..."}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
