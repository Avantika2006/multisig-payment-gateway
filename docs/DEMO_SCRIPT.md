# Quorum: Live Demo Script

**Length:** about 6 to 8 minutes on Sepolia. **Story:** a shop's money sits in a vault that needs 2 of 3 owners to open. Customers pay in, receipts are public, and nobody can move funds alone.

---

## Before you present (15 minutes earlier)

- [ ] **Start the three services**, each in its own terminal:
  ```powershell
  cd D:\multisig-payment-gateway\backend;  npm run receiver   # webhook receiver  :4000
  cd D:\multisig-payment-gateway\backend;  npm start          # indexer + API     :4001
  cd D:\multisig-payment-gateway\frontend; npm run dev        # dashboard         :5173
  ```
- [ ] Open **http://localhost:5173** and **http://localhost:4001/api/status**. The status page should show `"network":"sepolia"` and a small `lag` (about 3).
- [ ] MetaMask is on **Sepolia** and the accounts **Owner 1**, **Owner 2** and **Customer** each have a little SepoliaETH.
- [ ] Have these tabs ready:
  - Etherscan for the multi-sig: https://sepolia.etherscan.io/address/0xb596578E1F5F17659478a756AdAf099d2738d35b
  - The README on GitHub (or in the editor)
- [ ] Arrange the screen so the webhook-receiver terminal is visible next to the browser.
- [ ] **Do not run `npm run deploy:local`**: it re-points the dashboard to a local chain.

> **Every MetaMask confirmation:** click the pencil next to *Network fee* → **Advanced** → Max base fee `0.1`, Priority fee `0.01`. Otherwise MetaMask may block the transaction with "Review alert".

---

## 1. The problem (30 seconds, no clicking)

> "Card gateways keep receipts in a database the processor controls, and one compromised admin can approve a refund or payout. Crypto fixes speed and cost but makes it worse: whoever holds the key holds all the money. Quorum puts the merchant's money in a multi-signature vault on Ethereum. Payments are public receipts, and any money leaving the vault needs 2 of 3 owners."

## 2. The architecture (45 seconds)

Show the diagram in the README (section 3) and say:

> "Three contracts on Sepolia: a stablecoin, a payment gateway for invoices and receipts, and a 2-of-3 multi-sig. **The key idea: the multi-sig itself is the merchant**, so every payment lands in the vault. A Node.js backend indexes the events and sends Stripe-style signed webhooks to the merchant's server, and this React dashboard is the merchant's control panel."

## 3. Overview page (30 seconds), as Owner 1

- Point at the four live cards: **Treasury balance**, **Total received**, **Awaiting payment**, **Awaiting approval**.
- Point at **Recent activity**: the earlier invoice #0 and its 500 mUSDC payment.

> "Everything here is live from the blockchain. Nothing is a database row we could edit."

## 4. Create an invoice: needs 2 of 3 (2 minutes)

1. **Owner 1** → **Invoices** → amount **50** → leave *Also approve it as the submitter* ticked → **Propose invoice** → confirm **two** MetaMask transactions (submit, approve).
   > "Even creating an invoice is a proposal. One owner can't do it alone."
2. The status card says the proposal needs **1 more approval**. Click **Go to Approvals**.
3. On **Approvals**, point at the card: **1 / 2**, badge **Needs approvals**, and **Execute is disabled**.
   > "With one approval the contract refuses to execute. If we called it directly it would revert with *Not enough approvals*. That's covered in our tests."
4. Switch MetaMask to **Owner 2**, connect, **Approve** → it becomes **2 / 2**, **Ready to execute** → **Execute**.
   > "Second owner agrees, and now the invoice exists on-chain with the vault as the merchant."

## 5. Customer pays and gets a receipt (1.5 minutes)

1. Switch MetaMask to **Customer** → **Invoices**. Note: no create form, because customers can't create invoices.
2. In **Invoice history**, find the 50 mUSDC invoice → **Pay** → confirm **two** transactions (approve the token, then pay).
   > "ERC-20 payments are two steps: the customer allows the gateway to take exactly 50, then the gateway pulls it."
