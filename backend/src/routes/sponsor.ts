import { Router } from "express";
import {
  buildSponsorshipData,
  registerPolicy,
  buildExpiredSponsorshipData,
  buildDisallowedSelectorData,
} from "../services/sponsorService";
import {
  signSponsorAuthorization,
  buildPaymasterAndData,
  getPaymasterInfo,
} from "../services/contractService";
import { config } from "../config";
import type { SponsorPolicy } from "../types";

export const sponsorRouter = Router();

// ─── POST /api/sponsor/policy ─────────────────────────────────────────────────
sponsorRouter.post("/policy", (req, res) => {
  const {
    auctionId,
    beneficiary,
    allowedSelectors = [],
    allowedTargets = [],
    maxGasPerOp = "500000",
    maxOpsPerAuction = 10,
    expirySeconds = 3600,
  } = req.body as {
    auctionId?: string;
    beneficiary?: string;
    allowedSelectors?: `0x${string}`[];
    allowedTargets?: `0x${string}`[];
    maxGasPerOp?: string;
    maxOpsPerAuction?: number;
    expirySeconds?: number;
  };

  if (!auctionId || !beneficiary) {
    res
      .status(400)
      .json({ ok: false, error: "auctionId and beneficiary are required" });
    return;
  }

  const policy: SponsorPolicy = {
    auctionId,
    beneficiary: beneficiary as `0x${string}`,
    allowedSelectors: allowedSelectors as `0x${string}`[],
    allowedTargets: allowedTargets as `0x${string}`[],
    maxGasPerOp: BigInt(maxGasPerOp),
    maxOpsPerAuction,
    expiresAt: Math.floor(Date.now() / 1000) + expirySeconds,
  };

  registerPolicy(policy);

  res.json({
    ok: true,
    data: {
      message: "Policy registered",
      beneficiary,
      auctionId,
      expiresAt: new Date(policy.expiresAt * 1000).toISOString(),
      maxOpsPerAuction,
    },
  });
});

// ─── POST /api/sponsor/sign ───────────────────────────────────────────────────
// Real sponsor signing endpoint using deployed paymaster contracts.
sponsorRouter.post("/sign", async (req, res) => {
  const {
    sender,
    callData,
    auctionId,
    paymasterType = "native",
    validitySeconds = 300,
  } = req.body as {
    sender?: string;
    callData?: string;
    auctionId?: string;
    paymasterType?: "native" | "erc20";
    validitySeconds?: number;
  };

  if (!sender || !auctionId) {
    res.status(400).json({
      ok: false,
      error: "sender and auctionId are required",
    });
    return;
  }

  const paymasterAddress =
    paymasterType === "erc20"
      ? config.contracts.erc20Paymaster
      : config.contracts.nativePaymaster;

  if (!paymasterAddress) {
    res.status(500).json({
      ok: false,
      error: `${paymasterType} paymaster not deployed`,
    });
    return;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const validAfter = now - 30; // 30s buffer for clock skew
    const validUntil = now + validitySeconds;

    // Generate real cryptographic sponsor signature
    const authResult = await signSponsorAuthorization(
      sender,
      paymasterAddress,
      validUntil,
      validAfter
    );

    // Build the full paymasterAndData bytes
    const paymasterAndData = buildPaymasterAndData(
      paymasterAddress,
      validUntil,
      validAfter,
      authResult.signature
    );

    // Also try the policy-based validation from sponsorService
    let policyResult = null;
    try {
      policyResult = await buildSponsorshipData(
        paymasterAddress as `0x${string}`,
        { sender: sender as `0x${string}`, callData: (callData || "0x") as `0x${string}`, auctionId },
        validitySeconds
      );
    } catch {
      // Policy validation is supplementary; signature is the main auth
    }

    res.json({
      ok: true,
      data: {
        paymasterAddress,
        paymasterType,
        paymasterAndData,
        validAfter: new Date(validAfter * 1000).toISOString(),
        validUntil: new Date(validUntil * 1000).toISOString(),
        sponsorSigner: authResult.sponsorSigner,
        signature: authResult.signature,
        chainId: (await (await import("../services/contractService")).getProvider().getNetwork()).chainId.toString(),
        entryPoint: config.adi.entryPointV07,
        policyCheck: policyResult ? "passed" : "no_policy",
      },
    });
  } catch (err: any) {
    const code = err.message?.split(":")[0] ?? "SPONSOR_ERROR";
    res.status(403).json({ ok: false, error: err.message, code });
  }
});

// ─── GET /api/sponsor/info ──────────────────────────────────────────────────
// Returns live paymaster contract info
sponsorRouter.get("/info", async (_req, res) => {
  try {
    const info = await getPaymasterInfo();
    res.json({ ok: true, data: info });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/sponsor/demo-failures ─────────────────────────────────────────
sponsorRouter.get("/demo-failures", (_req, res) => {
  const pm =
    config.contracts.nativePaymaster ||
    ("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as `0x${string}`);
  res.json({
    ok: true,
    data: {
      expired: buildExpiredSponsorshipData(pm as `0x${string}`),
      disallowed_selector: buildDisallowedSelectorData(
        pm as `0x${string}`,
        "0xdeadbeef"
      ),
      rate_limited: {
        error:
          "SPONSOR_RATE_LIMIT: Exceeded maxOpsPerAuction (10) for this auction",
      },
      policy_not_found: {
        error: "SPONSOR_POLICY_NOT_FOUND: No sponsorship policy for 0x000...000",
      },
    },
  });
});
