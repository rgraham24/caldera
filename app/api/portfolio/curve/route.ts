import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";
import { buildEquityCurve } from "@/lib/portfolio/equity-curve";

/**
 * GET /api/portfolio/curve?desoPublicKey=...
 *
 * Cumulative cash-invested series for the last 30 days. Returns
 * { points: [{ date, value }], tradeCount, currentInvested }.
 *
 * Auth: same pattern as /api/portfolio — session cookie verify +
 * ownership check (the desoPublicKey query param must match the
 * cookie's verified pubkey).
 */
export async function GET(req: NextRequest) {
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

  const requestedPublicKey = req.nextUrl.searchParams.get("desoPublicKey");
  if (!requestedPublicKey) {
    return NextResponse.json({ error: "desoPublicKey required" }, { status: 400 });
  }
  if (requestedPublicKey !== session.publicKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: dbUser } = await supabase
    .from("users")
    .select("id")
    .eq("deso_public_key", session.publicKey)
    .maybeSingle();

  if (!dbUser) {
    return NextResponse.json({ data: { points: [], tradeCount: 0, currentInvested: 0 } });
  }

  const result = await buildEquityCurve(supabase, dbUser.id);
  return NextResponse.json({ data: result });
}
