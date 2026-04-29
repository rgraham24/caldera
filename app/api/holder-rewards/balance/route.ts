/**
 * P3-4.3 — GET /api/holder-rewards/balance
 *
 * Returns the authenticated holder's pending rewards, aggregated
 * by token. Used by the portfolio page rewards section.
 *
 * Auth: P2-1 session cookie. 401 if missing.
 * Rate limit: P2-3 with bucket prefix "rewards-balance:".
 *
 * See docs/P3-4-holder-rewards-claim-design.md.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { getTokenSymbolDisplay } from "@/lib/utils/tokenSymbol";

export const dynamic = "force-dynamic";

type PendingRow = {
  holder_deso_public_key: string;
  token_slug: string;
  token_type: string;
  row_count: number;
  total_usd: string; // numeric → text via the view
};

type CreatorRow = {
  slug: string;
  deso_public_key: string | null;
};

type ResponseEntry = {
  tokenSlug: string;
  tokenType: string;
  displayLabel: string;
  rowCount: number;
  totalUsd: string;
  creatorPublicKey: string | null;
};

export async function GET(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────
  const authed = getAuthenticatedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const desoPublicKey = authed.publicKey;

  // ── 2. Rate limit ──────────────────────────────────────────
  const rl = await checkRateLimit(
    `rewards-balance:${desoPublicKey}`,
    "trades"
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      }
    );
  }

  // ── 3. Fetch pending rewards from view ─────────────────────
  const supabase = createServiceClient();
  // View not yet in generated types — cast to escape type-checking.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pendingRows, error: viewErr } = (await (supabase as any)
    .from("v_holder_rewards_pending_by_user")
    .select("*")
    .eq("holder_deso_public_key", desoPublicKey)) as {
    data: PendingRow[] | null;
    error: { message: string } | null;
  };

  if (viewErr) {
    console.error("[rewards/balance] view query failed:", viewErr);
    return NextResponse.json(
      { error: "Failed to fetch rewards" },
      { status: 500 }
    );
  }

  // Empty is a valid response (most users have no rewards yet)
  if (!pendingRows || pendingRows.length === 0) {
    return NextResponse.json({ pending: [] });
  }

  // ── 4. Batch-load creator metadata for display ─────────────
  const slugs = Array.from(new Set(pendingRows.map((r) => r.token_slug)));
  const { data: creators, error: creatorsErr } = (await supabase
    .from("creators")
    .select("slug, deso_public_key")
    .in("slug", slugs)) as unknown as {
    data: CreatorRow[] | null;
    error: { message: string } | null;
  };

  if (creatorsErr) {
    console.error("[rewards/balance] creators query failed:", creatorsErr);
    return NextResponse.json(
      { error: "Failed to fetch token metadata" },
      { status: 500 }
    );
  }

  const creatorBySlug = new Map<string, CreatorRow>();
  for (const c of creators ?? []) creatorBySlug.set(c.slug, c);

  // ── 5. Compose response ────────────────────────────────────
  const pending: ResponseEntry[] = pendingRows.map((row) => {
    const c = creatorBySlug.get(row.token_slug);
    return {
      tokenSlug: row.token_slug,
      tokenType: row.token_type,
      displayLabel: getTokenSymbolDisplay({ slug: row.token_slug }),
      rowCount: row.row_count,
      totalUsd: row.total_usd,
      creatorPublicKey: c?.deso_public_key ?? null,
    };
  });

  return NextResponse.json({ pending });
}