3. Point at the **webhook-receiver terminal**: `✓ payment.confirmed`.
   > "The merchant's server was notified with an HMAC-signed webhook, exactly like Stripe. It only fires after 3 confirmations to protect against reorgs."
4. Open **Activity** → click the **Etherscan link** on *Invoice #N paid*.
   > "This is the receipt. It's public, permanent, and anyone can verify it without trusting us."

*While waiting for confirmations (about 40 seconds), talk about why blockchain is used here (section 2 of the plan).*

## 6. Refund: money leaving the vault needs 2 of 3 (1.5 minutes, optional if time is short)

1. Switch to **Owner 1** → **Approvals** → **Move treasury funds** → *Refund a customer* → amount **20** → paste the customer address `0x176370b1A2d138BBf037253692D000bdb11EA971` → **Submit proposal**.
2. Switch to **Owner 2** → **Approve** → **Execute**.
3. The receiver terminal shows `✓ refund.executed`.
   > "The backend recognised this as a refund because it goes back to a customer who paid, for no more than they paid."

## 7. The attack that fails (30 seconds)

- Switch MetaMask to the **Customer** and open **Approvals**: there is a banner *not a multisig owner* and no buttons.
  > "A non-owner can't approve anything, and the contract rejects it even if they bypass the UI."
- Then say:
  > "And if **one owner's key is stolen**, the attacker can propose sending everything to themselves and approve it, but can't execute with one signature. We test exactly this case: *a single compromised owner cannot drain the funds*."

## 8. Close (30 seconds)

> "30 contract tests, 100 % line coverage, deployed and exercised on Sepolia. Next steps on our roadmap: Chainlink USD pricing with a depeg check, a dedicated refund function with a refund window, time-locks for large withdrawals, and EIP-712 signatures so approvals cost owners no gas."

---

## If something goes wrong

| Problem | What to do |
|---|---|
| MetaMask "Review alert" / insufficient funds | Lower the fee (box at the top). If an account is empty, send it 0.0005 SepoliaETH from another account. |
| A transaction stays *Pending* | MetaMask → Activity → **Speed up**. Keep talking; Sepolia blocks are ~12 s. |
| Payment doesn't appear yet | Normal: the backend waits 3 confirmations. Click **Refresh** after ~40 s. |
| Backend not reachable | The invoice list falls back to reading the chain. Activity needs the backend: restart `npm start` in `backend/`. |
| Sepolia is down or very slow | Fall back to evidence: open the README's **Live deployment** section and click the Etherscan links for the earlier run (submit → execute → payment), then run `npx hardhat test` to show the 30 passing tests including the attack test. |

## Quick viva answers

| Question | Answer |
|---|---|
| Why blockchain and not a database? | Receipts can't be edited by anyone, and the 2-of-3 rule is enforced by code that no admin can bypass. |
| What's on-chain vs off-chain? | Money, invoices, receipts, owners, approvals: on-chain. Indexing, webhooks, the dashboard's lists: off-chain. No personal data on-chain. |
| How does multi-sig stop a stolen key? | Execution requires `approvals >= 2`; one key gives one approval. Tested. |
| Why approve before pay? | ERC-20 tokens can't be pulled without permission. We approve the exact amount, not unlimited, so a compromised gateway can't drain the wallet. |
| How do you prevent reentrancy and double actions? | `ReentrancyGuard` on payment, state updated before external calls (checks-effects-interactions), `approved[id][owner]` stops double approval, `executed` flag stops double execution. |
| Reorgs and missed events? | Backend waits 3 confirmations, stores the last processed block, and de-duplicates by `txHash:logIndex`, so restarts catch up without repeats. |
| Why no Chainlink? | Invoices are priced directly in a dollar stablecoin, so no conversion is needed for the demo. Chainlink USD pricing and a depeg check are the next step. |
| Where's the refund function? | Refunds are multi-sig token transfers, so they inherit the 2-of-3 protection. A dedicated `refund()` with a refund window and escrow is on the roadmap. |
| Limitations? | Not audited; flat 2-of-3 with no tiers or time-lock; no owner rotation or proposal cancel; backend uses a JSON file with no API auth. |
