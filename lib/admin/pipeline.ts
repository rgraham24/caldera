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
  base.setDate(base.getDate() + 30 + Math.floor(Math.random() * 61));
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

// ─── Step 1: Discover entities ────────────────────────────────────────────────

// Hard cap on any single external fetch — silent null on timeout
function withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

const BRAVE_QUERIES = [
  "Kick streamer arrested banned drama controversy April 2026",
  "YouTuber beef exposed drama meltdown this week 2026",
  "IRL streamer viral fight arrest meltdown April 2026",
  "LivestreamFail reddit controversy ban viral clip today",
  "influencer scandal exposed arrested April 2026",
];

const ENTITY_SCOUT_SYSTEM =
  'You are a hot entity scout for a prediction marketplace. List exactly 10 public figures, creators, athletes, or cultural moments that are trending RIGHT NOW in April 2026 with maximum drama, controversy, or urgency. Return ONLY a JSON array of strings like ["Entity Name", ...]. No explanation.';

async function fetchBraveResults(query: string, braveKey: string): Promise<string> {
  const result = await withTimeout(
    fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: { Accept: "application/json", "X-Subscription-Token": braveKey },
    }).then((r) => (r.ok ? r.json() : null))
  );
  if (!result) return "";
  const results: { title: string; description: string }[] = result?.web?.results ?? [];
  const lines = results.map((r) => `- ${r.title}: ${r.description ?? ""}`).join("\n");
  return lines ? `Query: ${query}\nResults:\n${lines}` : "";
}

async function fetchRedditHot(subreddit: string, limit: number): Promise<string> {
  const result = await withTimeout(
    fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`, {
      headers: { "User-Agent": "CalderaMarkets/1.0" },
    }).then((r) => (r.ok ? r.json() : null))
  );
  if (!result) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const titles: string[] = (result?.data?.children ?? []).map((c: any) => c.data?.title).filter(Boolean);
  return titles.length ? `Reddit r/${subreddit} hot posts:\n${titles.join("\n")}` : "";
}

async function fetchYouTubeTrending(): Promise<string> {
  const html = await withTimeout(
    fetch("https://www.youtube.com/feed/trending?hl=en&gl=US", {
      headers: { "User-Agent": "Mozilla/5.0" },
    }).then((r) => (r.ok ? r.text() : null))
  );
  if (!html) return "";
  const matches = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/g) ?? [];
  const titles = matches
    .slice(0, 10)
    .map((m) => m.match(/"text":"([^"]+)"/)?.[1] ?? "")
    .filter(Boolean);
  return titles.length ? `YouTube Trending:\n${titles.join("\n")}` : "";
}

async function fetchKickFeatured(): Promise<string> {
  const result = await withTimeout(
    fetch("https://kick.com/api/v2/channels/featured", {
      headers: { "User-Agent": "CalderaMarkets/1.0", Accept: "application/json" },
    }).then((r) => (r.ok ? r.json() : null))
  );
  if (!result) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: string[] = (Array.isArray(result) ? result : [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => c?.channel?.user?.username ?? c?.slug ?? "")
    .filter(Boolean)
    .slice(0, 10);
  return channels.length ? `Kick.com Featured Live Channels:\n${channels.join("\n")}` : "";
}

async function fetchTwitchTopStreams(): Promise<string> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return "";

  // Get app access token
  const tokenRes = await withTimeout(
    fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    }).then((r) => (r.ok ? r.json() : null))
  );
  if (!tokenRes?.access_token) return "";

  const streamsRes = await withTimeout(
    fetch("https://api.twitch.tv/helix/streams?first=20", {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${tokenRes.access_token}`,
      },
    }).then((r) => (r.ok ? r.json() : null))
  );
  if (!streamsRes) return "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const names: string[] = (streamsRes.data ?? []).map((s: any) => s.user_name).filter(Boolean);
  return names.length ? `Twitch Top Streamers:\n${names.join("\n")}` : "";
}

async function fetchGoogleTrends(): Promise<string> {
  const xml = await withTimeout(
    fetch("https://trends.google.com/trends/trendingsearches/daily/rss?geo=US", {
      headers: { "User-Agent": "Mozilla/5.0" },
    }).then((r) => (r.ok ? r.text() : null))
  );
  if (!xml) return "";
  const titles = (xml.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g) ?? [])
    .slice(1, 16) // skip feed title
    .map((m) => m.replace(/<title><!\[CDATA\[/, "").replace(/\]\]><\/title>/, "").trim())
    .filter(Boolean);
  return titles.length ? `Google Trends US:\n${titles.join("\n")}` : "";
}

function stripMarkdown(text: string): string {
  return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

function parseJsonArray(text: string): unknown[] {
  const clean = stripMarkdown(text);
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\[[\s\S]*\]/)?.[0];
    if (!match) throw new Error(`No JSON array found in: ${clean.slice(0, 120)}`);
    return JSON.parse(match);
  }
}

