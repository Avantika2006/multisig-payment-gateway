# Quorum — Multi-Signature Payment Gateway for Merchants

> Accept stablecoin payments with tamper-proof on-chain receipts, and make sure **no single person can move the merchant's money**: refunds and withdrawals need approval from M of N owners.

Mini project for **CS2614 Fundamentals of Blockchain** (RV University) — *Problem Statement 7: Multi-Signature Payment Gateway for Merchants.*

---

## 1. The problem

Traditional payment gateways keep the receipt ledger in a database the processor controls, charge percentage fees, settle in days, and let a single compromised admin account approve a refund or payout. Crypto payments fix speed and cost but introduce a worse risk: whoever holds the private key controls all the funds.

**Quorum** combines both ideas: customers pay in a stablecoin, every payment becomes a permanent public receipt, and the merchant's balance is held by a **multi-signature wallet** that releases funds only after enough owners approve.

## 2. Features

- **Invoices on-chain** — a merchant creates an invoice (amount in mUSDC); anyone can pay it with an ERC-20 `approve` + `payInvoice`.
- **On-chain receipts** — every payment emits `PaymentReceived` and is stored forever; the backend exposes a verifiable `/api/receipts/:id`.
- **M-of-N multi-sig treasury** — create invoice / refund / withdraw are *proposals*. Execution is impossible until the threshold (default 2-of-3) is reached.
- **Refund workflow** — a refund is a multi-sig token transfer back to the customer (partial refunds supported).
- **Event indexer + REST API** — Node.js service that follows the chain, survives restarts, and serves invoices, proposals, receipts and an activity feed.
- **Signed webhooks** — Stripe-style HMAC-SHA256 webhooks with retries and exponential backoff (`payment.confirmed`, `refund.executed`, `approval.pending`, ...).
- **Merchant dashboard (React)** — overview, wallet, create invoice with a permanent **invoice history** (rebuilt from on-chain events), a **Pay** button for customers, approvals queue with a **New proposal** form and signer progress, transactions, settings.

## 3. How it works

```
 Customer wallet                                              Merchant owners (2-of-3)
       │                                                               │
       │ 1. approve(mUSDC)                                             │ A. submitTransaction(...)
       │ 2. payInvoice(id)                                             │ B. approveTransaction(id) x2
       ▼                                                               ▼ C. executeTransaction(id)
┌──────────────┐  transferFrom   ┌───────────────────┐         ┌──────────────────┐
│ MockStablecoin│◄───────────────│  MerchantPayment  │         │  MultiSigWallet  │
│   (ERC-20)    │                │ invoices+receipts │◄────────│  (merchant = this│
└──────────────┘                 └───────────────────┘ calls   │   contract)      │
                                          │ events             └──────────────────┘
                                          ▼                             │ events
                          ┌──────────────────────────────────────────────┘
                          ▼
                 Backend: indexer ─► JSON store ─► REST API ─► React dashboard
                                         └──────► signed webhooks ─► merchant server
```

**The key design idea:** `MerchantPayment` pays whoever called `createInvoice()`. When the **`MultiSigWallet` contract itself** is that caller, every incoming payment lands in the multi-sig, and every refund or withdrawal (an ERC-20 `transfer` sent *by* the multi-sig) must be approved by M of N owners.

**Lifecycle of a payment and a refund**

1. Owners propose `createInvoice(500 mUSDC)` through the multi-sig → 2 approve → executed. Invoice `#0` now has the multi-sig as merchant.
2. Customer approves the gateway to spend 500 mUSDC and calls `payInvoice(0)`. Tokens move to the multi-sig; `PaymentReceived` is emitted.
3. Customer asks for a refund. An owner proposes `mUSDC.transfer(customer, 200)`.
4. One approval is **not** enough — `executeTransaction` reverts with `Not enough approvals`.
5. A second owner approves → anyone who is an owner executes → the customer receives 200 mUSDC.

### Where the blockchain is actually used

