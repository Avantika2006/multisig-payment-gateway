import { ethers } from "ethers";
import MockStablecoinArtifact from "../contracts/MockStablecoin.json";
import MerchantPaymentArtifact from "../contracts/MerchantPayment.json";
import { CONTRACT_ADDRESSES } from "../../contractAddresses";

const tokenIface = new ethers.Interface(MockStablecoinArtifact.abi);
const gatewayIface = new ethers.Interface(MerchantPaymentArtifact.abi);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Turns raw multisig calldata into something a human can approve:
 *   "Send 200.0 mUSDC"  /  "Create invoice (500.0 mUSDC)"  /  "0.5 ETH"
 */
export function describeTransaction(
  to: string,
  valueEth: string,
  data: string
): { title: string; detail: string } {
  try {
    if (data && data !== "0x") {
      if (same(to, CONTRACT_ADDRESSES.MOCK_STABLECOIN)) {
        const parsed = tokenIface.parseTransaction({ data });
        if (parsed?.name === "transfer") {
          return {
            title: `Send ${ethers.formatUnits(parsed.args[1], 6)} mUSDC`,
            detail: String(parsed.args[0]),
          };
        }
      }
      if (same(to, CONTRACT_ADDRESSES.MERCHANT_PAYMENT)) {
        const parsed = gatewayIface.parseTransaction({ data });
        if (parsed?.name === "createInvoice") {
          return {
            title: `Create invoice (${ethers.formatUnits(parsed.args[0], 6)} mUSDC)`,
            detail: `${to} (MerchantPayment)`,
          };
        }
      }
      return { title: "Contract call", detail: to };
    }
  } catch {
    /* fall through */
  }
  return { title: `${valueEth} ETH`, detail: to };
}
