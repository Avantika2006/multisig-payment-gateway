# Quorum: Complete Project Guide

**A multi-signature payment gateway for merchants. What it is, how every part works, and how to deploy it.**

## 1. What Quorum Is (in plain language)

Quorum lets a shop accept payments in a stablecoin (a crypto token pegged to the dollar) and keeps the shop’s money in a **shared vault that needs several people to open**.

Think of a shop whose safe needs 2 of 3 keys. Any customer can drop money in, but taking money out (a refund or a withdrawal) only works when at least two of the three owners agree. The “safe” is a smart contract, so the rule cannot be skipped by anyone, including the developer.

**Why this is useful**

- One stolen or leaked key cannot empty the merchant’s funds.
- Every payment is a permanent, public receipt that nobody can edit.
- Refunds and withdrawals leave a visible trail showing which owner approved what.

**Why blockchain, not a normal database?** A database is controlled by whoever runs it, so records can be changed and one admin can approve anything. On a blockchain the rules and the receipts live in code and a ledger that no single party controls. That is exactly what receipts and shared approvals need. Personal data (names, emails, descriptions) is deliberately kept off-chain.

## 2. The Big Picture

```
 Customer (MetaMask)                              Merchant owners x3 (MetaMask)
        |  approve + pay                                  |  propose / approve / execute
        v                                                 v
  +-------------+   tokens   +------------------+   calls   +-----------------+
  | MockStable- |<-----------| MerchantPayment  |<----------| MultiSigWallet  |
  | coin (ERC20)|            | invoices+receipts|           | (the merchant)  |
  +-------------+            +------------------+           +-----------------+
                                     | events                       | events
          +--------------------------+------------------------------+
          v                                                         v
   React dashboard (reads the chain directly)      Backend: indexer -> API + signed webhooks
```

| Part | What it is | Why it is needed |
| --- | --- | --- |
| Smart contracts | Three Solidity contracts on the blockchain | They hold the money, enforce the rules and create the receipts |
| Dashboard | React web app, talks to MetaMask | Lets humans create invoices, pay, and approve or execute proposals |
| Backend | Node.js indexer, REST API and webhook sender | Merchant systems (shop software, accounting) cannot watch a blockchain easily; the backend turns events into API data and notifications |
| Scripts | deploy.ts and demo.ts | One command to deploy everything and one to run the full story with a gas table |
| Tests | Hardhat test suites | Prove the contracts behave correctly, including attack attempts |

Important detail: the **dashboard reads the blockchain directly** and does not call the backend. The backend is for merchant servers and future features. You can run the whole demo without it, but it is what makes this a real gateway (webhooks, receipts API, activity feed).

## 3. Who Uses It (Roles)

| Role | Description | Example account in the demo |
| --- | --- | --- |
| Customer | Pays invoices with mUSDC | Hardhat account #4 |
| Merchant | Creates invoices; may be a normal wallet or the multi-sig | Account #3 (normal) or the MultiSigWallet |
| Multi-sig owner | One of N people who propose, approve and execute | Accounts #0, #1, #2 (2-of-3) |
| Outsider | Anyone else; must be blocked from the vault | Account #5 |

## 4. The Smart Contracts

### 4.1 MockStablecoin (the money)

A simple ERC-20 token called Mock USD Coin (mUSDC) with 6 decimals, like real USDC. The deployer receives 1,000,000 mUSDC. It exists so you can demonstrate payments without real money. It is for testing only.

### 4.2 MerchantPayment (invoices and receipts)

This contract is the billing system.

- **createInvoice(amount):** whoever calls it becomes that invoice’s merchant. It stores the invoice and emits InvoiceCreated.
- **payInvoice(id):** pulls the exact amount from the customer to the merchant, marks the invoice paid and emits **PaymentReceived**. That event plus the stored invoice is the permanent receipt.
- **Rules enforced in code:** amount above zero, invoice exists, cannot be paid twice, merchant cannot pay their own invoice, customer must have enough balance and allowance.

**Why the customer clicks twice:** ERC-20 tokens cannot be pulled without permission. Step one, approve, tells the token that the gateway may take this amount. Step two, payInvoice, makes the gateway take it. The dashboard does both for you when you press Pay.