| Need | Blockchain feature | In this project |
|---|---|---|
| Trustworthy receipts | Immutable ledger + event logs | `PaymentReceived` event / `invoices` mapping |
| No single point of failure | Smart-contract-enforced multi-sig | `MultiSigWallet` threshold approvals |
| Fast, cheap settlement | Stablecoin token | ERC-20 `MockStablecoin` (6 decimals) |
| Rules nobody can bypass | Smart contracts | Paid-once, approve-before-execute, owner-only checks |
| Audit trail | Public transaction history | Every approval has the signer's address and a tx hash |

Personal data (customer names, descriptions) is deliberately **not** stored on-chain.

## 4. Tech stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity 0.8.34 |
| Dev / test | Hardhat 3, Mocha + Chai, ethers v6 |
| Network | Hardhat local node (chain 31337), Sepolia testnet |
| Backend | Node.js 20+, Express, ethers v6, JSON-file store |
| Frontend | React 19, TypeScript, Vite, ethers v6, MetaMask |

## 5. Repository structure

```
contracts/            MockStablecoin.sol, MerchantPayment.sol, MultiSigWallet.sol
test/                 PaymentGateway.ts (core), GatewayExtended.ts (edge cases + integration)
scripts/              deploy.ts (deploy + write addresses), demo.ts (end-to-end story + gas table)
deployments/          <network>.json written by deploy.ts
backend/              indexer, REST API, webhook dispatcher, demo webhook receiver
frontend/             React dashboard
docs/                 report / presentation material
```

## 6. Smart contracts

**`MockStablecoin`** — minimal ERC-20 ("Mock USD Coin", `mUSDC`, 6 decimals). The deployer receives 1,000,000 mUSDC. Testnet use only.

**`MerchantPayment`**

| Function / event | Purpose |
|---|---|
| `createInvoice(amount)` | Caller becomes the invoice's merchant. Emits `InvoiceCreated(invoiceId, merchant, amount)` |
| `payInvoice(invoiceId)` | Pulls `amount` mUSDC from the caller to the merchant, marks the invoice paid, emits `PaymentReceived(invoiceId, customer, merchant, amount)` |
| `invoices(id)`, `nextInvoiceId()` | Public read access to invoices |

Guards: amount > 0, invoice exists, not already paid, merchant cannot pay own invoice, sufficient balance and allowance.

**`MultiSigWallet`** (generic M-of-N, 2 ≤ N, 1 ≤ M ≤ N)

| Function / event | Purpose |
|---|---|
| `submitTransaction(to, value, data)` | An owner proposes any call. Emits `TransactionSubmitted` |
| `approveTransaction(id)` | An owner approves once. Emits `TransactionApproved` |
| `executeTransaction(id)` | An owner executes once `approvals >= requiredApprovals`. Emits `TransactionExecuted` |
| `getOwners()`, `requiredApprovals()`, `getTransaction(id)`, `getTransactionCount()` | Views |
| `receive()` | Accepts ETH, emits `Deposit` |

Guards: owner-only, no duplicate approvals, no double execution, state updated *before* the external call, failed calls revert.

## 7. Getting started (local)

### Prerequisites
Node.js 20+, npm, Git, MetaMask browser extension.

### Install
```bash
git clone <your-repo-url>
cd multisig-payment-gateway
npm install                      # contracts + tests
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
```

### Run everything (5 terminals, from the project root unless noted)

```bash
# 1. local blockchain (prints 20 funded test accounts)
npx hardhat node

# 2. deploy contracts, writes deployments/localhost.json and frontend/contractAddresses.ts
npm run deploy:local

# 3. backend (indexer + API on :4001)
cd backend && cp .env.example .env && npm start

# 4. optional: demo merchant server that receives webhooks on :4000
cd backend && npm run receiver

# 5. frontend on http://localhost:5173
cd frontend && npm run dev
```

### MetaMask setup
Add a network: **RPC** `http://127.0.0.1:8545`, **Chain ID** `31337`, **Currency** `ETH`. Then import test accounts using the private keys printed by `npx hardhat node`:

| Account | Role in the demo |
|---|---|
| #0, #1, #2 | The three multi-sig owners (2-of-3) |
| #4 | Customer (has 10,000 mUSDC) |

> These keys are public. **Never** send real funds to them or use them on a real network.

