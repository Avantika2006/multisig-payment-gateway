# Quorum: Multi-Signature Payment Gateway for Merchants

**Problem Statement 7 · CS2614 Fundamentals of Blockchain · Project Plan and Implementation (as built)**

> This document describes the project **as it was actually built and deployed**. It follows the structure of the original plan (kept in git history, commit `6096f28`) so each section can become a report chapter or a slide. Where the build differs from the original plan, the section says so and explains why. Section 16 summarises planned versus delivered.

## 1. Project at a Glance

**One-line pitch:** a merchant payment gateway where customers pay in a stablecoin, every payment creates a tamper-proof on-chain receipt, and **no money can leave the merchant's treasury without approval from 2 of 3 owners**, enforced by a smart contract.

**What was built**

- Three Solidity smart contracts, deployed and exercised end to end on the **Sepolia** testnet
- A **2-of-3 multi-signature treasury** that is itself the merchant, so every payment lands in it
- A Node.js **backend** that indexes the blockchain, serves a REST API and sends **HMAC-signed webhooks** (like Stripe)
- A React **merchant dashboard** with Overview, Invoices, Approvals and Activity pages, connected through MetaMask
- **30 contract tests with 100 % line coverage**, attack tests, a gas report, and a deployment script with safety checks

**Skills demonstrated:** Solidity, smart-contract security, ERC-20 tokens, multi-signature design, event indexing, webhooks, wallet integration, testnet deployment.

## 2. The Problem, and Why Blockchain

Traditional card and gateway payments have four pain points:

- Fees are high (roughly 2 to 3 percent plus a fixed fee) and settlement takes days.
- The merchant must trust the processor's database. A receipt is just a row the processor controls.
- Refund and payout approvals are internal software rules. One compromised admin account can drain money (insider risk).
- Disputes and chargebacks are slow and opaque.

Stablecoin payments fix speed and cost, but create a new problem: whoever holds the private key controls everything. One leaked key means all funds are gone. Merchants therefore need **shared control**, where moving money needs approval from several people. That is a multi-signature (multi-sig) setup, and Quorum builds it into the gateway.

| Need | Blockchain feature | How Quorum uses it |
| --- | --- | --- |
| Trustworthy receipts | Immutable ledger and event logs | Every payment emits `PaymentReceived` and updates the on-chain invoice; anyone can verify it on Etherscan |
| No single point of failure | Multi-sig enforced by code | Invoices, refunds and withdrawals all need 2 of 3 owner approvals |
| Fast, cheap settlement | Stablecoin on a chain | The customer pays mUSDC and the treasury receives it in the same transaction |
| Rules nobody can bypass | Smart contracts | Pay-once, approve-before-execute and owner-only checks live in code, not in staff discretion |
| Auditability | Public transaction history | Every approval and execution is timestamped and tied to a signer address |

**Honest scope:** blockchain is not used for everything. Indexing, notifications and dashboard lists stay off-chain (section 4), and no personal data is stored on-chain.

## 3. Blockchain Concepts Used

- **Wallet, address, private key:** an address identifies a user; the private key signs transactions. Signing proves who approved something. MetaMask holds the keys; the dashboard never sees them.
- **Smart contract:** code on the blockchain that holds funds and enforces rules automatically. Once deployed it cannot be quietly changed.
- **Gas and testnet:** every transaction costs gas, paid on Sepolia in free test ETH.
- **ERC-20 token / stablecoin:** paying with a token is two steps: the customer calls `approve` (let the gateway spend exactly X), then the gateway calls `transferFrom`. The dashboard handles both.
- **Events (logs):** cheap, permanent records emitted by contracts. Receipts and the backend indexer rely on them.
- **Multi-sig (M-of-N):** an action executes only after M of N authorised signers approve. Quorum uses 2 of 3.
- **Confirmations / finality:** a transaction is only safe after several blocks. The backend waits 3 confirmations before treating an event as final and sending a webhook.
- **Not used in this version:** Chainlink oracles and EIP-712 off-chain signatures (see section 17, future work).

## 4. System Architecture

