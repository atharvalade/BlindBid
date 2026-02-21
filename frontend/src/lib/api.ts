/**
 * API client — calls our real backend directly.
 * Every function here hits a tested, working endpoint.
 * ALL data is live: Canton Sandbox, ADI Anvil Fork, Hedera Testnet.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function post(path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

// ─── Health ────────────────────────────────────────────────────────────────────

export async function getHealth() {
  return get("/health");
}

// ─── Canton / Auction ──────────────────────────────────────────────────────────

export async function createAuction(params: {
  auctionId: string;
  seller: string;
  itemDesc: string;
  constraints: string;
  weights: { priceWeight: number; deliveryWeight: number; penaltyWeight: number; reputationWeight: number };
  bidders: string[];
  auditor?: string;
  biddingDeadlineMinutes?: number;
}) {
  return post("/api/canton/auction/create", params);
}

export async function openBidding(auctionId: string, caller: string) {
  return post(`/api/canton/auction/${auctionId}/open-bidding`, { caller });
}

export async function closeBidding(auctionId: string, caller: string) {
  return post(`/api/canton/auction/${auctionId}/close-bidding`, { caller });
}

export async function scoreBids(auctionId: string, caller: string) {
  return post(`/api/canton/auction/${auctionId}/score-bids`, { caller });
}

export async function awardAuction(auctionId: string, caller: string, winner?: string) {
  return post(`/api/canton/auction/${auctionId}/award`, { caller, winner });
}

export async function submitBid(params: {
  auctionId: string;
  bidder: string;
  bidPackage: {
    price: number;
    deliveryDays: number;
    penaltyRate: number;
    warranty: string;
    addOns: string[];
    currency: string;
  };
}) {
  return post("/api/canton/bid/submit", params);
}

export async function getAuctionDetails(auctionId: string, party: string) {
  return get(`/api/canton/auction/${auctionId}/${party}/details`);
}

export async function getReputation(bidder: string, viewer: string) {
  return get(`/api/canton/reputation/${bidder}/${viewer}`);
}

// ─── Conditions ────────────────────────────────────────────────────────────────

export async function addCondition(auctionId: string, caller: string, conditionId: string, description: string) {
  return post(`/api/canton/auction/${auctionId}/add-condition`, { caller, conditionId, description });
}

export async function markConditionMet(auctionId: string, caller: string, conditionId: string, verifier: string) {
  return post(`/api/canton/auction/${auctionId}/mark-condition-met`, { caller, conditionId, verifier });
}

// ─── Disputes ──────────────────────────────────────────────────────────────────

export async function raiseDispute(auctionId: string, disputant: string, reason: string) {
  return post(`/api/canton/auction/${auctionId}/dispute`, { disputant, reason });
}

// ─── Hedera Audit ──────────────────────────────────────────────────────────────

export async function publishAuditCommitment(params: {
  auctionId: string;
  stage: string;
  cantonTxId: string;
  adiTxHash: string;
}) {
  return post("/api/audit/publish", params);
}

export async function getAuditLog(auctionId: string) {
  return get(`/api/audit/${auctionId}`);
}

// ─── Escrow (ADI On-Chain) ─────────────────────────────────────────────────────

export async function depositEscrow(auctionId: string, sellerAddress: string, amount: string) {
  return post("/api/escrow/deposit-native", { auctionId, sellerAddress, amount });
}

export async function getEscrowInfo(auctionId: string) {
  return get(`/api/escrow/${auctionId}`);
}

export async function releaseEscrow(auctionId: string) {
  return post("/api/escrow/release", { auctionId });
}

export async function refundEscrow(auctionId: string) {
  return post("/api/escrow/refund", { auctionId });
}

export async function disputeEscrow(auctionId: string) {
  return post("/api/escrow/dispute", { auctionId });
}

export async function resolveDisputeEscrow(auctionId: string, releaseToSeller: boolean) {
  return post("/api/escrow/resolve-dispute", { auctionId, releaseToSeller });
}

// ─── Sponsor / Paymaster (ADI ERC-4337) ────────────────────────────────────────

export async function getPaymasterInfo() {
  return get("/api/sponsor/info");
}

export async function signSponsor(params: {
  sender: string;
  auctionId: string;
  paymasterType?: "native" | "erc20";
  validitySeconds?: number;
}) {
  return post("/api/sponsor/sign", params);
}

export async function getDemoFailures() {
  return get("/api/sponsor/demo-failures");
}

export async function registerSponsorPolicy(params: {
  auctionId: string;
  beneficiary: string;
  allowedSelectors?: string[];
  allowedTargets?: string[];
  maxOpsPerAuction?: number;
  expirySeconds?: number;
}) {
  return post("/api/sponsor/policy", params);
}

// ─── Quotes (Fiat → Token) ────────────────────────────────────────────────────

export async function generateQuote(auctionId: string, fiatAmount: number, fiatCurrency: string, settlementToken: string) {
  return post("/api/quote/generate", { auctionId, fiatAmount, fiatCurrency, settlementToken });
}

export async function verifyQuote(quote: any) {
  return post("/api/quote/verify", quote);
}

// ─── Checkout (Merchant Payments) ──────────────────────────────────────────────

export async function createCheckout(params: {
  auctionId: string;
  merchantId: string;
  fiatAmount: number;
  fiatCurrency?: string;
  settlementToken?: string;
}) {
  return post("/api/checkout/create", params);
}

export async function getCheckout(sessionId: string) {
  return get(`/api/checkout/${sessionId}`);
}
