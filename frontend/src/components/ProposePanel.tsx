import { useState } from "react";
import { ethers } from "ethers";
import { FilePlus2, Loader2, Send } from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { getMockStablecoinContract } from "../utils/contracts";
import { submitProposal } from "../utils/multisig";
import { CONTRACT_ADDRESSES } from "../../contractAddresses";
import "./ProposePanel.css";

type Kind = "refund" | "withdraw";

interface Props {
  isOwner: boolean;
  onSubmitted: () => void | Promise<void>;
}

/**
 * Lets a multi-sig owner propose moving treasury funds:
 *   - refund a customer           -> token.transfer(customer, amount)
 *   - withdraw funds              -> token.transfer(address, amount)
 * Invoices are proposed from the Invoices page.
 * Nothing moves until the required number of owners approve AND someone executes.
 */
export default function ProposePanel({ isOwner, onSubmitted }: Props) {
  const { account, provider, connectWallet } = useWallet();

  const [kind, setKind] = useState<Kind>("refund");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!provider || !account) {
      setError("Connect your wallet first.");
      return;
    }
    if (!isOwner) {
      setError("Only multisig owners can submit proposals.");
      return;
    }

    let parsedAmount: bigint;
    try {
      parsedAmount = ethers.parseUnits(amount || "0", 6);
    } catch {
      setError("Enter a valid amount (max 6 decimals).");
      return;
    }
    if (parsedAmount <= 0n) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (!ethers.isAddress(recipient)) {
      setError("Enter a valid recipient address.");
      return;
    }

    try {
      setBusy(true);
      const data = getMockStablecoinContract(provider).interface.encodeFunctionData(
        "transfer",
        [recipient, parsedAmount]
      );
      const id = await submitProposal(
        provider,
        CONTRACT_ADDRESSES.MOCK_STABLECOIN,
        data,
        autoApprove
      );

      setSuccess(
        `Proposal #${id} submitted${autoApprove ? " and approved by you" : ""}. ` +
          `Other owners can now approve it below.`
      );
      setAmount("");
      setRecipient("");
      await onSubmitted();
    } catch (err: any) {
      setError(err?.reason || err?.shortMessage || err?.message || "Submission failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel propose-panel">
      <div className="panel-heading">
        <h3>
          <FilePlus2 size={18} /> Move treasury funds
        </h3>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="propose-grid">
          <div className="form-group">
            <label htmlFor="propose-kind">Action</label>
            <select
              id="propose-kind"
              className="propose-select"
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="refund">Refund a customer (mUSDC)</option>
              <option value="withdraw">Withdraw funds (mUSDC)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="propose-amount">Amount</label>
            <div className="amount-input-wrapper">
              <input
                id="propose-amount"
                type="number"
                min="0.000001"
                step="0.000001"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="currency-tag">mUSDC</span>
            </div>
          </div>

          <div className="form-group full-row">
            <label htmlFor="propose-recipient">
              {kind === "refund" ? "Customer address" : "Destination address"}
            </label>
            <input
              id="propose-recipient"
              className="propose-text"
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
            />
          </div>
        </div>

        <label className="propose-check">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
          />
          Also approve it as the submitter (2 wallet confirmations)
        </label>

        {error && <div className="form-error">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="propose-actions">
          {!account ? (
            <button type="button" className="secondary-button" onClick={connectWallet}>
              Connect MetaMask
            </button>
          ) : (
            <button type="submit" className="primary-button" disabled={busy || !isOwner}>
              {busy ? <Loader2 size={16} className="spin-icon" /> : <Send size={16} />}
              Submit proposal
            </button>
          )}
          {account && !isOwner && (
            <span className="form-hint">Connected wallet is not a multisig owner.</span>
          )}
        </div>
      </form>
    </section>
  );
}