```
 Customer wallet                                              Merchant owners (2-of-3)
       │ 1. approve(mUSDC)                                             │ A. submitTransaction
       │ 2. payInvoice(id)                                             │ B. approveTransaction x2
       ▼                                                               ▼ C. executeTransaction
┌──────────────┐  transferFrom   ┌───────────────────┐         ┌──────────────────┐
│MockStablecoin│◄────────────────│  MerchantPayment  │◄────────│  MultiSigWallet  │
│   (ERC-20)   │                 │ invoices+receipts │  calls  │ (the merchant)   │
└──────────────┘                 └───────────────────┘         └──────────────────┘
                                          │ events                      │ events
                                          ▼                             ▼
                 Backend: indexer ─► JSON store ─► REST API ─► React dashboard
                                         └──────► signed webhooks ─► merchant server
```

**The key design idea:** `MerchantPayment` pays whoever called `createInvoice()`. When the **`MultiSigWallet` contract itself** is that caller, every payment lands in the multi-sig, and every refund or withdrawal (a token transfer sent *by* the multi-sig) needs 2 of 3 owners. This is the same pattern production treasuries such as Safe (Gnosis Safe) use: a generic multi-sig that can call any contract.

**What lives on-chain vs off-chain**

| On-chain (trust-critical) | Off-chain (convenience) |
| --- | --- |
| Money movement and the treasury balance | Indexed copies of invoices, proposals and events for fast queries |
| Invoice amount, merchant and paid status (the receipt) | Webhooks and the delivery log |
| Owner list and threshold | Dashboard lists, filters and summaries |
| Every proposal, approval and execution | Contract addresses and configuration |

## 5. Smart Contract Design

### 5.1 Contracts

| Contract | Purpose |
| --- | --- |
| **MockStablecoin.sol** | Minimal ERC-20 "Mock USD Coin" (`mUSDC`, 6 decimals). 1,000,000 mUSDC are minted to the deployer, who funds test customers. |
| **MerchantPayment.sol** | Invoices and payments. Uses OpenZeppelin `ReentrancyGuard` and `IERC20`. |
| **MultiSigWallet.sol** | Generic M-of-N wallet: owners propose any contract call, approve it, and execute it once the threshold is reached. |

### 5.2 Core data structures

```solidity
// MerchantPayment
struct Invoice {
    address merchant;   // who gets paid (the multi-sig in Quorum)
    uint256 amount;     // in mUSDC (6 decimals)
    bool paid;
}
mapping(uint256 => Invoice) public invoices;

// MultiSigWallet
struct Transaction {
    address to;            // contract to call
    uint256 value;         // ETH to send
    bytes data;            // encoded call, e.g. createInvoice(500) or transfer(customer, 200)
    bool executed;
    uint256 approvalCount;
}
mapping(uint256 => mapping(address => bool)) public approved;   // one approval per owner
```

### 5.3 Functions

| Function | Who calls | What it does |
| --- | --- | --- |
| `createInvoice(amount)` | The multi-sig (via a proposal) | Stores a new invoice with the caller as merchant, emits `InvoiceCreated` |
| `payInvoice(id)` | Customer | Checks the invoice exists, is unpaid and the payer is not the merchant; marks it paid **before** pulling tokens; transfers mUSDC to the merchant; emits `PaymentReceived` (the receipt) |
| `submitTransaction(to, value, data)` | Owner | Opens a proposal, emits `TransactionSubmitted` |
| `approveTransaction(id)` | Owner | Adds one approval; each owner can approve once; emits `TransactionApproved` |
| `executeTransaction(id)` | Owner | Runs the call only if `approvalCount >= requiredApprovals` and not already executed; emits `TransactionExecuted` |
| `getOwners()`, `requiredApprovals()`, `getTransaction(id)`, `getTransactionCount()` | Anyone | Read-only views |

### 5.4 Key logic

**Payment:** check the invoice exists and is unpaid, mark it paid (checks-effects-interactions), then call `transferFrom`, then emit the receipt event. Paying twice, paying an unknown invoice, or a merchant paying their own invoice all revert.

**Refund:** an owner proposes `mUSDC.transfer(customer, amount)` from the treasury. One approval is not enough (`Not enough approvals`); after the second approval an owner executes it. Partial refunds are supported. The backend recognises a transfer back to a paying customer (for no more than they paid) as a refund.

