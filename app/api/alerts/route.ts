import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const alertSchema = z.object({
  creator_id: z.string().uuid(),
  deso_username: z.string(),
  alert_type: z.enum(["above", "below"]),
  target_price_usd: z.number().positive(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_alerts")
    .select("*, creator:creators(name, slug, creator_coin_price, deso_public_key)")
    .eq("user_id", user.id)
    .eq("is_triggered", false)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = alertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: creator } = await supabase
    .from("creators")
    .select("creator_coin_price")
    .eq("id", parsed.data.creator_id)
    .single();

  const { data, error } = await supabase.from("user_alerts").insert({
    user_id: user.id,
    creator_id: parsed.data.creator_id,
    deso_username: parsed.data.deso_username,
    alert_type: parsed.data.alert_type,
    target_price_usd: parsed.data.target_price_usd,
    current_price_at_creation: (creator as { creator_coin_price: number } | null)?.creator_coin_price || 0,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
