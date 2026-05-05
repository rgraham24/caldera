import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";
import { z } from "zod";

const watchlistSchema = z.object({
  entityType: z.enum(["market", "creator", "user"]),
  entityId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json();
    const parsed = watchlistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("watchlists")
      .insert({
        user_id: dbUser.id,
        entity_type: parsed.data.entityType,
        entity_id: parsed.data.entityId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
