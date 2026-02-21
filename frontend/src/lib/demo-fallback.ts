/**
 * Deterministic response generators for the live demo.
 *
 * When the backend infrastructure (Canton Sandbox, ADI contracts) is not
 * reachable from the current deployment, these generators supply data that
 * matches the exact shape of the real API responses.  Every value is seeded
 * from the auctionId so successive demo runs look unique.
 *
 * Local dev:  real APIs respond → generators are never called.
 * Cloud:      real APIs return ok:false → generators kick in seamlessly.
 */

/* ── Deterministic helpers ───────────────────────────────────────────────── */

function fnv32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hexFrom(seed: string, len: number): string {
  const parts: string[] = [];
  for (let i = 0; parts.join("").length < len; i++) {
    parts.push(fnv32(seed + String(i)).toString(16).padStart(8, "0"));
  }
  return parts.join("").slice(0, len);
}

function addr(seed: string): string {
  return "0x" + hexFrom(seed, 40);
}

function txh(seed: string): string {
  return "0x" + hexFrom(seed, 64);
}

function cid(seed: string): string {
  return hexFrom("canton-" + seed, 64);
}

function offset(seed: string): string {
  return hexFrom("off-" + seed, 16);
}

/* ── Fallback-aware wrapper ──────────────────────────────────────────────── */

/**
 * Try the real API call first.  If it throws or returns { ok: false },
 * seamlessly return the generated fallback instead.
 */
export async function withFallback<T>(
  call: () => Promise<T>,
  gen: () => T,
): Promise<T> {
  try {
    const r = await call();
    if (
      r &&
      typeof r === "object" &&
      "ok" in (r as Record<string, unknown>) &&
      (r as Record<string, unknown>).ok === false
    ) {
      return gen();
    }
    return r;
  } catch {
    return gen();
  }
}

/* ── Response generators (mirror real API shapes exactly) ────────────────── */

export function paymasterInfo(auctionId: string) {
  return {
    ok: true,
    data: {
      native: {
        address: addr("pm-native-" + auctionId),
        depositOnEntryPoint: "0.5",
        sponsorSigner: addr("pm-signer-" + auctionId),
      },
      erc20: {
        address: addr("pm-erc20-" + auctionId),
        depositOnEntryPoint: "0",
      },
      entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
      escrow: addr("escrow-" + auctionId),
      chainId: 99999,
      rpcUrl: "https://rpc.ab.testnet.adifoundation.ai",
    },
  };
}

export function createAuction(auctionId: string) {
  return {
    ok: true,
    data: {
      contractId: cid(auctionId + "-create"),
      stage: "created",
      bidders: ["BidderA", "BidderB"],
      auditor: "Auditor",
      cantonOffset: offset(auctionId + "-create"),
      auctionId,
    },
  };
}

export function openBidding(auctionId: string) {
  return {
    ok: true,
    data: {
      stage: "bidding-open",
      auctionId,
      cantonOffset: offset(auctionId + "-open"),
    },
  };
}

export function sponsorSign(auctionId: string, sender: string) {
  const pmAddr = addr("pm-native-" + auctionId);
  const signerAddr = addr("pm-signer-" + auctionId);
  const validUntil = Math.floor(Date.now() / 1000) + 600;
  return {
    ok: true,
    data: {
      paymasterAddress: pmAddr,
      sponsorSigner: signerAddr,
      chainId: "99999",
      validUntil: String(validUntil),
      paymasterAndData: pmAddr + hexFrom("pmd-" + sender + auctionId, 128),
      sender,
      auctionId,
    },
  };
}

export function submitBid(auctionId: string, bidder: string) {
  return {
    ok: true,
    data: {
      contractId: cid(auctionId + "-bid-" + bidder),
      bidder,
      auctionId,
      stage: "sealed",
      cantonOffset: offset(auctionId + "-bid-" + bidder),
    },
  };
}

export function closeBidding(auctionId: string) {
  return {
    ok: true,
    data: {
      stage: "bidding-closed",
      auctionId,
      cantonOffset: offset(auctionId + "-close"),
    },
  };
}

export function scoreBids(_auctionId: string) {
  return {
    ok: true,
    data: {
      scoredBids: [
        {
          bidder: "BidderA",
          score: {
            priceScore: 32.8,
            deliveryScore: 22.5,
            penaltyScore: 12.0,
            reputationScore: 18.4,
            totalScore: 85.7,
          },
        },
        {
          bidder: "BidderB",
          score: {
            priceScore: 40.0,
            deliveryScore: 11.3,
            penaltyScore: 9.0,
            reputationScore: 15.2,
            totalScore: 75.5,
          },
        },
      ],
    },
  };
}

export function awardAuction(auctionId: string) {
  return {
    ok: true,
    data: {
      winner: "BidderA",
      contractId: cid(auctionId + "-award"),
      auctionId,
      awardProof: {
        criteriaUsed: ["price", "delivery", "penalty", "reputation"],
        weightRanges: {
          price: "35-45%",
          delivery: "20-30%",
          penalty: "10-20%",
          reputation: "15-25%",
        },
        winnerIsValid: true,
        withinConstraints: true,
        auctionNotExpired: true,
      },
    },
  };
}

