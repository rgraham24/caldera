import { createClient } from "@/lib/supabase/server";
import { generateMarketsForTopic, GeneratedMarket } from "./market-generator";

// ─── Slug helpers ────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

function uniqueSlug(base: string): string {
  return `${base}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// ─── Date fix helpers ─────────────────────────────────────────────────────────

const SCHEDULED_EVENT_KEYWORDS = [
  "championship", "election", "award", "season",
  "world cup", "super bowl", "nba finals",
];

function randomNearTermDate(): string {
  const base = new Date("2026-04-07T00:00:00Z");
  base.setDate(base.getDate() + 30 + Math.floor(Math.random() * 61)); // 30–90 days
  return base.toISOString();
}

function hasScheduledKeyword(title: string): boolean {
  const lower = title.toLowerCase();
  return SCHEDULED_EVENT_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Curator prompt ───────────────────────────────────────────────────────────

const CURATOR_SYSTEM_PROMPT =
  "You are a prediction market curator. Given a list of markets with their trading data, return a JSON array of market IDs sorted by engagement priority for homepage featuring. Consider: recency of trades, volume, resolve date urgency (sooner = higher priority), and title appeal. Return ONLY a JSON array of market IDs in priority order, nothing else.";

const FEATURED_COUNT = 8;

// ─── Step 1: Discover entities (Brave + Reddit + YouTube grounding) ──────────

const BRAVE_QUERIES = [
  "Kick streamer arrested banned drama controversy April 2026",
  "YouTuber beef exposed drama meltdown this week 2026",
  "IRL streamer viral fight arrest meltdown April 2026",
  "LivestreamFail reddit controversy ban viral clip today",
  "influencer scandal exposed arrested April 2026",
];

const ENTITY_SCOUT_SYSTEM =
  'You are a hot entity scout for a prediction marketplace. List exactly 15 public figures, creators, athletes, or cultural moments that are trending RIGHT NOW in April 2026 with maximum drama, controversy, or urgency. Return ONLY a JSON array of strings like ["Entity Name", ...]. No explanation.';

async function fetchBraveResults(query: string, braveKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      { headers: { Accept: "application/json", "X-Subscription-Token": braveKey } }
    );
    if (!res.ok) return "";
    const data = await res.json();
    const results: { title: string; description: string }[] = data?.web?.results ?? [];
    const lines = results.map((r) => `- ${r.title}: ${r.description ?? ""}`).join("\n");
    return `Query: ${query}\nResults:\n${lines}`;
  } catch {
    return "";
  }
}

async function fetchRedditHot(subreddit: string, limit: number): Promise<string> {
  try {
    const data = await fetch(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`,
      { headers: { "User-Agent": "CalderaMarkets/1.0" } }
    ).then((r) => r.json());
    const titles: string[] =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data?.data?.children ?? []).map((c: any) => c.data?.title).filter(Boolean);
    return `Reddit r/${subreddit} hot posts:\n${titles.join("\n")}`;
  } catch {
    return "";
  }
}

async function fetchYouTubeTrending(): Promise<string> {
  try {
    const html = await fetch("https://www.youtube.com/feed/trending?hl=en&gl=US", {
      headers: { "User-Agent": "Mozilla/5.0" },
    }).then((r) => r.text());
    const matches = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/g) ?? [];
    const titles = matches
      .slice(0, 10)
      .map((m) => m.match(/"text":"([^"]+)"/)?.[1] ?? "")
      .filter(Boolean);
    return titles.length ? `YouTube Trending:\n${titles.join("\n")}` : "";
  } catch {
    return "";
  }
}

async function fetchKickFeatured(): Promise<string> {
  try {
    // Try v2 endpoint first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = await fetch("https://kick.com/api/v2/channels/featured", {
      headers: { "User-Agent": "CalderaMarkets/1.0", Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    // Fallback to v1
    if (!data) {
      data = await fetch("https://kick.com/api/v1/featured-livestreams", {
        headers: { "User-Agent": "CalderaMarkets/1.0", Accept: "application/json" },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }

    if (!data) return "";
    const channels: string[] = (Array.isArray(data) ? data : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => c?.channel?.user?.username ?? c?.slug ?? "")
      .filter(Boolean)
      .slice(0, 10);
    return channels.length ? `Kick.com Featured Live Channels:\n${channels.join("\n")}` : "";
  } catch {
    return "";
  }
}

async function fetchTikTokTrending(): Promise<string> {
  try {
    const html = await fetch("https://www.tiktok.com/trending", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      },
    }).then((r) => r.text());
    const tags = (html.match(/"hashtagName":"([^"]+)"/g) ?? [])
      .slice(0, 15)
      .map((s) => s.replace(/"hashtagName":"|"/g, ""))
      .filter(Boolean);
    return tags.length ? `TikTok Trending Hashtags:\n${tags.join("\n")}` : "";
  } catch {
    return "";
  }
}

function parseEntityList(text: string): string[] {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Failed to parse entity list from Claude");
    return JSON.parse(match[0]);
  }
}

async function callClaudeForEntities(apiKey: string, userContent: string): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: ENTITY_SCOUT_SYSTEM,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) throw new Error(`Entity discovery failed: ${res.status}`);
  const data = await res.json();
  return parseEntityList(data.content?.[0]?.text ?? "");
}

