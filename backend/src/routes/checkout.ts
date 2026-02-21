import { Router } from "express";
import {
  createCheckoutSession,
  generateSessionQuote,
  markPaying,
  confirmPayment,
  expireSession,
  getSession,
  listSessionsByAuction,
  listSessionsByMerchant,
  getCallbackLog,
} from "../services/checkoutService";
import type { FiatCurrency, SettlementToken } from "../types";

export const checkoutRouter = Router();

// ─── POST /api/checkout/create ───────────────────────────────────────────────
// Create a new checkout session
checkoutRouter.post("/create", async (req, res) => {
  const { auctionId, merchantId, fiatAmount, fiatCurrency, settlementToken, buyerAddress } =
    req.body as {
      auctionId?: string;
      merchantId?: string;
      fiatAmount?: number;
      fiatCurrency?: FiatCurrency;
      settlementToken?: SettlementToken;
      buyerAddress?: `0x${string}`;
    };

  if (!auctionId || !merchantId || !fiatAmount) {
    res.status(400).json({
      ok: false,
      error: "auctionId, merchantId, and fiatAmount are required",
    });
    return;
  }

  try {
    const session = await createCheckoutSession({
      auctionId,
      merchantId,
      fiatAmount,
      fiatCurrency,
      settlementToken,
      buyerAddress,
    });
    res.json({ ok: true, data: session });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/checkout/:sessionId/quote ─────────────────────────────────────
// Generate a signed fiat→token quote for the session
checkoutRouter.post("/:sessionId/quote", async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await generateSessionQuote(sessionId);
    res.json({ ok: true, data: session });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/checkout/:sessionId/pay ───────────────────────────────────────
// Mark session as "paying" (buyer submitted tx)
checkoutRouter.post("/:sessionId/pay", (req, res) => {
  const { sessionId } = req.params;
  const { txHash, buyerAddress } = req.body as {
    txHash?: string;
    buyerAddress?: `0x${string}`;
  };

  if (!txHash) {
    res.status(400).json({ ok: false, error: "txHash is required" });
    return;
  }

  try {
    const session = markPaying(sessionId, txHash, buyerAddress);
    res.json({ ok: true, data: session });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/checkout/:sessionId/confirm ───────────────────────────────────
// Confirm payment is on-chain
checkoutRouter.post("/:sessionId/confirm", (req, res) => {
  const { sessionId } = req.params;
  const { escrowTxHash } = req.body as { escrowTxHash?: string };

  try {
    const session = confirmPayment(sessionId, escrowTxHash);
    res.json({ ok: true, data: session });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/checkout/:sessionId/expire ────────────────────────────────────
// Manually expire a session
checkoutRouter.post("/:sessionId/expire", (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = expireSession(sessionId);
    res.json({ ok: true, data: session });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/checkout/:sessionId ────────────────────────────────────────────
// Get checkout session status
checkoutRouter.get("/:sessionId", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ ok: false, error: "Session not found" });
    return;
  }
  res.json({ ok: true, data: session });
});

// ─── GET /api/checkout/by-auction/:auctionId ─────────────────────────────────
checkoutRouter.get("/by-auction/:auctionId", (req, res) => {
  const sessions = listSessionsByAuction(req.params.auctionId);
  res.json({ ok: true, data: { sessions, count: sessions.length } });
});

// ─── GET /api/checkout/by-merchant/:merchantId ───────────────────────────────
checkoutRouter.get("/by-merchant/:merchantId", (req, res) => {
  const sessions = listSessionsByMerchant(req.params.merchantId);
  res.json({ ok: true, data: { sessions, count: sessions.length } });
});

// ─── GET /api/checkout/callbacks/log ─────────────────────────────────────────
// View all callback logs (for demo)
checkoutRouter.get("/callbacks/log", (_req, res) => {
  const log = getCallbackLog();
  res.json({ ok: true, data: { callbacks: log, count: log.length } });
});
