import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const now = Date.now();

  // Fetch all open markets with fields needed for composite scoring
  const { data: markets } = await supabase
    .from("markets")
    .select("id, created_at, resolve_at, total_volume, yes_price, category, featured_score")
    .eq("status", "open");

  if (!markets?.length) return NextResponse.json({ updated: 0 });

  const updates = markets.map((m) => {
    const ageHours = (now - new Date(m.created_at ?? 0).getTime()) / (1000 * 60 * 60);
    const daysUntilResolve = m.resolve_at
      ? (new Date(m.resolve_at).getTime() - now) / (1000 * 60 * 60 * 24)
      : 999;

    const volumeScore = Math.log10((m.total_volume || 0) + 1) * 1000;
    const recencyScore =
      ageHours < 48 ? 500 : ageHours < 168 ? 200 : ageHours < 720 ? 50 : 0;
    const movementScore = Math.abs((m.yes_price || 0.5) - 0.5) * 200;
    const expiryScore =
      daysUntilResolve < 7 ? 300 : daysUntilResolve < 30 ? 100 : 0;
    const breakingBoost =
      ageHours < 48 && m.category !== "Crypto" ? 400 : 0;

    const score =
      volumeScore + recencyScore + movementScore + expiryScore + breakingBoost;

    return { id: m.id, trending_score: Math.round(score) };
  });

  // Process in batches of 100
  const batchSize = 100;
  let totalUpdated = 0;
  for (let i = 0; i < updates.length; i += batchSize) {
    const chunk = updates.slice(i, i + batchSize);
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
  return NextResponse.json({
    updated: totalUpdated,
    timestamp: new Date(now).toISOString(),
  });
}
