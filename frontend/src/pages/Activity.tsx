import { useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";

import {
  fetchEvents,
  fetchIndexerStatus,
  type ChainEvent,
  type IndexerStatus,
} from "../utils/api";
import ActivityList from "../components/ActivityList";

type Filter = "all" | "payments" | "multisig";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "payments", label: "Invoices & payments" },
  { key: "multisig", label: "Multisig" },
];

/** Every indexed on-chain event (invoices, payments, approvals, executions), newest first. */
export default function Activity() {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [status, setStatus] = useState<IndexerStatus | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadActivity() {
    try {
      setLoading(true);
      setError("");
      const [list, indexer] = await Promise.all([fetchEvents(200), fetchIndexerStatus()]);
      setEvents(list);
      setStatus(indexer);
    } catch (err) {
      console.error(err);
      setError("Could not load activity. Start the backend (npm start in backend/).");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadActivity();
  }, []);

  const visible = events.filter((e) =>
    filter === "all"
      ? true
      : filter === "payments"
        ? e.contract === "MerchantPayment"
        : e.contract === "MultiSigWallet"
  );

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACTIVITY</p>
          <h1>Activity</h1>
          <p className="page-subtitle">
            Every invoice, payment and approval recorded on the blockchain.
          </p>
        </div>

        <button className="secondary-button" onClick={loadActivity} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin-icon" : ""} />
          Refresh
        </button>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h3>
            <History size={18} /> Timeline
          </h3>

          <div className="period-selector">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={filter === f.key ? "selected" : ""}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        {loading && events.length === 0 ? (
          <div className="empty-state">Loading activity...</div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <History size={32} />
            <h3>No activity yet</h3>
            <p>Invoices, payments and approvals will appear here.</p>
          </div>
        ) : (
          <ActivityList events={visible} />
        )}

        {status?.lastProcessedBlock != null && (
          <p className="table-footnote">
            Indexed up to block {status.lastProcessedBlock}. New events appear after{" "}
            {status.confirmations} confirmation(s), usually within a minute.
          </p>
        )}
      </section>
    </div>
  );
}
