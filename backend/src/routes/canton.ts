/**
 * Canton Routes — REAL Canton Ledger API integration.
 *
 * All routes call the cantonService which communicates with Canton sandbox
 * via the Daml JSON API. Canton enforces privacy — each party only sees
 * their authorized contracts.
 */

import { Router } from "express";
import {
  createAuction,
  openBidding,
  closeBidding,
  submitBid,
  scoreBids,
  awardAuction,
  addCondition,
  markConditionMet,
  triggerRelease,
  triggerRefund,
  raiseDispute,
  submitEvidence,
  resolveDispute,
  addReputationAttestation,
  getAuctionForParty,
  getReputationForParty,
  getDisputeForParty,
  listAuctions,
} from "../services/cantonService";
import type { BidPackage, ScoringWeights } from "../services/cantonService";

export const cantonRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// AUCTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

cantonRouter.post("/auction/create", async (req, res) => {
  const {
    auctionId,
    seller,
    itemDesc,
    constraints,
    weights,
    bidders,
    auditor,
    biddingDeadlineMinutes,
  } = req.body as {
    auctionId: string;
    seller: string;
    itemDesc: string;
    constraints: string;
    weights: ScoringWeights;
    bidders: string[];
    auditor?: string;
    biddingDeadlineMinutes?: number;
  };

  try {
    const result = await createAuction({
      auctionId,
      seller,
      itemDesc,
      constraints,
      weights,
      bidders,
      auditor,
      biddingDeadlineMinutes,
    });
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.post("/auction/:auctionId/open-bidding", async (req, res) => {
  const { auctionId } = req.params;
  const { caller } = req.body as { caller: string };
  try {
    const result = await openBidding(auctionId, caller);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.post("/auction/:auctionId/close-bidding", async (req, res) => {
  const { auctionId } = req.params;
  const { caller } = req.body as { caller: string };
  try {
    const result = await closeBidding(auctionId, caller);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.post("/auction/:auctionId/score-bids", async (req, res) => {
  const { auctionId } = req.params;
  const { caller } = req.body as { caller: string };
  try {
    const result = await scoreBids(auctionId, caller);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.post("/auction/:auctionId/award", async (req, res) => {
  const { auctionId } = req.params;
  const { caller, winner } = req.body as { caller: string; winner?: string };
  try {
    const result = await awardAuction(auctionId, caller, winner);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Conditions ──────────────────────────────────────────────────────────────

cantonRouter.post("/auction/:auctionId/add-condition", async (req, res) => {
  const { auctionId } = req.params;
  const { caller, conditionId, description } = req.body as {
    caller: string;
    conditionId: string;
    description: string;
  };
  try {
    const result = await addCondition(auctionId, caller, { conditionId, description });
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.post("/auction/:auctionId/mark-condition-met", async (req, res) => {
  const { auctionId } = req.params;
  const { caller, conditionId, verifier } = req.body as {
    caller: string;
    conditionId: string;
    verifier: string;
  };
  try {
    const result = await markConditionMet(auctionId, caller, conditionId, verifier);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Escrow triggers ─────────────────────────────────────────────────────────

cantonRouter.post("/auction/:auctionId/trigger-release", async (req, res) => {
  const { auctionId } = req.params;
  const { caller, amount, currency, recipient, adiTxHash } = req.body as {
    caller: string;
    amount: number;
    currency: string;
    recipient: string;
    adiTxHash?: string;
  };
  try {
    const result = await triggerRelease(auctionId, caller, {
      amount,
      currency,
      recipient,
      adiTxHash,
    });
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.post("/auction/:auctionId/trigger-refund", async (req, res) => {
  const { auctionId } = req.params;
  const { caller, amount, currency, recipient, adiTxHash } = req.body as {
    caller: string;
    amount: number;
    currency: string;
    recipient: string;
    adiTxHash?: string;
  };
  try {
    const result = await triggerRefund(auctionId, caller, {
      amount,
      currency,
      recipient,
      adiTxHash,
    });
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BIDDING
// ═══════════════════════════════════════════════════════════════════════════════

cantonRouter.post("/bid/submit", async (req, res) => {
  const { auctionId, bidder, bidPackage } = req.body as {
    auctionId: string;
    bidder: string;
    bidPackage: BidPackage;
  };
  try {
    const result = await submitBid({ auctionId, bidder, bidPackage });
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISPUTES
// ═══════════════════════════════════════════════════════════════════════════════

cantonRouter.post("/auction/:auctionId/dispute", async (req, res) => {
  const { auctionId } = req.params;
  const { disputant, reason } = req.body as { disputant: string; reason: string };
  try {
    const result = await raiseDispute({ auctionId, disputant, reason });
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.post("/auction/:auctionId/submit-evidence", async (req, res) => {
  const { auctionId } = req.params;
  const { submitter, evidenceDoc } = req.body as { submitter: string; evidenceDoc: string };
  try {
    const result = await submitEvidence(auctionId, submitter, evidenceDoc);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.post("/auction/:auctionId/resolve-dispute", async (req, res) => {
  const { auctionId } = req.params;
  const { resolver, decision } = req.body as { resolver: string; decision: string };
  try {
    const result = await resolveDispute(auctionId, resolver, decision);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPUTATION
// ═══════════════════════════════════════════════════════════════════════════════

cantonRouter.post("/reputation/attest", async (req, res) => {
  const attestation = req.body as {
    attestor: string;
    bidder: string;
    successfulDeliveries: number;
    disputes: number;
    rating: number;
    attestedAt: string;
  };
  try {
    const result = await addReputationAttestation(attestation);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.get("/reputation/:bidder/:viewer", async (req, res) => {
  const { bidder, viewer } = req.params;
  const { auctionId } = req.query as { auctionId?: string };
  try {
    const result = await getReputationForParty(bidder, viewer, auctionId);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VISIBILITY-CONTROLLED VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

cantonRouter.get("/auction/:auctionId/:party/details", async (req, res) => {
  const { auctionId, party } = req.params;
  try {
    const details = await getAuctionForParty(auctionId, party);
    res.json({ ok: true, data: details });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.get("/auction/:auctionId/:party/dispute", async (req, res) => {
  const { auctionId, party } = req.params;
  try {
    const details = await getDisputeForParty(auctionId, party);
    res.json({ ok: true, data: details });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

cantonRouter.get("/auctions/:party", async (req, res) => {
  const { party } = req.params;
  try {
    const result = await listAuctions(party);
    res.json({ ok: true, data: { auctions: result, count: result.length } });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
