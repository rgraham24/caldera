import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkGenerateAndInsert } from "@/lib/admin/pipeline";

/**
 * GET /api/cron/generate-markets
 * Daily cron: picks 5 creators with low market counts and generates markets for each.
 * Also triggers generate-climate for category market freshness.
 * Auth: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET ?? "caldera-cron-2026";
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const supabase = await createClient();

  // Pick 5 random active creators with fewer than 20 markets
  const { data: creators } = await supabase
    .from("creators")
    .select("id, slug, name, markets_count")
    .in("token_status", ["active_unverified", "active_verified", "claimed"])
    .lt("markets_count", 20)
    .not("name", "is", null)
    .limit(50);

  if (!creators || creators.length === 0) {
    return NextResponse.json({ success: true, marketsCreated: 0, note: "No eligible creators" });
  }

  // Shuffle and pick 5
  const shuffled = [...creators].sort(() => Math.random() - 0.5).slice(0, 5);
  const names = shuffled.map((c) => c.name);

  let marketsCreated = 0;
  try {
    marketsCreated = await bulkGenerateAndInsert(names, apiKey, supabase);
  } catch (err) {
    console.error("[cron/generate-markets] bulkGenerateAndInsert error:", err);
  }

  // Refresh markets_count for affected creators
  for (const creator of shuffled) {
    try {
      const { count } = await supabase
        .from("markets")
        .select("id", { count: "exact", head: true })
        .eq("creator_slug", creator.slug)
        .neq("status", "archived");
      await supabase
        .from("creators")
        .update({ markets_count: count ?? 0 })
        .eq("slug", creator.slug);
    } catch { /* non-critical */ }
  }

  return NextResponse.json({
    success: true,
    marketsCreated,
    creators: shuffled.map((c) => c.slug),
  });
}
