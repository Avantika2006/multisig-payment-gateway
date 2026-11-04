
import {
  LayoutDashboard,
  FilePlus2,
  ShieldCheck,
  History,
  Settings2,
  Bell,
  Store,
  Menu,
  Wallet as WalletIcon,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { useEffect, useState } from "react";

import CreateInvoice from "./CreateInvoice";
import Overview from "./Overview";
import WalletPage from "./Wallet";
import Approvals from "./Approvals";
import Activity from "./Activity";
import Settings from "./Settings";

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "My Wallet", icon: WalletIcon },
  { label: "Invoices", icon: FilePlus2 },
  { label: "Approvals", icon: ShieldCheck },
  { label: "Activity", icon: History },
  { label: "Settings", icon: Settings2 },
];

function Dashboard() {
  const { account, provider, connectWallet, disconnectWallet } = useWallet();

  const [activePage, setActivePage] = useState("Overview");
  const [networkName, setNetworkName] = useState("Not connected");

  const shortAddress = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "Not connected";

  // Network shown in the top bar and sidebar
  useEffect(() => {
    if (!account || !provider) {
      setNetworkName("Not connected");
      return;
    }

    provider
      .getNetwork()
      .then((network) =>
        setNetworkName(network.chainId === 31337n ? "Ethereum Local" : network.name)
      )
      .catch((error) => console.error("Failed to read network:", error));
  }, [account, provider]);

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
                onClick={() => setActivePage(item.label)}
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
              <i className="online-dot" /> {networkName}
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
            <WalletIcon size={17} />
            {account ? shortAddress : "Connect Wallet"}
          </button>
        </header>

        {/* PAGE CONTENT — render exactly one page */}
        <div className="dashboard-content">
          {activePage === "Overview" && <Overview onNavigate={setActivePage} />}
          {activePage === "My Wallet" && <WalletPage />}
          {activePage === "Invoices" && <CreateInvoice onNavigate={setActivePage} />}
          {activePage === "Approvals" && <Approvals />}
          {activePage === "Activity" && <Activity />}
          {activePage === "Settings" && <Settings />}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
