import { Router } from "express";
import {
  registerMerchant,
  getMerchant,
  listMerchants,
  updateMerchant,
} from "../services/merchantService";
import type { FiatCurrency, SettlementToken } from "../types";

export const merchantRouter = Router();

// ─── POST /api/merchant/register ─────────────────────────────────────────────
// Register a new merchant
merchantRouter.post("/register", (req, res) => {
  const { name, walletAddress, preferredCurrency, preferredSettlementToken, callbackUrl, logoUrl } =
    req.body as {
      name?: string;
      walletAddress?: `0x${string}`;
      preferredCurrency?: FiatCurrency;
      preferredSettlementToken?: SettlementToken;
      callbackUrl?: string;
      logoUrl?: string;
    };

  if (!name || !walletAddress) {
    res.status(400).json({ ok: false, error: "name and walletAddress are required" });
    return;
  }

  try {
    const merchant = registerMerchant({
      name,
      walletAddress,
      preferredCurrency,
      preferredSettlementToken,
      callbackUrl,
      logoUrl,
    });
    res.json({ ok: true, data: merchant });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/merchant/list ──────────────────────────────────────────────────
merchantRouter.get("/list", (_req, res) => {
  const merchants = listMerchants();
  res.json({ ok: true, data: { merchants, count: merchants.length } });
});

// ─── GET /api/merchant/:merchantId ───────────────────────────────────────────
merchantRouter.get("/:merchantId", (req, res) => {
  const merchant = getMerchant(req.params.merchantId);
  if (!merchant) {
    res.status(404).json({ ok: false, error: "Merchant not found" });
    return;
  }
  res.json({ ok: true, data: merchant });
});

// ─── PUT /api/merchant/:merchantId ───────────────────────────────────────────
merchantRouter.put("/:merchantId", (req, res) => {
  const { merchantId } = req.params;
  const updates = req.body as Partial<{
    name: string;
    callbackUrl: string;
    preferredCurrency: FiatCurrency;
    preferredSettlementToken: SettlementToken;
    logoUrl: string;
  }>;

  const updated = updateMerchant(merchantId, updates);
  if (!updated) {
    res.status(404).json({ ok: false, error: "Merchant not found" });
    return;
  }
  res.json({ ok: true, data: updated });
});

// ─── POST /api/merchant/callback-echo ────────────────────────────────────────
// Echo endpoint for payment callbacks during demo
merchantRouter.post("/callback-echo", (req, res) => {
  console.log("[MERCHANT CALLBACK]", JSON.stringify(req.body));
  res.json({ ok: true, data: { received: true, body: req.body } });
});
