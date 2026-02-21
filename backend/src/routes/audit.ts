import { Router } from "express";
import {
  publishCommitment,
  getAuditLog,
  verifyCommitment,
  getOrCreateTopic,
} from "../services/hederaService";
import type { AuctionStage } from "../types";

export const auditRouter = Router();

const VALID_STAGES: AuctionStage[] = [
  "created",
  "bidding-open",
  "bidding-closed",
  "awarded",
  "settled",
  "disputed",
];

// ─── POST /api/audit/publish ──────────────────────────────────────────────────
auditRouter.post("/publish", async (req, res) => {
  const { auctionId, stage, cantonTxId, adiTxHash } = req.body as {
    auctionId?: string;
    stage?: AuctionStage;
    cantonTxId?: string;
    adiTxHash?: string;
  };

  if (!auctionId || !stage) {
    res.status(400).json({ ok: false, error: "auctionId and stage are required" });
    return;
  }

  if (!VALID_STAGES.includes(stage)) {
    res.status(400).json({
      ok: false,
      error: `stage must be one of: ${VALID_STAGES.join(", ")}`,
    });
    return;
  }

  try {
    const entry = await publishCommitment(auctionId, stage, cantonTxId, adiTxHash);
    res.json({ ok: true, data: entry });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/audit/:auctionId ─────────────────────────────────────────────────
auditRouter.get("/:auctionId", (req, res) => {
  const { auctionId } = req.params;
  const log = getAuditLog(auctionId);

  res.json({
    ok: true,
    data: {
      auctionId,
      entries: log,
      count: log.length,
    },
  });
});

// ─── POST /api/audit/verify ───────────────────────────────────────────────────
auditRouter.post("/verify", (req, res) => {
  const { entry } = req.body;

  if (!entry) {
    res.status(400).json({ ok: false, error: "entry object is required" });
    return;
  }

  const valid = verifyCommitment(entry);
  res.json({
    ok: true,
    data: {
      valid,
      message: valid
        ? "Commitment hash matches — entry is authentic"
        : "TAMPERED: Commitment hash does not match the provided fields",
    },
  });
});

// ─── GET /api/audit/:auctionId/topic ──────────────────────────────────────────
auditRouter.get("/:auctionId/topic", async (req, res) => {
  const { auctionId } = req.params;
  try {
    const topicId = await getOrCreateTopic(auctionId);
    res.json({
      ok: true,
      data: {
        auctionId,
        hederaTopicId: topicId,
        mirrorNodeUrl: `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
