import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkGenerateAndInsert } from "@/lib/admin/pipeline";

/**
 * GET /api/cron/generate-markets
 * Daily 9am cron — generates fresh markets across all active categories.
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
  const breakdown: Record<string, number> = {
    sports: 0,
    entertainment: 0,
    politics: 0,
    companies: 0,
    climate: 0,
    creators: 0,
  };

  // ── Sports: 3 markets ──
  const { data: sportsCreators } = await supabase
    .from("creators")
    .select("id, slug, name")
    .or(
      "category.ilike.%Sports%,slug.in.(kingjames,chiefs,nba,nfl,curry)"
    )
    .not("name", "is", null)
    .limit(20);

  if (sportsCreators && sportsCreators.length > 0) {
    const picks = [...sportsCreators].sort(() => Math.random() - 0.5).slice(0, 3);
    try {
      breakdown.sports = await bulkGenerateAndInsert(
        picks.map((c) => c.name),
        apiKey,
        supabase
      );
    } catch (err) {
      console.error("[cron/generate-markets] sports error:", err);
    }
  }

  // ── Entertainment: 3 markets ──
  const { data: entCreators } = await supabase
    .from("creators")
    .select("id, slug, name")
    .ilike("category", "%Entertainment%")
    .not("name", "is", null)
    .limit(20);

  if (entCreators && entCreators.length > 0) {
    const picks = [...entCreators].sort(() => Math.random() - 0.5).slice(0, 3);
    try {
      breakdown.entertainment = await bulkGenerateAndInsert(
        picks.map((c) => c.name),
        apiKey,
        supabase
      );
    } catch (err) {
      console.error("[cron/generate-markets] entertainment error:", err);
    }
  }

  // ── Politics: 2 markets ──
  const { data: polCreators } = await supabase
    .from("creators")
    .select("id, slug, name")
    .ilike("category", "%Politics%")
    .not("name", "is", null)
    .limit(20);

  if (polCreators && polCreators.length > 0) {
    const picks = [...polCreators].sort(() => Math.random() - 0.5).slice(0, 2);
    try {
      breakdown.politics = await bulkGenerateAndInsert(
        picks.map((c) => c.name),
        apiKey,
        supabase
      );
    } catch (err) {
      console.error("[cron/generate-markets] politics error:", err);
    }
  }

  // ── Companies: 2 markets ──
  const { data: compCreators } = await supabase
    .from("creators")
    .select("id, slug, name")
    .in("slug", ["spacex", "tesla", "apple", "amazon", "google"])
    .not("name", "is", null)
    .limit(10);

  if (compCreators && compCreators.length > 0) {
    const picks = [...compCreators].sort(() => Math.random() - 0.5).slice(0, 2);
    try {
      breakdown.companies = await bulkGenerateAndInsert(
        picks.map((c) => c.name),
        apiKey,
        supabase
      );
    } catch (err) {
      console.error("[cron/generate-markets] companies error:", err);
    }
  }

  // ── Climate: 1 market via generate-climate endpoint ──
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://caldera.market";
    const climateRes = await fetch(`${appUrl}/api/admin/generate-climate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD ?? "caldera-admin-2026", count: 1 }),
    });
    if (climateRes.ok) {
      const d = await climateRes.json().catch(() => ({}));
      breakdown.climate = d.marketsCreated ?? 1;
    }
  } catch (err) {
    console.error("[cron/generate-markets] climate error:", err);
  }

  // ── Creators: 5 random active creators with low market count ──
  const { data: creatorPicks } = await supabase
    .from("creators")
    .select("id, slug, name, markets_count")
    .in("token_status", ["active_unverified", "active_verified"])
    .lt("markets_count", 15)
    .not("name", "is", null)
    .limit(50);

  if (creatorPicks && creatorPicks.length > 0) {
    const picks = [...creatorPicks].sort(() => Math.random() - 0.5).slice(0, 5);
    try {
      breakdown.creators = await bulkGenerateAndInsert(
        picks.map((c) => c.name),
        apiKey,
        supabase
      );
      // Refresh markets_count for affected creators
      for (const creator of picks) {
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
    } catch (err) {
      console.error("[cron/generate-markets] creators error:", err);
    }
  }

  const totalGenerated = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    success: true,
    generated: totalGenerated,
    breakdown,
  });
}
