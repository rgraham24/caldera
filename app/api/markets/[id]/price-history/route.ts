import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const range = req.nextUrl.searchParams.get("range") ?? "7d";
  const supabase = await createClient();

  const hoursMap: Record<string, number> = {
    "1d": 24, "7d": 168, "30d": 720, "all": 99999,
  };
  const hours = hoursMap[range] ?? 168;
  const since = new Date(Date.now() - hours * 3600000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("market_price_history")
    .select("yes_price, no_price, total_volume, recorded_at")
    .eq("market_id", id)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });

  // If no history, return synthetic data based on current market
  if (!data?.length) {
    const { data: market } = await supabase
      .from("markets")
      .select("yes_price, no_price, total_volume, created_at")
      .eq("id", id)
      .single();

    if (market) {
      const start = new Date(market.created_at ?? Date.now()).getTime();
      const end = Date.now();
      const step = (end - start) / 20;
      const basePrice = market.yes_price ?? 0.5;
      const synthetic = Array.from({ length: 20 }, (_, i) => {
        const t = start + step * i;
        const noise = (Math.random() - 0.5) * 0.08;
        const price = Math.max(0.05, Math.min(0.95, basePrice + noise * (i / 20)));
        return {
          yes_price: i === 19 ? market.yes_price : price,
          no_price: i === 19 ? market.no_price : 1 - price,
          total_volume: (market.total_volume ?? 0) * (i / 19),
          recorded_at: new Date(t).toISOString(),
        };
      });
      return NextResponse.json({ data: synthetic, synthetic: true });
    }
  }

  return NextResponse.json({ data: data ?? [] });
}
