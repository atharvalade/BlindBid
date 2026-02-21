// ─── Auction / Canton types ───────────────────────────────────────────────────

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

export interface ScoringWeights {
  priceWeight: number;
  deliveryWeight: number;
  penaltyWeight: number;
  reputationWeight: number;
}

export interface Auction {
  auctionId: string;
  contractId?: string;
  seller: string;
  itemDesc: string;
  constraints: string;
  weights: ScoringWeights;
  bidders: string[];
  auditor?: string;
  stage: AuctionStage;
  createdAt: string;
  biddingDeadline: string;
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

// ─── ERC-4337 / Paymaster types ───────────────────────────────────────────────

export interface UserOperationV07 {
  sender: `0x${string}`;
  nonce: bigint;
  factory: `0x${string}` | null;
  factoryData: `0x${string}` | null;
  callData: `0x${string}`;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster: `0x${string}` | null;
  paymasterVerificationGasLimit: bigint | null;
  paymasterPostOpGasLimit: bigint | null;
  paymasterData: `0x${string}` | null;
  signature: `0x${string}`;
}

export interface SponsorPolicy {
  auctionId: string;
  beneficiary: `0x${string}`;
  allowedSelectors: `0x${string}`[];  // 4-byte selectors
  allowedTargets: `0x${string}`[];
  maxGasPerOp: bigint;
  maxOpsPerAuction: number;
  expiresAt: number;                  // unix timestamp
}

export interface SponsorshipData {
  paymasterAddress: `0x${string}`;
  paymasterData: `0x${string}`;       // abi-encoded: validUntil + validAfter + sig
  validUntil: number;
  validAfter: number;
  sponsorSignature: `0x${string}`;
}

// ─── Hedera / Audit types ─────────────────────────────────────────────────────

export interface AuditCommitment {
  auctionId: string;
  stage: AuctionStage;
  cantonTxId: string;
  adiTxHash: string;
  timestamp: string;         // ISO-8601
  nonce: string;
  commitmentHash: string;    // keccak256 of the above fields
}

export interface AuditLogEntry extends AuditCommitment {
  hederaTopicId: string;
  hederaSequenceNumber: number;
  hederaConsensusTimestamp: string;
}

// ─── Merchant / Payment types ─────────────────────────────────────────────────

export type FiatCurrency = "USD" | "AED";
export type SettlementToken = "ADI_NATIVE" | "MOCK_ERC20";

export interface PriceQuote {
  auctionId: string;
  fiatAmount: number;
  fiatCurrency: FiatCurrency;
  tokenAmount: bigint;
  settlementToken: SettlementToken;
  exchangeRate: number;
  maxSlippageBps: number;   // basis points, e.g. 50 = 0.5%
  validUntil: number;       // unix timestamp
  signature: `0x${string}`; // signed by sponsor signer so contract can verify
}

// ─── Merchant / Checkout types ─────────────────────────────────────────────────

export type CheckoutStatus =
  | "pending"        // Session created, awaiting payment
  | "quote_ready"    // Quote generated, presented to buyer
  | "paying"         // Payment tx submitted
  | "confirming"     // Tx mined, waiting confirmations
  | "completed"      // Funds in escrow
  | "expired"        // Quote or session expired
  | "failed";        // Payment tx reverted

export interface Merchant {
  merchantId: string;
  name: string;
  walletAddress: `0x${string}`;
  preferredCurrency: FiatCurrency;
  preferredSettlementToken: SettlementToken;
  callbackUrl?: string;           // webhook for payment status
  logoUrl?: string;
  createdAt: number;
}

export interface CheckoutSession {
  sessionId: string;
  auctionId: string;
  merchantId: string;
  buyerAddress?: `0x${string}`;
  fiatAmount: number;
  fiatCurrency: FiatCurrency;
  tokenAmount?: string;            // BigInt → string for JSON
  settlementToken: SettlementToken;
  exchangeRate?: number;
  maxSlippageBps?: number;
  quoteSignature?: `0x${string}`;
  quoteValidUntil?: number;
  status: CheckoutStatus;
  paymentTxHash?: string;
  escrowTxHash?: string;
  walletConnectUri?: string;       // WalletConnect URI for mobile
  qrData?: string;                 // EIP-681 payment URI for QR
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentCallback {
  sessionId: string;
  auctionId: string;
  status: CheckoutStatus;
  txHash?: string;
  amount?: string;
  token?: string;
  timestamp: number;
}

// ─── API response wrappers ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
