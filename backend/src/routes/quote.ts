import { Router } from "express";
import { generateQuote, verifyQuote } from "../services/quoteService";
import type { FiatCurrency, SettlementToken } from "../types";

export const quoteRouter = Router();

// ─── POST /api/quote/generate ─────────────────────────────────────────────────
quoteRouter.post("/generate", async (req, res) => {
  const {
    auctionId,
    fiatAmount,
    fiatCurrency = "USD",
    settlementToken = "ADI_NATIVE",
    validitySeconds = 600,
  } = req.body as {
    auctionId?: string;
    fiatAmount?: number;
    fiatCurrency?: FiatCurrency;
    settlementToken?: SettlementToken;
    validitySeconds?: number;
  };

  if (!auctionId || !fiatAmount) {
    res.status(400).json({ ok: false, error: "auctionId and fiatAmount are required" });
    return;
  }

  if (!["USD", "AED"].includes(fiatCurrency)) {
    res.status(400).json({ ok: false, error: "fiatCurrency must be USD or AED" });
    return;
  }

  try {
    const quote = await generateQuote(
      auctionId,
      fiatAmount,
      fiatCurrency,
      settlementToken,
      validitySeconds
    );

    res.json({
      ok: true,
      data: {
        ...quote,
        tokenAmount: quote.tokenAmount.toString(), // BigInt → string for JSON
        validUntilIso: new Date(quote.validUntil * 1000).toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/quote/verify ───────────────────────────────────────────────────
quoteRouter.post("/verify", (req, res) => {
  const { quote } = req.body as { quote?: any };

  if (!quote) {
    res.status(400).json({ ok: false, error: "quote object is required" });
    return;
  }

  try {
    // Rehydrate tokenAmount as BigInt
    const hydrated = { ...quote, tokenAmount: BigInt(quote.tokenAmount) };
    const valid = verifyQuote(hydrated);
    res.json({ ok: true, data: { valid } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