### 4.3 MultiSigWallet (the shared vault)

A general M-of-N wallet. It can send ETH or call any other contract, but only after enough owners approve.

- **submitTransaction(to, value, data):** an owner proposes an action. Nothing happens yet.
- **approveTransaction(id):** an owner approves, once per proposal.
- **executeTransaction(id):** an owner runs it once approvals reach the threshold. It can run only once.
- **Checks:** at least 2 owners, threshold between 1 and N, no duplicate or zero-address owners, only owners can act, the state is updated before the outside call is made.

### 4.4 The key idea: the multi-sig is the merchant

MerchantPayment pays whoever called createInvoice. If the **MultiSigWallet itself** calls createInvoice (as an approved proposal), then every payment lands in the multi-sig, and the only way to move that money is another approved proposal, for example mUSDC.transfer(customer, amount). That single design choice is how multi-sig protects the gateway. The contract does not force this; it is how you deploy and use it.

## 5. How Everything Works: The Lifecycle

1. **Create the invoice.** Owner proposes createInvoice(500 mUSDC) through the multi-sig, two owners approve, one executes. Invoice #0 now exists with the multi-sig as merchant. (A normal wallet can also create invoices, in which case that wallet is the merchant.)
2. **Customer pays.** Customer approves the gateway to spend 500 mUSDC, then calls payInvoice(0). The tokens move into the multi-sig and PaymentReceived is emitted.
3. **Receipt.** The event, the stored invoice and the transaction hash are the receipt. The backend serves it at /api/receipts/0 and can fire a payment.confirmed webhook.
4. **Refund request.** The customer asks for 200 back. An owner proposes mUSDC.transfer(customer, 200) on the multi-sig and approves it.
5. **One approval is not enough.** Executing now fails with Not enough approvals.
6. **Second approval.** Another owner approves. Now execution succeeds and the customer receives 200 mUSDC. The backend classifies it as a refund and fires refund.executed.
7. **Attacker case.** If one owner is compromised and proposes sending everything to themselves, they can approve their own proposal but cannot execute it. The funds stay safe.

## 6. The Dashboard, Page by Page

The dashboard is a React app at localhost:5173. It connects to MetaMask, reads the blockchain with ethers and sends transactions that you confirm in MetaMask. The header shows the network and a Connect Wallet button; the sidebar switches pages.

### Overview

- **What it shows:** a welcome screen, summary cards, a volume chart, a status donut, quick actions, recent transactions and a wallet status card with your network and balances.
- **Why it exists:** a landing page that gives the merchant the feeling of a control center and quick links to the main tasks.
- **Honest note:** the wallet status card is live (real address, network and balances). The summary cards, the chart and the donut are currently placeholders that show zeros or an illustrative curve. Wiring them to the invoice and payment data is a good future improvement.

### My Wallet

- **What it shows:** your connected address (with a copy button), native ETH balance, mUSDC balance and network information, with a Refresh button.
- **Why it exists:** before paying or approving anything you need to confirm which account is connected and that it has gas (ETH) and tokens (mUSDC).
- **Reads from:** the provider balance and the token contract’s balanceOf.

### Create Invoice

- **What it does:** you type an amount and press Create invoice on-chain. MetaMask asks you to confirm createInvoice. A preview card then shows the invoice ID, amount, merchant and status Awaiting payment, with a button to copy the details.
- **Invoice history (bottom of the page):** a permanent list of invoices rebuilt from the contract’s InvoiceCreated and PaymentReceived events. It shows amount, merchant (You, Multisig or an address), status (Paid or Awaiting payment), who paid, the block and a copyable transaction hash. A Mine/All switch filters the list.
- **Pay button:** on an unpaid invoice that belongs to someone else, the connected customer wallet gets a Pay button that does the approval and the payment.
- **Why it exists:** it is how invoices come into existence and how a record is kept for bookkeeping. Nothing is stored in a database; the blockchain is the archive.
- **Writes to:** MerchantPayment (createInvoice, payInvoice) and the token (approve).
- **Important:** an invoice created here makes the connected wallet the merchant. To have the money land in the multi-sig, create the invoice through Approvals, New proposal, Create invoice as multisig.

### Approvals

