<p align="center">
  <img src="https://img.shields.io/badge/Canton-Daml-00d4aa?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2Zy8+" alt="Canton" />
  <img src="https://img.shields.io/badge/ADI-ERC--4337-ff6b35?style=for-the-badge" alt="ADI" />
  <img src="https://img.shields.io/badge/Hedera-HCS-8259ef?style=for-the-badge" alt="Hedera" />
  <img src="https://img.shields.io/badge/Status-Deployed%20%26%20Working-22c55e?style=for-the-badge" alt="Status" />
</p>

<h1 align="center">🔒 BlindBid to Buy, v2</h1>

<p align="center">
  <strong>A private B2B marketplace that settles like a public chain — without leaking anything.</strong>
</p>

<p align="center">
  Bidders submit confidential offers and terms · Auction logic runs privately on Canton Network in Daml<br/>
  Winner settles on ADI with true gasless UX via ERC-4337 paymasters<br/>
  A public audit trail is published through Hedera HCS — revealing zero business-sensitive details.
</p>

---

## 📋 Table of Contents

- [The Problem](#-the-problem)
- [The Solution](#-the-solution)
- [What Makes This Different (USP)](#-what-makes-this-different-usp)
- [Architecture](#-architecture)
- [Sponsor Bounties](#-sponsor-bounties)
- [Deployed Contract Addresses](#-deployed-contract-addresses)
- [Wallet Addresses](#-wallet-addresses)
- [Privacy Model & Data Visibility](#-privacy-model--data-visibility)
- [Daml Smart Contracts](#-daml-smart-contracts)
- [Solidity Smart Contracts](#-solidity-smart-contracts)
- [Hiero CLI Plugin](#-hiero-cli-plugin)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Setup & Installation](#-setup--installation)
- [Running the Demo](#-running-the-demo)
- [API Reference](#-api-reference)
- [E2E Test Results](#-e2e-test-results)

---

## 🔴 The Problem

B2B procurement is broken in three fundamental ways:

1. **No privacy on public chains.** If you put a bid on Ethereum, every competitor sees your price, delivery terms, and negotiation strategy. That's not how enterprise procurement works.

2. **No fairness without transparency.** If the auction runs on a private server, bidders have no way to verify the scoring was fair, the timeline wasn't manipulated, or that the winner was legitimate.

3. **No UX for enterprise users.** Expecting a procurement manager to buy ETH, manage a wallet, and pay gas fees is a non-starter. The crypto UX problem kills enterprise adoption.

Current "solutions" force a choice: **privacy OR transparency, never both.** And none of them solve the gas problem.

## 💡 The Solution

BlindBid combines three networks into something none of them can do alone:

| Layer | Network | What It Does |
|-------|---------|-------------|
| **Private Logic** | Canton Network (Daml) | Sealed bids, private scoring, party-based visibility, conditional awards, dispute resolution — all with real privacy enforced at the ledger level |
| **Public Settlement** | ADI (ERC-4337) | Gasless escrow deposits, releases, and refunds — bidders interact with zero native balance via sponsored UserOperations |
| **Public Audit** | Hedera (HCS) | Hash commitments at each stage prove fairness and timing without leaking any business data — anyone can verify, nobody can reverse-engineer |

**The result:** A marketplace where the Seller sees everything, each Bidder sees only their own data, the public can verify fairness, and nobody needs to buy crypto.

## ⚡ What Makes This Different (USP)

### 1. Sealed Bids with Private Multi-Criteria Scoring

Bidders don't just submit a price — they submit a **package**: price, delivery SLA, penalty clauses, warranty terms, and optional add-ons. Canton privately computes a weighted score:

```
score = 0.4 × price + 0.25 × delivery + 0.15 × penalty + 0.20 × reputation
```

Only the Seller sees the full breakdown. Everyone else gets an **"award proof packet"** — an enterprise-friendly explanation showing which criteria were used and the weight ranges, but **never the actual bid values**.

### 2. Private Reputation That's Actually Useful

Reputation is stored on Canton as attestations from previous counterparties. The auction scoring reads reputation **privately**. Losing bidders cannot infer the winner's history.

- **Seller sees:** "BidderA has 12 successful deliveries, 0 disputes, rating 4.8/5.0"
- **BidderB sees:** "You are eligible — minimum threshold passed"

This is privacy with utility.

### 3. Conditional Award, Escrow, and Private Dispute Resolution

The award is conditional on a checklist (KYC, delivery milestone, inspection). The buyer pays into a Solidity escrow contract on ADI. Canton controls release conditions privately and triggers release or refund instructions. A Daml dispute process exists with an arbitrator party — only involved parties see evidence.

### 4. True Gasless UX via ERC-4337

A bidder arrives with **no crypto, no native balance**. They interact through sponsored UserOperations:

- Backend sponsor signer generates cryptographic authorization
- Authorization is embedded in `paymasterAndData`
- `BlindBidNativePaymaster` validates the signature on-chain
- Strict abuse controls: allowlisted selectors, rate limits, spend caps, short expiry windows

### 5. Public Audit Trail That Proves Everything, Reveals Nothing

At each critical stage, a **hash commitment** is published to Hedera Consensus Service:

```
commitment = hash(auctionId + stage + cantonTxId + adiTxHash + timestamp + nonce)
```

Anyone can verify the sequence and timing. Nobody can reverse it into prices, delivery terms, or identities. The custom Hiero CLI plugin makes this a reusable workflow tool.

### 6. Multi-Currency Settlement with Signed Quotes

Seller lists in USD/AED. System generates a signed fiat-to-token quote with exchange rate, max slippage (50 bps), and a 10-minute expiry. Winner pays in ADI native or ERC-20 tokens.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
│  Landing · Live Demo · Privacy Explorer · Audit Trail               │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ REST API
┌────────────────────────────▼─────────────────────────────────────────┐
│                      BACKEND (Express.js + TypeScript)               │
│                                                                      │
│  Canton Service ◄──── JSON API ────► Canton Sandbox (Daml)          │
│  Contract Service ◄── ethers.js ──► ADI Anvil Fork (Solidity)       │
│  Hedera Service ◄──── SDK ────────► Hedera Testnet (HCS)           │
│  Sponsor Service ◄── ERC-4337 ───► Paymaster Contracts              │
│  Quote Service ◄──── Signed ─────► Fiat-to-Token Conversion        │
│  Checkout Service ◄─ EIP-681 ────► Merchant Payment Sessions        │
└──────────────────────────────────────────────────────────────────────┘

┌────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐
│   Canton    │  │  ADI (Anvil  │  │    Hedera    │  │   Hiero CLI    │
│  Sandbox   │  │    Fork)     │  │   Testnet    │  │    Plugin      │
│  Port 7575  │  │  Port 8545   │  │  HCS Topics  │  │  auctionlog    │
│  Daml JSON  │  │  Chain 99999 │  │  Mirror Node │  │  publish/verify │
│    API      │  │  ERC-4337    │  │  HashScan    │  │  export/list   │
└────────────┘  └──────────────┘  └──────────────┘  └────────────────┘
```

---

## 🏆 Sponsor Bounties

### 🟢 Canton Network — Build on Canton L1 ($8,000)

**What we built:** A complete private B2B auction marketplace with meaningful Daml smart contracts — not wrappers around other chains.

| Daml Template | Purpose | Privacy Model |
|--------------|---------|---------------|
| `Auction` | Main auction lifecycle (Created → BiddingOpen → BiddingClosed → Scoring → Awarded) | Seller is signatory; bidders + auditor are observers |
| `SealedBid` | Confidential bid packages with price, delivery, penalty, warranty, add-ons | Only the bidder (signatory) and seller (observer) — **other bidders see nothing** |
| `ScoredBid` | Weighted multi-criteria scores computed by seller | Seller signatory, bidder observer — bidders see only their own score |
| `AwardedAuction` | Post-award lifecycle: conditions, escrow instructions, disputes | Winner + losing bidders see award proof but **never actual bid values** |
| `DisputedAuction` | Evidence submission and arbitrator resolution | Only involved parties (disputant, seller, winner, auditor) see evidence |
| `ReputationContract` | Private attestations from previous counterparties | Only attestor and bidder — third parties see nothing |
| `ReputationThresholdCheck` | Boolean eligibility check without exposing raw scores | Checker and bidder only |

**Canton integration is REAL** — the backend makes HTTP calls to the Canton JSON API (`/v1/create`, `/v1/exercise`, `/v1/query`) with JWT tokens per party. Privacy is enforced by the ledger itself, not application logic.

**Daml SDK:** 2.10.3 · **Package ID:** `09b79c24d7d59ea75eb762c5c2aa0cf315e686c4018ec09222e7809495e5249a`

---

### 🟠 ADI Foundation — Paymaster Devtools

**What we built:** Two custom ERC-4337 paymasters with full sponsor authorization, abuse controls, and demonstrated failure cases.

| Contract | Address (Anvil Fork) | Description |
|----------|---------------------|-------------|
| `BlindBidNativePaymaster` | `0x60640D3cC6Af9c11E60ADDA4a52b49dF16E3de0C` | Sponsors gas for bidders using native ADI. Validates sponsor signatures in `validatePaymasterUserOp`. |
| `BlindBidERC20Paymaster` | `0x5EfC93821214C08Cf99DFAcc71168d4381452412` | Accepts ERC-20 token payment for gas with configurable `tokenPricePerGas`. |
| `MockERC20` | `0x8Fc04637612137abC670717B3C3151ED315219cf` | Test token for ERC-20 paymaster flows |

**Sponsor authorization flow:**
1. Backend generates off-chain signature: `sign(sender, paymaster, validUntil, validAfter, chainId, entryPoint)`
2. Signature is embedded in `paymasterAndData` bytes
3. Paymaster's `validatePaymasterUserOp` recovers and verifies the signer
4. Authorization is bound to: account address, chain ID (`99999`), EntryPoint (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`), and expiry window

**Demonstrated failure cases (required by bounty):**
- ❌ `SPONSOR_POLICY_EXPIRED` — expired sponsorship window
- ❌ `SPONSOR_SELECTOR_DISALLOWED` — function selector not in allowlist
- ❌ `SPONSOR_RATE_LIMIT` — exceeded `maxOpsPerAuction`
- ❌ `SPONSOR_POLICY_NOT_FOUND` — no policy registered for account

**E2E test output:**
```
✅ Native paymaster deposit: 100.0 ADI on EntryPoint
✅ ERC-20 paymaster deposit: 100.0 ADI on EntryPoint
✅ Sponsor signature generated and verified
✅ Escrow deposit: tx=0x76fa... gasUsed=159415
✅ Escrow release: tx=0xa164... state=Released
```

---

### 🟠 ADI Foundation — Merchant Payments

**What we built:** End-to-end payment settlement with signed fiat-to-token quotes, an escrow smart contract, and merchant callbacks.

| Contract | Address (Anvil Fork) | Description |
|----------|---------------------|-------------|
| `BlindBidEscrow` | `0x0c64cABcBE4C139F40227Dd9cEce1345c29DE881` | Conditional escrow: deposit → release/refund/dispute → resolve. Supports native ADI and ERC-20. |

**Payment flow:**
1. Seller lists lot in USD/AED
2. System generates **signed quote**: exchange rate, max slippage (50 bps), 10-minute expiry
3. Winner deposits into `BlindBidEscrow` (real on-chain transaction)
4. Canton privately verifies conditions (KYC, delivery, inspection)
5. Backend triggers `release()` or `refund()` based on Canton's instruction
6. Funds transfer to seller or back to buyer

**Checkout features:**
- EIP-681 payment request URLs (QR code compatible)
- WalletConnect URI generation
- Payment status tracking with merchant webhook callbacks
- Clear status progression: `pending → quoted → submitted → confirmed`

---

### 🟣 Hedera — Hiero CLI Plugin

**What we built:** A custom Hiero CLI plugin (`auctionlog`) that publishes, verifies, and exports audit commitments to Hedera Consensus Service (HCS).

**Commands:**

```bash
# Publish a commitment at a critical stage
hiero auctionlog publish \
  --auctionId DEMO-123 \
  --stage awarded \
  --cantonTxId canton-ref-abc \
  --adiTxHash 0xb800fae43fb4975e86...

# Verify the audit trail for an auction
hiero auctionlog verify --auctionId DEMO-123

# Export audit log as JSON or CSV
hiero auctionlog export --auctionId DEMO-123 --format json --outputFile audit.json

# List all commitments (optionally filter by auction)
hiero auctionlog list --auctionId DEMO-123
```

**Commitment structure:**
```
hash(auctionId + stage + cantonTxId + adiTxHash + timestamp + nonce)
```

**Stages published:** `created` · `bidding-open` · `bidding-closed` · `awarded` · `settled` · `disputed`

**Hedera Account:** `0.0.7984559` (testnet) — real topics created, real messages published, verifiable on [HashScan](https://hashscan.io/testnet).

---

## 📄 Deployed Contract Addresses

> All contracts are deployed on the ADI Anvil Fork (Chain ID: 99999, forked from ADI Testnet RPC).

| Contract | Address | Verified |
|----------|---------|----------|
| **BlindBidNativePaymaster** | `0x60640D3cC6Af9c11E60ADDA4a52b49dF16E3de0C` | ✅ |
| **BlindBidERC20Paymaster** | `0x5EfC93821214C08Cf99DFAcc71168d4381452412` | ✅ |
| **MockERC20** | `0x8Fc04637612137abC670717B3C3151ED315219cf` | ✅ |
| **BlindBidEscrow** | `0x0c64cABcBE4C139F40227Dd9cEce1345c29DE881` | ✅ |
| **EntryPoint v0.7** | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | ✅ (canonical) |

**Canton Daml Package:**
| Item | Value |
|------|-------|
| Package ID | `09b79c24d7d59ea75eb762c5c2aa0cf315e686c4018ec09222e7809495e5249a` |
| Canton Namespace | `12205b779a3c744111afb336f7229cd2be55d0921a85c617c1121d92a8d2dd14cc65` |
| Ledger API | `http://127.0.0.1:7575` (JSON API) |

---

## 👛 Wallet Addresses

| Wallet | Address | Purpose |
|--------|---------|---------|
| **Deployer** | `0xA510ca9Ee7C66E7351C514C03edEEFd6D59F222F` | Deploys contracts, funds paymasters, acts as buyer in demo |
| **Sponsor Signer** | `0xb02e172f65d6c4ee10B4C6a10F5589003278Ced7` | Signs sponsor authorizations for `paymasterAndData` |
| **Hedera Account** | `0.0.7984559` | Publishes HCS commitments on Hedera Testnet |
| **Hedera EVM** | `0xa055bf5288922810f8ab02df2f989dcbec556762` | EVM-compatible Hedera address |

**Canton Parties (with full namespace):**

| Party | Full Identifier |
|-------|----------------|
| Seller | `Seller::12205b779a3c744111afb336f7229cd2be55d0921a85c617c1121d92a8d2dd14cc65` |
| BidderA | `BidderA::12205b779a3c744111afb336f7229cd2be55d0921a85c617c1121d92a8d2dd14cc65` |
| BidderB | `BidderB::12205b779a3c744111afb336f7229cd2be55d0921a85c617c1121d92a8d2dd14cc65` |
| Auditor | `Auditor::12205b779a3c744111afb336f7229cd2be55d0921a85c617c1121d92a8d2dd14cc65` |

---

## 🔐 Privacy Model & Data Visibility

This is the core value proposition. Canton's party-based visibility is enforced at the **ledger level** — not filtered by the application.

| Data | Seller | BidderA | BidderB | Auditor | Public (Hedera) |
|------|:------:|:-------:|:-------:|:-------:|:---------------:|
| Auction metadata (item, constraints) | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ❌ Nothing |
| Scoring weights | ✅ Full | ✅ Ranges only | ✅ Ranges only | ✅ Full | ❌ Nothing |
| BidderA's bid package | ✅ Full | ✅ Own bid | ❌ **Nothing** | ❌ Nothing | ❌ Nothing |
| BidderB's bid package | ✅ Full | ❌ **Nothing** | ✅ Own bid | ❌ Nothing | ❌ Nothing |
| BidderA's score | ✅ Full | ✅ Own score | ❌ **Nothing** | ❌ Nothing | ❌ Nothing |
| BidderB's score | ✅ Full | ❌ **Nothing** | ✅ Own score | ❌ Nothing | ❌ Nothing |
| BidderA's reputation (detailed) | ✅ Full | ✅ Own history | ❌ **Nothing** | ❌ Nothing | ❌ Nothing |
| BidderB's reputation (detailed) | ✅ Full | ❌ **Nothing** | ✅ Own history | ❌ Nothing | ❌ Nothing |
| Award proof (criteria + weight ranges) | ✅ Full | ✅ Proof only | ✅ Proof only | ✅ Full | ❌ Nothing |
| Winner identity | ✅ | ✅ | ✅ | ✅ | ❌ |
| Winning bid value | ✅ | ❌ | ❌ | ❌ | ❌ |
| Escrow tx hash | ✅ | ✅ (if winner) | ❌ | ✅ | ✅ Hash only |
| Dispute evidence | ✅ | ✅ (if party) | ❌ | ✅ | ❌ Nothing |
| Audit commitment hash | ✅ | ✅ | ✅ | ✅ | ✅ Hash only |
| Stage timing proof | ✅ | ✅ | ✅ | ✅ | ✅ **Full** |

**Key insight:** The public audit trail on Hedera proves the *sequence and timing* of events (auction created → bidding closed → awarded → settled) without revealing *any* business data. Anyone can verify fairness; nobody can extract prices, terms, or identities.

---

## 📜 Daml Smart Contracts

Located in `canton-daml/daml/BlindBid/`:

### `Types.daml` — Core Data Types
```haskell
data ScoringWeights   -- price, delivery, penalty, reputation weights
data BidPackage       -- price, deliveryDays, penaltyRate, warranty, addOns, currency
data BidScore         -- computed scores per criterion + total
data AwardProof       -- criteria used, weight ranges, validity flags
data AwardCondition   -- conditional checklist items
data EscrowInstruction -- release/refund instructions for ADI
data AuctionStage     -- Created | BiddingOpen | BiddingClosed | Scoring | Awarded | ...
```

### `Auction.daml` — Full Auction Lifecycle
- **`Auction`** — 5 choices: `OpenBidding`, `CloseBidding`, `StartScoring`, `AwardAuction`, `QueryAuctionStage`
- **`SealedBid`** — 1 choice: `ScoreBid` (seller scores privately)
- **`ScoredBid`** — Immutable scored record
- **`AwardedAuction`** — 6 choices: `AddCondition`, `MarkConditionMet`, `TriggerRelease`, `TriggerRefund`, `RaiseDispute`, `AuditorCoSign`
- **`DisputedAuction`** — 2 choices: `SubmitEvidence`, `ResolveDispute`

### `Reputation.daml` — Private Reputation System
- **`ReputationContract`** — attestor + bidder visibility only
- **`ReputationThresholdCheck`** — boolean eligibility (no raw data leaked)
- **`ReputationCheckRequest`** — privacy-preserving check flow

---

## ⛓ Solidity Smart Contracts

Located in `adi-paymaster/src/`:

### `BlindBidNativePaymaster.sol`
ERC-4337 paymaster that sponsors gas using native ADI. Validates sponsor signatures (ECDSA recovery of `keccak256(sender, paymaster, validUntil, validAfter, chainId, entryPoint)`).

### `BlindBidERC20Paymaster.sol`
ERC-4337 paymaster that accepts ERC-20 tokens as gas payment. Configurable `tokenPricePerGas`.

### `BlindBidEscrow.sol`
Conditional escrow with 5 states: `Empty → Funded → Released/Refunded/Disputed`. Supports native ADI and ERC-20. Dispute resolution via arbitrator. Quote verification via ECDSA.

### `MockERC20.sol`
Standard ERC-20 token for testing ERC-20 paymaster and escrow flows.

---

## 🔧 Hiero CLI Plugin

Located in `hiero-plugin/src/auctionlog/`:

```
auctionlog/
├── manifest.ts           # Plugin manifest with all 4 commands
├── types.ts              # TypeScript interfaces
└── commands/
    ├── publish/          # Publish commitment to HCS
    │   ├── handler.ts    # Creates topic if needed, hashes, submits
    │   ├── input.ts      # Zod schema: auctionId, stage, cantonTxId, adiTxHash
    │   └── output.ts     # Schema + Handlebars template
    ├── verify/           # Verify audit trail integrity
    │   ├── handler.ts    # Retrieves and validates sequence + hashes
    │   ├── input.ts      # Zod schema: auctionId
    │   └── output.ts
    ├── export/           # Export to JSON or CSV
    │   ├── handler.ts    # Fetches logs, writes file
    │   ├── input.ts      # Zod schema: auctionId, format, outputFile
    │   └── output.ts
    └── list/             # List commitments
        ├── handler.ts    # Lists all or filtered by auctionId
        ├── input.ts
        └── output.ts
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contracts (Private)** | Daml 2.10.3 on Canton Sandbox |
| **Smart Contracts (Public)** | Solidity 0.8.23 (Foundry) |
| **Backend** | Node.js + Express.js + TypeScript |
| **Frontend** | Next.js 14 + React 18 + Tailwind CSS + Framer Motion |
| **ADI Integration** | ethers.js 6 (ERC-4337, escrow, paymasters) |
| **Hedera Integration** | @hashgraph/sdk (HCS topics + messages) |
| **Canton Integration** | JSON API with JWT auth (fast-jwt) |
| **Local Blockchain** | Anvil (Foundry) — fork of ADI Testnet |
| **CLI Plugin** | TypeScript + Zod + Handlebars (Hiero CLI) |
| **Testing** | Custom E2E suite (paymaster-e2e.ts) |

---

## 📁 Project Structure

```
BlindBid/
├── frontend/                 # Next.js 14 application
│   └── src/
│       ├── app/
│       │   ├── page.tsx      # Landing page (scroll animations, sponsor tracks)
│       │   ├── demo/         # Live Demo (15-step auction lifecycle)
│       │   ├── privacy/      # Privacy Explorer (party view comparison)
│       │   ├── audit/        # Audit Trail (Hedera HCS timeline)
│       │   └── globals.css   # Custom glass, gradients, party colors
│       └── lib/api.ts        # API client (all endpoints)
│
├── backend/                  # Express.js API server
│   └── src/
│       ├── services/
│       │   ├── cantonService.ts      # Real Canton JSON API integration
│       │   ├── contractService.ts    # ADI contract interactions (ethers.js)
│       │   ├── hederaService.ts      # Hedera HCS publishing
│       │   ├── sponsorService.ts     # ERC-4337 sponsor policies
│       │   ├── quoteService.ts       # Fiat-to-token quote generation
│       │   ├── checkoutService.ts    # Payment session management
│       │   └── merchantService.ts    # Merchant registration
│       ├── routes/                   # REST API endpoints
│       └── config.ts                 # Environment configuration
│
├── canton-daml/              # Daml smart contracts
│   └── daml/BlindBid/
│       ├── Types.daml        # Core types
│       ├── Auction.daml      # Auction lifecycle (7 templates)
│       └── Reputation.daml   # Private reputation (3 templates)
│
├── adi-paymaster/            # Solidity contracts + deployment
│   ├── src/
│   │   ├── BlindBidNativePaymaster.sol
│   │   ├── BlindBidERC20Paymaster.sol
│   │   ├── BlindBidEscrow.sol
│   │   └── MockERC20.sol
│   ├── script/Deploy.s.sol   # Foundry deployment script
│   └── e2e/paymaster-e2e.ts  # End-to-end test suite
│
├── hiero-plugin/             # Hiero CLI auctionlog plugin
│   └── src/auctionlog/
│       ├── manifest.ts       # Plugin manifest
│       └── commands/         # publish, verify, export, list
│
└── .gitignore
```

---

## 🚀 Setup & Installation

### Prerequisites

- **Node.js** ≥ 18
- **Docker Desktop** (for Canton sandbox)
- **Foundry** (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- **Daml SDK** 2.10.3 (`curl -sSL https://get.daml.com/ | sh`)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/<your-username>/BlindBid.git
cd BlindBid

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Solidity (Foundry)
cd adi-paymaster && forge install && cd ..
```

### 2. Start Canton Sandbox

```bash
export PATH="$HOME/.daml/bin:$PATH"
cd canton-daml
daml start --sandbox-port 6865 --json-api-port 7575 &
```

Wait for `"Started server"` message. The sandbox compiles and uploads the DAR automatically.

### 3. Start ADI Anvil Fork

```bash
anvil --fork-url https://rpc.ab.testnet.adifoundation.ai/ --port 8545 &
```

### 4. Deploy Solidity Contracts

```bash
cd adi-paymaster
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key <DEPLOYER_PRIVATE_KEY>
```

### 5. Configure Environment

```bash
cd backend
cp env.example .env
# Fill in:
#   - Contract addresses from step 4
#   - Canton package ID (from daml build output)
#   - Canton namespace (from party allocation)
#   - Hedera private key (from portal.hedera.com)
```

### 6. Start Backend

```bash
cd backend
npx ts-node src/index.ts
# Starts on port 3001
```

### 7. Start Frontend

```bash
cd frontend
npx next dev --port 3000
# Opens at http://localhost:3000
```

---

## 🎬 Running the Demo

### Option A: One-Click (Frontend)

Navigate to `http://localhost:3000/demo` and click **"Run Full Demo"**. The system executes all 15 steps automatically:

1. **System Health** — verifies Canton, ADI, Hedera are all live
2. **Create Auction** — Daml `Auction` contract on Canton
3. **Open Bidding** — Canton transitions to `BiddingOpen`
4. **Sponsor Auth A** — ERC-4337 signature for BidderA
5. **BidderA Bid** — sealed `SealedBid` contract on Canton
6. **Sponsor Auth B** — ERC-4337 signature for BidderB
7. **BidderB Bid** — sealed `SealedBid` contract on Canton
8. **Close Bidding + Hedera Audit** — Canton transition + HCS commitment
9. **Score Bids** — private multi-criteria scoring
10. **Award** — Canton awards with explainable proof
11. **Generate Quote** — signed fiat-to-token conversion
12. **Escrow Deposit** — **real on-chain ADI transaction**
13. **Release Escrow** — **real on-chain funds transfer to seller**
14. **Settlement Audit** — HCS commitment with real ADI tx hash
15. **Failure Cases** — demonstrates all required paymaster failures

### Option B: Explore Pages

- **`/privacy`** — Side-by-side comparison of what Seller, BidderA, BidderB, and Auditor each see
- **`/audit`** — Hedera HCS timeline with HashScan links
- **`/`** — Landing page explaining the system and all sponsor tracks

---

## 📡 API Reference

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | System health + all service statuses |

### Canton / Auction
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/canton/auction/create` | Create auction on Canton |
| POST | `/api/canton/auction/:id/open-bidding` | Open bidding window |
| POST | `/api/canton/bid/submit` | Submit sealed bid |
| POST | `/api/canton/auction/:id/close-bidding` | Close bidding |
| POST | `/api/canton/auction/:id/score-bids` | Score all bids |
| POST | `/api/canton/auction/:id/award` | Award to winner |
| GET | `/api/canton/auction/:id/:party/details` | Get auction details (party-filtered) |
| GET | `/api/canton/reputation/:bidder/:viewer` | Get reputation (privacy-filtered) |

### Escrow (ADI On-Chain)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/escrow/deposit-native` | Deposit native ADI into escrow |
| GET | `/api/escrow/:auctionId` | Get escrow state from blockchain |
| POST | `/api/escrow/release` | Release funds to seller |
| POST | `/api/escrow/refund` | Refund funds to buyer |
| POST | `/api/escrow/dispute` | Initiate dispute |
| POST | `/api/escrow/resolve-dispute` | Resolve dispute |

### Sponsor / Paymaster (ERC-4337)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sponsor/sign` | Generate sponsor authorization |
| GET | `/api/sponsor/info` | Live paymaster contract info |
| GET | `/api/sponsor/demo-failures` | Demonstrate failure cases |
| POST | `/api/sponsor/policy` | Register sponsorship policy |

### Hedera Audit
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/audit/publish` | Publish commitment to HCS |
| GET | `/api/audit/:auctionId` | Get audit log |

### Quotes & Checkout
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/quote/generate` | Generate signed fiat-to-token quote |
| POST | `/api/quote/verify` | Verify quote signature |
| POST | `/api/checkout/create` | Create checkout session |
| GET | `/api/checkout/:sessionId` | Get checkout status |

---

## ✅ E2E Test Results

Full auction lifecycle tested end-to-end with real services:

```
=== FULL E2E TEST ===
--- 0:Health ---       ✅
--- 1:Create ---       ✅ Auction created on Canton
--- 2:Open ---         ✅ Bidding opened
--- 3:SponsorA ---     ✅ sig=0xb79d3c7e1dcd...
--- 4:BidA ---         ✅ Sealed bid on Canton
--- 5:SponsorB ---     ✅ sig=0x4af2e9c1...
--- 6:BidB ---         ✅ Sealed bid on Canton
--- 7:Close ---        ✅ Bidding closed
--- 7b:AuditClose ---  ✅ topic=0.0.7999778 (Hedera Testnet)
--- 8:Score ---        ✅ scored=2 bids
--- 9:Award ---        ✅ winner=BidderB
--- 10:Quote ---       ✅ rate=10 ADI/USD
--- 11:EscrowDeposit - ✅ tx=0xb800fae43fb4... gas=159415
--- 12:Release ---     ✅ tx=0x8e7c685edbfa... state=Released
--- 13:AuditSettled -- ✅ topic=0.0.7999778 seq=2
--- 14:Failures ---    ✅ 4 failure cases demonstrated
=== ALL 15 STEPS ✅ ===
```

---

## 📄 License

MIT

---

<p align="center">
  Built for the Canton Network + ADI Foundation + Hedera Hackathon<br/>
  <strong>Privacy where it matters. Transparency where it counts. Zero gas for users.</strong>
</p>
