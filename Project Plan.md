# Multi-Signature Payment Gateway for Merchants

**Problem Statement 7 · FinTech Blockchain Mini-Project · End-to-End Plan**

## 1. Project at a Glance

**One-line pitch:** a merchant payment gateway where customers pay in stablecoins, every payment creates a tamper-proof on-chain receipt, and any large refund or payout must be approved by several people (multi-signature) before the smart contract releases the money.

**What you will build**

- Smart contracts (Solidity) deployed on an Ethereum testnet
- Chainlink price-feed integration to convert USD prices into token amounts
- A backend service that watches the blockchain and sends webhooks (like Stripe does)
- A web app: customer checkout page plus merchant dashboard with an approval queue
- Tests, a security scan, documentation and a demo video

**Suggested duration:** 5 to 6 weeks (stretch or compress to your deadline). **Team size:** 3 to 4 people (roles in section 11).

**Skills you will pick up:** Solidity, smart-contract security, ERC-20 tokens, oracles, event indexing, wallet integration, typed signatures. These are exactly what payments-engineering and blockchain roles list.

## 2. The Problem, and Why Blockchain

Traditional card and gateway payments have four pain points:

- Fees are high (roughly 2 to 3 percent plus a fixed fee) and settlement takes days.
- The merchant must trust the processor’s database. A receipt is just a row the processor controls.
- Refund and payout approvals are internal software rules. One compromised admin account can drain money (insider risk).
- Disputes and chargebacks are slow and opaque.

Stablecoin payments fix speed and cost, but create a new problem: whoever holds the private key controls everything. One leaked key means all funds are gone. Merchants therefore need shared control, where large transactions need approval from several people. That is a multi-signature (multi-sig) setup, and the problem statement asks you to build it into a gateway.

| Need | Blockchain feature | How this project uses it |
| --- | --- | --- |
| Trustworthy receipts | Immutable ledger and event logs | Every payment emits an InvoicePaid event and stores a record anyone can verify on a block explorer |
| No single point of failure | Multi-sig enforced by code | M-of-N approvals for large refunds and withdrawals |
| Fast, cheap settlement | Stablecoins on a chain | Customer pays a stablecoin and the merchant balance updates in the same transaction |
| Rules nobody can bypass | Smart contracts | Refund windows, limits and the refund state machine live in code, not in staff discretion |
| Fair pricing | Oracles (Chainlink) | USD invoice converted to token amount; USD-based approval thresholds |
| Auditability | Public transaction history | Every approval, refund and payout is timestamped and tied to a signer address |

**Be honest in your viva:** blockchain is not used for everything. Personal data and heavy queries stay off-chain (see section 4).

## 3. Blockchain Concepts You Need (Primer)

- **Wallet, address, private key:** an address identifies a user; the private key signs transactions. Signing proves who approved something.
- **Smart contract:** code stored on the blockchain that holds funds and enforces rules automatically. Once deployed it cannot be quietly changed.
- **Gas and testnet:** every transaction costs gas. On a testnet (Sepolia) gas is paid in free test ETH from faucets, so you can build without real money.
- **ERC-20 token / stablecoin:** the standard token interface. Paying with a token is a two-step flow: the customer calls approve (let the gateway spend X), then the gateway calls transferFrom. Your checkout UI must handle both steps.
- **Events (logs):** cheap, permanent records emitted by contracts. Your receipts and your backend listener rely on them.
- **Multi-sig (M-of-N):** an action executes only after M of N authorised signers approve, for example 2 of 3.
- **Oracle / Chainlink Data Feed:** contracts cannot fetch outside data themselves. Chainlink publishes prices on-chain, which a contract reads through the AggregatorV3Interface (latestRoundData). You must check the data is fresh and handle its decimals (usually 8).
- **EIP-712 typed signatures (stretch):** lets a signer approve an action off-chain by signing structured data, which someone else submits later. The signer pays no gas.
- **Confirmations / finality:** a transaction is only safe after several blocks. Your backend should wait for confirmations before sending a payment-confirmed webhook.

## 4. System Architecture

```
Customer wallet --> Checkout page (Next.js) --> PaymentGateway contract <-- Chainlink price feed
                                                      |  emits events
Merchant signers --> Merchant dashboard --> approve / execute txs --> same contract
                                                      |
                                         Event listener / indexer (Node.js)
                                                      |
                              Database + webhook sender + REST API --> merchant server
```

**What lives on-chain vs off-chain**

