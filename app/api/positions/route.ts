import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";

/**
 * GET /api/positions?marketId=...&desoPublicKey=...
 * Returns the requester's open positions for a given market as an array.
 * A user may have both YES and NO positions; both are returned.
 */
export async function GET(req: NextRequest) {
  // ── Auth (P2-1 cookie, F-6 direct-verify pattern) ─────────────
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const signingKey = process.env.COOKIE_SIGNING_KEY ?? "";
  if (!cookie || !signingKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let session;
  try {
    session = await verifyCookie(cookie, signingKey);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const verifiedPublicKey = session.publicKey;

  // ── Param validation + ownership check ────────────────────────
  const { searchParams } = new URL(req.url);
  const marketId = searchParams.get("marketId");
  const requestedPublicKey = searchParams.get("desoPublicKey");

  if (!marketId || !requestedPublicKey) {
    return NextResponse.json({ error: "marketId and desoPublicKey required" }, { status: 400 });
  }
  if (requestedPublicKey !== verifiedPublicKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  // Look up user by DeSo public key
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("deso_public_key", verifiedPublicKey)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ data: [] });
  }

  // Multi-row fetch: a user may hold both YES and NO positions on the
  // same market simultaneously. Return all open ones.
  const { data: positions } = await supabase
    .from("positions")
    .select("side, quantity, avg_entry_price, total_cost, unrealized_pnl_cached")
    .eq("market_id", marketId)
    .eq("user_id", user.id)
    .eq("status", "open");

  if (!positions || positions.length === 0) {
    return NextResponse.json({ data: [] });
  }

  return NextResponse.json({
    data: positions.map((p) => ({
      side: p.side,
      shares: p.quantity,
      avgPrice: p.avg_entry_price,
      totalCost: p.total_cost,
      unrealizedPnl: p.unrealized_pnl_cached,
    })),
  });
}
