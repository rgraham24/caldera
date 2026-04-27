/**
 * P4-6 — GET /api/cron/reconcile
 *
 * Vercel cron handler. Runs every 6 hours via vercel.json schedule.
 * Calls sweep + drift-check libs on all supported audit tables.
 *
 * Auth: Bearer CRON_SECRET (matches resolve-crypto-markets pattern).
 *
 * Uses createServiceClient() (not createClient) because the libs
 * write to drift_alerts and UPDATE position_payouts/creator_claim_payouts
 * which require service role to bypass RLS.
 *
 * For manual admin triggers, use POST /api/admin/reconcile instead.
 *
 * See docs/P4-reconciliation-design.md.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  sweepPositionPayouts,
  sweepCreatorClaimPayouts,
  type SweepResult,
} from "@/lib/reconciliation/sweep";
import {
  driftCheckPositionPayouts,
  driftCheckCreatorClaimPayouts,
  type DriftCheckResult,
} from "@/lib/reconciliation/drift-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  // ── Auth ────────────────────────────────────────────────────
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Platform env sanity ────────────────────────────────────
  if (!process.env.DESO_PLATFORM_PUBLIC_KEY) {
    console.error(
      "[cron/reconcile] DESO_PLATFORM_PUBLIC_KEY missing — abort"
    );
    return NextResponse.json(
      {
        error: "Server misconfigured",
        reason: "platform-wallet-unavailable",
      },
      { status: 503 }
    );
  }

  const supabase = createServiceClient();

  // ── Per-table sweep + drift, isolated try/catch ─────────────
  const sweepResults: SweepResult[] = [];
  const driftResults: DriftCheckResult[] = [];

  // position_payouts
  try {
    sweepResults.push(
      await sweepPositionPayouts(supabase, { triggeredBy: "cron" })
    );
  } catch (e) {
    console.error("[cron/reconcile] sweep position_payouts threw:", e);
    sweepResults.push({
      table: "position_payouts",
      swept: 0,
      confirmed: 0,
      failed: 0,
      stillPending: 0,
      driftAlerts: 0,
      errors: 1,
    });
  }

  try {
    driftResults.push(
      await driftCheckPositionPayouts(supabase, { triggeredBy: "cron" })
    );
  } catch (e) {
    console.error("[cron/reconcile] drift position_payouts threw:", e);
    driftResults.push({
      table: "position_payouts",
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

  // creator_claim_payouts
  try {
    sweepResults.push(
      await sweepCreatorClaimPayouts(supabase, { triggeredBy: "cron" })
    );
  } catch (e) {
    console.error("[cron/reconcile] sweep creator_claim_payouts threw:", e);
    sweepResults.push({
      table: "creator_claim_payouts",
      swept: 0,
      confirmed: 0,
      failed: 0,
      stillPending: 0,
      driftAlerts: 0,
      errors: 1,
    });
  }

  try {
    driftResults.push(
      await driftCheckCreatorClaimPayouts(supabase, { triggeredBy: "cron" })
    );
  } catch (e) {
    console.error("[cron/reconcile] drift creator_claim_payouts threw:", e);
    driftResults.push({
      table: "creator_claim_payouts",
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

  return NextResponse.json({
    ok: true,
    triggeredBy: "cron",
    sweepResults,
    driftResults,
  });
}
