import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";

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

  // ── Ownership check ───────────────────────────────────────────
  const requestedPublicKey = req.nextUrl.searchParams.get("desoPublicKey");
  if (!requestedPublicKey) {
    return NextResponse.json({ error: "desoPublicKey required" }, { status: 400 });
  }
  if (requestedPublicKey !== verifiedPublicKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: dbUser } = await supabase
    .from("users")
    .select("id")
    .eq("deso_public_key", verifiedPublicKey)
    .single();

  if (!dbUser) {
    return NextResponse.json({ data: [] });
  }

  const { data: positions, error } = await supabase
    .from("positions")
    .select("*, market:markets(*)")
    .eq("user_id", dbUser.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: positions });
}