function parseEntityList(text: string): string[] {
  return parseJsonArray(text) as string[];
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
    const [braveResults, lsf, boxing, mma, ksi, loganpaul, youtube, kick, twitch, trends] =
      await Promise.all([
        Promise.all(BRAVE_QUERIES.map((q) => fetchBraveResults(q, braveKey))),
        fetchRedditHot("LivestreamFail", 10),
        fetchRedditHot("Boxing", 5),
        fetchRedditHot("MMA", 5),
        fetchRedditHot("ksi", 5),
        fetchRedditHot("LoganPaul", 5),
        fetchYouTubeTrending(),
        fetchKickFeatured(),
        fetchTwitchTopStreams(),
        fetchGoogleTrends(),
      ]);

    const rawData = [
      ...braveResults,
      lsf, boxing, mma, ksi, loganpaul,
      youtube, kick, twitch, trends,
    ].filter(Boolean).join("\n\n");

    return callClaudeForEntities(
      apiKey,
      `Find the 10 hottest entities right now for a prediction market. Based on these real-time signals from Brave Search, Reddit (LivestreamFail/Boxing/MMA/KSI/LoganPaul), YouTube Trending, Kick.com, Twitch, and Google Trends, identify the most viral, dramatic, controversial people or entities. Return ONLY a JSON array like ["Entity Name", ...] with exactly 10 entries.\n\nFresh data:\n${rawData}`
    );
  }

  // Fallback: Claude knowledge only
  return callClaudeForEntities(
    apiKey,
    "List 10 trending public figures or entities with maximum drama and controversy in April 2026. Return ONLY a JSON array."
  );
}

// ─── Step 2: Relevance gatekeeper ─────────────────────────────────────────────

function gatekeeperSystem(): string {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `You are an extremely ruthless prediction market gatekeeper. Today is ${today}.

You MUST reject at least 20-30% of markets. If you're keeping everything, you're being too lenient.

AUTOMATICALLY REJECT if any of these are true:
- Resolve date is after September 2026 (too far out)
- Title contains 'by end of 2026' or 'in 2026' without a specific month
- Title is about an event with no specific trigger (e.g. 'Will X do Y someday?')
- The person/entity has not been in the news in the last 30 days
- The question is about a past event (championship already happened, case already resolved, etc.)
- Title uses vague language: 'ever', 'someday', 'eventually', 'at some point'

KEEP only if:
- Resolve date is before July 2026
- Tied to something that happened in the last 2 weeks
- Has a specific measurable outcome
- The drama/event is still actively unfolding

Return ONLY a JSON array of markets to KEEP with the same structure as input. Reject ruthlessly.`;
}

async function filterStaleMarkets(
  markets: GeneratedMarket[],
  apiKey: string,
  topic?: string
): Promise<GeneratedMarket[]> {
  if (markets.length === 0) return [];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: gatekeeperSystem(),
        messages: [
          {
            role: "user",
            content: `Filter this batch, keeping only currently relevant markets: ${JSON.stringify(markets)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.warn("[filterStaleMarkets] API error, keeping all markets:", res.status);
      return markets;
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";
    const kept = parseJsonArray(text) as GeneratedMarket[];
    const label = topic ? `for ${topic}` : "";
    console.log(`[Relevance filter] kept ${kept.length}/${markets.length} markets ${label} (${markets.length - kept.length} rejected)`);
    return kept;
  } catch (err) {
    console.warn("[filterStaleMarkets] Failed, keeping all markets:", err);
    return markets;
  }
}

// Exported version for the validate-existing-markets route
export async function filterStaleMarketsPublic(
  markets: { id: string; title: string; description: string | null; category: string; resolve_at: string | null }[],
  apiKey: string
): Promise<string[]> {
  if (markets.length === 0) return [];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: gatekeeperSystem(),
        messages: [
          {
            role: "user",
            content: `Filter these existing markets, returning ONLY the ones that are still relevant and should stay live. Return a JSON array of objects with only the "id" field for each market to KEEP: ${JSON.stringify(markets.map((m) => ({ id: m.id, title: m.title, description: m.description, category: m.category, resolve_at: m.resolve_at })))}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.warn("[filterStaleMarketsPublic] API error:", res.status);
      return markets.map((m) => m.id); // keep all on error
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";
    const kept = parseJsonArray(text) as { id: string }[];
    const keptIds = kept.map((k) => k.id).filter(Boolean);
    console.log(`[Relevance filter] validate-existing: kept ${keptIds.length}/${markets.length} (${markets.length - keptIds.length} to delete)`);
    return keptIds;
  } catch (err) {
    console.warn("[filterStaleMarketsPublic] Failed, keeping all:", err);
    return markets.map((m) => m.id);
  }
}

// ─── Step 3: Generate + insert markets ────────────────────────────────────────

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
        const entity = batch[results.indexOf(result)];
        const filtered = await filterStaleMarkets(result.value, apiKey, entity);
        if (filtered.length > 0) {
          created += await insertMarkets(filtered, supabase);
        }
      }
    }

    if (i + BATCH_SIZE < entities.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return created;
}

// ─── Step 4: Fix stale dates ──────────────────────────────────────────────────

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

// ─── Step 5: Curate homepage ──────────────────────────────────────────────────

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
    rankedIds = parseJsonArray(text) as string[];
  } catch {
    console.error("[curateHomepage] Failed to parse curator response. Raw:", text.slice(0, 300));
    return 0;
  }

  const heroIds = rankedIds.slice(0, FEATURED_COUNT);
  await supabase.from("markets").update({ is_hero: false }).eq("status", "open");
  await supabase.from("markets").update({ is_hero: true }).in("id", heroIds);

  return heroIds.length;
}
