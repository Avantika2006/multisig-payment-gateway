
import { useEffect, useState } from "react";
import {
  Wallet,
  Clock3,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { getMerchantPaymentContract } from "../utils/contracts";

export default function Overview() {
  const { account, provider } = useWallet();

  const [totalReceived, setTotalReceived] = useState("0");
  const [payments, setPayments] = useState(0);
  const [loading, setLoading] = useState(false);

  async function loadOverview() {
    if (!provider) return;

    try {
      setLoading(true);

      const contract = getMerchantPaymentContract(provider);
      const events = await contract.queryFilter(
        contract.filters.PaymentReceived(),
        0,
        "latest"
      );

      let total = 0n;
      let count = 0;

      for (const event of events) {
        const log = event as any;

        if (
          account &&
          log.args.customer.toLowerCase() === account.toLowerCase()
        ) {
          total += log.args.amount;
          count++;
        }
      }

      setTotalReceived((Number(total) / 1e6).toFixed(2));
      setPayments(count);
    } catch (error) {
      console.error("Overview loading failed:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, [provider, account]);

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">QUORUM WORKSPACE</p>
          <h1>Overview</h1>
          <p className="page-subtitle">
            A live summary of your blockchain payment activity.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={loadOverview}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin-icon" : ""} />
          Refresh
        </button>
      </div>

      <div className="stats-grid">
        <section className="panel stat-card">
          <div className="quick-icon">
            <Wallet size={19} />
          </div>
          <span>Total received</span>
          <h2>{loading ? "..." : `${totalReceived} mUSDC`}</h2>
          <small>Confirmed on-chain payments</small>
        </section>

        <section className="panel stat-card">
          <div className="quick-icon">
            <CheckCircle2 size={19} />
          </div>
          <span>Completed payments</span>
          <h2>{loading ? "..." : payments}</h2>
          <small>Successful payment events</small>
        </section>

        <section className="panel stat-card">
          <div className="quick-icon">
            <Clock3 size={19} />
          </div>
          <span>Payment system</span>
          <h2>Active</h2>
          <small>MerchantPayment contract</small>
        </section>

        <section className="panel stat-card">
          <div className="quick-icon">
            <ShieldCheck size={19} />
          </div>
          <span>Multisig security</span>
          <h2>Enabled</h2>
          <small>MultiSigWallet contract</small>
        </section>
      </div>

      <section className="panel overview-info">
        <div className="panel-heading">
          <h3>Getting started</h3>
        </div>

        <p>
          QUORUM combines on-chain merchant invoices with multi-signature
          transaction security. Use the workspace to create payment requests,
          track confirmed payments, and manage transactions requiring
          multiple wallet approvals.
        </p>
      </section>
    </div>
  );
}
