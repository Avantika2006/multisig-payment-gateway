
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  ArrowDownLeft,
  RefreshCw,
  ExternalLink,
  History,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { getMerchantPaymentContract } from "../utils/contracts";
import { CONTRACT_ADDRESSES } from "../../contractAddresses";
import InvoiceHistory from "../components/InvoiceHistory";

interface PaymentRecord {
  id: string;
  customer: string;
  merchant: string;
  amount: string;
  transactionHash: string;
  blockNumber: number;
}

export default function Transactions() {
  const { account, provider } = useWallet();

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadTransactions() {
    if (!provider) return;

    try {
      setLoading(true);
      setError("");

      const contract = getMerchantPaymentContract(provider);

      const filter = contract.filters.PaymentReceived();
      const events = await contract.queryFilter(filter, 0, "latest");

      const records: PaymentRecord[] = events.map((event) => {
        const log = event as ethers.EventLog;
        const args = log.args;

        return {
          id: args.invoiceId.toString(),
          customer: args.customer,
          merchant: args.merchant,
          amount: ethers.formatUnits(args.amount, 6),
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
      });

      const me = account?.toLowerCase();
      const multisig = CONTRACT_ADDRESSES.MULTISIG_WALLET.toLowerCase();
      const filtered = me
        ? records.filter(
            (item) =>
              item.customer.toLowerCase() === me ||
              item.merchant.toLowerCase() === me ||
              item.merchant.toLowerCase() === multisig
          )
        : records;

      setPayments(filtered.reverse());
    } catch (err) {
      console.error(err);
      setError(
        "Could not retrieve events. Make sure your Hardhat node is running."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTransactions();
  }, [provider, account]);

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACTIVITY</p>
          <h1>Transactions</h1>
          <p className="page-subtitle">
            View payment events recorded on the blockchain.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={loadTransactions}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin-icon" : ""} />
          Refresh
        </button>
      </div>

      <InvoiceHistory />

      <section className="panel">
        <div className="panel-heading">
          <h3>
            <History size={18} /> Payment history
          </h3>
          <span className="muted-text">
            {payments.length} transaction(s)
          </span>
        </div>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <div className="empty-state">Loading blockchain events...</div>
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <ArrowDownLeft size={32} />
            <h3>No payments yet</h3>
            <p>Completed payments will appear here.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Type</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Block</th>
                  <th>Transaction</th>
                </tr>
              </thead>

              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.transactionHash}>
                    <td>#{payment.id}</td>
                    <td>
                      {account &&
                      payment.customer.toLowerCase() === account.toLowerCase()
                        ? "Paid"
                        : "Received"}
                    </td>
                    <td>
                      {payment.customer.slice(0, 6)}...
                      {payment.customer.slice(-4)}
                    </td>
                    <td>{payment.amount} mUSDC</td>
                    <td>{payment.blockNumber}</td>
                    <td>
                      <button
                        className="text-link"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            payment.transactionHash
                          )
                        }
                      >
                        <ExternalLink size={14} />
                        {payment.transactionHash.slice(0, 10)}...
                      </button>
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