**Withdrawal:** the same mechanism, to any destination address.

**Events:** `InvoiceCreated`, `PaymentReceived`, `TransactionSubmitted`, `TransactionApproved`, `TransactionExecuted`, `Deposit`.

### 5.5 Security checklist

| Item | Status |
| --- | --- |
| `ReentrancyGuard` on the payment function, checks-effects-interactions | ✅ |
| Owner-only submit / approve / execute; no double approval; no double execution | ✅ |
| Input validation: zero amounts, zero addresses, duplicate owners, invalid threshold | ✅ |
| Execution state updated **before** the external call; failed calls revert | ✅ |
| Attack test: a single compromised owner cannot drain the treasury | ✅ |
| SafeERC20, Pausable, custom errors | ❌ future work |
| Owner / threshold changes through the multi-sig, proposal cancel | ❌ future work |

## 6. Multi-Signature Design

**Approach A, on-chain approvals (built).** Each owner sends their own transaction calling `approveTransaction`. Simple to test and to explain.

**Policy in this version:** a flat **2-of-3** for every action: creating invoices, refunds and withdrawals.

**Rules enforced by the contract:** only owners can act; an owner cannot approve twice; execution needs at least the threshold; a proposal executes once; the threshold must be between 1 and the number of owners, and there must be at least 2 owners.

**Why the multi-sig is the merchant:** because invoices are created *by* the multi-sig, the treasury receives the money directly. Nobody can redirect payments or withdraw them without a second owner.

**Approach B, EIP-712 off-chain signatures:** not built; listed as future work (owners would sign approvals off-chain and pay no gas).

## 7. Price Oracle (Chainlink): deferred

The original plan quoted invoices in USD and converted them with a Chainlink price feed. In this version **invoices are priced directly in a dollar stablecoin (mUSDC)**, so no conversion is needed and the demo has no dependency on oracle freshness on a testnet. Chainlink USD pricing with staleness and depeg checks is the first item in future work (section 17).

## 8. Backend: Indexer, API and Webhooks (built)

1. **Indexer:** a Node.js service (ethers v6) polls Sepolia through Alchemy in small block ranges, decoding events from both contracts.
2. **Confirmations:** an event is processed only once **3 blocks** are on top of it, to handle reorgs.
3. **Storage:** a JSON file with invoices, proposals, events and webhook deliveries. It stores `lastProcessedBlock` and de-duplicates by `txHash:logIndex`, so a restart catches up without missing or repeating anything.
4. **Proposal decoding:** multi-sig calldata is decoded so proposals are labelled `create_invoice` or `token_transfer`, and transfers are classified as refunds or withdrawals.
5. **Webhooks:** `invoice.created`, `payment.confirmed`, `approval.pending`, `approval.added`, `transaction.executed`, `refund.executed`, `withdrawal.executed`. Each is signed with HMAC-SHA256 over `timestamp.body`, retried with exponential backoff (1 s, 2 s, 4 s … up to 60 s), and protected against replay by rejecting timestamps older than 5 minutes.
6. **REST API:** `/api/status`, `/api/invoices`, `/api/receipts/:id`, `/api/proposals`, `/api/events`, `/api/webhooks` (with manual retry).
7. **Demo merchant server:** verifies every webhook signature before trusting it.

## 9. Frontend: Merchant Dashboard (built)

React 19 + TypeScript + Vite, ethers v6 and MetaMask. Each page has one job:

| Page | Role | What it does |
| --- | --- | --- |
| **Overview** | Everyone | Live treasury balance, total received, invoices awaiting payment, proposals awaiting approval, recent on-chain activity, quick actions |
| **Invoices** | Owners and customers | Owners **propose** invoices through the multi-sig (optionally approving in the same step) and see how many approvals are still needed; customers see open invoices and **Pay** them (approve + pay) |
| **Approvals** | Owners | Pending proposals with approval progress and "You approved"; **Execute** is enabled only once enough approvals exist; refund / withdrawal form; executed history. Non-owners see a banner and no buttons. |
| **Activity** | Everyone | Timeline of every on-chain event with Etherscan links and filters, plus the indexer's progress |
| **My Wallet / Settings** | Everyone | Connected address, ETH and mUSDC balances, contract addresses |

