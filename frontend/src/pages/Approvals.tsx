
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Send,
  Play,
  Loader2,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { getMultiSigWalletContract } from "../utils/contracts";

interface MultisigTransaction {
  id: number;
  to: string;
  value: string;
  data: string;
  executed: boolean;
  approvalCount: number;
}

export default function Approvals() {
  const { account, provider, connectWallet } = useWallet();

  const [transactions, setTransactions] =
    useState<MultisigTransaction[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [required, setRequired] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    if (!provider) return;

    try {
      setLoading(true);
      setError("");

      const contract = getMultiSigWalletContract(provider);

      const [ownerList, threshold, count] = await Promise.all([
        contract.getOwners(),
        contract.requiredApprovals(),
        contract.getTransactionCount(),
      ]);

      setOwners(ownerList);
      setRequired(Number(threshold));

      const allTransactions: MultisigTransaction[] = [];

      for (let i = 0; i < Number(count); i++) {
        const tx = await contract.getTransaction(i);

        allTransactions.push({
          id: i,
          to: tx.to,
          value: ethers.formatEther(tx.value),
          data: tx.data,
          executed: tx.executed,
          approvalCount: Number(tx.approvalCount),
        });
      }

      setTransactions(allTransactions.reverse());
    } catch (err) {
      console.error(err);
      setError(
        "Unable to load multisig data. Check your local blockchain."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [provider, account]);

  async function approveTransaction(id: number) {
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

      const tx = await contract.approveTransaction(id);
      await tx.wait();

      setSuccess(`Transaction #${id} approved successfully.`);
      await loadData();
    } catch (err: any) {
      setError(err?.reason || err?.shortMessage || err?.message || "Approval failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function executeTransaction(id: number) {
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

      const tx = await contract.executeTransaction(id);
      await tx.wait();

      setSuccess(`Transaction #${id} executed successfully.`);
      await loadData();
    } catch (err: any) {
      setError(err?.reason || err?.shortMessage || err?.message || "Execution failed.");
    } finally {
      setBusyId(null);
    }
  }

  const isOwner =
    account &&
    owners.some(
      (owner) => owner.toLowerCase() === account.toLowerCase()
    );

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MULTI-SIGNATURE SECURITY</p>
          <h1>Approvals</h1>
          <p className="page-subtitle">
            Review, approve, and execute multisig transactions.
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
          <h2>{required} of {owners.length} owners</h2>
        </section>

        <section className="panel">
          <span className="muted-text">Pending transactions</span>
          <h2>{transactions.filter((tx) => !tx.executed).length}</h2>
        </section>
      </div>

      {!account && (
        <button className="primary-button" onClick={connectWallet}>
          Connect MetaMask
        </button>
      )}

      {account && !isOwner && (
        <div className="form-error">
          Your connected wallet is not a multisig owner.
        </div>
      )}

      {error && <div className="form-error">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <section className="panel">
        <div className="panel-heading">
          <h3>
            <ShieldCheck size={18} /> Submitted transactions
          </h3>
        </div>

        {loading ? (
          <div className="empty-state">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <Send size={32} />
            <h3>No transactions submitted</h3>
            <p>Multisig transactions will appear here.</p>
          </div>
        ) : (
          <div className="approval-list">
            {transactions.map((tx) => (
              <div className="approval-card" key={tx.id}>
                <div className="approval-card-header">
                  <div>
                    <span className="muted-text">Transaction #{tx.id}</span>
                    <h3>{tx.value} ETH</h3>
                  </div>

                  <span
                    className={`status-badge ${
                      tx.executed ? "completed-badge" : "pending-badge"
                    }`}
                  >
                    {tx.executed ? "Executed" : "Pending"}
                  </span>
                </div>

                <div className="approval-details">
                  <span>Recipient</span>
                  <strong>{tx.to}</strong>
                </div>

                <div className="approval-details">
                  <span>Approvals</span>
                  <strong>
                    {tx.approvalCount} / {required}
                  </strong>
                </div>

                <div className="approval-progress">
                  <div
                    style={{
                      width: `${Math.min(
                        100,
                        (tx.approvalCount / Math.max(required, 1)) * 100
                      )}%`,
                    }}
                  />
                </div>

                {!tx.executed && isOwner && (
                  <div className="approval-actions">
                    <button
                      className="secondary-button"
                      disabled={busyId === tx.id}
                      onClick={() => approveTransaction(tx.id)}
                    >
                      {busyId === tx.id ? (
                        <Loader2 size={16} className="spin-icon" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Approve
                    </button>

                    <button
                      className="primary-button"
                      disabled={
                        busyId === tx.id ||
                        tx.approvalCount < required
                      }
                      onClick={() => executeTransaction(tx.id)}
                    >
                      <Play size={16} />
                      Execute
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
