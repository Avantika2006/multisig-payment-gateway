
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Send,
  Play,
  Loader2,
  History,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { getMultiSigWalletContract } from "../utils/contracts";
import {
  isOwnerOf,
  loadMultisigInfo,
  loadProposals,
  type MultisigInfo,
  type Proposal,
} from "../utils/multisig";
import ProposePanel from "../components/ProposePanel";
import { describeTransaction } from "../utils/describeTransaction";

export default function Approvals() {
  const { account, provider, connectWallet } = useWallet();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    if (!provider) return;

    try {
      setLoading(true);
      setError("");

      const [multisig, list] = await Promise.all([
        loadMultisigInfo(provider),
        loadProposals(provider, account),
      ]);
      setInfo(multisig);
      setProposals(list);
    } catch (err) {
      console.error(err);
      setError("Unable to load multisig data. Check that your wallet is on the right network.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [provider, account]);

  async function runAction(id: number, action: "approve" | "execute") {
    if (!provider || !account) {
      setError("Connect your wallet first.");
      return;
    }

    try {
      setBusyId(id);
      setError("");
      setSuccess("");

      const signer = await provider.getSigner();
      const contract = getMultiSigWalletContract(signer);

      const tx =
        action === "approve"
          ? await contract.approveTransaction(id)
          : await contract.executeTransaction(id);
      await tx.wait();

      setSuccess(`Proposal #${id} ${action === "approve" ? "approved" : "executed"} successfully.`);
      await loadData();
    } catch (err: any) {
      setError(
        err?.reason || err?.shortMessage || err?.message ||
          (action === "approve" ? "Approval failed." : "Execution failed.")
      );
    } finally {
      setBusyId(null);
    }
  }

  const required = info?.required ?? 0;
  const isOwner = isOwnerOf(info, account);
  const pending = proposals.filter((p) => !p.executed);
  const executed = proposals.filter((p) => p.executed);

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MULTI-SIGNATURE SECURITY</p>
          <h1>Approvals</h1>
          <p className="page-subtitle">
            Every invoice, refund and withdrawal needs {required || "M"} owner approvals.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin-icon" : ""} />
          Refresh
        </button>
      </div>

      <div className="approval-summary-grid">
        <section className="panel">
          <span className="muted-text">Required approvals</span>
          <h2>{required} of {info?.owners.length ?? 0} owners</h2>
        </section>

        <section className="panel">
          <span className="muted-text">Waiting for approval</span>
          <h2>{pending.length}</h2>
        </section>
      </div>

      {!account && (
        <button className="primary-button" onClick={connectWallet}>
          Connect MetaMask
        </button>
      )}

      {account && info && !isOwner && (
        <div className="form-error">
          Your connected wallet is not a multisig owner, so you can view proposals but not approve them.
        </div>
      )}

      {error && <div className="form-error">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <section className="panel">
        <div className="panel-heading">
          <h3>
            <ShieldCheck size={18} /> Waiting for approval
          </h3>
        </div>

        {loading && proposals.length === 0 ? (
          <div className="empty-state">Loading proposals...</div>
        ) : pending.length === 0 ? (
          <div className="empty-state">
            <Send size={32} />
            <h3>Nothing to approve</h3>
            <p>New invoices, refunds and withdrawals will appear here.</p>
          </div>
        ) : (
          <div className="approval-list">
            {pending.map((tx) => {
              const { title, detail } = describeTransaction(tx.to, tx.value, tx.data);
              const ready = tx.approvalCount >= required;

              return (
                <div className="approval-card" key={tx.id}>
                  <div className="approval-card-header">
                    <div>
                      <span className="muted-text">Proposal #{tx.id}</span>
                      <h3>{title}</h3>
                    </div>

                    <span
                      className={`status-badge ${ready ? "completed-badge" : "pending-badge"}`}
                    >
                      {ready ? "Ready to execute" : "Needs approvals"}
                    </span>
                  </div>

                  <div className="approval-details">
                    <span>Target</span>
                    <strong>{detail}</strong>
                  </div>

                  <div className="approval-details">
                    <span>Approvals</span>
                    <strong>
                      {tx.approvalCount} / {required}
                      {tx.approvedByMe && " · including you"}
                    </strong>
                  </div>

                  <div className="approval-progress">
                    <div
                      style={{
                        width: `${Math.min(100, (tx.approvalCount / Math.max(required, 1)) * 100)}%`,
                      }}
                    />
                  </div>

                  {isOwner && (
                    <div className="approval-actions">
                      <button
                        className="secondary-button"
                        disabled={busyId === tx.id || tx.approvedByMe}
                        onClick={() => runAction(tx.id, "approve")}
                      >
                        {busyId === tx.id ? (
                          <Loader2 size={16} className="spin-icon" />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        {tx.approvedByMe ? "You approved" : "Approve"}
                      </button>

                      <button
                        className="primary-button"
                        disabled={busyId === tx.id || !ready}
                        onClick={() => runAction(tx.id, "execute")}
                      >
                        <Play size={16} />
                        Execute
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isOwner && <ProposePanel isOwner={isOwner} onSubmitted={loadData} />}

      <section className="panel">
        <div className="panel-heading">
          <h3>
            <History size={18} /> Executed proposals
          </h3>
          <span className="muted-text">{executed.length} total</span>
        </div>

        {executed.length === 0 ? (
          <div className="empty-state">
            <p>No proposals executed yet.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Action</th>
                  <th>Approvals</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {executed.map((tx) => (
                  <tr key={tx.id}>
                    <td>#{tx.id}</td>
                    <td>{describeTransaction(tx.to, tx.value, tx.data).title}</td>
                    <td>
                      {tx.approvalCount} / {required}
                    </td>
                    <td>
                      <span className="status-badge completed-badge">Executed</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
