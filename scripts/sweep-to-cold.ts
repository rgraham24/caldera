/**
 * Stream 3.3 — Sweep DESO from hot platform wallet to cold treasury wallet.
 *
 * Per SECURITY.md §4. Manual operation. NEVER run unsupervised.
 *
 * Usage:
 *   npx tsx scripts/sweep-to-cold.ts --amount-nanos <N> [--dry-run]
 *
 * Examples:
 *   # Smoke test: 0.05 DESO
 *   npx tsx scripts/sweep-to-cold.ts --amount-nanos 50000000 --dry-run
 *   npx tsx scripts/sweep-to-cold.ts --amount-nanos 50000000
 *
 *   # 1 DESO sweep
 *   npx tsx scripts/sweep-to-cold.ts --amount-nanos 1000000000
 *
 * Constraints:
 *   MIN: 1_000_000 nanos (0.001 DESO)   — anti-dust
 *   MAX: 5_000_000_000 nanos (5 DESO)   — anti-fat-finger; raise after first
 *                                         verified sweep if needed
 *
 * The cold wallet pubkey is HARDCODED in this script. Do NOT make it
 * configurable. A misconfigured env var must NOT be able to redirect
 * platform funds elsewhere.
 *
 * NOT a one-shot — kept in repo as the sweep tool referenced by
 * SECURITY.md §4 (the playbook).
 */

import dotenv from "dotenv";
import { transferDeso } from "@/lib/deso/transferDeso";
import { verifyDesoTransfer } from "@/lib/deso/verifyTx";

dotenv.config({ path: ".env.local" });

// ─── Hardcoded constants ──────────────────────────────────────────────────────

const COLD_WALLET_PUBKEY =
  "BC1YLgjNpL3jAgsydmsksqTcnXxFZ98WgxJmBt2giFG29ettuXxjimj";
const MIN_AMOUNT_NANOS = BigInt(1_000_000);     // 0.001 DESO — anti-dust
const MAX_AMOUNT_NANOS = BigInt(5_000_000_000); // 5 DESO — anti-fat-finger

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(): { amountNanos: bigint; dryRun: boolean } {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");

  const amountIdx = argv.indexOf("--amount-nanos");
  if (amountIdx === -1 || argv[amountIdx + 1] === undefined) {
    throw new Error("Missing required flag: --amount-nanos <N>");
  }

  const raw = argv[amountIdx + 1];
  let amountNanos: bigint;
  try {
    amountNanos = BigInt(raw);
  } catch {
    throw new Error(`--amount-nanos must be a valid integer, got: "${raw}"`);
  }

  if (amountNanos < MIN_AMOUNT_NANOS) {
    throw new Error(
      `--amount-nanos ${amountNanos} is below minimum ${MIN_AMOUNT_NANOS} (0.001 DESO). ` +
      `Refusing to send dust.`
    );
  }
  if (amountNanos > MAX_AMOUNT_NANOS) {
    throw new Error(
      `--amount-nanos ${amountNanos} exceeds maximum ${MAX_AMOUNT_NANOS} (5 DESO). ` +
      `Raise MAX_AMOUNT_NANOS in the script after first verified sweep if needed.`
    );
  }

  return { amountNanos, dryRun };
}

// ─── Env read ─────────────────────────────────────────────────────────────────

function readEnv(): { platformSeed: string; platformPublicKey: string } {
  const platformSeed = process.env.DESO_PLATFORM_SEED;
  const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY;

  if (!platformSeed) {
    throw new Error("Missing env var: DESO_PLATFORM_SEED (check .env.local)");
  }
  if (!platformPublicKey) {
    throw new Error("Missing env var: DESO_PLATFORM_PUBLIC_KEY (check .env.local)");
  }
  if (!platformPublicKey.startsWith("BC1YL")) {
    throw new Error(
      `DESO_PLATFORM_PUBLIC_KEY looks wrong — expected BC1YL prefix, got: ${platformPublicKey.slice(0, 10)}...`
    );
  }

  return { platformSeed, platformPublicKey };
}

// ─── Countdown pause ──────────────────────────────────────────────────────────