### Run the end-to-end demo
With the node, deploy step and (optionally) backend running:
```bash
npm run demo:local
```
It plays the invoice → payment → refund story above, shows the failed early execution and the rejected non-owner, prints a **gas table**, and leaves one half-approved refund so the dashboard's Approvals page has something to approve.

## 8. Testing

```bash
npm test                      # 30 gateway tests (+5 Hardhat template tests until Counter.* is deleted)
npx hardhat test --coverage   # line coverage
npx hardhat test --gas-stats  # gas report
cd backend && npm test        # webhook signing / backoff unit tests
```

Coverage of the three project contracts is 100 % lines and statements (the remaining Hardhat template files `Counter.sol` / `HelloGateway.sol` can be deleted).

**What is tested**

- Core flow: token transfer, pay invoice, multi-sig execute after 2 approvals, reject without enough approvals, reject duplicate approvals
- Edge cases: zero amount, unknown invoice, double payment, merchant paying own invoice, missing allowance / balance, zero-address token
- Multi-sig validation: < 2 owners, bad threshold, duplicate / zero owners, non-owner submit / approve / execute, unknown transaction, double execution, failed inner call, event arguments
- Integration (multi-sig as merchant): create invoice via multi-sig, payment lands in the multi-sig, refund needs 2-of-3, partial refund, **a single compromised owner cannot drain the funds**

Typical gas on the local Hardhat network (unoptimised):

| Operation | Gas (min – max) |
|---|---|
| `createInvoice` | 75,676 – 92,788 |
| `payInvoice` | 84,482 – 94,082 |
| `mUSDC.approve` | 46,708 |
| `submitTransaction` | 84,310 – 156,966 |
| `approveTransaction` | 62,500 – 79,612 |
| `executeTransaction` | 65,726 – 146,821 |

## 9. Backend

The backend turns raw chain events into a merchant-friendly API.

- **Indexer** polls the chain in chunks, processes only blocks with `CONFIRMATIONS` blocks on top (reorg safety), stores `lastProcessedBlock`, and de-duplicates every log by `txHash:logIndex`. After a restart it catches up on everything it missed without repeating anything.
- **Proposal decoding** — it decodes multi-sig calldata, so a proposal is labelled `token_transfer`, `create_invoice`, etc. A token transfer back to a customer who paid an invoice (for no more than they paid) is reported as a **refund**, otherwise as a **withdrawal**.
- **Webhooks** are queued in an outbox and retried with exponential backoff (1 s, 2 s, 4 s ... up to 60 s) until `WEBHOOK_MAX_ATTEMPTS`.

### Configuration (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `NETWORK` | `localhost` | Reads `deployments/<NETWORK>.json` |
| `RPC_URL` | `http://127.0.0.1:8545` | JSON-RPC endpoint (Alchemy / Infura URL for Sepolia) |
| `CONFIRMATIONS` | `0` | Blocks to wait before processing (use 3+ on Sepolia) |
| `POLL_INTERVAL_MS` | `2000` | Polling interval |
| `BLOCK_CHUNK` | `2000` | Max blocks per `getLogs` call |
| `PORT` | `4001` | API port |
| `EXPLORER_URL` | — | e.g. `https://sepolia.etherscan.io`, adds links to receipts |
| `WEBHOOK_URL` | — | Merchant endpoint; webhooks are disabled when empty |
| `WEBHOOK_SECRET` | — | HMAC secret shared with the merchant |
| `WEBHOOK_MAX_ATTEMPTS` | `6` | Delivery attempts before marking `failed` |

### REST API

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness check |
| `GET /api/status` | Contracts, indexer lag, webhook queue, counts |
| `GET /api/invoices?status=&merchant=` | List invoices |
| `GET /api/invoices/:id` | One invoice |
| `GET /api/receipts/:id` | Receipt for a paid invoice (tx hash, block, explorer link) |
| `GET /api/proposals?status=pending&kind=token_transfer` | Multi-sig proposals with approvers and decoded action |
| `GET /api/proposals/:id` | One proposal |
| `GET /api/events?limit=&name=` | Raw chronological activity feed |
| `GET /api/webhooks?status=` | Webhook delivery log |
| `POST /api/webhooks/:id/retry` | Manually retry a delivery |

### Webhook events

`invoice.created` · `payment.confirmed` · `approval.pending` · `approval.added` · `transaction.executed` · `refund.executed` · `withdrawal.executed`

