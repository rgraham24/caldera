import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type BuybackEvent = {
  id: string;
  market_id: string;
  market_title: string | null;
  creator_slug: string | null;
  team_slug: string | null;
  league_slug: string | null;
  trade_amount_usd: number;
  personal_buyback_usd: number;
  team_buyback_usd: number;
  league_buyback_usd: number;
  platform_fee_usd: number;
  created_at: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const supabase = await createClient();
  const { slug } = await params;

  // Return buybacks where this slug appears as personal, team, OR league token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("buyback_events")
    .select("*")
    .or(`creator_slug.eq.${slug},team_slug.eq.${slug},league_slug.eq.${slug}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 });

  const events = (data ?? []) as BuybackEvent[];

  // Calculate totals for this slug's token specifically
  const totalBuyback = events.reduce((sum, e) => {
    if (e.creator_slug === slug) return sum + (e.personal_buyback_usd ?? 0);
    if (e.team_slug === slug) return sum + (e.team_buyback_usd ?? 0);
    if (e.league_slug === slug) return sum + (e.league_buyback_usd ?? 0);
    return sum;
  }, 0);

  return NextResponse.json({ events, totalBuyback });
}
