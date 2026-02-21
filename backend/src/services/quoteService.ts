/**
 * QuoteService — generates a signed fiat-to-token price quote.
 *
 * In production this would call an oracle / price feed. For the hackathon we
 * use a hardcoded rate that the deployer wallet signs so the escrow contract
 * can verify the quote hasn't been tampered with.
 *
 * Quote format signed by sponsorSigner:
 *   keccak256(abi.encode(auctionId, fiatAmount, fiatCurrency, tokenAmount, validUntil))
 */

import { ethers } from "ethers";
import { config } from "../config";
import type { PriceQuote, FiatCurrency, SettlementToken } from "../types";

// ─── Mock exchange rates (USD/AED → ADI tokens) ───────────────────────────────
// 1 ADI native token ≈ $0.10 at demo time. Adjust as needed.
const RATES: Record<FiatCurrency, number> = {
  USD: 10,   // 1 USD = 10 ADI tokens
  AED: 2.72, // 1 AED ≈ 0.272 USD → 2.72 ADI tokens
};

// Max slippage allowed by the escrow contract: 50 bps = 0.5 %
const MAX_SLIPPAGE_BPS = 50;

export async function generateQuote(
  auctionId: string,
  fiatAmount: number,
  fiatCurrency: FiatCurrency,
  settlementToken: SettlementToken = "ADI_NATIVE",
  validitySeconds = 600   // quotes expire in 10 minutes
): Promise<PriceQuote> {
  if (fiatAmount <= 0) throw new Error("fiatAmount must be > 0");

  const signer = new ethers.Wallet(config.sponsorSigner.privateKey);
  const rate = RATES[fiatCurrency];
  const tokenAmountFloat = fiatAmount * rate;

  // Scale to 18 decimals (wei)
  const tokenAmount = ethers.parseEther(tokenAmountFloat.toFixed(6));
  const validUntil = Math.floor(Date.now() / 1000) + validitySeconds;

  // ─── Build and sign the quote ─────────────────────────────────────────────
  const hash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "string", "uint256", "uint256"],
      [auctionId, Math.round(fiatAmount * 100), fiatCurrency, tokenAmount, validUntil]
    )
  );

  const signature = (await signer.signMessage(ethers.getBytes(hash))) as `0x${string}`;

  return {
    auctionId,
    fiatAmount,
    fiatCurrency,
    tokenAmount,
    settlementToken,
    exchangeRate: rate,
    maxSlippageBps: MAX_SLIPPAGE_BPS,
    validUntil,
    signature,
  };
}

/** Verify a previously generated quote hasn't been tampered with */
export function verifyQuote(quote: PriceQuote): boolean {
  const hash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "string", "uint256", "uint256"],
      [
        quote.auctionId,
        Math.round(quote.fiatAmount * 100),
        quote.fiatCurrency,
        quote.tokenAmount,
        quote.validUntil,
      ]
    )
  );
  const recovered = ethers.verifyMessage(ethers.getBytes(hash), quote.signature);
  return recovered.toLowerCase() === config.sponsorSigner.address.toLowerCase();
}
