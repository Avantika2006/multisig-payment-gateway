
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  FilePlus2,
  Landmark,
  CircleCheck,
  Loader2,
  ArrowLeft,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { getMerchantPaymentContract, shortenAddress } from "../utils/contracts";
import { isOwnerOf, loadMultisigInfo, submitProposal, type MultisigInfo } from "../utils/multisig";
import InvoiceHistory from "../components/InvoiceHistory";
import { CONTRACT_ADDRESSES } from "../../contractAddresses";

/**
 * Invoices are always created BY the multisig (as a proposal), so every payment
 * lands in the treasury and no single owner can create one alone.
 */
function CreateInvoice({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { account, provider, connectWallet } = useWallet();

  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [proposal, setProposal] = useState<{
    id: string;
    amount: string;
    approved: boolean;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!provider) return;
    loadMultisigInfo(provider)
      .then(setInfo)
      .catch((err) => console.error("Could not read multisig owners:", err));
  }, [provider]);

  const isOwner = isOwnerOf(info, account);

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setProposal(null);

    if (!account || !provider) {
      setError("Please connect your MetaMask wallet first.");
      return;
    }
    if (!isOwner) {
      setError("Only treasury owners can create invoices.");
      return;
    }

    let parsedAmount: bigint;
    try {
      // Mock stablecoin uses 6 decimal places
      parsedAmount = ethers.parseUnits(amount || "0", 6);
    } catch {
      setError("Enter a valid amount (max 6 decimals).");
      return;
    }
    if (parsedAmount <= 0n) {
      setError("Please enter a valid invoice amount.");
      return;
    }

    try {
      setIsCreating(true);

      const data = getMerchantPaymentContract(provider).interface.encodeFunctionData(
        "createInvoice",
        [parsedAmount]
      );
      const id = await submitProposal(
        provider,
        CONTRACT_ADDRESSES.MERCHANT_PAYMENT,
        data,
        autoApprove
      );

      setProposal({ id: id.toString(), amount, approved: autoApprove });
      setAmount("");
    } catch (err: any) {
      console.error("Invoice proposal failed:", err);
      setError(err?.reason || err?.shortMessage || err?.message || "Failed to submit the invoice.");
    } finally {
      setIsCreating(false);
    }
  }

  const required = info?.required ?? 2;
  const stillNeeded = proposal ? Math.max(0, required - (proposal.approved ? 1 : 0)) : 0;

  return (
    <div className="invoice-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{isOwner || !account ? "MERCHANT WORKSPACE" : "CUSTOMER WORKSPACE"}</p>
          <h1>Invoices</h1>
          <p className="page-subtitle">
            {isOwner
              ? "Propose new invoices for the treasury and track every payment."
              : "Open invoices from the merchant. Pay them with mUSDC."}
          </p>
        </div>
      </div>

      {isOwner && (
        <div className="invoice-layout">
          {/* FORM */}
          <section className="panel invoice-form-panel">
            <div className="panel-heading">
              <h3>
                <FilePlus2 size={19} /> New invoice
              </h3>
            </div>

            <form onSubmit={handleCreateInvoice}>
              <div className="form-group">
                <label htmlFor="invoice-amount">Invoice amount</label>

                <div className="amount-input-wrapper">
                  <input
                    id="invoice-amount"
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />

                  <span className="currency-tag">mUSDC</span>
                </div>

                <span className="form-hint">
                  Mock USD Coin · 6 decimal precision
                </span>
              </div>

              <div className="invoice-merchant-info">
                <div className="quick-icon">
                  <Landmark size={18} />
                </div>

                <div>
                  <strong>Paid into</strong>
                  <span>
                    Multisig treasury {shortenAddress(CONTRACT_ADDRESSES.MULTISIG_WALLET)}
                  </span>
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

              <button
                type="submit"
                className="primary-button full-width"
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 size={17} className="spin-icon" />
                    Confirming on blockchain...
                  </>
                ) : (
                  <>
                    <FilePlus2 size={17} />
                    Propose invoice
                  </>
                )}
              </button>

              <p className="form-hint transaction-hint">
                <ShieldCheck size={14} />
                The invoice is created once {required} owners approve it.
              </p>
            </form>
          </section>

          {/* RESULT PANEL */}
          <section className="panel invoice-preview-panel">
            <div className="panel-heading">
              <h3>Status</h3>
            </div>

            {proposal ? (
              <div className="invoice-success">
                <div className="success-icon">
                  <CircleCheck size={28} />
                </div>

                <h2>Proposal #{proposal.id} submitted</h2>
                <p>
                  {stillNeeded > 0
                    ? `It needs ${stillNeeded} more owner approval(s), then an owner executes it to create the invoice.`
                    : "It has enough approvals. Execute it on the Approvals page to create the invoice."}
                </p>

                <div className="invoice-result-card">
                  <span className="result-label">Amount</span>
                  <strong>{proposal.amount} mUSDC</strong>

                  <span className="result-label">Merchant</span>
                  <span className="result-address">
                    {CONTRACT_ADDRESSES.MULTISIG_WALLET}
                  </span>

                  <div className="result-status">
                    <span className="status-badge pending-badge">
                      Awaiting approval
                    </span>
                  </div>
                </div>

                <button
                  className="secondary-button full-width"
                  onClick={() => onNavigate("Approvals")}
                >
                  <ShieldCheck size={16} /> Go to Approvals
                </button>

                <button className="text-link" onClick={() => setProposal(null)}>
                  <ArrowLeft size={15} /> Propose another invoice
                </button>
              </div>
            ) : (
              <div className="invoice-empty-preview">
                <div className="preview-icon">
                  <FilePlus2 size={30} />
                </div>

                <h3>How invoices work</h3>
                <p>
                  An owner proposes the invoice, {required} owners approve it, and it is
                  created on-chain with the treasury as the merchant.
                </p>

                <div className="preview-detail">
                  <span>Payment currency</span>
                  <strong>mUSDC</strong>
                </div>

                <div className="preview-detail">
                  <span>Approvals required</span>
                  <strong>
                    {required} of {info?.owners.length ?? 3} owners
                  </strong>
                </div>

                <div className="preview-detail">
                  <span>Funds go to</span>
                  <strong>Multisig treasury</strong>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {!account && (
        <button className="secondary-button" onClick={connectWallet}>
          <Wallet size={17} /> Connect MetaMask
        </button>
      )}

      <InvoiceHistory refreshKey={proposal?.id ?? ""} />
    </div>
  );
}

export default CreateInvoice;
