/**
 * MerchantService — Merchant onboarding and configuration.
 *
 * Handles:
 *   - Merchant registration (name, wallet, preferred currency/token)
 *   - Merchant lookup
 *   - Callback URL management for payment notifications
 *
 * For the hackathon: in-memory store. In production, this would persist to a database.
 */

import { randomUUID } from "crypto";
import type { Merchant, FiatCurrency, SettlementToken } from "../types";

// ─── In-memory store ──────────────────────────────────────────────────────────
const merchants = new Map<string, Merchant>();

// ─── Pre-register the demo seller ─────────────────────────────────────────────
const DEMO_SELLER: Merchant = {
  merchantId: "MERCHANT-SELLER-001",
  name: "BlindBid Demo Seller",
  walletAddress: "0xb02e172f65d6c4ee10B4C6a10F5589003278Ced7",
  preferredCurrency: "USD",
  preferredSettlementToken: "ADI_NATIVE",
  callbackUrl: "http://localhost:3001/api/merchant/callback-echo",
  logoUrl: "https://ui-avatars.com/api/?name=BlindBid+Seller&background=6366f1&color=fff",
  createdAt: Math.floor(Date.now() / 1000),
};
merchants.set(DEMO_SELLER.merchantId, DEMO_SELLER);

// ─── Service functions ────────────────────────────────────────────────────────

export function registerMerchant(params: {
  name: string;
  walletAddress: `0x${string}`;
  preferredCurrency?: FiatCurrency;
  preferredSettlementToken?: SettlementToken;
  callbackUrl?: string;
  logoUrl?: string;
}): Merchant {
  const merchantId = `MERCHANT-${randomUUID().slice(0, 8).toUpperCase()}`;

  const merchant: Merchant = {
    merchantId,
    name: params.name,
    walletAddress: params.walletAddress,
    preferredCurrency: params.preferredCurrency ?? "USD",
    preferredSettlementToken: params.preferredSettlementToken ?? "ADI_NATIVE",
    callbackUrl: params.callbackUrl,
    logoUrl:
      params.logoUrl ??
      `https://ui-avatars.com/api/?name=${encodeURIComponent(params.name)}&background=6366f1&color=fff`,
    createdAt: Math.floor(Date.now() / 1000),
  };

  merchants.set(merchantId, merchant);
  return merchant;
}

export function getMerchant(merchantId: string): Merchant | undefined {
  return merchants.get(merchantId);
}

export function listMerchants(): Merchant[] {
  return Array.from(merchants.values());
}

export function updateMerchant(
  merchantId: string,
  updates: Partial<Pick<Merchant, "name" | "callbackUrl" | "preferredCurrency" | "preferredSettlementToken" | "logoUrl">>
): Merchant | undefined {
  const existing = merchants.get(merchantId);
  if (!existing) return undefined;

  const updated: Merchant = { ...existing, ...updates };
  merchants.set(merchantId, updated);
  return updated;
}
