import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: markets } = await supabase
    .from("markets")
    .select("id, yes_price, no_price, total_volume")
    .eq("status", "open");

  if (!markets?.length) return NextResponse.json({ snapshots: 0 });

  const snapshots = markets.map((m) => ({
    market_id: m.id,
    yes_price: m.yes_price ?? 0.5,
    no_price: m.no_price ?? 0.5,
    total_volume: m.total_volume ?? 0,
  }));

  const chunkSize = 100;
  let total = 0;
  for (let i = 0; i < snapshots.length; i += chunkSize) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("market_price_history")
      .insert(snapshots.slice(i, i + chunkSize));
    if (!error) total += Math.min(chunkSize, snapshots.length - i);
  }

  console.log(`[snapshot-prices] Recorded ${total} snapshots`);
  return NextResponse.json({ snapshots: total });
}
