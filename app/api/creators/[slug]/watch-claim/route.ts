import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

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

  const { data: dbUser } = await (supabase as any)
    .from("users")
    .select("id")
    .eq("deso_public_key", session.publicKey)
    .maybeSingle();

  if (!dbUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("slug", slug)
    .single();

  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await (supabase as any).from("creator_claim_watchers").upsert({
    creator_id: creator.id,
    user_id: dbUser.id,
  }, { onConflict: "creator_id,user_id" });

  // Update count
  const { count } = await (supabase as any)
    .from("creator_claim_watchers")
    .select("*", { count: "exact", head: true })
    .eq("creator_id", creator.id);

  await supabase
    .from("creators")
    .update({ claim_watcher_count: count || 0 })
    .eq("id", creator.id);

  return NextResponse.json({ data: { watching: true, count: count || 0 } });
}
