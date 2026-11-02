
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { Wallet as WalletIcon, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { getMockStablecoinContract } from "../utils/contracts";

export default function Wallet() {
  const { account, provider } = useWallet();

  const [ethBalance, setEthBalance] = useState("0.0000");
  const [tokenBalance, setTokenBalance] = useState("0.00");
  const [loading, setLoading] = useState(false);

  const shortAddress = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "Not connected";

  async function loadBalances() {
    if (!account || !provider) return;

    try {
      setLoading(true);

      const balance = await provider.getBalance(account);
      setEthBalance(ethers.formatEther(balance));

      const token = getMockStablecoinContract(provider);
      const balanceToken = await token.balanceOf(account);

      setTokenBalance(
        ethers.formatUnits(balanceToken, 6)
      );
    } catch (error) {
      console.error("Failed to load balances:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBalances();
  }, [account, provider]);

  async function copyAddress() {
    if (!account) return;
    await navigator.clipboard.writeText(account);
    alert("Wallet address copied!");
  }

  if (!account) {
    return (
      <div className="page-container">
        <h1>My Wallet</h1>
        <p>Please connect your MetaMask wallet to view balances.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WALLET MANAGEMENT</p>
          <h1>My Wallet</h1>
          <p>Manage your connected wallet and assets.</p>
        </div>

        <button
          className="secondary-button"
          onClick={loadBalances}
          disabled={loading}
        >
          <RefreshCw size={16} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="wallet-overview-card">
        <div className="wallet-icon">
          <WalletIcon size={24} />
        </div>

        <div>
          <p>Connected wallet</p>
          <h2>{shortAddress}</h2>
          <button className="text-button" onClick={copyAddress}>
            <Copy size={14} /> Copy address
          </button>
        </div>

        <span className="status-badge">Connected</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p>Native ETH balance</p>
          <h2>{Number(ethBalance).toFixed(4)} ETH</h2>
          <span>Hardhat Local Network</span>
        </div>

        <div className="stat-card">
          <p>Mock stablecoin balance</p>
          <h2>{Number(tokenBalance).toFixed(2)} mUSDC</h2>
          <span>6 decimal token</span>
        </div>
      </div>

      <div className="info-card">
        <h3>Network information</h3>
        <div className="info-row">
          <span>Network</span>
          <strong>Ethereum Local</strong>
        </div>
        <div className="info-row">
          <span>Chain ID</span>
          <strong>31337</strong>
        </div>
        <div className="info-row">
          <span>Wallet address</span>
          <strong>{account}</strong>
        </div>
      </div>
    </div>
  );
}
