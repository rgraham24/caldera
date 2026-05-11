import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";

/**
 * POST /api/portfolio/coins/cost-basis
 *   body: { deso_public_key, coins_held, avg_price_usd }
 *   → upserts a source='manual' row into user_coin_purchases so a
 *     user can self-report a cost basis for a creator coin they
 *     bought outside Caldera.
 *
 * DELETE /api/portfolio/coins/cost-basis
 *   body: { deso_public_key }
 *   → wipes all source='manual' rows for this user+creator,
 *     reverting the holding to no-cost-basis state.
 *
 * Auth: same cookie+pubkey-ownership pattern as /api/portfolio.
 *
 * deso_public_key is used (not creator_id) so the route is robust
 * to duplicate creator rows for the same pubkey — we resolve to
 * whichever creator row Postgres returns first and use that.
 */

type AuthOk = { userId: string };
type AuthFail = { response: NextResponse };

async function authAndResolveUser(req: NextRequest): Promise<AuthOk | AuthFail> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const signingKey = process.env.COOKIE_SIGNING_KEY ?? "";
  if (!cookie || !signingKey) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  let session;
  try {
    session = await verifyCookie(cookie, signingKey);
  } catch {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!session) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbUser } = await (supabase as any)
    .from("users")
    .select("id")
    .eq("deso_public_key", session.publicKey)
    .maybeSingle();
  if (!dbUser?.id) {
    return { response: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }
  return { userId: dbUser.id };
}

async function resolveCreatorIds(desoPublicKey: string): Promise<string[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .from("creators")
    .select("id")
    .eq("deso_public_key", desoPublicKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((rows ?? []) as Array<any>).map((r) => r.id as string);
}

export async function POST(req: NextRequest) {
  const auth = await authAndResolveUser(req);
  if ("response" in auth) return auth.response;

  let body: { deso_public_key?: unknown; coins_held?: unknown; avg_price_usd?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const desoPk = typeof body.deso_public_key === "string" ? body.deso_public_key.trim() : "";
  const coinsHeld = Number(body.coins_held);
  const avgPriceUsd = Number(body.avg_price_usd);

  if (!desoPk) {
    return NextResponse.json({ error: "deso_public_key required" }, { status: 400 });
  }
  if (!Number.isFinite(coinsHeld) || coinsHeld <= 0) {
    return NextResponse.json({ error: "coins_held must be > 0" }, { status: 400 });
  }
  if (!Number.isFinite(avgPriceUsd) || avgPriceUsd <= 0) {
    return NextResponse.json({ error: "avg_price_usd must be > 0" }, { status: 400 });
  }

  const creatorIds = await resolveCreatorIds(desoPk);
  if (creatorIds.length === 0) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }
  // If duplicate rows exist, pick the first — the read path aggregates
  // across all of them by pubkey so the choice is observation-equivalent.
  const creatorId = creatorIds[0];

  const supabase = createServiceClient();

  // Idempotency: delete any existing source='manual' rows for this
  // user+creator before inserting, so save-new and edit share one
  // code path. Caldera-tracked rows (source='caldera') are untouched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delErr } = await (supabase as any)
    .from("user_coin_purchases")
    .delete()
    .eq("user_id", auth.userId)
    .in("creator_id", creatorIds)
    .eq("source", "manual");
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insErr } = await (supabase as any)
    .from("user_coin_purchases")
    .insert({
      user_id: auth.userId,
      creator_id: creatorId,
      coins_purchased: coinsHeld,
      price_per_coin_usd: avgPriceUsd,
      deso_price_at_purchase: 0,
      source: "manual",
    })
    .select()
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: inserted });
}

export async function DELETE(req: NextRequest) {
  const auth = await authAndResolveUser(req);
  if ("response" in auth) return auth.response;

  let body: { deso_public_key?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const desoPk = typeof body.deso_public_key === "string" ? body.deso_public_key.trim() : "";
  if (!desoPk) {
    return NextResponse.json({ error: "deso_public_key required" }, { status: 400 });
  }

  const creatorIds = await resolveCreatorIds(desoPk);
  if (creatorIds.length === 0) {
    // Nothing to clear; treat as success.
    return NextResponse.json({ data: { deleted: 0 } });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (supabase as any)
    .from("user_coin_purchases")
    .delete({ count: "exact" })
    .eq("user_id", auth.userId)
    .in("creator_id", creatorIds)
    .eq("source", "manual");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: count ?? 0 } });
}
