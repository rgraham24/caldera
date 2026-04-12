import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const now = new Date();

  // Fetch all open markets
  const { data: markets } = await supabase
    .from("markets")
    .select("id, created_at, close_at, total_volume, featured_score")
    .eq("status", "open");

  if (!markets?.length) return NextResponse.json({ updated: 0 });

  // Calculate trending score for each market
  const updates = markets.map((m) => {
    const hoursOld = (now.getTime() - new Date(m.created_at ?? 0).getTime()) / 3_600_000;
    const recencyScore = Math.max(0, 1 - hoursOld / 48) * 100;

    let urgencyScore = 0;
    if (m.close_at) {
      const hoursToClose = (new Date(m.close_at).getTime() - now.getTime()) / 3_600_000;
      if (hoursToClose > 0 && hoursToClose <= 24) urgencyScore = 50;
      else if (hoursToClose > 24 && hoursToClose <= 72) urgencyScore = 25;
    }

    const volumeScore = (m.total_volume ?? 0);
    const featuredScore = (m.featured_score ?? 0);
    const trendingScore = volumeScore + recencyScore + urgencyScore + featuredScore;

    return { id: m.id, trending_score: Math.round(trendingScore) };
  });

  // Batch UPDATE in chunks of 50 concurrent calls (upsert fails on NOT NULL columns)
  const chunkSize = 50;
  let totalUpdated = 0;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const results = await Promise.allSettled(
      chunk.map(({ id, trending_score }) =>
        supabase.from("markets").update({ trending_score }).eq("id", id)
      )
    );
    totalUpdated += results.filter(
      (r) => r.status === "fulfilled" && !(r.value as { error: unknown }).error
    ).length;
  }

  console.log(`[update-trending] Updated ${totalUpdated} markets`);
  return NextResponse.json({ updated: totalUpdated, timestamp: now.toISOString() });
}