export async function discoverEntities(apiKey: string): Promise<string[]> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;

  if (braveKey) {
    // Fetch all sources in parallel
    const [braveResults, lsf, boxing, mma, ksi, loganpaul, pka, youtube, kick, tiktok] =
      await Promise.all([
        Promise.all(BRAVE_QUERIES.map((q) => fetchBraveResults(q, braveKey))),
        fetchRedditHot("LivestreamFail", 10),
        fetchRedditHot("Boxing", 5),
        fetchRedditHot("MMA", 5),
        fetchRedditHot("ksi", 5),
        fetchRedditHot("LoganPaul", 5),
        fetchRedditHot("PKA", 5),
        fetchYouTubeTrending(),
        fetchKickFeatured(),
        fetchTikTokTrending(),
      ]);

    const rawData = [
      ...braveResults.filter(Boolean),
      lsf, boxing, mma, ksi, loganpaul, pka,
      youtube, kick, tiktok,
    ]
      .filter(Boolean)
      .join("\n\n");

    return callClaudeForEntities(
      apiKey,
      `Find the 15 hottest entities right now for a prediction market. Based on these real-time signals from Brave Search, Reddit (LivestreamFail/Boxing/MMA/KSI/LoganPaul/PKA), YouTube Trending, Kick.com live channels, and TikTok Trending, identify the most viral, dramatic, controversial people or entities. Return ONLY a JSON array like ["Entity Name", ...] with exactly 15 entries.\n\nFresh data:\n${rawData}`
    );
  }

  // Fallback: Claude knowledge only (no Brave key configured)
  return callClaudeForEntities(
    apiKey,
    "List 15 trending public figures or entities with maximum drama and controversy in April 2026. Return ONLY a JSON array."
  );
}

// ─── Step 2: Generate + insert markets ────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function insertMarkets(
  markets: GeneratedMarket[],
  supabase: SupabaseClient
): Promise<number> {
  let created = 0;
  for (const market of markets) {
    const slug = uniqueSlug(slugify(market.title));
    const { error } = await supabase.from("markets").insert({
      title: market.title,
      slug,
      description: market.description,
      category: market.category,
      rules_text: market.resolution_criteria,
      resolve_at: market.resolve_at,
      status: "open",
      yes_pool: 380,
      no_pool: 620,
      yes_price: 0.62,
      no_price: 0.38,
      liquidity: 1000,
      total_volume: 0,
    });
    if (!error) created++;
  }
  return created;
}

export async function bulkGenerateAndInsert(
  entities: string[],
  apiKey: string,
  supabase: SupabaseClient
): Promise<number> {
  const BATCH_SIZE = 3;
  let created = 0;

  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const batch = entities.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((entity) => generateMarketsForTopic(entity, apiKey))
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value?.length > 0) {
        created += await insertMarkets(result.value, supabase);
      }
    }

    // 2s cooldown between batches to avoid rate limits
    if (i + BATCH_SIZE < entities.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return created;
}

// ─── Step 3: Fix stale dates ──────────────────────────────────────────────────

export async function fixStaleDates(supabase: SupabaseClient): Promise<number> {
  const { data: markets } = await supabase
    .from("markets")
    .select("id, title")
    .eq("status", "open")
    .gt("resolve_at", "2026-09-01T00:00:00Z");

  const stale = (markets ?? []).filter((m) => !hasScheduledKeyword(m.title));
  let updated = 0;

  for (const market of stale) {
    const { error } = await supabase
      .from("markets")
      .update({ resolve_at: randomNearTermDate(), updated_at: new Date().toISOString() })
      .eq("id", market.id);
    if (!error) updated++;
  }

  return updated;
}

// ─── Step 4: Curate homepage ──────────────────────────────────────────────────

export async function curateHomepage(
  apiKey: string,
  supabase: SupabaseClient
): Promise<number> {
  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, total_volume, resolve_at")
    .eq("status", "open")
    .order("total_volume", { ascending: false })
    .limit(50);

  if (!markets?.length) return 0;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const marketIds = markets.map((m) => m.id);

  const { data: recentTrades } = await supabase
    .from("trades")
    .select("market_id, user_id")
    .in("market_id", marketIds)
    .gte("created_at", since24h);

  const tradeCount24h: Record<string, number> = {};
  const uniqueTraders24h: Record<string, Set<string>> = {};

  for (const trade of recentTrades ?? []) {
    tradeCount24h[trade.market_id] = (tradeCount24h[trade.market_id] ?? 0) + 1;
    if (!uniqueTraders24h[trade.market_id]) uniqueTraders24h[trade.market_id] = new Set();
    uniqueTraders24h[trade.market_id].add(trade.user_id);
  }

  const marketData = markets.map((m) => ({
    id: m.id,
    title: m.title,
    total_volume: m.total_volume,
    trade_count_24h: tradeCount24h[m.id] ?? 0,
    unique_traders_24h: uniqueTraders24h[m.id]?.size ?? 0,
    resolve_at: m.resolve_at,
  }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: CURATOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Here are the markets: ${JSON.stringify(marketData)}` }],
    }),
  });

  if (!res.ok) throw new Error(`Curator API error: ${res.status}`);

  const claudeData = await res.json();
  const text: string = claudeData.content?.[0]?.text ?? "";

  let rankedIds: string[];
  try {
    rankedIds = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Failed to parse curator response");
    rankedIds = JSON.parse(match[0]);
  }

  const heroIds = rankedIds.slice(0, FEATURED_COUNT);
  await supabase.from("markets").update({ is_hero: false }).eq("status", "open");
  await supabase.from("markets").update({ is_hero: true }).in("id", heroIds);

  return heroIds.length;
}