| On-chain (trust-critical) | Off-chain (convenience and privacy) |
| --- | --- |
| Money movement and merchant balances | Product names, customer emails, any personal data |
| Invoice status and receipt record | Invoice display details (a hash of them can go on-chain) |
| Signer list, threshold, limits | Dashboard queries and filtering (served from the indexer DB) |
| Approvals, refunds, withdrawals | Webhooks, notifications, analytics |

For integrity, store a keccak256 hash of the off-chain invoice details in the invoice (metadataHash). Anyone can later prove the details were not altered.

## 5. Smart Contract Design

### 5.1 Contracts

- **MockStablecoin.sol:** an ERC-20 with 6 decimals and a public mint function, so testers can get fake USDC. Built on OpenZeppelin.
- **PaymentGateway.sol:** the main contract: merchants, invoices, payments, refunds, multi-sig proposals.
- **Stretch:** a GatewayFactory that deploys one gateway per merchant.

### 5.2 Core data structures

```solidity
enum InvoiceStatus { Created, Paid, PartiallyRefunded, Refunded, Expired, Cancelled }
enum ProposalType  { Refund, Withdrawal, ChangeSigners }

struct Merchant {
    address[] signers;       // the N owners
    uint8 threshold;         // M in M-of-N
    uint256 autoLimitUsd;    // below this, one signer can act (8 decimals)
    uint256 balance;         // stablecoin held for this merchant
    bool active;
}

struct Invoice {
    uint256 id;
    address merchant;
    uint256 amountUsd;       // 8 decimals
    uint256 amountToken;     // quote locked at creation
    address payer;
    uint64 expiresAt;
    uint64 paidAt;
    uint256 refunded;
    bytes32 metadataHash;
    InvoiceStatus status;
}

struct Proposal {
    uint256 id;
    ProposalType kind;
    uint256 invoiceId;       // for refunds
    address to;
    uint256 amount;
    uint8 approvals;
    bool executed;
    uint64 executableAfter;  // time-lock
}
```

### 5.3 Functions

| Function | Who calls | What it does |
| --- | --- | --- |
| registerMerchant(signers, threshold, autoLimit) | Merchant | Creates the merchant account and its multi-sig policy |
| createInvoice(amountUsd, expiry, metadataHash) | Merchant signer | Reads the price feed, locks the token amount, emits InvoiceCreated |
| payInvoice(id) | Customer | Pulls tokens via transferFrom, credits merchant balance, marks Paid, emits InvoicePaid (the receipt) |
| requestRefund(id, amount) | Customer or merchant | Opens a refund if inside the refund window and amount is within what was paid |
| proposeWithdrawal(to, amount) | Signer | Opens a withdrawal proposal |
| approveProposal(id) | Signer | Adds one approval; each signer can approve once |
| executeProposal(id) | Anyone | Runs it only if approvals reach the threshold and the time-lock has passed |
| cancelProposal(id) | Proposer or threshold | Cancels a pending proposal |
| pause / unpause | Admin or multi-sig | Emergency stop |

### 5.4 Key logic, step by step

**Payment:** check the invoice is Created and not expired, then (checks-effects-interactions) update state first, then pull the tokens, then emit the event. Reject wrong amounts or define clear overpay and underpay rules.

**Refund:** compute the USD value. If it is at or below autoLimitUsd, a single signer can execute it. If above, it becomes a proposal that needs M approvals. On execution reduce the merchant balance, transfer tokens to the payer, update the refunded amount and status, emit RefundExecuted.

**Withdrawal:** the same tier policy, plus a time-lock for large amounts (for example 24 hours in production, a few minutes in your demo, configurable).

**Price conversion:** amountToken = amountUsd x 10^tokenDecimals / tokenPriceUsd, with the feed’s 8 decimals handled explicitly. Lock this quote at invoice creation with a short expiry (15 minutes) so the customer is not exposed to price swings. For a stablecoin the price is about 1, so also use the feed as a peg check and revert if the price has moved more than about 2 percent or the data is stale.

**Events to emit** (your backend and receipts depend on these): MerchantRegistered, InvoiceCreated, InvoicePaid, RefundRequested, ProposalCreated, ProposalApproved, ProposalExecuted, RefundExecuted, WithdrawalExecuted.

### 5.5 Security checklist (build this in from day one)

- ReentrancyGuard on every function that moves tokens, plus checks-effects-interactions
- SafeERC20 for token transfers
- Role checks: only active signers may approve; no double approval by the same signer
- Oracle checks: stale timestamp, zero or negative price
- Decimals handling (6 for the token, 8 for the feed) and rounding direction
- Expiry and replay protection (nonce and chainId if using EIP-712)
- Pausable emergency stop; custom errors to save gas
- Changing signers or threshold is itself a multi-sig action

