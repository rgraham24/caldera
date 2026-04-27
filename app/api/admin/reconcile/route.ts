/**
 * P4-5 — POST /api/admin/reconcile
 *
 * Manual + cron-triggered reconciliation. Runs sweep then
 * drift-check on requested audit tables, returns aggregated
 * report.
 *
 * Auth: admin password OR admin DeSo public key (via
 * isAdminAuthorized). Same auth model as resolve-market routes.
 *
 * Auto-detects cron triggering via Vercel's x-vercel-cron header
 * to distinguish "cron" vs "manual" trigger in drift_alerts logs.
 *
 * Body (all fields optional):
 *   - adminPassword: string (or use DeSo pubkey via desoPublicKey)
 *   - desoPublicKey: string
 *   - tables: ["position_payouts" | "creator_claim_payouts"]
 *
 * Response:
 *   {
 *     ok: true,
 *     triggeredBy: "cron" | "manual",
 *     sweepResults: SweepResult[],
 *     driftResults: DriftCheckResult[]
 *   }
 *
 * Coverage matches sweep + drift-check (excludes holder_rewards
 * pending verifyCreatorCoinTransfer primitive).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  sweepPositionPayouts,
  sweepCreatorClaimPayouts,
  type SweepResult,
  type SweepTable,
  type SweepTrigger,
} from "@/lib/reconciliation/sweep";
import {
  driftCheckPositionPayouts,
  driftCheckCreatorClaimPayouts,
  type DriftCheckResult,
} from "@/lib/reconciliation/drift-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUPPORTED_TABLES = [
  "position_payouts",
  "creator_claim_payouts",
] as const;

const ReconcileBody = z.object({
  adminPassword: z.string().optional(),
  desoPublicKey: z.string().optional(),
  tables: z
    .array(z.enum(SUPPORTED_TABLES))
    .min(1)
    .optional(),
});

export async function POST(req: NextRequest) {
  // ── 1. Body parse ───────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", reason: "bad-body" },
      { status: 400 }
    );
  }

  // ── 2. Body validation ──────────────────────────────────────
  let parsed: z.infer<typeof ReconcileBody>;
  try {
    parsed = ReconcileBody.parse(body);
  } catch (e) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        reason: "bad-body",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 400 }
    );
  }
  const { adminPassword, desoPublicKey, tables } = parsed;

  // ── 3. Admin auth ───────────────────────────────────────────
  if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "unauthorized" },
      { status: 401 }
    );
  }

  // ── 4. Platform env sanity ──────────────────────────────────
  if (!process.env.DESO_PLATFORM_PUBLIC_KEY) {
    console.error(
      "[reconcile] DESO_PLATFORM_PUBLIC_KEY missing"
    );
    return NextResponse.json(
      {
        error: "Server misconfigured",
        reason: "platform-wallet-unavailable",
      },
      { status: 503 }
    );
  }

  // ── 5. Trigger source detection ─────────────────────────────
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const triggeredBy: SweepTrigger = isCron ? "cron" : "manual";

  // ── 6. Build supabase client ────────────────────────────────
  const supabase = createServiceClient();

  // ── 7. Determine which tables to process ────────────────────
  const targetTables: SweepTable[] = tables ?? [
    "position_payouts",
    "creator_claim_payouts",
  ];

  // ── 8. Run sweep then drift-check per table, with per-step
  //     try/catch so one failure doesn't kill the whole endpoint
  // ───────────────────────────────────────────────────────────

  const sweepResults: SweepResult[] = [];
  const driftResults: DriftCheckResult[] = [];

  for (const table of targetTables) {
    try {
      let sweepResult: SweepResult;
      if (table === "position_payouts") {
        sweepResult = await sweepPositionPayouts(supabase, {
          triggeredBy,
        });
      } else {
        sweepResult = await sweepCreatorClaimPayouts(supabase, {
          triggeredBy,
        });
      }
      sweepResults.push(sweepResult);
    } catch (e) {
      console.error("[reconcile] sweep failed for table:", table, e);
      sweepResults.push({
        table,
        swept: 0,
        confirmed: 0,
        failed: 0,
        stillPending: 0,
        driftAlerts: 0,
        errors: 1,
      });
    }

    try {
      let driftResult: DriftCheckResult;
      if (table === "position_payouts") {
        driftResult = await driftCheckPositionPayouts(supabase, {
          triggeredBy,
        });
      } else {
        driftResult = await driftCheckCreatorClaimPayouts(supabase, {
          triggeredBy,
        });
      }
      driftResults.push(driftResult);
    } catch (e) {
      console.error("[reconcile] drift-check failed for table:", table, e);
      driftResults.push({
        table,
        claimedRows: 0,
        ledgerSumNanos: "0",
        onchainSumNanos: "0",
        diffNanos: "0",
        toleranceNanos: "0",
        withinThreshold: true,
        unmatched: [],
        errors: 1,
      });
    }
  }

  // ── 9. Return aggregated report ─────────────────────────────
  return NextResponse.json({
    ok: true,
    triggeredBy,
    sweepResults,
    driftResults,
  });
}
