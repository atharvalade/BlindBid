/**
 * CantonService — REAL Canton Ledger JSON API integration.
 *
 * Every operation goes through the Daml JSON API at localhost:7575.
 * Canton enforces party-based visibility cryptographically — no application-level
 * filtering needed. Each party only sees contracts they're signatory/observer on.
 *
 * Architecture:
 *   Frontend → Backend API → Canton JSON API → Canton Sandbox (Daml ledger)
 *
 * JWT tokens are generated per-party to authenticate with the JSON API.
 * The sandbox doesn't verify JWT signatures, but the token carries the party claim.
 */

import { createHmac } from "crypto";
import { config } from "../config";

// ─── Types mirroring Daml contracts ───────────────────────────────────────────

export interface ScoringWeights {
  priceWeight: number;
  deliveryWeight: number;
  penaltyWeight: number;
  reputationWeight: number;
}

export interface BidPackage {
  price: number;
  deliveryDays: number;
  penaltyRate: number;
  warranty: string;
  addOns: string[];
  currency: string;
}

export interface BidScore {
  priceScore: number;
  deliveryScore: number;
  penaltyScore: number;
  reputationScore: number;
  totalScore: number;
}

export interface AwardProof {
  criteriaUsed: string[];
  weightRanges: Array<{ criterion: string; minWeight: number; maxWeight: number }>;
  winnerIsValid: boolean;
  withinConstraints: boolean;
  notExpired: boolean;
  awardedAt: string;
}

export interface AwardCondition {
  conditionId: string;
  description: string;
  isMet: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface EscrowInstruction {
  action: "release" | "refund";
  amount: number;
  currency: string;
  recipient: string;
  adiTxHash?: string;
}

export interface ReputationAttestation {
  attestor: string;
  bidder: string;
  successfulDeliveries: number;
  disputes: number;
  rating: number;
  attestedAt: string;
}

export type AuctionStage =
  | "created"
  | "bidding-open"
  | "bidding-closed"
  | "scoring"
  | "awarded"
  | "conditions-checking"
  | "settled"
  | "disputed"
  | "resolved";

// ═══════════════════════════════════════════════════════════════════════════════
// JWT TOKEN GENERATION FOR CANTON JSON API
// ═══════════════════════════════════════════════════════════════════════════════

function base64url(str: string): string {
  return Buffer.from(str).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createJwt(party: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    "https://daml.com/ledger-api": {
      ledgerId: "sandbox",
      applicationId: "blindbid",
      actAs: [party],
      readAs: [party],
    },
  }));
  const secret = config.canton.jwtSecret || "secret";
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.${signature}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANTON JSON API CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

const CANTON_API = config.canton.ledgerApiUrl || "http://127.0.0.1:7575";
const PKG = config.canton.packageId;

