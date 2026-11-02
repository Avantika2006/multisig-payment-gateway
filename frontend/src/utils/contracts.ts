

import { ethers } from "ethers";

import MockStablecoinArtifact from "../contracts/MockStablecoin.json";
import MerchantPaymentArtifact from "../contracts/MerchantPayment.json";
import MultiSigWalletArtifact from "../contracts/MultiSigWallet.json";

import { CONTRACT_ADDRESSES } from "../../contractAddresses";


// ─── GET SIGNER ──────────────────────────────────────
export async function getSigner(
  provider: ethers.BrowserProvider
) {
  return provider.getSigner();
}

// ─── MOCK STABLECOIN CONTRACT ────────────────────────
export function getMockStablecoinContract(
  signerOrProvider: ethers.Signer | ethers.Provider
) {
  return new ethers.Contract(
    CONTRACT_ADDRESSES.MOCK_STABLECOIN,
    MockStablecoinArtifact.abi,
    signerOrProvider
  );
}

// ─── MERCHANT PAYMENT CONTRACT ────────────────────────
export function getMerchantPaymentContract(
  signerOrProvider: ethers.Signer | ethers.Provider
) {
  return new ethers.Contract(
    CONTRACT_ADDRESSES.MERCHANT_PAYMENT,
    MerchantPaymentArtifact.abi,
    signerOrProvider
  );
}

// ─── MULTISIG WALLET CONTRACT ────────────────────────
export function getMultiSigWalletContract(
  signerOrProvider: ethers.Signer | ethers.Provider
) {
  return new ethers.Contract(
    CONTRACT_ADDRESSES.MULTISIG_WALLET,
    MultiSigWalletArtifact.abi,
    signerOrProvider
  );
}

// ─── FORMAT HELPERS ──────────────────────────────────
export function formatETH(value: bigint | string) {
  return ethers.formatEther(value);
}

export function formatUSDC(value: bigint | string) {
  return ethers.formatUnits(value, 6);
}

// ─── ADDRESS HELPER ──────────────────────────────────
export function shortenAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ─── NETWORK HELPER ──────────────────────────────────
export async function getNetwork(
  provider: ethers.BrowserProvider
) {
  const network = await provider.getNetwork();

  return {
    name: network.name,
    chainId: Number(network.chainId),
  };
}