- **What it shows:** the multi-sig’s owners, the number of approvals required, and a card for every proposal with a readable title such as Send 200 mUSDC, the real recipient, status and how many approvals it has.
- **Buttons:** **Approve** (owners only, once per proposal) and **Execute** (when enough approvals exist).
- **New proposal form:** owners can create a refund, a withdrawal or an invoice-as-multisig proposal. It can approve it for you in the same step.
- **Warning banner:** if the connected wallet is not an owner, the page says so and disables actions.
- **Why it exists:** this is the heart of the project, the place where shared control actually happens.
- **Writes to:** MultiSigWallet (submitTransaction, approveTransaction, executeTransaction).

### Transactions

- **What it shows:** the invoice history again (all invoices) and a **Payment history** table of PaymentReceived events involving you, tagged Paid (you were the customer) or Received (you or your multi-sig was the merchant), with block number and copyable hash.
- **Why it exists:** a ledger-style activity page for audits and the report screenshots.

### Settings

- **What it shows:** wallet connection status with Connect or Disconnect, the network configuration (Hardhat Local, chain 31337, RPC 127.0.0.1:8545), the three contract addresses with copy buttons, and an About section.
- **Why it exists:** a quick way to check that the dashboard points at the right contracts and to copy addresses for MetaMask or Etherscan.
- **Note:** the network values on this page and on My Wallet are static text for local development.

## 7. The Backend

A Node.js service in the backend folder. It is independent of the dashboard.

**Why it exists:** a shop’s own software cannot sit in a browser waiting for blockchain events. It needs a server that watches the chain, remembers what happened and calls it when something important occurs, the way Stripe does.

**How it works**

1. **Indexer:** every couple of seconds it reads new blocks in chunks, only processing blocks with enough confirmations on top (reorg safety). It decodes the three contracts’ events into invoices and proposals and stores them, keyed by transaction hash and log index so nothing is counted twice.
2. **Memory:** it saves lastProcessedBlock. After a restart it catches up on everything it missed without repeating anything (we tested this).
3. **Proposal decoding:** it reads the multi-sig proposal data to label it token\_transfer, create\_invoice and so on. A token transfer back to a customer who paid an invoice, for no more than they paid, is called a refund; otherwise it is a withdrawal.
4. **Webhooks:** events such as payment.confirmed, refund.executed and approval.pending are queued and sent to the merchant’s URL with an HMAC-SHA256 signature. Failed deliveries are retried with exponential backoff (1 s, 2 s, 4 s and so on, up to 60 s).
5. **REST API:** invoices, receipts, proposals, an event feed and webhook delivery logs (full table in the README).
6. **Demo receiver:** a small merchant server that verifies the signature before trusting a webhook, showing how a real merchant would integrate.

**Storage:** a JSON file (backend/data). Simple and dependency-free for a mini project; a real system would use PostgreSQL or DynamoDB.

## 8. How the Pieces Connect

- **ABIs:** the compiled contract descriptions are copied to frontend/src/contracts, so the dashboard knows how to call each function.
- **Addresses:** frontend/contractAddresses.ts holds the three contract addresses (plus a START\_BLOCK). The deploy script rewrites it automatically.
- **Wallet:** MetaMask holds the keys and signs. The dashboard never sees a private key.
- **Events as the database:** invoice history, payments and receipts are all rebuilt from events, which is why the data cannot be silently altered.

## 9. Scripts and Tests

- **scripts/deploy.ts:** deploys the token, gateway and a 2-of-3 multi-sig; funds test accounts on a local chain; writes deployments/\<network>.json and the frontend addresses.
- **scripts/demo.ts:** runs the invoice, payment, refund, early-execution and non-owner story on a local chain, prints a gas table and leaves a pending proposal so the Approvals page has something to show.
- **Tests:** 30 gateway tests plus 5 template tests. They cover happy paths, every revert, event arguments, the multi-sig as merchant, partial refunds and the compromised-owner attack. Line coverage on the three contracts is 100 percent.

## 10. Security Model and Limits

**Protected:** owner-only actions, one approval per owner, one execution per proposal, state updated before external calls, input validation, and the funds-safety scenario with one bad owner.

**Not protected or not built (be honest in the viva):**

