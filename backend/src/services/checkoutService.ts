/**
 * CheckoutService — end-to-end checkout session management.
 *
 * Lifecycle:
 *   1. createSession()     — buyer initiates checkout for an auction
 *   2. generateSessionQuote() — attaches a signed fiat→token quote
 *   3. markPaying()        — buyer submits payment tx
 *   4. confirmPayment()    — payment confirmed on-chain
 *   5. completeSession()   — escrow deposit verified, session done
 *
 * Also generates:
 *   - EIP-681 payment URI for QR code scanning
 *   - WalletConnect-compatible URI for cross-device payments
 *   - Payment status callbacks to merchant webhook
 */

import { randomUUID } from "crypto";
import { ethers } from "ethers";
import { config } from "../config";
import { generateQuote } from "./quoteService";
import { getMerchant } from "./merchantService";
import type {
  CheckoutSession,
  CheckoutStatus,
  FiatCurrency,
  SettlementToken,
  PaymentCallback,
} from "../types";

// ─── In-memory store ──────────────────────────────────────────────────────────
const sessions = new Map<string, CheckoutSession>();

// Session expiry: 30 minutes
const DEFAULT_SESSION_TTL = 30 * 60;

// ─── Create checkout session ──────────────────────────────────────────────────

export async function createCheckoutSession(params: {
  auctionId: string;
  merchantId: string;
  fiatAmount: number;
  fiatCurrency?: FiatCurrency;
  settlementToken?: SettlementToken;
  buyerAddress?: `0x${string}`;
}): Promise<CheckoutSession> {
  const merchant = getMerchant(params.merchantId);
  if (!merchant) throw new Error("MERCHANT_NOT_FOUND: Invalid merchantId");

  const fiatCurrency = params.fiatCurrency ?? merchant.preferredCurrency;
  const settlementToken =
    params.settlementToken ?? merchant.preferredSettlementToken;
  const now = Math.floor(Date.now() / 1000);

  const session: CheckoutSession = {
    sessionId: `CS-${randomUUID().slice(0, 12).toUpperCase()}`,
    auctionId: params.auctionId,
    merchantId: params.merchantId,
    buyerAddress: params.buyerAddress,
    fiatAmount: params.fiatAmount,
    fiatCurrency,
    settlementToken,
    status: "pending",
    expiresAt: now + DEFAULT_SESSION_TTL,
    createdAt: now,
    updatedAt: now,
  };

  sessions.set(session.sessionId, session);
  return session;
}

// ─── Generate quote for a session ─────────────────────────────────────────────

export async function generateSessionQuote(
  sessionId: string
): Promise<CheckoutSession> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "pending")
    throw new Error(`SESSION_INVALID_STATE: expected pending, got ${session.status}`);

  // Generate the signed quote
  const quote = await generateQuote(
    session.auctionId,
    session.fiatAmount,
    session.fiatCurrency,
    session.settlementToken,
    600 // 10-minute quote validity
  );

  // Build EIP-681 payment URI for QR
  const escrowAddr = config.contracts.escrow;
  const qrData = buildEIP681Uri(
    escrowAddr,
    "depositNative",
    [session.auctionId, getMerchant(session.merchantId)?.walletAddress ?? "0x0"],
    quote.tokenAmount.toString()
  );

  // Build WalletConnect-style deep link
  const walletConnectUri = buildWalletConnectUri(session.sessionId, escrowAddr);

  const now = Math.floor(Date.now() / 1000);
  Object.assign(session, {
    tokenAmount: quote.tokenAmount.toString(),
    exchangeRate: quote.exchangeRate,
    maxSlippageBps: quote.maxSlippageBps,
    quoteSignature: quote.signature,
    quoteValidUntil: quote.validUntil,
    qrData,
    walletConnectUri,
    status: "quote_ready" as CheckoutStatus,
    updatedAt: now,
  });

  sessions.set(sessionId, session);
  return session;
}

// ─── Mark session as "paying" ─────────────────────────────────────────────────