## 6. Multi-Signature Deep Dive

**Approach A, on-chain approvals (build this first).** Each signer sends their own transaction calling approveProposal. Simple, easy to test and easy to explain.

**Approach B, EIP-712 off-chain signatures (stretch, great for interviews).** The signer signs a typed message (proposal id, nonce, chainId, contract address). One person collects the signatures and submits them in a single transaction. The contract recovers each signer address with ECDSA, checks it is a valid unique signer, and counts them. Benefits: signers pay no gas and approval is one transaction.

**Suggested approval policy for the demo**

| Amount (USD) | Approval needed | Extra rule |
| --- | --- | --- |
| Up to 100 | One signer | None |
| 100 to 1,000 | 2 of 3 signers | None |
| Above 1,000 | 2 of 3 (or 3 of 3) | Time-lock before execution |

**Rules to enforce:** the proposer’s approval counts; a signer cannot approve twice; threshold must be at least 2 for large tiers and never exceed N; adding or removing signers requires the current threshold.

## 7. Chainlink Integration

1. Find the Sepolia price-feed addresses on the Chainlink Data Feeds documentation page (copy them from the official docs, never from a random site).
2. Import AggregatorV3Interface and call latestRoundData().
3. Validate: price greater than 0, updatedAt not older than your limit (for example 1 hour on testnet), answeredInRound valid.
4. Normalise decimals with a helper function and unit-test it heavily.
5. Use the feed for (a) USD to token quotes, (b) the stablecoin peg check, and (c) valuing balances in USD for withdrawal thresholds.
6. Optional: support paying in ETH using the ETH/USD feed.

For tests, write a MockAggregator so you can simulate price changes and stale data.

## 8. Backend: Event Listener and Webhooks

This is the part that makes the project feel like real payments engineering.

1. **Listener:** a Node.js service using ethers connects to an RPC provider (Alchemy or Infura) and subscribes to the gateway events.
2. **Confirmations:** mark an event confirmed only after N blocks (for example 3 on testnet) to handle reorgs.
3. **Database:** store invoices, payments, proposals and approvals (PostgreSQL or SQLite; DynamoDB if you go the AWS route). Keep the last processed block so a restart does not miss events.
4. **Webhook sender:** POST a JSON payload to the merchant’s URL, signed with an HMAC secret in a header, with retries and exponential backoff. Events: payment.confirmed, refund.requested, refund.executed, approval.pending.
5. **REST API:** endpoints for the dashboard, such as GET /invoices, GET /proposals?status=pending, GET /receipts/:id.

**Cloud option (fits your Cloud Computing major):** run the poller as a scheduled AWS Lambda (EventBridge), store data in DynamoDB, expose the API through API Gateway, and keep secrets in Secrets Manager. Mention this in your README as the production deployment design.

## 9. Frontend

Next.js with wagmi or viem and RainbowKit for wallet connection.

**Customer pages**

- **Checkout (/pay/\[invoiceId\]):** shows the USD price, token amount, merchant and expiry countdown. Steps: connect wallet, approve token, pay. A live status tracker shows pending, confirmed, receipt.
- **Receipt (/receipt/\[invoiceId\]):** reads the on-chain record and links to the block explorer so the customer can verify it independently.

**Merchant pages**

- **Create invoice:** amount, description, expiry; generates a payment link and QR code.
- **Dashboard:** invoices, balances, recent payments.
- **Approvals queue:** pending proposals with approve and execute buttons and a signer progress bar (for example 1 of 2).
- **Refunds:** requests, status, history.
- **Settings:** signers, threshold, limits.

Handle the real-world states: wrong network, wallet rejected, insufficient allowance, insufficient balance, pending transactions.

## 10. Tech Stack

| Layer | Choice |
| --- | --- |
| Contracts | Solidity, OpenZeppelin |
| Dev framework | Hardhat (JavaScript friendly) or Foundry (faster tests, fuzzing) |
| Oracle | Chainlink Data Feeds on Sepolia |
| Network | Sepolia testnet (free test ETH from faucets) |
| Frontend | Next.js, TypeScript, wagmi/viem, RainbowKit, Tailwind |
| Backend | Node.js, ethers, Express, PostgreSQL or SQLite |
| Security | Slither, solidity-coverage, gas reporter |
| Hosting | Vercel for frontend; Render, Railway or AWS for backend |
| Repo and docs | GitHub monorepo, README with architecture diagram |

