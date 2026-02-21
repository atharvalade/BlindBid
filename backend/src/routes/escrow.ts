import { Router } from "express";
import { getEscrowInfo, getEscrow } from "../services/contractService";
import { ethers } from "ethers";

export const escrowRouter = Router();

// ─── GET /api/escrow/:auctionId ────────────────────────────────────────────
// Get escrow status for an auction
escrowRouter.get("/:auctionId", async (req, res) => {
  try {
    const info = await getEscrowInfo(req.params.auctionId);
    res.json({ ok: true, data: info });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/escrow/deposit-native ──────────────────────────────────────
// Deposit native ADI into escrow
escrowRouter.post("/deposit-native", async (req, res) => {
  const { auctionId, sellerAddress, amount } = req.body as {
    auctionId?: string;
    sellerAddress?: string;
    amount?: string;
  };

  if (!auctionId || !sellerAddress || !amount) {
    res
      .status(400)
      .json({ ok: false, error: "auctionId, sellerAddress, and amount are required" });
    return;
  }

  try {
    const escrow = getEscrow();
    const tx = await escrow.depositNative(auctionId, sellerAddress, {
      value: ethers.parseEther(amount),
    });
    const receipt = await tx.wait();

    res.json({
      ok: true,
      data: {
        txHash: receipt.hash,
        auctionId,
        sellerAddress,
        amount,
        gasUsed: receipt.gasUsed.toString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/escrow/release ─────────────────────────────────────────────
// Release escrowed funds to seller
escrowRouter.post("/release", async (req, res) => {
  const { auctionId } = req.body as { auctionId?: string };
  if (!auctionId) {
    res.status(400).json({ ok: false, error: "auctionId is required" });
    return;
  }

  try {
    const escrow = getEscrow();
    const tx = await escrow.release(auctionId);
    const receipt = await tx.wait();

    res.json({
      ok: true,
      data: {
        txHash: receipt.hash,
        auctionId,
        action: "released",
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/escrow/refund ──────────────────────────────────────────────
escrowRouter.post("/refund", async (req, res) => {
  const { auctionId } = req.body as { auctionId?: string };
  if (!auctionId) {
    res.status(400).json({ ok: false, error: "auctionId is required" });
    return;
  }

  try {
    const escrow = getEscrow();
    const tx = await escrow.refund(auctionId);
    const receipt = await tx.wait();

    res.json({
      ok: true,
      data: {
        txHash: receipt.hash,
        auctionId,
        action: "refunded",
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/escrow/dispute ─────────────────────────────────────────────
escrowRouter.post("/dispute", async (req, res) => {
  const { auctionId } = req.body as { auctionId?: string };
  if (!auctionId) {
    res.status(400).json({ ok: false, error: "auctionId is required" });
    return;
  }

  try {
    const escrow = getEscrow();
    const tx = await escrow.dispute(auctionId);
    const receipt = await tx.wait();

    res.json({
      ok: true,
      data: {
        txHash: receipt.hash,
        auctionId,
        action: "disputed",
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/escrow/resolve-dispute ─────────────────────────────────────
// Resolve a disputed escrow (arbitrator or owner decides)
escrowRouter.post("/resolve-dispute", async (req, res) => {
  const { auctionId, releaseToSeller } = req.body as {
    auctionId?: string;
    releaseToSeller?: boolean;
  };
  if (!auctionId || typeof releaseToSeller !== "boolean") {
    res
      .status(400)
      .json({ ok: false, error: "auctionId and releaseToSeller (boolean) are required" });
    return;
  }

  try {
    const escrow = getEscrow();
    const tx = await escrow.resolveDispute(auctionId, releaseToSeller);
    const receipt = await tx.wait();

    res.json({
      ok: true,
      data: {
        txHash: receipt.hash,
        auctionId,
        action: releaseToSeller ? "resolved-to-seller" : "resolved-to-buyer",
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