The lists are read from the backend's API. If the backend is offline, the invoice list falls back to reading contract events directly in chunks that respect the RPC's block-range limit.

**Differences from the original plan:** Vite/React instead of Next.js with wagmi/RainbowKit (simpler for a single-page dashboard); paying happens from the invoice list rather than a separate `/pay/[id]` checkout link with a QR code; receipts are served by the backend API and Etherscan rather than a dedicated receipt page.

## 10. Tech Stack

| Layer | Planned | Built |
| --- | --- | --- |
| Contracts | Solidity, OpenZeppelin | Solidity 0.8.34, OpenZeppelin (`ReentrancyGuard`, `IERC20`) |
| Dev framework | Hardhat or Foundry | **Hardhat 3**, Mocha + Chai, ethers v6 |
| Oracle | Chainlink Data Feeds | Deferred (section 7) |
| Network | Sepolia | **Sepolia** (chain 11155111), plus a local Hardhat node for development |
| Frontend | Next.js, wagmi, RainbowKit | **React 19, TypeScript, Vite, ethers v6, MetaMask** |
| Backend | Node.js, ethers, Express, PostgreSQL/SQLite | **Node.js 20, Express, ethers v6, JSON-file store** |
| RPC provider | Alchemy or Infura | **Alchemy** |
| Security / quality | Slither, coverage, gas reporter | Hardhat coverage (100 %), gas statistics; Slither not run |
| Secrets | Environment variables | **Hardhat encrypted keystore** for the RPC URL and deployer key |

## 11. Team Roles

| Area | Responsibilities | Member |
| --- | --- | --- |
| Smart contracts | Token, payment gateway, multi-sig | *(fill in)* |
| Testing and security | Unit, integration and attack tests, coverage, deployment scripts | *(fill in)* |
| Backend | Indexer, API, webhooks, demo receiver | *(fill in)* |
| Frontend | Dashboard pages, wallet flows, demo polish | *(fill in)* |

## 12. How the Project Was Built (phases as executed)

### Phase 0: Setup
Repository with `contracts`, `test`, `scripts`, `backend`, `frontend` and `docs`; Hardhat 3, MetaMask, an Alchemy RPC key, and separate test wallets for the deployer, three owners and a customer.

### Phase 1: Core contracts
`MockStablecoin`, `MerchantPayment` (create and pay invoices, receipts as events) and the first tests. **Done when:** a test creates an invoice, pays it and reads back the receipt. ✅

### Phase 2: Multi-sig and refunds
`MultiSigWallet` (submit / approve / execute), the "multi-sig is the merchant" integration, refunds as multi-sig transfers, partial refunds, and the compromised-owner attack test. **Done when:** every refund and withdrawal path passes tests. ✅

### Phase 3: Hardening and deployment
Edge-case and validation tests (30 total, 100 % coverage), a gas report, a deploy script that writes addresses for the backend and frontend, and a **preflight check** that refuses to deploy on the wrong chain, with a public test key, without funds, or with an invalid owner list. Deployed to Sepolia. **Done when:** the live contracts can be used from the dashboard. ✅

### Phase 4: Backend
Indexer with confirmations and restart recovery, JSON store, HMAC-signed webhooks with retries, REST API, demo receiver. **Done when:** paying an invoice on-chain triggers a confirmed webhook. ✅ (verified on Sepolia)

### Phase 5: Frontend and integration
Dashboard with wallet connection, invoice proposals, payment, approvals queue and activity log, wired to the backend and the Sepolia contracts. **Done when:** a payment and an approval can be completed from the UI. ✅

### Phase 6: Documentation and presentation
README with architecture, setup, live addresses and troubleshooting; a complete project guide; this as-built plan; a demo script (`docs/DEMO_SCRIPT.md`).

## 13. Testing and Security Results

| Area | Result |
| --- | --- |
| Contract tests | **30 passing** (Mocha + Chai on Hardhat) |
| Coverage | **100 %** lines and statements on all three contracts |
| Backend tests | 5 passing (webhook signing and backoff) |

**What is tested**