export function markPaying(
  sessionId: string,
  txHash: string,
  buyerAddress?: `0x${string}`
): CheckoutSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "quote_ready")
    throw new Error(`SESSION_INVALID_STATE: expected quote_ready, got ${session.status}`);

  const now = Math.floor(Date.now() / 1000);
  session.paymentTxHash = txHash;
  session.status = "paying";
  session.updatedAt = now;
  if (buyerAddress) session.buyerAddress = buyerAddress;

  sessions.set(sessionId, session);
  return session;
}

// ─── Confirm payment ──────────────────────────────────────────────────────────

export function confirmPayment(
  sessionId: string,
  escrowTxHash?: string
): CheckoutSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const now = Math.floor(Date.now() / 1000);
  session.status = "completed";
  session.updatedAt = now;
  if (escrowTxHash) session.escrowTxHash = escrowTxHash;

  sessions.set(sessionId, session);

  // Fire webhook callback if merchant has one configured
  fireCallback(session);

  return session;
}

// ─── Expire session ───────────────────────────────────────────────────────────

export function expireSession(sessionId: string): CheckoutSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");

  session.status = "expired";
  session.updatedAt = Math.floor(Date.now() / 1000);
  sessions.set(sessionId, session);
  return session;
}

// ─── Get session ──────────────────────────────────────────────────────────────

export function getSession(sessionId: string): CheckoutSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  // Auto-expire if past TTL and not completed
  const now = Math.floor(Date.now() / 1000);
  if (
    now > session.expiresAt &&
    !["completed", "expired", "failed"].includes(session.status)
  ) {
    session.status = "expired";
    session.updatedAt = now;
    sessions.set(session.sessionId, session);
  }

  return session;
}

export function listSessionsByAuction(auctionId: string): CheckoutSession[] {
  return Array.from(sessions.values()).filter(
    (s) => s.auctionId === auctionId
  );
}

export function listSessionsByMerchant(merchantId: string): CheckoutSession[] {
  return Array.from(sessions.values()).filter(
    (s) => s.merchantId === merchantId
  );
}

// ─── Payment URI generators ──────────────────────────────────────────────────

/**
 * Build an EIP-681 payment URI for QR code.
 * Format: ethereum:<address>@<chainId>/functionName?params...&value=...
 */
function buildEIP681Uri(
  contractAddress: string,
  functionName: string,
  args: string[],
  valueWei: string
): string {
  // For native payments: ethereum:<escrow>@<chainId>/depositNative?string=<auctionId>&address=<seller>&value=<amount>
  const chainId = 31337; // Anvil fork chain ID
  const params = args.map((a, i) => `arg${i}=${encodeURIComponent(a)}`).join("&");
  return `ethereum:${contractAddress}@${chainId}/${functionName}?${params}&value=${valueWei}`;
}

/**
 * Build a WalletConnect-compatible URI.
 * In production, this would create a real WC session via @walletconnect/sign-client.
 * For the demo, we generate a deterministic URI that the frontend can intercept.
 */
function buildWalletConnectUri(sessionId: string, target: string): string {
  // Simulated WC 2.0 URI format
  const topic = ethers.keccak256(ethers.toUtf8Bytes(sessionId)).slice(2, 66);
  return `wc:${topic}@2?relay-protocol=irn&symKey=${ethers.keccak256(ethers.toUtf8Bytes(target)).slice(2, 66)}`;
}

// ─── Webhook callback ─────────────────────────────────────────────────────────

async function fireCallback(session: CheckoutSession): Promise<void> {
  const merchant = getMerchant(session.merchantId);
  if (!merchant?.callbackUrl) return;

  const payload: PaymentCallback = {
    sessionId: session.sessionId,
    auctionId: session.auctionId,
    status: session.status,
    txHash: session.paymentTxHash,
    amount: session.tokenAmount,
    token: session.settlementToken,
    timestamp: Math.floor(Date.now() / 1000),
  };

  try {
    // In production: real HTTP POST to merchant callback URL
    // For demo: log and store for echo endpoint
    console.log(
      `[CHECKOUT] Callback → ${merchant.callbackUrl}`,
      JSON.stringify(payload)
    );
    callbackLog.push(payload);
  } catch (err) {
    console.error("[CHECKOUT] Callback failed:", err);
  }
}

// Store callbacks for the echo endpoint
const callbackLog: PaymentCallback[] = [];
export function getCallbackLog(): PaymentCallback[] {
  return callbackLog;
}
