import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FilePlus2,
  Play,
  Send,
  Wallet as WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { explorerTxUrl, type ChainEvent } from "../utils/api";
import { shortenAddress } from "../utils/contracts";

const KIND_LABELS: Record<string, string> = {
  create_invoice: "create invoice",
  token_transfer: "send mUSDC",
};

/** Human-readable line for one indexed event. */
export function describeEvent(e: ChainEvent): { icon: LucideIcon; title: string; detail: string } {
  const s = e.summary;
  switch (e.name) {
    case "InvoiceCreated":
      return { icon: FilePlus2, title: `Invoice #${s.invoiceId} created`, detail: `${s.amount} mUSDC` };
    case "PaymentReceived":
      return {
        icon: CreditCard,
        title: `Invoice #${s.invoiceId} paid`,
        detail: `${s.amount} mUSDC from ${shortenAddress(s.customer)}`,
      };
    case "TransactionSubmitted":
      return {
        icon: Send,
        title: `Proposal #${s.proposalId} submitted`,
        detail: KIND_LABELS[s.kind] ?? s.kind ?? "",
      };
    case "TransactionApproved":
      return {
        icon: CheckCircle2,
        title: `Proposal #${s.proposalId} approved`,
        detail: `by ${shortenAddress(s.owner)}`,
      };
    case "TransactionExecuted":
      return { icon: Play, title: `Proposal #${s.proposalId} executed`, detail: "" };
    default:
      return { icon: WalletIcon, title: e.name, detail: "" };
  }
}

const timeAgo = (unix: number) => {
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - unix));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(unix * 1000).toLocaleDateString();
};

/** Timeline of indexed contract events with explorer links. */
export default function ActivityList({ events }: { events: ChainEvent[] }) {
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Details</th>
            <th>Block</th>
            <th>When</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const { icon: Icon, title, detail } = describeEvent(e);
            const url = explorerTxUrl(e.chainId, e.txHash);
            return (
              <tr key={e.key}>
                <td>
                  <span className="activity-title">
                    <Icon size={15} /> {title}
                  </span>
                </td>
                <td>{detail || "-"}</td>
                <td>{e.blockNumber}</td>
                <td>{timeAgo(e.timestamp)}</td>
                <td>
                  {url ? (
                    <a className="text-link" href={url} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> {e.txHash.slice(0, 10)}...
                    </a>
                  ) : (
                    <span className="muted-text">{e.txHash.slice(0, 10)}...</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