- **Core flow:** token transfer, invoice payment, multi-sig execution after 2 approvals, rejection without enough approvals, rejection of duplicate approvals.
- **Edge cases:** zero amount, unknown invoice, double payment, merchant paying their own invoice, missing allowance or balance, zero-address token.
- **Multi-sig validation:** fewer than 2 owners, invalid threshold, duplicate or zero owners, non-owner submit / approve / execute, unknown transaction, double execution, failed inner call, event arguments.
- **Integration and attacks:** the multi-sig creates an invoice and receives the payment; a refund needs 2 of 3; partial refunds; **a single compromised owner cannot drain the funds**.

**Gas (local Hardhat network, unoptimised)**

| Operation | Gas |
| --- | --- |
| `createInvoice` | 75,676 – 92,788 |
| `payInvoice` | 84,482 – 94,082 |
| `mUSDC.approve` | 46,708 |
| `submitTransaction` | 84,310 – 156,966 |
| `approveTransaction` | 62,500 – 79,612 |
| `executeTransaction` | 65,726 – 146,821 |

**Not done:** Slither static analysis and fuzz / invariant tests (future work).

## 14. Deployment (Sepolia)

| Contract | Address |
| --- | --- |
| MockStablecoin (mUSDC) | `0x59f961E1d23492e0ae36756cFde740e45EB7DbE5` |
| MerchantPayment | `0xc8c10314C73c43D2597509B2a47C94A9E37a748a` |
| MultiSigWallet (2-of-3) | `0xb596578E1F5F17659478a756AdAf099d2738d35b` |

Deployed on 4 November 2026 from block 12,062,835 for about 0.024 SepoliaETH.

**Safe deployment process**

- Secrets (RPC URL, deployer key) are kept in Hardhat's **encrypted keystore**, never in files or the repository.
- The Hardhat network config is pinned to **chain ID 11155111**, so it refuses to send anything to any other chain (including mainnet).
- A **preflight check** (`npm run check:sepolia`) runs before anything is signed: it verifies the chain, rejects public Hardhat test keys, checks the deployer's balance, validates the owner addresses, and prints where each secret was loaded from.

**End-to-end run on Sepolia (verifiable on Etherscan)**

1. Owner 1 proposed `createInvoice(500 mUSDC)` through the multi-sig.
2. Owners 1 and 2 approved; the proposal was executed, creating invoice #0 with the multi-sig as merchant.
3. The customer approved and paid 500 mUSDC, which landed in the multi-sig.
4. The backend issued receipt `RCPT-0000` and delivered a signed `payment.confirmed` webhook.

Transaction links are in the README's *Live deployment* section.

**Practical lessons from the testnet**

- Alchemy's free tier limits `eth_getLogs` to 10 blocks per request, and MetaMask's RPC to 10,000; the indexer and the dashboard both query in chunks.
- MetaMask's default priority fee on Sepolia is high relative to faucet balances; a manual fee (max base fee 0.1 gwei, priority fee 0.01 gwei) cuts the cost of each transaction by about 100×.

## 15. Demo Script (summary)

Full script with timings, what to say and fallbacks: **`docs/DEMO_SCRIPT.md`**.

1. Show the live Overview (treasury balance, received, recent activity).
2. Owner 1 proposes a 50 mUSDC invoice; show that **Execute is blocked** at 1 of 2 approvals.
3. Owner 2 approves and executes; the invoice now exists with the treasury as merchant.
4. The customer pays; the merchant server receives a signed `payment.confirmed` webhook.
5. Open the payment on Etherscan from the Activity page: the receipt is public and permanent.
6. A refund proposal needs 2 of 3 as well; the server receives `refund.executed`.
7. A non-owner cannot approve anything, and one compromised owner cannot drain funds (shown by the test).

## 16. Planned vs Delivered