## 11. Suggested Team Roles

- **Smart contract lead:** gateway, multi-sig, refunds, Chainlink integration
- **Testing and security lead:** unit and fuzz tests, Slither, deployment scripts, report on findings
- **Backend lead:** indexer, database, webhooks, API
- **Frontend lead:** checkout, dashboard, wallet flows, demo polish

With fewer people, merge roles, but every member should be able to explain the whole system in the viva.

## 12. Step-by-Step Plan

### Phase 0: Setup and Learning (before and during Week 1)

1. Create the GitHub repo with folders: contracts, backend, frontend, docs. Add a README skeleton now.
2. Install Node.js, Hardhat (or Foundry), MetaMask. Create two or three separate test wallets for the demo signers and never reuse a wallet that ever holds real money.
3. Get an RPC key (Alchemy or Infura) and collect Sepolia test ETH from faucets for each wallet.
4. Learn the basics: Solidity by Example, CryptoZombies, OpenZeppelin ERC-20 docs, Chainlink Data Feeds docs. Aim for one small deployed contract (store and read a number) to confirm your toolchain works.
5. Write a one-page spec: actors (customer, merchant, signer), user stories, the invoice and refund state diagrams. Get the whole team to agree.

### Phase 1: Core Payment Contracts (Week 1 to 2)

1. Write MockStablecoin (OpenZeppelin ERC-20, 6 decimals, mint function).
2. Write the Merchant and Invoice structs, registerMerchant and createInvoice.
3. Add the Chainlink integration with a MockAggregator for tests. Implement the quote formula and staleness checks.
4. Implement payInvoice with the approve and transferFrom flow, events, and the Paid status.
5. Write unit tests as you go: happy path, expired invoice, double payment, wrong status, unauthorised caller, stale price.
6. **Done when:** a test can create an invoice, pay it, and read back a correct receipt.

### Phase 2: Multi-Sig and Refunds (Week 2 to 3)

1. Implement the Proposal struct, proposeWithdrawal, approveProposal, executeProposal.
2. Add tiered thresholds (auto limit versus M-of-N) and the time-lock.
3. Implement requestRefund with the refund window and partial refunds; route large refunds through proposals.
4. Add signer management through multi-sig proposals.
5. Add ReentrancyGuard, Pausable and custom errors.
6. Tests: approval counting, duplicate approvals, non-signer approval, executing early, executing twice, time-lock, over-refund, reentrancy attack contract.
7. **Done when:** all refund and withdrawal paths pass tests and the state machine matches your diagram.

### Phase 3: Hardening and Deployment (Week 3)

1. Run solidity-coverage and aim for 90 percent or more on the gateway.
2. Add fuzz or property tests (balance accounting always equals the sum of paid minus refunded minus withdrawn).
3. Run Slither, fix real findings, and document each finding and your decision (this write-up is gold on a CV).
4. Write a deploy script. Deploy to Sepolia and verify the source on Etherscan.
5. Save deployed addresses and the ABI into a shared config file used by backend and frontend.
6. **Done when:** a teammate can interact with the live contract from a script.

### Phase 4: Backend (Week 4)

1. Build the listener for all gateway events and test it against the Sepolia deployment.
2. Add the database schema and last-processed-block tracking.
3. Add confirmation waiting and reorg handling.
4. Build the HMAC-signed webhook sender with retries.
5. Build the REST API for the dashboard.
6. Build a tiny fake merchant server that receives webhooks, so you can demo the full loop.
7. **Done when:** paying an invoice on-chain triggers a confirmed webhook within seconds.

### Phase 5: Frontend and Integration (Week 4 to 5)

1. Set up Next.js, wallet connection and the network guard.
2. Build checkout (approve, pay, status tracker) and the receipt page.
3. Build the merchant dashboard, create-invoice form and QR link.
4. Build the approvals queue and the refund screens.
5. Handle every error state listed in section 9.
6. Deploy the frontend to Vercel pointing at Sepolia.
7. **Done when:** a non-developer can complete a payment and a refund approval without help.

### Phase 6: Polish, Docs and Presentation (Week 5 to 6)

1. Record a 3 to 5 minute demo video (script in section 14).
2. Finish the README: problem, architecture diagram, how to run locally, deployed links, test and coverage results, security notes, limitations.
3. Write the project report and slides using the sections of this document.
4. Clean the repo: remove secrets, add a .env.example, add a LICENSE.
5. Rehearse the viva with the questions in section 18.

## 13. Testing and Security Plan