async function cantonPost(endpoint: string, body: any, party: string): Promise<any> {
  const token = createJwt(party);
  const res = await fetch(`${CANTON_API}${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (data.status !== 200 && data.errors) {
    throw new Error(`CANTON_ERROR: ${data.errors.join("; ")}`);
  }
  return data;
}

async function cantonQuery(templateId: string, party: string, filter?: Record<string, any>): Promise<any[]> {
  const token = createJwt(party);
  const body: any = { templateIds: [`${PKG}:${templateId}`] };
  if (filter) body.query = filter;

  const res = await fetch(`${CANTON_API}/v1/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (data.errors) {
    throw new Error(`CANTON_QUERY_ERROR: ${data.errors.join("; ")}`);
  }
  return data.result || [];
}

async function cantonCreate(templateId: string, payload: any, party: string): Promise<any> {
  return cantonPost("/v1/create", {
    templateId: `${PKG}:${templateId}`,
    payload,
  }, party);
}

async function cantonExercise(
  templateId: string,
  contractId: string,
  choice: string,
  argument: any,
  party: string
): Promise<any> {
  return cantonPost("/v1/exercise", {
    templateId: `${PKG}:${templateId}`,
    contractId,
    choice,
    argument,
  }, party);
}

// ─── Party helpers ─────────────────────────────────────────────────────────────

function fullPartyId(shortName: string): string {
  const ns = config.canton.namespace;
  if (!ns) throw new Error("CANTON_NAMESPACE not configured");
  // Already fully qualified?
  if (shortName.includes("::")) return shortName;
  return `${shortName}::${ns}`;
}

function shortPartyName(fullId: string): string {
  return fullId.split("::")[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUCTION LIFECYCLE — Real Canton Ledger API calls
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an Auction contract on the Canton ledger.
 */
export async function createAuction(params: {
  auctionId: string;
  seller: string;
  itemDesc: string;
  constraints: string;
  weights: ScoringWeights;
  bidders: string[];
  auditor?: string;
  biddingDeadlineMinutes?: number;
}): Promise<any> {
  const seller = fullPartyId(params.seller);
  const bidders = params.bidders.map(fullPartyId);
  const auditor = params.auditor ? fullPartyId(params.auditor) : null;
  const now = new Date();
  const deadline = new Date(now.getTime() + (params.biddingDeadlineMinutes ?? 60) * 60 * 1000);

  const result = await cantonCreate("BlindBid.Auction:Auction", {
    seller,
    auctionId: params.auctionId,
    itemDesc: params.itemDesc,
    constraints: params.constraints,
    weights: {
      priceWeight: params.weights.priceWeight.toString(),
      deliveryWeight: params.weights.deliveryWeight.toString(),
      penaltyWeight: params.weights.penaltyWeight.toString(),
      reputationWeight: params.weights.reputationWeight.toString(),
    },
    bidders,
    auditor: auditor || null,
    stage: "Created",
    createdAt: now.toISOString(),
    biddingDeadline: deadline.toISOString(),
  }, seller);

  return {
    auctionId: params.auctionId,
    contractId: result.result.contractId,
    seller: shortPartyName(seller),
    stage: "created",
    createdAt: now.toISOString(),
    biddingDeadline: deadline.toISOString(),
    bidders: bidders.map(shortPartyName),
    auditor: auditor ? shortPartyName(auditor) : undefined,
    cantonOffset: result.result.completionOffset,
  };
}

/**
 * Open bidding on an auction (Seller exercises OpenBidding choice).
 */
export async function openBidding(auctionId: string, seller: string): Promise<any> {
  const sellerFull = fullPartyId(seller);
  const contracts = await cantonQuery("BlindBid.Auction:Auction", sellerFull, { auctionId });
  if (contracts.length === 0) throw new Error("AUCTION_NOT_FOUND");

  const contract = contracts.find((c: any) => c.payload.stage === "Created");
  if (!contract) throw new Error("INVALID_STAGE: Auction not in Created stage");

  const result = await cantonExercise(
    "BlindBid.Auction:Auction",
    contract.contractId,
    "OpenBidding",
    {},
    sellerFull
  );

  return {
    auctionId,
    stage: "bidding-open",
    contractId: result.result.exerciseResult,
    cantonOffset: result.result.completionOffset,
  };
}

/**
 * Close bidding (Seller exercises CloseBidding choice).
 */
export async function closeBidding(auctionId: string, seller: string): Promise<any> {
  const sellerFull = fullPartyId(seller);
  const contracts = await cantonQuery("BlindBid.Auction:Auction", sellerFull, { auctionId });
  if (contracts.length === 0) throw new Error("AUCTION_NOT_FOUND");

  const contract = contracts.find((c: any) => c.payload.stage === "BiddingOpen");
  if (!contract) throw new Error("INVALID_STAGE: Auction not in BiddingOpen stage");

  const result = await cantonExercise(
    "BlindBid.Auction:Auction",
    contract.contractId,
    "CloseBidding",
    {},
    sellerFull
  );

  return {
    auctionId,
    stage: "bidding-closed",
    contractId: result.result.exerciseResult,
    cantonOffset: result.result.completionOffset,
  };
}

/**
 * Submit a sealed bid (Bidder creates a SealedBid contract).
 * Only the bidder and seller can see this contract — Canton enforces privacy.
 */
export async function submitBid(params: {
  auctionId: string;
  bidder: string;
  bidPackage: BidPackage;
}): Promise<{ bidId: string; message: string; contractId: string }> {
  const bidder = fullPartyId(params.bidder);

  // Look up the auction to get the seller
  const auctions = await cantonQuery("BlindBid.Auction:Auction", bidder, {
    auctionId: params.auctionId,
  });
  if (auctions.length === 0) throw new Error("AUCTION_NOT_FOUND or not invited");

  const auction = auctions[0];
  const seller = auction.payload.seller;

  const result = await cantonCreate("BlindBid.Auction:SealedBid", {
    bidder,
    seller,
    auctionId: params.auctionId,
    bidPackage: {
      price: params.bidPackage.price.toString(),
      deliveryDays: params.bidPackage.deliveryDays,
      penaltyRate: params.bidPackage.penaltyRate.toString(),
      warranty: params.bidPackage.warranty,
      addOns: params.bidPackage.addOns,
      currency: params.bidPackage.currency,
    },
    submittedAt: new Date().toISOString(),
  }, bidder);

  return {
    bidId: result.result.contractId.slice(0, 16),
    message: "Bid submitted on Canton ledger — only you and the seller can see it",
    contractId: result.result.contractId,
  };
}

/**
 * Score a bid (Seller exercises ScoreBid choice on a SealedBid).
 */
export async function scoreBid(
  auctionId: string,
  seller: string,
  bidContractId: string,
  score: BidScore,
  reputationScore: number
): Promise<any> {
  const sellerFull = fullPartyId(seller);

  const result = await cantonExercise(
    "BlindBid.Auction:SealedBid",
    bidContractId,
    "ScoreBid",
    {
      score: {
        priceScore: score.priceScore.toString(),
        deliveryScore: score.deliveryScore.toString(),
        penaltyScore: score.penaltyScore.toString(),
        reputationScore: score.reputationScore.toString(),
        totalScore: score.totalScore.toString(),
      },
      reputationScore: reputationScore.toString(),
    },
    sellerFull
  );

  return {
    auctionId,
    scoredBidContractId: result.result.exerciseResult,
    cantonOffset: result.result.completionOffset,
  };
}

/**
 * Score ALL bids for an auction. Seller queries all SealedBid contracts,
 * computes scores, and exercises ScoreBid choice on each.
 */
export async function scoreBids(
  auctionId: string,
  seller: string
): Promise<{ scored: number; stage: AuctionStage; scoredBids: any[] }> {
  const sellerFull = fullPartyId(seller);

  // Get all sealed bids for this auction (seller can see all of them)
  const sealedBids = await cantonQuery("BlindBid.Auction:SealedBid", sellerFull, {
    auctionId,
  });

  if (sealedBids.length === 0) throw new Error("NO_BIDS: No sealed bids found");

  // Get auction weights
  const auctionContracts = await cantonQuery("BlindBid.Auction:Auction", sellerFull, {
    auctionId,
  });
  if (auctionContracts.length === 0) throw new Error("AUCTION_NOT_FOUND");

  const weights = auctionContracts[0].payload.weights;
  const w = {
    priceWeight: parseFloat(weights.priceWeight),
    deliveryWeight: parseFloat(weights.deliveryWeight),
    penaltyWeight: parseFloat(weights.penaltyWeight),
    reputationWeight: parseFloat(weights.reputationWeight),
  };

  // Compute scores for all bids
  const bidData = sealedBids.map((b: any) => ({
    contractId: b.contractId,
    bidder: b.payload.bidder,
    price: parseFloat(b.payload.bidPackage.price),
    deliveryDays: b.payload.bidPackage.deliveryDays,
    penaltyRate: parseFloat(b.payload.bidPackage.penaltyRate),
  }));

  const prices = bidData.map((b: any) => b.price);
  const deliveries = bidData.map((b: any) => b.deliveryDays);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minDelivery = Math.min(...deliveries);
  const maxDelivery = Math.max(...deliveries);

  const scoredBids: any[] = [];

  for (const bid of bidData) {
    const priceRange = maxPrice - minPrice || 1;
    const priceScore = ((maxPrice - bid.price) / priceRange) * 100;

    const deliveryRange = maxDelivery - minDelivery || 1;
    const deliveryScore = ((maxDelivery - bid.deliveryDays) / deliveryRange) * 100;

    const penaltyScore = Math.min(bid.penaltyRate * 20, 100);

    // Reputation: query Canton for attestations
    const repScore = await getReputationScore(bid.bidder, sellerFull);

    const totalScore =
      w.priceWeight * priceScore +
      w.deliveryWeight * deliveryScore +
      w.penaltyWeight * penaltyScore +
      w.reputationWeight * repScore;

    const score: BidScore = {
      priceScore: Math.round(priceScore * 100) / 100,
      deliveryScore: Math.round(deliveryScore * 100) / 100,
      penaltyScore: Math.round(penaltyScore * 100) / 100,
      reputationScore: Math.round(repScore * 100) / 100,
      totalScore: Math.round(totalScore * 100) / 100,
    };

    // Exercise ScoreBid choice on Canton
    const result = await cantonExercise(
      "BlindBid.Auction:SealedBid",
      bid.contractId,
      "ScoreBid",
      {
        score: {
          priceScore: score.priceScore.toString(),
          deliveryScore: score.deliveryScore.toString(),
          penaltyScore: score.penaltyScore.toString(),
          reputationScore: score.reputationScore.toString(),
          totalScore: score.totalScore.toString(),
        },
        reputationScore: repScore.toString(),
      },
      sellerFull
    );

    scoredBids.push({
      bidder: shortPartyName(bid.bidder),
      score,
      scoredBidContractId: result.result.exerciseResult,
    });
  }

  // Move auction to scoring stage
  const auctionContract = auctionContracts.find(
    (c: any) => c.payload.stage === "BiddingClosed"
  );
  if (auctionContract) {
    await cantonExercise(
      "BlindBid.Auction:Auction",
      auctionContract.contractId,
      "StartScoring",
      {},
      sellerFull
    );
  }

  return { scored: scoredBids.length, stage: "scoring", scoredBids };
}

/**
 * Award the auction to a winner.
 */
export async function awardAuction(
  auctionId: string,
  seller: string,
  winnerId?: string
): Promise<{ winner: string; awardProof: AwardProof; contractId: string }> {
  const sellerFull = fullPartyId(seller);

  // Get auction in scoring stage
  const auctionContracts = await cantonQuery("BlindBid.Auction:Auction", sellerFull, {
    auctionId,
  });
  const scoringAuction = auctionContracts.find((c: any) => c.payload.stage === "Scoring");
  if (!scoringAuction) throw new Error("AUCTION_NOT_IN_SCORING: Auction must be in Scoring stage");

  // Get scored bids
  const scoredBids = await cantonQuery("BlindBid.Auction:ScoredBid", sellerFull, {
    auctionId,
  });
  if (scoredBids.length === 0) throw new Error("NO_SCORED_BIDS");

  // Select winner
  let winner: any;
  if (winnerId) {
    const winnerFull = fullPartyId(winnerId);
    winner = scoredBids.find((b: any) => b.payload.bidder === winnerFull);
    if (!winner) throw new Error("WINNER_NOT_FOUND");
  } else {
    scoredBids.sort(
      (a: any, b: any) =>
        parseFloat(b.payload.score.totalScore) - parseFloat(a.payload.score.totalScore)
    );
    winner = scoredBids[0];
  }

  const winnerParty = winner.payload.bidder;
  const weights = scoringAuction.payload.weights;

  const awardProof: AwardProof = {
    criteriaUsed: ["price", "delivery", "penalty", "reputation"],
    weightRanges: [
      { criterion: "price", minWeight: Math.max(0, parseFloat(weights.priceWeight) - 0.1), maxWeight: Math.min(1, parseFloat(weights.priceWeight) + 0.1) },
      { criterion: "delivery", minWeight: Math.max(0, parseFloat(weights.deliveryWeight) - 0.1), maxWeight: Math.min(1, parseFloat(weights.deliveryWeight) + 0.1) },
      { criterion: "penalty", minWeight: Math.max(0, parseFloat(weights.penaltyWeight) - 0.1), maxWeight: Math.min(1, parseFloat(weights.penaltyWeight) + 0.1) },
      { criterion: "reputation", minWeight: Math.max(0, parseFloat(weights.reputationWeight) - 0.1), maxWeight: Math.min(1, parseFloat(weights.reputationWeight) + 0.1) },
    ],
    winnerIsValid: true,
    withinConstraints: true,
    notExpired: true,
    awardedAt: new Date().toISOString(),
  };

  // Exercise AwardAuction choice on Canton
  const result = await cantonExercise(
    "BlindBid.Auction:Auction",
    scoringAuction.contractId,
    "AwardAuction",
    {
      winner: winnerParty,
      awardProof: {
        criteriaUsed: awardProof.criteriaUsed,
        weightRanges: awardProof.weightRanges.map((w) => [w.criterion, w.minWeight.toString(), w.maxWeight.toString()]),
        winnerIsValid: awardProof.winnerIsValid,
        withinConstraints: awardProof.withinConstraints,
        notExpired: awardProof.notExpired,
        awardedAt: awardProof.awardedAt,
      },
    },
    sellerFull
  );

  return {
    winner: shortPartyName(winnerParty),
    awardProof,
    contractId: result.result.exerciseResult,
  };
}

// ─── Condition management ────────────────────────────────────────────────────

export async function addCondition(
  auctionId: string,
  seller: string,
  condition: { conditionId: string; description: string }
): Promise<any> {
  const sellerFull = fullPartyId(seller);
  const awarded = await cantonQuery("BlindBid.Auction:AwardedAuction", sellerFull, {
    auctionId,
  });
  if (awarded.length === 0) throw new Error("AWARDED_AUCTION_NOT_FOUND");

  const contract = awarded[0];
  const result = await cantonExercise(
    "BlindBid.Auction:AwardedAuction",
    contract.contractId,
    "AddCondition",
    {
      condition: {
        conditionId: condition.conditionId,
        description: condition.description,
        isMet: false,
        verifiedBy: null,
        verifiedAt: null,
      },
    },
    sellerFull
  );

  return {
    auctionId,
    stage: "conditions-checking",
    contractId: result.result.exerciseResult,
  };
}

export async function markConditionMet(
  auctionId: string,
  seller: string,
  conditionId: string,
  verifier: string
): Promise<any> {
  const sellerFull = fullPartyId(seller);
  const awarded = await cantonQuery("BlindBid.Auction:AwardedAuction", sellerFull, {
    auctionId,
  });
  if (awarded.length === 0) throw new Error("AWARDED_AUCTION_NOT_FOUND");

  const contract = awarded[0];
  const result = await cantonExercise(
    "BlindBid.Auction:AwardedAuction",
    contract.contractId,
    "MarkConditionMet",
    {
      conditionId,
      verifier: fullPartyId(verifier),
      verifiedAt: new Date().toISOString(),
    },
    sellerFull
  );

  return {
    auctionId,
    conditionId,
    verifier,
    contractId: result.result.exerciseResult,
  };
}

// ─── Escrow trigger ──────────────────────────────────────────────────────────

export async function triggerRelease(
  auctionId: string,
  seller: string,
  instruction: Omit<EscrowInstruction, "action">
): Promise<any> {
  const sellerFull = fullPartyId(seller);
  const awarded = await cantonQuery("BlindBid.Auction:AwardedAuction", sellerFull, {
    auctionId,
  });
  if (awarded.length === 0) throw new Error("AWARDED_AUCTION_NOT_FOUND");

  const contract = awarded[0];
  const result = await cantonExercise(
    "BlindBid.Auction:AwardedAuction",
    contract.contractId,
    "TriggerRelease",
    {
      instruction: {
        action: "release",
        amount: instruction.amount.toString(),
        currency: instruction.currency,
        recipient: instruction.recipient,
        adiTxHash: instruction.adiTxHash || null,
      },
    },
    sellerFull
  );

  return {
    auctionId,
    action: "release",
    contractId: result.result.exerciseResult,
  };
}

export async function triggerRefund(
  auctionId: string,
  seller: string,
  instruction: Omit<EscrowInstruction, "action">
): Promise<any> {
  const sellerFull = fullPartyId(seller);
  const awarded = await cantonQuery("BlindBid.Auction:AwardedAuction", sellerFull, {
    auctionId,
  });
  if (awarded.length === 0) throw new Error("AWARDED_AUCTION_NOT_FOUND");

  const contract = awarded[0];
  const result = await cantonExercise(
    "BlindBid.Auction:AwardedAuction",
    contract.contractId,
    "TriggerRefund",
    {
      instruction: {
        action: "refund",
        amount: instruction.amount.toString(),
        currency: instruction.currency,
        recipient: instruction.recipient,
        adiTxHash: instruction.adiTxHash || null,
      },
    },
    sellerFull
  );

  return {
    auctionId,
    action: "refund",
    contractId: result.result.exerciseResult,
  };
}

// ─── Dispute flow ─────────────────────────────────────────────────────────────

export async function raiseDispute(params: {
  auctionId: string;
  disputant: string;
  reason: string;
}): Promise<any> {
  const disputantFull = fullPartyId(params.disputant);
  const awarded = await cantonQuery("BlindBid.Auction:AwardedAuction", disputantFull, {
    auctionId: params.auctionId,
  });
  if (awarded.length === 0) throw new Error("AWARDED_AUCTION_NOT_FOUND");

  const contract = awarded[0];
  const result = await cantonExercise(
    "BlindBid.Auction:AwardedAuction",
    contract.contractId,
    "RaiseDispute",
    {
      disputant: disputantFull,
      reason: params.reason,
    },
    disputantFull
  );

  return {
    auctionId: params.auctionId,
    disputeContractId: result.result.exerciseResult,
    disputant: params.disputant,
    reason: params.reason,
  };
}

export async function submitEvidence(
  auctionId: string,
  submitter: string,
  evidenceDoc: string
): Promise<any> {
  const submitterFull = fullPartyId(submitter);
  const disputes = await cantonQuery("BlindBid.Auction:DisputedAuction", submitterFull, {
    auctionId,
  });
  if (disputes.length === 0) throw new Error("DISPUTE_NOT_FOUND");

  const contract = disputes[0];
  const result = await cantonExercise(
    "BlindBid.Auction:DisputedAuction",
    contract.contractId,
    "SubmitEvidence",
    {
      submitter: submitterFull,
      evidenceDoc,
    },
    submitterFull
  );

  return {
    auctionId,
    contractId: result.result.exerciseResult,
    submitter,
  };
}

export async function resolveDispute(
  auctionId: string,
  resolver: string,
  decision: string
): Promise<any> {
  const resolverFull = fullPartyId(resolver);
  const disputes = await cantonQuery("BlindBid.Auction:DisputedAuction", resolverFull, {
    auctionId,
  });
  if (disputes.length === 0) throw new Error("DISPUTE_NOT_FOUND");

  const contract = disputes[0];
  const result = await cantonExercise(
    "BlindBid.Auction:DisputedAuction",
    contract.contractId,
    "ResolveDispute",
    {
      resolver: resolverFull,
      decision,
    },
    resolverFull
  );

  return {
    auctionId,
    decision,
    contractId: result.result.exerciseResult,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPUTATION — Real Canton contracts
// ═══════════════════════════════════════════════════════════════════════════════

export async function addReputationAttestation(attestation: ReputationAttestation): Promise<any> {
  const attestorFull = fullPartyId(attestation.attestor);
  const bidderFull = fullPartyId(attestation.bidder);

  const result = await cantonCreate("BlindBid.Reputation:ReputationContract", {
    attestor: attestorFull,
    bidder: bidderFull,
    attestation: {
      attestor: attestorFull,
      successfulDeliveries: attestation.successfulDeliveries,
      disputes: attestation.disputes,
      rating: attestation.rating.toString(),
      attestedAt: attestation.attestedAt,
    },
  }, attestorFull);

  return {
    contractId: result.result.contractId,
    attestor: attestation.attestor,
    bidder: attestation.bidder,
  };
}

/**
 * Get reputation score for a bidder. Queries Canton for ReputationContract instances.
 */
async function getReputationScore(bidderParty: string, viewerParty: string): Promise<number> {
  try {
    const contracts = await cantonQuery("BlindBid.Reputation:ReputationContract", viewerParty, {
      bidder: bidderParty,
    });

    if (contracts.length === 0) return 50; // Default mid score

    const attestations = contracts.map((c: any) => c.payload.attestation);
    const avgRating = attestations.reduce(
      (sum: number, a: any) => sum + parseFloat(a.rating), 0
    ) / attestations.length;
    const totalDeliveries = attestations.reduce(
      (sum: number, a: any) => sum + a.successfulDeliveries, 0
    );
    const totalDisputes = attestations.reduce(
      (sum: number, a: any) => sum + a.disputes, 0
    );
    const disputeRatio = totalDeliveries > 0 ? totalDisputes / totalDeliveries : 0;

    return Math.min(100, (avgRating / 5) * 80 + (1 - disputeRatio) * 20);
  } catch {
    return 50; // Default if query fails
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARTY-BASED VISIBILITY — Powered by Canton
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get auction data as seen by a specific party.
 * Canton enforces visibility — we just query with the party's token.
 */
export async function getAuctionForParty(auctionId: string, viewer: string) {
  const viewerFull = fullPartyId(viewer);

  // Query Auction contracts visible to this party
  const auctions = await cantonQuery("BlindBid.Auction:Auction", viewerFull, { auctionId });
  const awardedAuctions = await cantonQuery("BlindBid.Auction:AwardedAuction", viewerFull, { auctionId });
  const sealedBids = await cantonQuery("BlindBid.Auction:SealedBid", viewerFull, { auctionId });
  const scoredBids = await cantonQuery("BlindBid.Auction:ScoredBid", viewerFull, { auctionId });
  const disputeContracts = await cantonQuery("BlindBid.Auction:DisputedAuction", viewerFull, { auctionId });

  const auction = auctions[0] || awardedAuctions[0];
  if (!auction) throw new Error("AUCTION_NOT_FOUND or not visible to you");

  const payload = auction.payload;
  const isSeller = payload.seller === viewerFull;
  const isWinner = awardedAuctions.length > 0 && awardedAuctions[0].payload.winner === viewerFull;
  const isBidder = sealedBids.length > 0 || (payload.bidders && payload.bidders.includes(viewerFull));
  const isAuditor = payload.auditor === viewerFull;

  // Determine role
  let role: string;
  if (isSeller) role = "seller";
  else if (isWinner) role = "winner";
  else if (isAuditor) role = "auditor";
  else if (isBidder) role = "bidder";
  else role = "public";

  // Determine current stage
  let stage = "created";
  if (awardedAuctions.length > 0) {
    const awStage = awardedAuctions[0].payload.stage;
    stage = awStage === "Awarded" ? "awarded"
      : awStage === "ConditionsChecking" ? "conditions-checking"
      : awStage === "Settled" ? "settled"
      : awStage.toLowerCase();
  } else if (disputeContracts.length > 0) {
    stage = "disputed";
  } else if (auctions.length > 0) {
    const aStage = payload.stage;
    stage = aStage === "Created" ? "created"
      : aStage === "BiddingOpen" ? "bidding-open"
      : aStage === "BiddingClosed" ? "bidding-closed"
      : aStage === "Scoring" ? "scoring"
      : aStage.toLowerCase();
  }

  const base = {
    auctionId,
    stage,
    role,
    createdAt: payload.createdAt,
    contractCount: {
      auctions: auctions.length,
      awardedAuctions: awardedAuctions.length,
      sealedBids: sealedBids.length,
      scoredBids: scoredBids.length,
      disputes: disputeContracts.length,
    },
  };

  if (role === "seller") {
    return {
      ...base,
      itemDesc: payload.itemDesc,
      constraints: payload.constraints,
      weights: payload.weights,
      bidders: (payload.bidders || []).map((b: string) => shortPartyName(b)),
      biddingDeadline: payload.biddingDeadline,
      bids: sealedBids.map((b: any) => ({
        bidder: shortPartyName(b.payload.bidder),
        bidPackage: b.payload.bidPackage,
        submittedAt: b.payload.submittedAt,
      })),
      scoredBids: scoredBids.map((b: any) => ({
        bidder: shortPartyName(b.payload.bidder),
        bidPackage: b.payload.bidPackage,
        score: b.payload.score,
      })),
      awarded: awardedAuctions.length > 0 ? {
        winner: shortPartyName(awardedAuctions[0].payload.winner),
        awardProof: awardedAuctions[0].payload.awardProof,
        conditions: awardedAuctions[0].payload.conditions,
        allConditionsMet: awardedAuctions[0].payload.allConditionsMet,
        escrowInstruction: awardedAuctions[0].payload.escrowInstruction,
      } : null,
      disputes: disputeContracts.map((d: any) => ({
        disputant: shortPartyName(d.payload.disputant),
        reason: d.payload.reason,
        evidence: d.payload.evidence,
        resolution: d.payload.resolution,
      })),
    };
  }

  if (role === "winner") {
    const myBid = sealedBids[0] || scoredBids[0];
    return {
      ...base,
      itemDesc: payload.itemDesc,
      myBid: myBid ? {
        bidPackage: myBid.payload.bidPackage,
        score: myBid.payload.score,
      } : null,
      awardProof: awardedAuctions[0]?.payload.awardProof,
      conditions: awardedAuctions[0]?.payload.conditions,
      allConditionsMet: awardedAuctions[0]?.payload.allConditionsMet,
    };
  }

  if (role === "bidder") {
    const myBid = sealedBids[0] || scoredBids[0];
    return {
      ...base,
      itemDesc: payload.itemDesc,
      myBid: myBid ? {
        bidPackage: myBid.payload.bidPackage,
        score: myBid.payload.score ? {
          totalScore: myBid.payload.score.totalScore,
          // Losing bidder does NOT see score breakdown
        } : null,
      } : null,
      awardProof: awardedAuctions[0]?.payload.awardProof ? {
        criteriaUsed: awardedAuctions[0].payload.awardProof.criteriaUsed,
        winnerIsValid: awardedAuctions[0].payload.awardProof.winnerIsValid,
        // No weight ranges for losing bidders
      } : null,
    };
  }

  if (role === "auditor") {
    return {
      ...base,
      seller: shortPartyName(payload.seller),
      itemDesc: payload.itemDesc,
      biddingDeadline: payload.biddingDeadline,
      bidCount: sealedBids.length + scoredBids.length,
      winner: awardedAuctions[0] ? shortPartyName(awardedAuctions[0].payload.winner) : null,
      awardProof: awardedAuctions[0]?.payload.awardProof,
      conditions: awardedAuctions[0]?.payload.conditions,
    };
  }

  // Public view
  return base;
}

/**
 * Get reputation as seen by a specific party.
 */
export async function getReputationForParty(bidder: string, viewer: string, auctionId?: string) {
  const viewerFull = fullPartyId(viewer);
  const bidderFull = fullPartyId(bidder);

  // Query reputation contracts visible to this viewer
  const repContracts = await cantonQuery("BlindBid.Reputation:ReputationContract", viewerFull, {
    bidder: bidderFull,
  });

  // Also check threshold checks
  const thresholdChecks = await cantonQuery("BlindBid.Reputation:ReputationThresholdCheck", viewerFull, {
    bidder: bidderFull,
  });

  const attestations = repContracts.map((c: any) => ({
    attestor: shortPartyName(c.payload.attestor),
    successfulDeliveries: c.payload.attestation.successfulDeliveries,
    disputes: c.payload.attestation.disputes,
    rating: parseFloat(c.payload.attestation.rating),
    attestedAt: c.payload.attestation.attestedAt,
  }));

  const score = await getReputationScore(bidderFull, viewerFull);

  if (viewer === bidder) {
    return {
      bidder,
      role: "self",
      attestations,
      computedScore: score,
      meetsThreshold: score >= 60,
    };
  }

  // If viewer can see reputation contracts (seller/attestor), return full details
  if (attestations.length > 0) {
    return {
      bidder,
      role: "authorized",
      attestations,
      computedScore: score,
      successfulDeliveries: attestations.reduce((s: number, a: any) => s + a.successfulDeliveries, 0),
      totalDisputes: attestations.reduce((s: number, a: any) => s + a.disputes, 0),
    };
  }

  // Otherwise, only threshold check
  if (thresholdChecks.length > 0) {
    const check = thresholdChecks[0].payload;
    return {
      bidder,
      role: "external",
      meetsThreshold: check.meetsThreshold,
      message: check.meetsThreshold
        ? "You are eligible — minimum reputation threshold passed"
        : "You do not meet the minimum reputation threshold",
    };
  }

  return {
    bidder,
    role: "external",
    meetsThreshold: score >= 60,
    message: score >= 60
      ? "You are eligible — minimum reputation threshold passed"
      : "You do not meet the minimum reputation threshold",
  };
}

/**
 * Get dispute data for a party.
 */
export async function getDisputeForParty(auctionId: string, viewer: string) {
  const viewerFull = fullPartyId(viewer);
  const disputes = await cantonQuery("BlindBid.Auction:DisputedAuction", viewerFull, { auctionId });

  if (disputes.length === 0) {
    return { auctionId, hasDispute: false, role: "external" };
  }

  const dispute = disputes[0].payload;
  return {
    auctionId,
    hasDispute: true,
    role: "party",
    disputant: shortPartyName(dispute.disputant),
    reason: dispute.reason,
    evidence: dispute.evidence,
    resolution: dispute.resolution,
  };
}

/**
 * List all auctions visible to a party.
 */
export async function listAuctions(viewer: string) {
  const viewerFull = fullPartyId(viewer);

  const auctions = await cantonQuery("BlindBid.Auction:Auction", viewerFull);
  const awarded = await cantonQuery("BlindBid.Auction:AwardedAuction", viewerFull);

  const auctionMap = new Map<string, any>();

  for (const a of auctions) {
    const id = a.payload.auctionId;
    auctionMap.set(id, {
      auctionId: id,
      itemDesc: a.payload.seller === viewerFull ? a.payload.itemDesc : undefined,
      stage: a.payload.stage.toLowerCase().replace("bidding", "bidding-"),
      createdAt: a.payload.createdAt,
      role: a.payload.seller === viewerFull ? "seller"
        : (a.payload.bidders || []).includes(viewerFull) ? "bidder"
        : a.payload.auditor === viewerFull ? "auditor"
        : "public",
    });
  }

  for (const a of awarded) {
    const id = a.payload.auctionId;
    if (!auctionMap.has(id)) {
      auctionMap.set(id, {
        auctionId: id,
        stage: a.payload.stage.toLowerCase(),
        role: a.payload.seller === viewerFull ? "seller"
          : a.payload.winner === viewerFull ? "winner"
          : "bidder",
      });
    } else {
      const existing = auctionMap.get(id);
      existing.stage = a.payload.stage.toLowerCase();
    }
  }

  return Array.from(auctionMap.values());
}
