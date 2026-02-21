import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { healthRouter } from "./routes/health";
import { sponsorRouter } from "./routes/sponsor";
import { quoteRouter } from "./routes/quote";
import { auditRouter } from "./routes/audit";
import { escrowRouter } from "./routes/escrow";
import { merchantRouter } from "./routes/merchant";
import { checkoutRouter } from "./routes/checkout";
import { cantonRouter } from "./routes/canton";

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/health", healthRouter);
app.use("/api/sponsor", sponsorRouter);
app.use("/api/quote", quoteRouter);
app.use("/api/audit", auditRouter);
app.use("/api/escrow", escrowRouter);
app.use("/api/merchant", merchantRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/canton", cantonRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[ERROR]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
);

// ─── Start (skip when running as Vercel serverless function) ─────────────────
if (!process.env.VERCEL) {
  app.listen(config.server.port, () => {
    console.log(`\n🚀 BlindBid backend running on port ${config.server.port}`);
    console.log(`   ENV  : ${config.server.env}`);
    console.log(`   ADI  : ${config.adi.rpcUrl}`);
    console.log(`   Entry: ${config.adi.entryPointV07}`);
    console.log(`   HBAR : ${config.hedera.accountId}`);
    console.log(`   PM(N): ${config.contracts.nativePaymaster || "not deployed"}`);
    console.log(`   PM(E): ${config.contracts.erc20Paymaster || "not deployed"}`);
    console.log(`   ESC  : ${config.contracts.escrow || "not deployed"}\n`);
  });
}

export default app;
