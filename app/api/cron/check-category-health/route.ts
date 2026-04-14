import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/check-category-health
 * Daily 8am UTC cron — counts open markets per category and tops up any that fall
 * below minimum thresholds by generating fresh markets via Claude.
 * Auth: Bearer <CRON_SECRET>
 */

// ── Category minimums (Crypto is managed by its own cron) ───────────────────
const CATEGORY_MINIMUMS: Record<string, number> = {
  Sports: 30,
  Entertainment: 30,
  Creators: 20,
  Music: 15,
  Politics: 15,
  Tech: 15,
  Companies: 15,
  Climate: 10,
};

// ── Category token slugs ─────────────────────────────────────────────────────
const CATEGORY_TOKEN: Record<string, string> = {
  Sports: "caldera-sports",
  Entertainment: "caldera-entertainment",
  Music: "caldera-music",
  Politics: "caldera-politics",
  Tech: "caldera-tech",
  Companies: "caldera-companies",
  Climate: "caldera-climate",
  Creators: "caldera-creators",
};

// ── Per-category Claude prompts ──────────────────────────────────────────────
function buildSystemPrompt(category: string, count: number, today: string): string {
  const topicMap: Record<string, string> = {
    Sports: `professional sports outcomes — NFL, NBA, MLB, NHL, soccer, tennis, golf, MMA, or Olympic events.
Topics: game results, season records, award winners, trades, retirements, milestone achievements`,
    Entertainment: `film, TV, streaming, celebrity, award shows, and pop culture.
Topics: box office records, streaming hits, award winners, celebrity relationships, show renewals/cancellations, viral moments`,
    Creators: `online creators, streamers, YouTubers, TikTokers, podcasters, and influencers.
Topics: subscriber milestones, platform changes, controversies, collaborations, sponsorship deals, platform bans`,
    Music: `music industry outcomes — chart positions, sales, tours, awards, albums, and artists.
Topics: chart performance, Grammy/Billboard outcomes, tour announcements, streaming records, artist collaborations`,
    Politics: `political events, elections, legislation, and government decisions globally.
Topics: election outcomes, bill passage, approval ratings, policy changes, geopolitical events, diplomatic agreements`,
    Tech: `technology industry events, product launches, company milestones, and regulatory decisions.
Topics: AI capabilities, product releases, IPOs, acquisitions, regulatory rulings, market share shifts`,
    Companies: `public and private company performance, business milestones, and corporate events.
Topics: earnings beats/misses, stock price milestones, product launches, leadership changes, acquisitions`,
    Climate: `climate change, environmental policy, clean energy, and sustainability outcomes.
Topics: carbon targets, renewable energy milestones, climate legislation, extreme weather records, corporate ESG commitments`,
  };

  const topics = topicMap[category] ?? `${category.toLowerCase()} events and milestones`;

  return `You are a prediction market architect for Caldera. Generate exactly ${count} binary prediction markets about ${topics}.

Rules:
- Binary Yes/No markets only with crystal-clear resolution criteria
- Resolve within 30-90 days of today (${today})
- Titles must be punchy, specific, and 6-12 words
- No duplicate or near-duplicate titles
- category MUST be "${category}" (exactly)
- Make them timely and newsworthy — things people actually want to bet on

Return ONLY a valid JSON array, no markdown:
[
  {
    "title": "short catchy title",
    "description": "1-2 sentences on why this is timely",
    "category": "${category}",
    "resolution_criteria": "specific verifiable source and threshold",
    "resolve_at": "ISO date string within 30-90 days of ${today}"
  }
]`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 80);
}

function uniqueSlug(base: string): string {
  return `${base}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

type ClaudeMarket = {
  title: string;
  description: string;
  category: string;
  resolution_criteria: string;
  resolve_at: string;
};

async function generateMarketsForCategory(
  category: string,
  count: number,
  apiKey: string,
  today: string
): Promise<ClaudeMarket[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: buildSystemPrompt(category, count, today),
      messages: [{ role: "user", content: `Generate ${count} fresh prediction markets for the ${category} category. Today is ${today}.` }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  }

  const aiData = await res.json();
  const text: string = aiData.content?.[0]?.text ?? "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  const jsonStr = cleaned.startsWith("[") ? cleaned : (cleaned.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
  return JSON.parse(jsonStr) as ClaudeMarket[];
}

// ── Route handler ─────────────────────────────────────────────────────────────
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
  const today = new Date().toISOString().slice(0, 10);

  // ── Step 1: count open markets per category ─────────────────────────────
  const counts: Record<string, number> = {};
  await Promise.all(
    Object.keys(CATEGORY_MINIMUMS).map(async (cat) => {
      const { count } = await supabase
        .from("markets")
        .select("id", { count: "exact", head: true })
        .eq("category", cat)
        .eq("status", "open");
      counts[cat] = count ?? 0;
    })
  );

  // ── Step 2: identify shortfalls ──────────────────────────────────────────
  const shortfalls: Array<{ category: string; current: number; minimum: number; needed: number }> = [];
  for (const [cat, minimum] of Object.entries(CATEGORY_MINIMUMS)) {
    const current = counts[cat] ?? 0;
    if (current < minimum) {
      shortfalls.push({ category: cat, current, minimum, needed: minimum - current });
    }
  }

  const log: Record<string, { before: number; generated: number; inserted: number }> = {};

  // ── Step 3: top up each deficient category ──────────────────────────────
  for (const { category, current, needed } of shortfalls) {
    // Generate a batch slightly larger than needed to account for dupes/errors
    const batchSize = Math.min(needed + 3, 20);
    log[category] = { before: current, generated: 0, inserted: 0 };

    try {
      const markets = await generateMarketsForCategory(category, batchSize, apiKey, today);
      log[category].generated = markets.length;

      const tokenSlug = CATEGORY_TOKEN[category] ?? null;

      for (const market of markets.slice(0, needed + 2)) {
        if (!market.title || !market.resolve_at) continue;

        const slug = uniqueSlug(slugify(market.title));
        const { error } = await supabase.from("markets").insert({
          title: market.title,
          slug,
          description: market.description ?? null,
          rules_text: market.resolution_criteria ?? null,
          category,
          resolve_at: market.resolve_at,
          status: "open",
          yes_pool: 1000,
          no_pool: 1000,
          yes_price: 0.5,
          no_price: 0.5,
          liquidity: 1000,
          total_volume: 0,
          trending_score: 10,
          featured_score: 0,
          category_token_slug: tokenSlug,
        });

        if (!error) {
          log[category].inserted++;
        }
      }
    } catch (err) {
      console.error(`[check-category-health] Error generating ${category} markets:`, err);
    }

    // Small pause between categories to avoid Claude rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  // ── Step 4: return summary ───────────────────────────────────────────────
  const totalInserted = Object.values(log).reduce((sum, v) => sum + v.inserted, 0);

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    counts,
    shortfalls: shortfalls.map((s) => s.category),
    toppedUp: log,
    totalInserted,
    allHealthy: shortfalls.length === 0,
  });
}
