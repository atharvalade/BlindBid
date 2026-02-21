import { Router } from "express";
import { ethers } from "ethers";
import { config } from "../config";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const checks: Record<string, string> = {};

  // ─── Check Anvil / ADI RPC ────────────────────────────────────────────────
  try {
    const provider = new ethers.JsonRpcProvider(config.adi.rpcUrl);
    const [blockNumber, network] = await Promise.all([
      provider.getBlockNumber(),
      provider.getNetwork(),
    ]);
    const deployerBalance = await provider.getBalance(config.deployer.address);
    checks["adi_rpc"] = `ok (chain=${network.chainId}, block=${blockNumber}, deployer=${ethers.formatEther(deployerBalance)} ADI)`;
  } catch (e: any) {
    checks["adi_rpc"] = `error: ${e.message}`;
  }

  // ─── Check EntryPoint v0.7 is deployed ───────────────────────────────────
  try {
    const provider = new ethers.JsonRpcProvider(config.adi.rpcUrl);
    const code = await provider.getCode(config.adi.entryPointV07);
    checks["entrypoint_v07"] = code !== "0x"
      ? `ok (${config.adi.entryPointV07})`
      : `NOT DEPLOYED at ${config.adi.entryPointV07}`;
  } catch (e: any) {
    checks["entrypoint_v07"] = `error: ${e.message}`;
  }

  // ─── Check paymaster contracts (post-deployment) ─────────────────────────
  if (config.contracts.nativePaymaster) {
    try {
      const provider = new ethers.JsonRpcProvider(config.adi.rpcUrl);
      const code = await provider.getCode(config.contracts.nativePaymaster);
      checks["native_paymaster"] = code !== "0x" ? "ok" : "NOT DEPLOYED";
    } catch (e: any) {
      checks["native_paymaster"] = `error: ${e.message}`;
    }
  } else {
    checks["native_paymaster"] = "not configured (run deployment first)";
  }

  // ─── Check Hedera mirror node ─────────────────────────────────────────────
  try {
    const url = `${config.hedera.mirrorNode}/api/v1/accounts/${config.hedera.accountId}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = (await resp.json()) as { balance?: { balance?: number } };
      const hbar = (data?.balance?.balance ?? 0) / 1e8;
      checks["hedera_mirror"] = `ok (${config.hedera.accountId}, balance=${hbar} HBAR)`;
    } else {
      checks["hedera_mirror"] = `http ${resp.status}`;
    }
  } catch (e: any) {
    checks["hedera_mirror"] = `error: ${e.message}`;
  }

  const allOk = Object.values(checks).every((v) => v.startsWith("ok") || v.includes("not configured"));

  res.status(allOk ? 200 : 207).json({
    ok: allOk,
    service: "blindbid-backend",
    timestamp: new Date().toISOString(),
    checks,
  });
});
