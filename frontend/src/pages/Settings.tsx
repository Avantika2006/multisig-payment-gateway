
import { useState } from "react";
import {
  Settings as SettingsIcon,
  Wallet,
  Copy,
  ShieldCheck,
  Network,
} from "lucide-react";

import { useWallet } from "../context/WalletContext";
import { CONTRACT_ADDRESSES } from "../../contractAddresses";
import { shortenAddress } from "../utils/contracts";

export default function Settings() {
  const { account, connectWallet, disconnectWallet } = useWallet();

  const [copied, setCopied] = useState("");

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h1>Settings</h1>
          <p className="page-subtitle">
            Manage your wallet connection and view contract details.
          </p>
        </div>
      </div>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <h3>
            <Wallet size={18} /> Wallet connection
          </h3>
        </div>

        <div className="settings-row">
          <span>Status</span>
          <strong className={account ? "connected-text" : "muted-text"}>
            {account ? "Connected" : "Not connected"}
          </strong>
        </div>

        {account && (
          <div className="settings-row">
            <span>Address</span>
            <div className="settings-value-action">
              <strong>{shortenAddress(account)}</strong>
              <button
                className="icon-button"
                onClick={() => copyText(account, "wallet")}
              >
                <Copy size={14} />
                {copied === "wallet" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <div className="settings-actions">
          {account ? (
            <button className="secondary-button" onClick={disconnectWallet}>
              Disconnect wallet
            </button>
          ) : (
            <button className="primary-button" onClick={connectWallet}>
              Connect MetaMask
            </button>
          )}
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <h3>
            <Network size={18} /> Network configuration
          </h3>
        </div>

        <div className="settings-row">
          <span>Network</span>
          <strong>Hardhat Local</strong>
        </div>

        <div className="settings-row">
          <span>Chain ID</span>
          <strong>31337</strong>
        </div>

        <div className="settings-row">
          <span>RPC URL</span>
          <strong>http://127.0.0.1:8545</strong>
        </div>

        <p className="settings-note">
          This application is currently configured for local development.
          Do not use these test contracts for real funds.
        </p>
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <h3>
            <ShieldCheck size={18} /> Smart contract addresses
          </h3>
        </div>

        {Object.entries(CONTRACT_ADDRESSES).map(([name, address]) => (
          <div className="settings-row" key={name}>
            <span>{name.replaceAll("_", " ")}</span>

            <div className="settings-value-action">
              <strong>{shortenAddress(address)}</strong>
              <button
                className="icon-button"
                onClick={() => copyText(address, name)}
              >
                <Copy size={14} />
                {copied === name ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <h3>
            <SettingsIcon size={18} /> About QUORUM
          </h3>
        </div>

        <div className="settings-row">
          <span>Application</span>
          <strong>QUORUM</strong>
        </div>

        <div className="settings-row">
          <span>Version</span>
          <strong>1.0.0 · Academic prototype</strong>
        </div>

        <div className="settings-row">
          <span>Technology</span>
          <strong>React · Solidity · Ethereum · Hardhat</strong>
        </div>
      </section>
    </div>
  );
}