async function countdown(seconds: number): Promise<void> {
  process.stdout.write("  Submitting in ");
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`${i}...`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write(" go\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { amountNanos, dryRun } = parseArgs();
  const { platformSeed, platformPublicKey } = readEnv();

  const amountDeso = Number(amountNanos) / 1e9;

  // ── Banner ────────────────────────────────────────────────────────────────
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║          SWEEP TO COLD WALLET                ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`  From (hot):  ${platformPublicKey}`);
  console.log(`  To   (cold): ${COLD_WALLET_PUBKEY}`);
  console.log(`  Amount:      ${amountDeso} DESO (${amountNanos} nanos)`);
  console.log(`  Mode:        ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  // ── Defense-in-depth: confirm recipient is exactly the hardcoded pubkey ──
  if (COLD_WALLET_PUBKEY !== "BC1YLgjNpL3jAgsydmsksqTcnXxFZ98WgxJmBt2giFG29ettuXxjimj") {
    // This can only fire if someone edits the const above — belt + suspenders.
    throw new Error("COLD_WALLET_PUBKEY constant has been tampered with. Aborting.");
  }

  // ── Dry run exits here ────────────────────────────────────────────────────
  if (dryRun) {
    console.log("DRY RUN — no transaction submitted.");
    console.log("Re-run without --dry-run to execute the real sweep.");
    console.log("");
    return;
  }

  // ── 5-second countdown (Ctrl-C window) ───────────────────────────────────
  console.log("Press Ctrl-C NOW to abort. Otherwise:");
  await countdown(5);
  console.log("");

  // ── Transfer ─────────────────────────────────────────────────────────────
  console.log("[1/3] Submitting transfer...");
  const result = await transferDeso({
    platformPublicKey,
    platformSeed,
    recipientPublicKey: COLD_WALLET_PUBKEY,
    amountNanos,
  });

  if (!result.ok) {
    console.error(`  FAILED: ${result.reason} — ${result.detail}`);
    process.exit(1);
  }

  const { txHashHex, feeNanos } = result;
  console.log(`  ✓ Accepted. Tx hash: ${txHashHex}`);
  console.log(`  Fee paid: ${Number(feeNanos)} nanos (${Number(feeNanos) / 1e9} DESO)`);
  console.log(`  Explorer: https://explorer.deso.com/?query-node=https%3A%2F%2Fnode.deso.org&query=${txHashHex}`);
  console.log("");

  // ── Wait for indexer ──────────────────────────────────────────────────────
  console.log("[2/3] Waiting 5s for indexer propagation...");
  await new Promise((r) => setTimeout(r, 5000));
  console.log("");

  // ── Verify on-chain ───────────────────────────────────────────────────────
  console.log("[3/3] Verifying on-chain...");
  const verify = await verifyDesoTransfer(
    txHashHex,
    platformPublicKey,
    COLD_WALLET_PUBKEY,
    Number(amountNanos)
  );

  if (!verify.ok) {
    console.error(`  VERIFY FAILED: ${verify.reason}${verify.detail ? ` — ${verify.detail}` : ""}`);
    console.error(`  The transfer may still have succeeded — check the explorer link above.`);
    console.error(`  Do NOT re-run without confirming on-chain state first.`);
    process.exit(1);
  }

  console.log(`  ✓ Verified. On-chain amount: ${verify.actualAmountNanos} nanos`);
  if (verify.blockHashHex) {
    console.log(`  Block: ${verify.blockHashHex}`);
  } else {
    console.log(`  Block: still in mempool (not yet confirmed — normal for <30s)`);
  }

  console.log("");
  console.log("══════════════════════════════════════════════");
  console.log("  SWEEP COMPLETE");
  console.log(`  Sent:     ${amountDeso} DESO → cold wallet`);
  console.log(`  Tx hash:  ${txHashHex}`);
  console.log("══════════════════════════════════════════════");
  console.log("");
  console.log("ACTION REQUIRED: Log this in docs/SWEEP-LOG.md per SECURITY.md §4 step 7.");
  console.log("");
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
