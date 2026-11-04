import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  ArrowLeftRight,
  ChevronRight,
  CircleCheck,
  Clock3,
  FilePlus2,
  History,
  Landmark,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { getMockStablecoinContract } from "../utils/contracts";
import { fetchEvents, fetchInvoices, type ChainEvent } from "../utils/api";
import { isOwnerOf, loadMultisigInfo, loadProposals, type MultisigInfo } from "../utils/multisig";
import ActivityList from "../components/ActivityList";
import { CONTRACT_ADDRESSES } from "../../contractAddresses";

const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

const fmt = (raw: bigint) =>
  Number(ethers.formatUnits(raw, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });

interface Stats {
  treasury?: bigint;
  received?: bigint;
  paidCount?: number;
  unpaidAmount?: bigint;
  unpaidCount?: number;
  pendingProposals?: number;
}

export default function Overview({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { account, provider } = useWallet();

  const [stats, setStats] = useState<Stats>({});
  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [backendDown, setBackendDown] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadOverview() {
    setLoading(true);
    const next: Stats = {};

    const [invoices, recent, treasury, multisig, proposals] = await Promise.allSettled([
      fetchInvoices(provider),
      fetchEvents(6),
      provider
        ? getMockStablecoinContract(provider).balanceOf(CONTRACT_ADDRESSES.MULTISIG_WALLET)
        : Promise.reject(new Error("no wallet")),
      provider ? loadMultisigInfo(provider) : Promise.reject(new Error("no wallet")),
      provider ? loadProposals(provider, account) : Promise.reject(new Error("no wallet")),
    ]);

    if (invoices.status === "fulfilled") {
      const treasuryInvoices = invoices.value.filter((i) =>
        same(i.merchant, CONTRACT_ADDRESSES.MULTISIG_WALLET)
      );
      const paid = treasuryInvoices.filter((i) => i.paid);
      const unpaid = treasuryInvoices.filter((i) => !i.paid);
      next.received = paid.reduce((sum, i) => sum + i.amountRaw, 0n);
      next.paidCount = paid.length;
      next.unpaidAmount = unpaid.reduce((sum, i) => sum + i.amountRaw, 0n);
      next.unpaidCount = unpaid.length;
    }
    if (treasury.status === "fulfilled") next.treasury = treasury.value;
    if (proposals.status === "fulfilled") {
      next.pendingProposals = proposals.value.filter((p) => !p.executed).length;
    }

    setStats(next);
    setInfo(multisig.status === "fulfilled" ? multisig.value : null);
    setEvents(recent.status === "fulfilled" ? recent.value : []);
    setBackendDown(recent.status === "rejected");
    setLoading(false);
  }

  useEffect(() => {
    loadOverview();
  }, [provider, account]);

  const isOwner = isOwnerOf(info, account);
  const show = (v: string | undefined) => (loading ? "..." : v ?? "-");

  const cards = [
    {
      label: "Treasury balance",
      value: show(stats.treasury !== undefined ? `${fmt(stats.treasury)} mUSDC` : undefined),
      caption: info ? `Held by the ${info.required}-of-${info.owners.length} multisig` : "Connect a wallet to read",
      icon: Landmark,
    },
    {
      label: "Total received",
      value: show(stats.received !== undefined ? `${fmt(stats.received)} mUSDC` : undefined),
      caption: `${stats.paidCount ?? 0} paid invoice(s)`,
      icon: CircleCheck,
    },
    {
      label: "Awaiting payment",
      value: show(stats.unpaidAmount !== undefined ? `${fmt(stats.unpaidAmount)} mUSDC` : undefined),
      caption: `${stats.unpaidCount ?? 0} open invoice(s)`,
      icon: Clock3,
    },
    {
      label: "Awaiting approval",
      value: show(stats.pendingProposals?.toString()),
      caption: "Pending multisig proposals",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="page-container">
      <section className="page-heading">
        <div>
          <p className="eyebrow">QUORUM WORKSPACE</p>
          <h1>Overview</h1>
          <p className="page-subtitle">
            {isOwner
              ? "You are a treasury owner. Here's what needs your attention."
              : "A live summary of the merchant treasury."}
          </p>
        </div>

        <div className="heading-actions">
          <button className="primary-button" onClick={() => onNavigate("Invoices")}>
            <Plus size={17} /> New invoice
          </button>
          <button className="secondary-button" onClick={loadOverview} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin-icon" : ""} /> Refresh
          </button>
        </div>
      </section>

      <section className="stats-grid">
        {cards.map(({ label, value, caption, icon: Icon }) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <div className="stat-icon">
                <Icon size={19} />
              </div>
            </div>
            <p className="stat-label">{label}</p>
            <h2>{value}</h2>
            <span className="stat-caption">{caption}</span>
          </div>
        ))}
      </section>

      <section className="bottom-grid">
        <div className="panel transactions-panel">
          <div className="panel-heading">
            <h3>
              <History size={18} /> Recent activity
            </h3>
            <button className="text-link" onClick={() => onNavigate("Activity")}>
              View all activity <ArrowLeftRight size={14} />
            </button>
          </div>

          {backendDown ? (
            <div className="empty-state">
              <p>Start the backend (npm start in backend/) to see live activity.</p>
            </div>
          ) : events.length === 0 ? (
            <div className="empty-state">
              <ArrowLeftRight size={22} />
              <p>No activity yet. Create an invoice to get started.</p>
            </div>
          ) : (
            <ActivityList events={events} />
          )}
        </div>

        <div className="panel quick-actions-panel">
          <div className="panel-heading">
            <h3>Quick actions</h3>
          </div>

          <div className="quick-action" onClick={() => onNavigate("Invoices")}>
            <div className="quick-icon"><FilePlus2 size={19} /></div>
            <div>
              <strong>{isOwner ? "Create invoice" : "Pay an invoice"}</strong>
              <span>{isOwner ? "Propose a new payment request" : "See open invoices"}</span>
            </div>
            <ChevronRight size={17} />
          </div>

          <div className="quick-action" onClick={() => onNavigate("Approvals")}>
            <div className="quick-icon"><ShieldCheck size={19} /></div>
            <div>
              <strong>Review approvals</strong>
              <span>
                {stats.pendingProposals ? `${stats.pendingProposals} waiting` : "Nothing pending"}
              </span>
            </div>
            <ChevronRight size={17} />
          </div>

          <div className="quick-action" onClick={() => onNavigate("Activity")}>
            <div className="quick-icon"><History size={19} /></div>
            <div>
              <strong>Activity log</strong>
              <span>Every on-chain event</span>
            </div>
            <ChevronRight size={17} />
          </div>
        </div>
      </section>
    </div>
  );
}