| Planned | Delivered |
| --- | --- |
| Smart contracts on an Ethereum testnet | ✅ Three contracts on Sepolia |
| Stablecoin payments with on-chain receipts | ✅ |
| M-of-N approvals for refunds and withdrawals | ✅ 2-of-3 for every treasury action, including invoice creation |
| Backend listener with confirmations, webhooks and REST API | ✅ (plus more webhook events and replay protection than planned) |
| Merchant dashboard with an approvals queue | ✅ Overview, Invoices, Approvals, Activity |
| Tests and coverage | ✅ 30 tests, 100 % coverage, attack tests, gas report |
| Safe deployment tooling | ✅ Beyond the plan: preflight checks and encrypted keystore |
| Chainlink USD pricing and peg check | ❌ Deferred: invoices are priced in the stablecoin |
| Dedicated refund function with refund window; invoice expiry | ❌ Refunds are multi-sig transfers |
| Amount-based approval tiers and time-lock | ❌ Flat 2-of-3 |
| Pausable, SafeERC20, signer management, proposal cancel | ❌ |
| Separate checkout and receipt pages with QR links | ❌ Pay from the invoice list; receipts via API and Etherscan |
| Slither report, fuzz tests | ❌ |
| Hosted frontend, verified contract source | ❌ Runs locally; source verification pending |

## 17. Limitations and Future Work

**Known limitations**

- Learning project, **not audited**; testnet only.
- Every action needs the same 2-of-3 approval: no amount-based tiers and no time-lock on large withdrawals.
- The multi-sig cannot change owners or the threshold, revoke an approval or cancel a proposal.
- `MerchantPayment` has no invoice expiry and no dedicated refund function, and lets any address create invoices; "merchant = the multi-sig" is enforced by the dashboard, not by the contract.
- Prices are fixed in mUSDC; no oracle or fiat conversion.
- The backend uses a JSON file and its API has no authentication.

**Future work (in priority order)**

1. A dedicated `refund()` with a refund window and partial-refund status, with payments held in escrow by the gateway.
2. Time-locks for large withdrawals and amount-based approval tiers, plus proposal cancel.
3. Chainlink USD pricing with staleness and depeg checks.
4. EIP-712 off-chain approvals so owners pay no gas.
5. Owner and threshold management through the multi-sig; `Pausable` emergency stop.
6. Slither analysis and invariant tests; Etherscan source verification.
7. Checkout and receipt pages with payment links and QR codes; hosted deployment (Vercel for the frontend; AWS Lambda + DynamoDB + API Gateway for the backend).

## 18. Viva Questions and Answers

1. **Why use blockchain here instead of a normal database and a payment API?** Receipts can't be edited by anyone, including us, and the 2-of-3 rule is enforced by code no admin can bypass. Settlement is instant and cheap.
2. **What is stored on-chain, and what is deliberately off-chain?** Money, invoices, receipts, owners and approvals are on-chain. Indexing, webhooks and dashboard lists are off-chain for speed. No personal data is on-chain.
3. **How does multi-sig prevent a single compromised key from draining funds?** Execution requires at least 2 approvals and each owner can approve once, so one key is never enough. A test proves it.
4. **Why must a customer call approve before pay? What can go wrong with unlimited allowances?** ERC-20 tokens can only be pulled with permission. Quorum approves the exact invoice amount; an unlimited allowance would let a buggy or compromised gateway take everything.
5. **What happens if the stablecoin depegs?** Prices are fixed in mUSDC, so a depeg would change the real value received. A Chainlink peg check is planned future work.
6. **How did you prevent reentrancy and double approvals?** `ReentrancyGuard` and checks-effects-interactions on payment; `executed` is set before the external call; the `approved[id][owner]` mapping blocks double approvals.
7. **How does your backend handle chain reorgs and missed events?** It waits 3 confirmations, saves the last processed block, and de-duplicates by `txHash:logIndex`, so a restart catches up exactly.
8. **What are the limitations and how would you improve it for production?** See section 17: tiers and time-locks, a dedicated refund flow, an oracle, an audit, a real database with API authentication, and hosted deployment.

## 19. Learning Resources

- Solidity by Example and the official Solidity docs
- OpenZeppelin Contracts documentation (ERC-20, ReentrancyGuard)
- Hardhat 3 documentation (testing, coverage, keystore, verification)
- Ethereum.org developer docs on gas, events and transactions
- Safe (Gnosis Safe) documentation, for how a production multi-sig is designed
- Chainlink Data Feeds documentation (for the planned oracle integration)
