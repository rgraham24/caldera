/**
 * GET /api/admin/treasury
 *
 * Returns a TreasurySnapshot: the platform wallet's real-time balance
 * vs. liabilities across DESO and every creator coin with pending
 * holder rewards.
 *
 * Auth: Authorization: Bearer <admin_password>
 *   Accepts the hardcoded admin password or ADMIN_PASSWORD env var
 *   (same credentials as other admin routes, via isAdminAuthorized).
 *
 * Response 200:
 *   { ok: true, snapshot: TreasurySnapshot }
 *   All bigint fields are serialized as decimal strings.
 *
 * Response 401:
 *   { ok: false, error: 'unauthorized' }
 *
 * Response 500:
 *   { ok: false, error: 'internal', message: string }
 *
 * Read-only. Idempotent. No body required.
 * Stream 2 Phase 1 — backend math only; UI deferred to Phase 2.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { computePlatformLiability } from "@/lib/finance/liability";

export const dynamic = "force-dynamic";

// ─── Bigint serialization ─────────────────────────────────────────────────────

/**
 * Recursively walk an object and convert every bigint to a string.
 * Returns a new object — does not mutate the input.
 * Used to make TreasurySnapshot JSON-serializable.
 */
function serializeBigInts(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = serializeBigInts(v);
    }
    return result;
  }
  return value;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // 1. Parse Authorization: Bearer <password>
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const password = bearerMatch ? bearerMatch[1] : undefined;

    // 2. Auth check
    if (!isAdminAuthorized(password)) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    // 3. Compute snapshot
    const supabase = createServiceClient();
    const snapshot = await computePlatformLiability(supabase);

    // 4. Serialize bigints → strings (JSON.stringify cannot handle bigint)
    const serialized = serializeBigInts(snapshot);

    return NextResponse.json({ ok: true, snapshot: serialized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[GET /api/admin/treasury] error:", error);
    return NextResponse.json(
      { ok: false, error: "internal", message },
      { status: 500 }
    );
  }
}
