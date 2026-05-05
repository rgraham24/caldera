import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";
import { z } from "zod";

const alertSchema = z.object({
  creator_id: z.string().uuid(),
  deso_username: z.string(),
  alert_type: z.enum(["above", "below"]),
  target_price_usd: z.number().positive(),
});

async function authedUserId(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const signingKey = process.env.COOKIE_SIGNING_KEY ?? "";
  if (!cookie || !signingKey) return null;
  let session;
  try {
    session = await verifyCookie(cookie, signingKey);
  } catch {
    return null;
  }
  if (!session) return null;

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbUser } = await (supabase as any)
    .from("users")
    .select("id")
    .eq("deso_public_key", session.publicKey)
    .maybeSingle();
  return dbUser?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await authedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_alerts")
    .select("*, creator:creators(name, slug, creator_coin_price, deso_public_key)")
    .eq("user_id", userId)
    .eq("is_triggered", false)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const userId = await authedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = alertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: creator } = await supabase
    .from("creators")
    .select("creator_coin_price")
    .eq("id", parsed.data.creator_id)
    .single();

  const { data, error } = await supabase.from("user_alerts").insert({
    user_id: userId,
    creator_id: parsed.data.creator_id,
    deso_username: parsed.data.deso_username,
    alert_type: parsed.data.alert_type,
    target_price_usd: parsed.data.target_price_usd,
    current_price_at_creation: (creator as { creator_coin_price: number } | null)?.creator_coin_price || 0,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
