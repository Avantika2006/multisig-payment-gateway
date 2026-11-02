
import { useState } from "react";
import { ethers } from "ethers";
import {
  FilePlus2,
  Wallet,
  CircleCheck,
  Copy,
  Loader2,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { getMerchantPaymentContract } from "../utils/contracts";

function CreateInvoice() {
  const { account, provider, connectWallet } = useWallet();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<{
    id: string;
    amount: string;
    merchant: string;
  } | null>(null);

  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreatedInvoice(null);

    if (!account || !provider) {
      setError("Please connect your MetaMask wallet first.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      setError("Please enter a valid invoice amount.");
      return;
    }

    try {
      setIsCreating(true);

      const signer = await provider.getSigner();
      const contract = getMerchantPaymentContract(signer);

      // Mock stablecoin uses 6 decimal places
      const parsedAmount = ethers.parseUnits(amount, 6);

      // Create invoice on the blockchain
      const tx = await contract.createInvoice(parsedAmount);

      // Wait for blockchain confirmation
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction confirmation failed.");
      }

      // Read the latest invoice ID from the contract
      const nextId = await contract.nextInvoiceId();
      const invoiceId = (nextId - 1n).toString();

      setCreatedInvoice({
        id: invoiceId,
        amount,
        merchant: account,
      });

      setAmount("");
      setDescription("");
    } catch (err: unknown) {
      console.error("Invoice creation failed:", err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create invoice. Please try again.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function copyInvoiceDetails() {
    if (!createdInvoice) return;

    const invoiceText = `QUORUM PAYMENT REQUEST
Invoice ID: ${createdInvoice.id}
Amount: ${createdInvoice.amount} mUSDC
Merchant: ${createdInvoice.merchant}`;

    try {
      await navigator.clipboard.writeText(invoiceText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  return (
    <div className="invoice-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MERCHANT WORKSPACE</p>
          <h1>Create invoice</h1>
          <p className="page-subtitle">
            Generate a secure on-chain payment request.
          </p>
        </div>
      </div>

      <div className="invoice-layout">
        {/* FORM */}
        <section className="panel invoice-form-panel">
          <div className="panel-heading">
            <h3>
              <FilePlus2 size={19} /> Invoice details
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

            <div className="form-group">
              <label htmlFor="invoice-description">
                Description <span className="optional-label">(optional)</span>
              </label>

              <textarea
                id="invoice-description"
                placeholder="What is this payment for?"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="invoice-merchant-info">
              <div className="quick-icon">
                <Wallet size={18} />
              </div>

              <div>
                <strong>Receiving wallet</strong>
                <span>
                  {account
                    ? `${account.slice(0, 6)}...${account.slice(-4)}`
                    : "Connect your wallet"}
                </span>
              </div>
            </div>

            {!account && (
              <button
                type="button"
                className="secondary-button full-width"
                onClick={connectWallet}
              >
                <Wallet size={17} /> Connect MetaMask
              </button>
            )}

            {error && (
              <div className="form-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="primary-button full-width"
              disabled={isCreating || !account}
            >
              {isCreating ? (
                <>
                  <Loader2 size={17} className="spin-icon" />
                  Confirming on blockchain...
                </>
              ) : (
                <>
                  <FilePlus2 size={17} />
                  Create invoice on-chain
                </>
              )}
            </button>

            <p className="form-hint transaction-hint">
              <ShieldCheck size={14} />
              This action requires MetaMask transaction approval.
            </p>
          </form>
        </section>

        {/* SUCCESS PANEL */}
        <section className="panel invoice-preview-panel">
          <div className="panel-heading">
            <h3>Invoice preview</h3>
          </div>

          {createdInvoice ? (
            <div className="invoice-success">
              <div className="success-icon">
                <CircleCheck size={28} />
              </div>

              <h2>Invoice created!</h2>
              <p>Your payment request has been recorded on-chain.</p>

              <div className="invoice-result-card">
                <span className="result-label">Invoice ID</span>
                <strong>#{createdInvoice.id}</strong>

                <span className="result-label">Amount due</span>
                <strong>
                  {createdInvoice.amount} mUSDC
                </strong>

                <span className="result-label">Merchant</span>
                <span className="result-address">
                  {createdInvoice.merchant}
                </span>

                <div className="result-status">
                  <span className="status-badge pending-badge">
                    Awaiting payment
                  </span>
                </div>
              </div>

              <button
                className="secondary-button full-width"
                onClick={copyInvoiceDetails}
              >
                <Copy size={16} />
                {copied ? "Copied!" : "Copy invoice details"}
              </button>

              <button
                className="text-link"
                onClick={() => setCreatedInvoice(null)}
              >
                <ArrowLeft size={15} /> Create another invoice
              </button>
            </div>
          ) : (
            <div className="invoice-empty-preview">
              <div className="preview-icon">
                <FilePlus2 size={30} />
              </div>

              <h3>Your invoice will appear here</h3>
              <p>
                Enter an amount and submit the form to generate
                a unique on-chain invoice.
              </p>

              <div className="preview-detail">
                <span>Payment currency</span>
                <strong>mUSDC</strong>
              </div>

              <div className="preview-detail">
                <span>Payment method</span>
                <strong>Smart contract</strong>
              </div>

              <div className="preview-detail">
                <span>Confirmation</span>
                <strong>MetaMask</strong>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default CreateInvoice;