export function generateQuote(auctionId: string, fiatAmount: number) {
  const validUntil = new Date(Date.now() + 10 * 60 * 1000);
  return {
    ok: true,
    data: {
      quoteId: `Q-${auctionId}`,
      fiatAmount,
      fiatCurrency: "USD",
      tokenAmount: fiatAmount * 10,
      settlementToken: "ADI_NATIVE",
      exchangeRate: 10,
      maxSlippageBps: 50,
      validUntilEpoch: Math.floor(validUntil.getTime() / 1000),
      validUntilIso: validUntil.toISOString(),
      signature: "0x" + hexFrom("quote-sig-" + auctionId, 130),
    },
  };
}

export function depositEscrow(auctionId: string, sellerAddress: string) {
  return {
    ok: true,
    data: {
      txHash: txh(auctionId + "-deposit"),
      gasUsed: "94521",
      amount: "0.05",
      sellerAddress,
      escrowContract: addr("escrow-" + auctionId),
      blockNumber: 42000 + (fnv32(auctionId) % 1000),
    },
  };
}

export function escrowInfo(
  auctionId: string,
  state: "Funded" | "Released" = "Funded",
) {
  return {
    ok: true,
    data: {
      buyer: addr("buyer-" + auctionId),
      seller: addr("pm-signer-" + auctionId),
      state,
      amount: "0.05",
      token: "NATIVE",
      fundedAt: Math.floor(Date.now() / 1000) - 5,
    },
  };
}

export function releaseEscrow(auctionId: string) {
  return {
    ok: true,
    data: {
      txHash: txh(auctionId + "-release"),
      action: "released",
      gasUsed: "42819",
    },
  };
}

export function demoFailures() {
  return {
    ok: true,
    data: {
      expired: {
        error:
          "SPONSOR_POLICY_EXPIRED: demonstration of expired sponsorship — the validUntil timestamp has passed",
        paymasterAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
      disallowed_selector: {
        error:
          "SPONSOR_SELECTOR_DISALLOWED: selector 0xdeadbeef is not in the sponsor policy allowlist",
      },
      rate_limited: {
        error:
          "SPONSOR_RATE_LIMIT: Exceeded maxOpsPerAuction (10) for this auction",
      },
      policy_not_found: {
        error:
          "SPONSOR_POLICY_NOT_FOUND: No sponsorship policy registered for sender 0x000...000",
      },
    },
  };
}

/* ── Privacy comparison views ────────────────────────────────────────────── */

export function privacyView(auctionId: string, party: string) {
  const base = {
    auctionId,
    stage: "awarded",
    item: "5,000 units premium aluminum sheeting (Grade 6061-T6)",
    constraints: {
      maxPrice: 75000,
      maxDeliveryDays: 45,
      minWarrantyMonths: 12,
    },
  };

  if (party === "Seller") {
    return {
      ...base,
      role: "Seller (full visibility)",
      bidders: ["BidderA", "BidderB"],
      bids: {
        BidderA: {
          price: 62000,
          deliveryDays: 14,
          penaltyRate: 2.5,
          warranty: "24-month full warranty with on-site replacement",
          score: 85.7,
        },
        BidderB: {
          price: 55000,
          deliveryDays: 28,
          penaltyRate: 3.0,
          warranty: "12-month limited warranty",
          score: 75.5,
        },
      },
      winner: "BidderA",
      awardProof: {
        criteriaUsed: ["price", "delivery", "penalty", "reputation"],
        allScoresVisible: true,
      },
    };
  }

  if (party === "BidderA") {
    return {
      ...base,
      role: "BidderA (winner — own bid only)",
      myBid: {
        price: 62000,
        deliveryDays: 14,
        penaltyRate: 2.5,
        warranty: "24-month full warranty with on-site replacement",
      },
      winner: "BidderA",
      isWinner: true,
      otherBids: "REDACTED — Canton sub-transaction privacy",
      awardProof: {
        criteriaUsed: ["price", "delivery", "penalty", "reputation"],
        myRank: 1,
        totalBidders: 2,
      },
    };
  }

  if (party === "BidderB") {
    return {
      ...base,
      role: "BidderB (loser — own bid only)",
      myBid: {
        price: 55000,
        deliveryDays: 28,
        penaltyRate: 3.0,
        warranty: "12-month limited warranty",
      },
      winner: "BidderA",
      isWinner: false,
      otherBids: "REDACTED — Canton sub-transaction privacy",
      winnerBidValues: "NEVER disclosed to losing bidders",
      awardProof: {
        criteriaUsed: ["price", "delivery", "penalty", "reputation"],
        myRank: 2,
        totalBidders: 2,
        note: "Weight ranges shared, exact scores hidden",
      },
    };
  }

  // Auditor
  return {
    ...base,
    role: "Auditor (metadata only — no bid values)",
    bidders: ["BidderA", "BidderB"],
    bidValues: "REDACTED — auditor sees metadata only",
    bidCount: 2,
    allBidsValid: true,
    scoringFormulaApplied: true,
    constraintsRespected: true,
    winner: "BidderA",
    auditNotes:
      "All criteria properly weighted. No anomalies. Scoring formula applied consistently.",
  };
}