- **Unit tests:** every function, every revert path
- **Scenario tests:** full lifecycle, create then pay then partial refund then withdrawal
- **Fuzz and invariant tests:** balances always reconcile; no one can withdraw more than the merchant balance
- **Attack tests:** reentrancy via a malicious token, front-running of approvals, replay of signatures (if EIP-712)
- **Static analysis:** Slither, plus a manual review against the SWC and OpenZeppelin guidance
- **Gas report:** note the cost of payInvoice and execute functions
- **Integration test:** script that runs contract, backend and webhook together

**Never** commit private keys or RPC keys. Use environment variables and a .gitignore from the first commit.

## 14. Demo Script (for the video and the viva)

1. Merchant registers with 3 signers, a threshold of 2 and an auto limit of 100 USD.
2. Merchant creates a 50 USD invoice and a 500 USD invoice; the dashboard shows two payment links.
3. A customer opens the first link, approves the token, pays. The page shows the receipt; the merchant server receives the confirmed webhook.
4. Show the transaction and event on Etherscan to prove the receipt is public and permanent.
5. Customer requests a refund on the 500 USD invoice. It exceeds the auto limit, so it appears in the approvals queue.
6. Signer 1 approves: the progress shows 1 of 2 and execute is blocked. Show the failed execute attempt.
7. Signer 2 approves, then execute succeeds and the customer receives the refund; a refund webhook fires.
8. Show an attack that fails: a non-signer tries to approve and is rejected by the contract.

## 15. Deliverables Checklist

- GitHub repo with clean structure and meaningful commit history from all members
- Verified contracts on Sepolia with address links
- Live frontend link and a demo video
- README with architecture diagram, setup steps and results
- Test and coverage report, Slither findings and fixes
- Project report and presentation slides
- A short limitations and future-work section (be honest)

## 16. Making It CV-Ready

**Resume bullets (adapt with your real numbers):**

- Built a multi-signature merchant payment gateway (Solidity, Hardhat, Next.js) with threshold-based approvals, on-chain receipts and refund workflows, deployed and verified on Sepolia.
- Integrated Chainlink price feeds with staleness and peg checks to quote USD invoices in stablecoin.
- Developed an event-driven backend issuing HMAC-signed webhooks with confirmation handling and retries.
- Achieved over 90 percent test coverage including fuzz and reentrancy tests; resolved static-analysis findings from Slither.

**Portfolio tips**

- Pin the repo on GitHub and add the demo video or GIF at the top of the README.
- Write a short LinkedIn or blog post on one lesson, such as oracle staleness or why multi-sig matters.
- Be ready to explain every design choice; recruiters ask why, not just what.

## 17. Stretch Goals and Risks

**Stretch goals (pick one or two, only after the core works)**

- EIP-712 off-chain signature approvals
- Pay in ETH using the ETH/USD feed
- GatewayFactory with one gateway per merchant
- Subscription or pull payments
- Account abstraction (ERC-4337) for gasless checkout
- Multi-currency dashboard using FX data

**Risks and mitigations**

| Risk | Mitigation |
| --- | --- |
| Scope creep | Freeze the core feature list in week 1; stretch goals only after Phase 3 |
| Faucet limits or slow testnet | Request test ETH early; keep a local Hardhat network for development |
| Oracle stale or unavailable on testnet | Staleness checks plus a mock feed in tests and a fallback flag for demos |
| Smart-contract bugs | Tests first for money paths, Slither, small readable contracts |
| Team members idle or blocked | Define interfaces and ABIs early so frontend and backend can work against mocks |

## 18. Viva Questions to Prepare

1. Why use blockchain here instead of a normal database and a payment API?
2. What exactly is stored on-chain, and what is deliberately off-chain, and why?
3. How does multi-sig prevent a single compromised key from draining funds?
4. Why must a customer call approve before pay? What can go wrong with unlimited allowances?
5. What happens if the Chainlink price is stale or the stablecoin depegs?
6. How did you prevent reentrancy and double approvals?
7. How does your backend handle chain reorgs and missed events?
8. What are the limitations (gas costs, key management, regulation, chargebacks) and how would you improve it for production?

## 19. Learning Resources

- Solidity by Example and the official Solidity docs
- OpenZeppelin Contracts documentation (ERC-20, ReentrancyGuard, AccessControl, EIP-712)
- Chainlink Data Feeds documentation
- Hardhat or Foundry Book tutorials
- Ethereum.org developer docs on gas, events and transactions
- Slither documentation and the Smart Contract Weakness Classification (SWC) registry
- Safe (Gnosis Safe) documentation, to study how a production multi-sig is designed