```json
{
  "id": "0b3c…",
  "type": "payment.confirmed",
  "createdAt": "2026-11-03T10:15:02.000Z",
  "data": { "id": "0", "merchant": "0x9fE4…", "customer": "0x15d3…", "amountFormatted": "500.0", "symbol": "mUSDC", "status": "paid" },
  "chain": { "network": "localhost", "chainId": 31337, "txHash": "0xd433…", "blockNumber": 14, "logIndex": 2 }
}
```

### Verifying a webhook (merchant side)

Headers: `X-Quorum-Timestamp`, `X-Quorum-Signature: sha256=<hex>` where the signature is `HMAC_SHA256(secret, timestamp + "." + rawBody)`. Verify against the **raw** body and reject timestamps older than 5 minutes (replay protection). A working example is in `backend/receiver/server.js` and `backend/src/webhooks.js` (`verify`).

## 10. Deploying to Sepolia

1. Get Sepolia test ETH from a faucet for the deployer account.
2. Store your secrets in Hardhat's encrypted keystore (never commit them):
   ```bash
   npx hardhat keystore set SEPOLIA_RPC_URL
   npx hardhat keystore set SEPOLIA_PRIVATE_KEY
   ```
3. Choose real owner addresses (three separate MetaMask test wallets, each with a little Sepolia ETH for gas) and a customer wallet that should receive test mUSDC (the token has no faucet, so the deployer sends it):
   ```bash
   MULTISIG_OWNERS="0xOwner1,0xOwner2,0xOwner3" MULTISIG_REQUIRED=2 \
   FUND_ADDRESSES="0xCustomerWallet" npm run deploy:sepolia
   ```
   (On Windows PowerShell set the variables first: `$env:MULTISIG_OWNERS="..."`.) The script saves `deployments/sepolia.json` and rewrites `frontend/contractAddresses.ts` with the Sepolia addresses and the start block. `npm run demo:local` only works on a local chain; on Sepolia use the dashboard with MetaMask. Run `npm run deploy:local` again to switch the frontend back to your local chain.
4. Verify the source on Etherscan with the `hardhat-verify` plugin (already installed; add your Etherscan API key as a config variable) so anyone can read the contracts.
5. Run the backend with `NETWORK=sepolia`, `RPC_URL=<your Sepolia RPC>`, `CONFIRMATIONS=3`, and point the frontend's `contractAddresses.ts` at the new addresses (the deploy script rewrites it).

## 11. Security notes and known limitations

Implemented: checks-effects-interactions in `MultiSigWallet.executeTransaction`, owner-only access control, single-execution guard, duplicate-approval guard, input validation, and tests for the main attack paths (single compromised owner, non-owner access, replay of execution).

This is a learning project and **has not been audited**. Known limitations:

- `MultiSigWallet` has no owner/threshold management and no way to revoke an approval or cancel a proposal.
- `MerchantPayment` has no invoice expiry and no built-in refund function — refunds are multi-sig token transfers. It also lets *any* address create invoices; "merchant = the multi-sig" is a deployment convention, not enforced by the contract.
- Invoice prices are fixed in mUSDC; there is no fiat conversion or price oracle (Chainlink was an optional extension).
- Creating an invoice from the **Create invoice** page with a normal wallet makes *that wallet* the merchant. To have payments land in the multi-sig, create the invoice through **Approvals → New proposal → Create invoice as multisig**.
- The backend uses a JSON file as its database and its API has no authentication — fine for a demo, not for production.
- Testnet only; MetaMask must be connected to the right network.

## 12. Roadmap

- Chainlink price feeds for fiat-denominated invoices and a depeg check
- Invoice expiry, ERC-20 `permit` (one-click payment), and a dedicated `refund()` with a refund window
- Owner management and a revoke / cancel flow in the multi-sig
- EIP-712 off-chain signatures so approvals cost owners no gas
- Persistent database and API authentication; deployment on AWS (Lambda + DynamoDB + API Gateway)

## 13. Team and license

Built by Avantika Chakraborty and team for CS2614 Fundamentals of Blockchain, RV University, Bengaluru.

Released under the MIT license.
