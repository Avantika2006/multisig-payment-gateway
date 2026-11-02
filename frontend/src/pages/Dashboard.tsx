
import {
  LayoutDashboard,
  FilePlus2,
  ShieldCheck,
  ArrowLeftRight,
  Settings2,
  Bell,
  Plus,
  Clock3,
  CircleCheck,
  Store,
  ChevronRight,
  Copy,
  TrendingUp,
  Menu,
  LogOut,
  ExternalLink,
  Wallet as WalletIcon,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { useEffect, useState } from "react";
import { ethers } from "ethers";


import MockStablecoinArtifact from "../contracts/MockStablecoin.json";
import { CONTRACT_ADDRESSES } from "../../contractAddresses";
import CreateInvoice from "./CreateInvoice";
import Overview from "./Overview";
import WalletPage from "./Wallet";
import Approvals from "./Approvals";
import Transactions from "./Transactions";
import Settings from "./Settings";

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "My Wallet", icon: WalletIcon },
  { label: "Create Invoice", icon: FilePlus2 },
  { label: "Approvals", icon: ShieldCheck },
  { label: "Transactions", icon: ArrowLeftRight },
  { label: "Settings", icon: Settings2 },
];

function Dashboard() {
  const { account, provider, connectWallet, disconnectWallet } = useWallet();

  const [activePage, setActivePage] = useState("Overview");
  const [ethBalance, setEthBalance] = useState("0.0000");
  const [tokenBalance, setTokenBalance] = useState("0.00");
  const [networkName, setNetworkName] = useState("Ethereum Local");
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [copied, setCopied] = useState(false);

  const shortAddress = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "Not connected";

  // Fetch wallet network and balances
  useEffect(() => {
    async function fetchWalletData() {
      if (!account || !provider) {
        setEthBalance("0.0000");
        setTokenBalance("0.00");
        setNetworkName("Not connected");
        return;
      }

      setIsLoadingBalance(true);

      try {
        const [balance, network] = await Promise.all([
          provider.getBalance(account),
          provider.getNetwork(),
        ]);

        setEthBalance(
          Number(ethers.formatEther(balance)).toFixed(4)
        );

        setNetworkName(
          network.chainId === 31337n
            ? "Ethereum Local"
            : network.name
        );

        const tokenContract = new ethers.Contract(
          CONTRACT_ADDRESSES.MOCK_STABLECOIN,
          MockStablecoinArtifact.abi,
          provider
        );

        const [tokenAmount, decimals] = await Promise.all([
          tokenContract.balanceOf(account),
          tokenContract.decimals(),
        ]);

        setTokenBalance(
          Number(
            ethers.formatUnits(tokenAmount, decimals)
          ).toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })
        );
      } catch (error) {
        console.error("Failed to fetch wallet data:", error);
      } finally {
        setIsLoadingBalance(false);
      }
    }

    fetchWalletData();
  }, [account, provider]);

  // Copy wallet address
  async function copyAddress() {
    if (!account) return;

    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Unable to copy address:", error);
    }
  }

  // Page navigation
  function navigateTo(page: string) {
    setActivePage(page);
  }

  const pageDescriptions: Record<string, string> = {
    "My Wallet":
      "Manage your connected wallet and view your on-chain assets.",
    "Create Invoice":
      "Create payment requests for your customers using mUSDC.",
    Approvals:
      "Review, approve, and execute multi-signature transactions.",
    Transactions:
      "Monitor your payment and multi-signature transaction history.",
    Settings:
      "Manage your wallet preferences and application settings.",
  };

  return (
    <div className="quorum-app">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-symbol">Q</div>
          <div>
            <h2>QUORUM</h2>
            <span>Multi-Sig Payment Gateway</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>


        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className={`nav-item ${activePage === item.label ? "active" : ""
                  }`}
                onClick={() => navigateTo(item.label)}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
                {activePage === item.label && (
                  <span className="active-indicator" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="merchant-avatar">
            <Store size={21} />
          </div>

          <div className="merchant-info">
            <strong>Merchant account</strong>
            <span>
              <i className="online-dot" /> Local environment
            </span>
          </div>

          <Menu size={17} className="merchant-menu" />
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main-area">
        {/* TOPBAR */}
        <header className="topbar">
          <div className="network-pill">
            <span className="ethereum-icon">◆</span>
            {networkName}
            <span className="network-dot" />
          </div>

          <button className="icon-button notification-button">
            <Bell size={19} />
            <span className="notification-dot" />
          </button>

          <button
            className="wallet-button"
            onClick={account ? disconnectWallet : connectWallet}
          >
            {account ? (
              <>
                <WalletIcon size={17} />
                {shortAddress}
              </>
            ) : (
              <>
                <WalletIcon size={17} />
                Connect Wallet
              </>
            )}
          </button>
        </header>

        {/* PAGE CONTENT */}

       
{/* PAGE CONTENT */}
<div className="dashboard-content">

  {activePage === "Overview" ? (
    <>
      {/* OVERVIEW DASHBOARD */}
      <section className="page-heading">
        <div>
          <p className="eyebrow">MERCHANT WORKSPACE</p>
          <h1>Good evening, Merchant</h1>
          <p className="page-subtitle">
            Here's what's happening with your payments.
          </p>
        </div>

        <div className="heading-actions">
          <button
            className="primary-button"
            onClick={() => navigateTo("Create Invoice")}
          >
            <Plus size={17} /> Create invoice
          </button>

          <button
            className="secondary-button"
            onClick={() => navigateTo("Transactions")}
          >
            <ArrowLeftRight size={17} /> View transactions
          </button>
        </div>
      </section>

      {/* STATISTICS */}
      <section className="stats-grid">
        {[
          { label: "Total received", value: "$0.00", icon: WalletIcon },
          { label: "Pending payments", value: "$0.00", icon: Clock3 },
          { label: "Awaiting approval", value: "0", icon: ShieldCheck },
          { label: "Completed transactions", value: "0", icon: CircleCheck },
        ].map((stat) => {
          const Icon = stat.icon;

          return (
            <div className="stat-card" key={stat.label}>
              <div className="stat-top">
                <div className="stat-icon">
                  <Icon size={19} />
                </div>
                <span className="stat-change">
                  <TrendingUp size={13} /> +0.0%
                </span>
              </div>

              <p className="stat-label">{stat.label}</p>
              <h2>{stat.value}</h2>
              <span className="stat-caption">vs. last 30 days</span>

              <div className="sparkline">
                <svg viewBox="0 0 100 32" preserveAspectRatio="none">
                  <path
                    d="M0 27 C15 25,20 23,30 25 S45 13,55 18 S75 5,100 3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </section>

      {/* ANALYTICS */}
      <section className="analytics-grid">
        <div className="panel volume-panel">
          <div className="panel-heading">
            <h3>Payment volume</h3>
            <div className="period-selector">
              <button>7D</button>
              <button className="selected">30D</button>
              <button>90D</button>
            </div>
          </div>

          <div className="chart-area">
            <div className="chart-y-labels">
              <span>$50K</span>
              <span>$40K</span>
              <span>$30K</span>
              <span>$20K</span>
              <span>$10K</span>
              <span>$0</span>
            </div>

            <div className="chart">
              <div className="chart-grid-lines">
                <span /><span /><span /><span /><span /><span />
              </div>

              <svg viewBox="0 0 600 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="roseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E58CA4" stopOpacity=".3" />
                    <stop offset="100%" stopColor="#E58CA4" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <path
                  d="M0 170 C40 150,55 145,80 155 S130 110,170 125 S220 95,250 120 S300 80,350 105 S400 55,450 90 S500 35,550 65 S580 35,600 25 L600 200 L0 200 Z"
                  fill="url(#roseFill)"
                />

                <path
                  d="M0 170 C40 150,55 145,80 155 S130 110,170 125 S220 95,250 120 S300 80,350 105 S400 55,450 90 S500 35,550 65 S580 35,600 25"
                  fill="none"
                  stroke="#E58CA4"
                  strokeWidth="3"
                />
              </svg>

              <div className="chart-x-labels">
                <span>Oct 2</span><span>Oct 6</span>
                <span>Oct 10</span><span>Oct 14</span>
                <span>Oct 18</span><span>Oct 22</span>
                <span>Oct 26</span><span>Oct 30</span>
              </div>
            </div>
          </div>

          <div className="chart-empty-note">
            Illustrative chart · Live analytics coming soon
          </div>
        </div>

        <div className="panel distribution-panel">
          <div className="panel-heading">
            <h3>Payment distribution</h3>
          </div>

          <div className="donut-container">
            <div className="donut">
              <div className="donut-center">
                <strong>0</strong>
                <span>Transactions</span>
              </div>
            </div>

            <div className="donut-legend">
              <div><i className="legend-dot completed" />Completed <span>0</span></div>
              <div><i className="legend-dot pending" />Pending <span>0</span></div>
              <div><i className="legend-dot awaiting" />Awaiting sig. <span>0</span></div>
              <div><i className="legend-dot failed" />Failed <span>0</span></div>
            </div>
          </div>
        </div>

        <div className="panel quick-actions-panel">
          <div className="panel-heading">
            <h3>Quick actions</h3>
          </div>

          <div className="quick-action" onClick={() => navigateTo("Create Invoice")}>
            <div className="quick-icon"><FilePlus2 size={19} /></div>
            <div>
              <strong>Create invoice</strong>
              <span>Generate a payment request</span>
            </div>
            <ChevronRight size={17} />
          </div>

          <div className="quick-action" onClick={() => navigateTo("Approvals")}>
            <div className="quick-icon"><ShieldCheck size={19} /></div>
            <div>
              <strong>Review approvals</strong>
              <span>View pending transactions</span>
            </div>
            <ChevronRight size={17} />
          </div>

          <div className="quick-action" onClick={account ? copyAddress : connectWallet}>
            <div className="quick-icon"><WalletIcon size={19} /></div>
            <div>
              <strong>{account ? "Copy wallet address" : "Connect wallet"}</strong>
              <span>
                {account ? (copied ? "Address copied!" : shortAddress) : "Connect MetaMask"}
              </span>
            </div>
            <ChevronRight size={17} />
          </div>
        </div>
      </section>

      {/* RECENT TRANSACTIONS + WALLET STATUS */}
      <section className="bottom-grid">
        <div className="panel transactions-panel">
          <div className="panel-heading">
            <h3>Recent transactions</h3>
            <button className="text-link" onClick={() => navigateTo("Transactions")}>
              View all transactions <ArrowLeftRight size={14} />
            </button>
          </div>

          <div className="transaction-table">
            <div className="table-header">
              <span>Customer</span>
              <span>Invoice ID</span>
              <span>Amount</span>
              <span>Date</span>
              <span>Status</span>
            </div>

            <div className="empty-transactions">
              <ArrowLeftRight size={22} />
              <p>No transactions yet</p>
              <span>Your on-chain activity will appear here.</span>
            </div>
          </div>

          <p className="table-footnote">Connected to your local blockchain</p>
        </div>

        <div className="panel wallet-status-panel">
          <div className="panel-heading">
            <h3>Wallet status</h3>
          </div>

          <div className="wallet-status-card">
            <div className="wallet-status-top">
              <div className="metamask-icon">🦊</div>
              <div className="wallet-details">
                <strong>MetaMask</strong>
                <span>{account ? shortAddress : "Not connected"}</span>
              </div>

              <button className="connect-small" onClick={account ? copyAddress : connectWallet}>
                {account ? (copied ? "Copied!" : "Copy") : "Connect"}
              </button>
            </div>

            <div className="wallet-info-row">
              <span>Network</span>
              <strong>{networkName}</strong>
            </div>
            <div className="wallet-info-row">
              <span>ETH Balance</span>
              <strong>{isLoadingBalance ? "Loading..." : `${ethBalance} ETH`}</strong>
            </div>
            <div className="wallet-info-row">
              <span>mUSDC Balance</span>
              <strong>{isLoadingBalance ? "Loading..." : `${tokenBalance} mUSDC`}</strong>
            </div>
          </div>

          <div className="security-note">
            <ShieldCheck size={14} />
            Connected to deployed smart contracts
          </div>
        </div>
      </section>
    </>
  ) : (
    /* OTHER PAGES — render exactly one page */
    <>
      {activePage === "My Wallet" && <WalletPage />}
      {activePage === "Create Invoice" && <CreateInvoice />}
      {activePage === "Approvals" && <Approvals />}
      {activePage === "Transactions" && <Transactions />}
      {activePage === "Settings" && <Settings />}
    </>
  )}

</div>


      </main>
    </div>
  );
}

export default Dashboard;
