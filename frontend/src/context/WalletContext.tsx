
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { ethers } from "ethers";

interface WalletContextType {
  account: string | null;
  provider: ethers.BrowserProvider | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] =
    useState<ethers.BrowserProvider | null>(null);

  async function connectWallet() {
    if (!window.ethereum) {
      alert("Please install MetaMask to connect your wallet.");
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send(
        "eth_requestAccounts",
        []
      );

      setProvider(browserProvider);
      setAccount(accounts[0]);
    } catch (error) {
      console.error("Wallet connection failed:", error);
      alert("Failed to connect wallet. Please try again.");
    }
  }

  function disconnectWallet() {
    setAccount(null);
    setProvider(null);
  }

  useEffect(() => {
    if (!window.ethereum) return;

    window.ethereum.on("accountsChanged", (accounts: string[]) => {
      setAccount(accounts[0] || null);
    });

    return () => {
      window.ethereum?.removeAllListeners("accountsChanged");
    };
  }, []);

  return (
    <WalletContext.Provider
      value={{ account, provider, connectWallet, disconnectWallet }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet must be used inside WalletProvider");
  }

  return context;
}
