import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("platform_config")
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  // ── Auth: cookie-direct verify (F-6 pattern) ─────────────
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
  const desoPublicKey = session.publicKey;

  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbUser } = await (supabase as any)
    .from("users")
    .select("id, is_admin")
    .eq("deso_public_key", desoPublicKey)
    .maybeSingle();

  if (!dbUser?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, string> = await req.json();

  for (const [key, value] of Object.entries(updates)) {
    await supabase
      .from("platform_config")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);
  }

  return NextResponse.json({ data: { updated: true } });
}
