import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkGenerateAndInsert } from "@/lib/admin/pipeline";
import { fetchUpcomingGames } from "@/lib/resolution/sports-resolver";

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
    espn_schedule: 0,
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

  // ── ESPN Schedule: generate game-specific markets from upcoming fixtures ──
  try {
    const upcomingGames = await fetchUpcomingGames(["nfl", "nba", "mlb", "nhl"], 2);

    if (upcomingGames.length > 0) {
      // Fetch existing market titles to avoid duplicates
      const { data: existingMarkets } = await supabase
        .from("markets")
        .select("title")
        .eq("category", "Sports")
        .eq("status", "open")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const existingTitles = new Set(
        (existingMarkets ?? []).map((m) => m.title.toLowerCase())
      );

      const newGames = upcomingGames.filter((g) => {
        const candidateTitle = `Will the ${g.homeTeam} beat the ${g.awayTeam}?`.toLowerCase();
        const candidateTitle2 = `Will the ${g.awayTeam} beat the ${g.homeTeam}?`.toLowerCase();
        return !existingTitles.has(candidateTitle) && !existingTitles.has(candidateTitle2);
      });

      // Cap at 5 new ESPN-sourced markets per cron run
      const toCreate = newGames.slice(0, 5);
      let espnCreated = 0;

      for (const game of toCreate) {
        try {
          // Resolve date = game date + 4 hours (gives time for game to finish)
          const resolveAt = new Date(game.gameDate);
          resolveAt.setHours(resolveAt.getHours() + 4);

          const slug = `${game.homeTeam.toLowerCase().replace(/[^a-z0-9]/g, "-")}-vs-${game.awayTeam.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${game.gameDate.toISOString().slice(0, 10)}-${Date.now()}`;

          const sportLabel = game.sport.toUpperCase();
          const { error } = await supabase.from("markets").insert({
            title: `Will the ${game.homeTeam} beat the ${game.awayTeam}?`,
            slug,
            description: `${sportLabel} game: ${game.awayTeam} @ ${game.homeTeam} on ${game.gameDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}. Resolves YES if the home team (${game.homeTeam}) wins.`,
            category: "Sports",
            status: "open",
            resolve_at: resolveAt.toISOString(),
            yes_price: 0.5,
            no_price: 0.5,
            yes_pool: 1000,
            no_pool: 1000,
            liquidity: 1000,
            total_volume: 0,
            trending_score: 50,
            featured_score: 0,
            category_token_slug: "caldera-sports",
          });

          if (!error) espnCreated++;
        } catch (insertErr) {
          console.error("[cron/generate-markets] ESPN insert error:", insertErr);
        }
      }

      breakdown.espn_schedule = espnCreated;
    }
  } catch (err) {
    console.error("[cron/generate-markets] ESPN schedule error:", err);
  }

  const totalGenerated = Object.values(breakdown).reduce((a, b) => a + b, 0);

  // ── Daily photo refresh — top 10 creators by market count ──
  let photosRefreshed = 0;
  try {
    const { data: topCreators } = await supabase
      .from("creators")
      .select("id, slug, deso_public_key, image_url")
      .not("deso_public_key", "is", null)
      .order("markets_count", { ascending: false })
      .limit(10);

    for (const creator of topCreators ?? []) {
      if (!creator.deso_public_key) continue;
      try {
        const res = await fetch("https://node.deso.org/api/v0/get-single-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ PublicKeyBase58Check: creator.deso_public_key }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const data = await res.json() as { Profile?: { Username?: string; ExtraData?: { LargeProfilePicURL?: string } } };
        const profile = data?.Profile;
        if (!profile) continue;

        const freshImageUrl =
          profile.ExtraData?.LargeProfilePicURL ||
          `https://node.deso.org/api/v0/get-single-profile-picture/${creator.deso_public_key}`;

        if (freshImageUrl && freshImageUrl !== creator.image_url) {
          await supabase
            .from("creators")
            .update({ image_url: freshImageUrl, deso_username: profile.Username ?? undefined })
            .eq("id", creator.id);
          photosRefreshed++;
        }

        await new Promise((r) => setTimeout(r, 150));
      } catch { /* non-critical — skip this creator */ }
    }
  } catch (err) {
    console.error("[cron/generate-markets] photo refresh error:", err);
  }

  return NextResponse.json({
    success: true,
    generated: totalGenerated,
    breakdown,
    photosRefreshed,
  });
}
