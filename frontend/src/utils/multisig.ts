import { ethers } from "ethers";

import { getMultiSigWalletContract } from "./contracts";

export interface MultisigInfo {
  owners: string[];
  required: number;
}

export interface Proposal {
  id: number;
  to: string;
  value: string;
  data: string;
  executed: boolean;
  approvalCount: number;
  approvedByMe: boolean;
}

export const isOwnerOf = (info: MultisigInfo | null, account: string | null) =>
  Boolean(
    info && account && info.owners.some((o) => o.toLowerCase() === account.toLowerCase())
  );

export async function loadMultisigInfo(provider: ethers.BrowserProvider): Promise<MultisigInfo> {
  const wallet = getMultiSigWalletContract(provider);
  const [owners, required] = await Promise.all([wallet.getOwners(), wallet.requiredApprovals()]);
  return { owners: [...owners], required: Number(required) };
}

/** All proposals read straight from the contract, newest first. */
export async function loadProposals(
  provider: ethers.BrowserProvider,
  account: string | null
): Promise<Proposal[]> {
  const wallet = getMultiSigWalletContract(provider);
  const count = Number(await wallet.getTransactionCount());

  const list = await Promise.all(
    Array.from({ length: count }, async (_, id) => {
      const [tx, approvedByMe] = await Promise.all([
        wallet.getTransaction(id),
        account ? wallet.approved(id, account) : false,
      ]);
      return {
        id,
        to: tx.to,
        value: ethers.formatEther(tx.value),
        data: tx.data,
        executed: tx.executed,
        approvalCount: Number(tx.approvalCount),
        approvedByMe: Boolean(approvedByMe),
      };
    })
  );
  return list.reverse();
}

/**
 * Submits a multisig proposal (and optionally approves it as the submitter).
 * Returns the proposal id, read from the TransactionSubmitted event.
 */
export async function submitProposal(
  provider: ethers.BrowserProvider,
  to: string,
  data: string,
  autoApprove: boolean
): Promise<bigint> {
  const signer = await provider.getSigner();
  const wallet = getMultiSigWalletContract(signer);

  const receipt = await (await wallet.submitTransaction(to, 0, data)).wait();
  const submitted = receipt?.logs
    .map((log: ethers.Log) => {
      try {
        return wallet.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed: ethers.LogDescription | null) => parsed?.name === "TransactionSubmitted");
  const id: bigint = submitted
    ? submitted.args.transactionId
    : (await wallet.getTransactionCount()) - 1n;

  if (autoApprove) {
    await (await wallet.approveTransaction(id)).wait();
  }
  return id;
}