- No audit; testnet use only.
- The multi-sig cannot change owners or threshold, revoke an approval or cancel a proposal.
- No invoice expiry and no dedicated refund function; refunds are multi-sig transfers.
- No price oracle (Chainlink) or fiat conversion; amounts are in mUSDC.
- The backend API has no authentication and uses a JSON file.
- Anyone can create an invoice; making the multi-sig the merchant is a usage convention.
- The Overview cards and chart are placeholders.

## 11. How to Deploy

There are three things to deploy: the **contracts**, the **backend** and the **dashboard**. For the course you can stop after the contracts on Sepolia plus the local dashboard; the rest is optional.

### 11.1 Run everything locally (development)

1. npm install in the project root, in backend and in frontend.
2. Terminal 1: npx hardhat node
3. Terminal 2: npm run deploy:local (writes addresses and funds test accounts)
4. Terminal 3: cd backend, copy .env.example to .env, npm start
5. Terminal 4 (optional): cd backend, npm run receiver
6. Terminal 5: cd frontend, npm run dev, open localhost:5173
7. In MetaMask add a network with RPC http://127.0.0.1:8545, chain ID 31337, and import the Hardhat test accounts from the node output.
8. Optional: npm run demo:local to fill the system with sample activity.

After restarting the Hardhat node the chain is empty again, so run the deploy step again and refresh the dashboard.

### 11.2 Deploy the contracts to Sepolia

**Prepare**

1. Create 4 MetaMask test wallets: three multi-sig owners and one customer. Use throwaway wallets only, never one that holds real funds.
2. Get free Sepolia ETH from a faucet for the deployer wallet and for each owner wallet (they need gas to approve and execute).
3. Get a Sepolia RPC URL from Alchemy or Infura (free tier is fine).
4. Store secrets in Hardhat’s encrypted keystore (never in the code or Git):
   - npx hardhat keystore set SEPOLIA\_RPC\_URL
   - npx hardhat keystore set SEPOLIA\_PRIVATE\_KEY

**Deploy**

5. Run the deploy script with your owners and the customer to fund (PowerShell syntax shown; use export on Mac or Linux):
   - $env:MULTISIG\_OWNERS="0xOwner1,0xOwner2,0xOwner3"
   - $env:MULTISIG\_REQUIRED="2"
   - $env:FUND\_ADDRESSES="0xCustomerWallet"
   - npm run deploy:sepolia
6. The script prints three addresses, saves deployments/sepolia.json and rewrites frontend/contractAddresses.ts. Save the deploy transaction hashes from the terminal or from Etherscan for the report.
7. Open each address on sepolia.etherscan.io to confirm the contracts exist.

**Verify the source (optional but impressive)**

8. Get a free Etherscan API key. Add a verify block to hardhat.config.ts: verify with etherscan and an apiKey set from a configuration variable named ETHERSCAN\_API\_KEY, then store it with npx hardhat keystore set ETHERSCAN\_API\_KEY.
9. Run npx hardhat verify --network sepolia ADDRESS followed by that contract’s constructor arguments (none for MockStablecoin; the token address for MerchantPayment; the owners list and threshold for MultiSigWallet, using the constructor-args file option shown by npx hardhat verify --help).

**Use it**

10. Switch MetaMask to the Sepolia network (it is built in), run the dashboard with npm run dev and connect an owner wallet. Create an invoice through a proposal, pay it from the customer wallet, then propose, approve with two owners and execute a refund.
11. Record every transaction hash. They go into the report’s deployment table and screenshots.

To return to local development, run npm run deploy:local again, which points the dashboard back at the local chain.

### 11.3 Deploy the backend (optional)

The backend must run on a host that stays on, and it needs the deployments/sepolia.json file and the ABIs.

1. Choose a host: Render, Railway, Fly.io, or an AWS EC2 instance. Deploy the whole repository, with the working directory set to backend.
2. Build command: npm install. Start command: npm start.
3. Environment variables: NETWORK=sepolia, RPC\_URL (your Alchemy or Infura Sepolia URL), CONFIRMATIONS=3, PORT (the host usually provides it), EXPLORER\_URL=https://sepolia.etherscan.io, WEBHOOK\_URL and WEBHOOK\_SECRET if you have a receiving server.
4. Add a persistent disk for backend/data. Without it the JSON store resets when the host restarts, the backend re-reads history and webhooks would be sent again. For anything beyond a demo, replace the JSON file with a database.
5. Protect the API before exposing it publicly (it currently has no authentication).
6. Check https://your-host/api/status: it should list the Sepolia contracts and a small indexer lag.

