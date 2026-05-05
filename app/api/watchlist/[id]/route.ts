import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbUser } = await (supabase as any)
    .from("users")
    .select("id")
    .eq("deso_public_key", session.publicKey)
    .maybeSingle();

  if (!dbUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", id)
    .eq("user_id", dbUser.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: true } });
}
