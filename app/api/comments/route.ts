import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";

const commentSchema = z.object({
  marketId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
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

  // ── Body validation ──────────────────────────────────────
  let parsed: z.infer<typeof commentSchema>;
  try {
    const json = await req.json();
    parsed = commentSchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // ── Resolve Caldera users.id from DeSo public key ────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userQ = (await (supabase as any)
    .from("users")
    .select("id")
    .eq("deso_public_key", desoPublicKey)
    .maybeSingle()) as {
    data: { id: string } | null;
    error: { message: string } | null;
  };

  if (userQ.error || !userQ.data) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Insert comment ───────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("market_comments")
    .insert({
      market_id: parsed.marketId,
      user_id: userQ.data.id,
      body: parsed.body,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