**AWS alternative (fits the cloud major):** run the indexer as a scheduled AWS Lambda (EventBridge every minute), store data in DynamoDB, expose the API through API Gateway and keep secrets in Secrets Manager. This is the production design to describe in the report; the current code is the simple single-server version.

### 11.4 Deploy the dashboard (optional)

1. Make sure frontend/contractAddresses.ts has the Sepolia addresses (the deploy script did this) and commit it.
2. Fix the build first: npm run build currently fails because of unused-import errors in a few pages. Either delete the unused imports or set noUnusedLocals and noUnusedParameters to false in frontend/tsconfig.app.json.
3. Push to GitHub and import the repository into Vercel or Netlify. Root directory: frontend. Build command: npm run build. Output directory: dist.
4. Open the deployed URL with MetaMask on Sepolia. If loading history is slow or errors out with a range message, check that START\_BLOCK is in contractAddresses.ts (the deploy script writes it).
5. Cosmetic: a few labels (Settings and My Wallet) still say Hardhat Local; change them if you show the Sepolia version in the demo.

### 11.5 Post-deployment checklist

- Contract addresses saved and visible on Etherscan
- Three owner wallets have Sepolia ETH; customer wallet has mUSDC
- MetaMask is on Sepolia and the right account is selected
- One complete flow done: invoice, payment, refund proposal, two approvals, execution
- Backend status page shows the right network and low lag (if deployed)
- Secrets are not in Git (check .gitignore and run git status)

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Dashboard shows no data or errors after restarting the node | The local chain was reset | Run npm run deploy:local again and refresh |
| MetaMask nonce or transaction errors on the local chain | MetaMask cached the old chain | Settings, Advanced, Clear activity tab data for the account |
| Approvals page says wallet is not an owner | Wrong MetaMask account | Switch to one of the owner accounts |
| Pay fails with insufficient balance | Customer has no mUSDC | Fund it (the deploy script funds local accounts; use FUND\_ADDRESSES on Sepolia) |
| Backend exits saying deployment file not found | Deploy not run for that network | Run the deploy script, or set NETWORK correctly |
| Webhooks stay pending | Receiver is down or the secret does not match | Start the receiver and make sure both sides use the same WEBHOOK\_SECRET |
| Settings page crashes | An old contractAddresses.ts format | Re-run the deploy script or use the latest zip |
| Sepolia history fails to load | Event scan starts at block 0 | Set START\_BLOCK in contractAddresses.ts to the deploy block |

## 13. Glossary

- **Smart contract:** code on the blockchain that holds funds and enforces rules.
- **Stablecoin / ERC-20:** a token with a standard interface; a stablecoin is pegged to a currency.
- **Multi-sig (M-of-N):** an action needs M approvals from N owners.
- **Event / log:** a permanent record emitted by a contract, used here as receipts.
- **Gas:** the fee for running a transaction, paid in ETH.
- **Testnet (Sepolia):** a practice blockchain with free test coins.
- **ABI:** the description of a contract’s functions that lets the dashboard call it.
- **Webhook:** a message the backend sends to the merchant’s server when something happens.
- **HMAC signature:** a code that proves a webhook really came from Quorum and was not changed.

## 14. Quick Answers for the Viva

- **Why not just use Stripe?** Fees, delayed settlement, and the processor owns the ledger and the refund controls. Here the rules and receipts are public and enforced by code.
- **How does multi-sig stop a hacker?** One stolen key can propose and approve but never reach the threshold alone, so execution reverts.
- **Why does the dashboard not need the backend?** It reads events straight from the chain. The backend serves merchant servers with webhooks and an API.
- **What happens if the backend is down?** Nothing is lost; it catches up from the last processed block when it restarts.
- **What would you add next?** Chainlink price feeds for fiat invoices, owner management and cancel or revoke in the multi-sig, invoice expiry, a database and authenticated API, and live Overview analytics.
