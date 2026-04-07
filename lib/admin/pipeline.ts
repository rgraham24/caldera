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

// ─── Step 1: Discover entities ────────────────────────────────────────────────

export async function discoverEntities(apiKey: string): Promise<string[]> {
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
      system:
        'You are a hot entity scout for a prediction marketplace. List exactly 15 public figures, creators, athletes, or cultural moments that are trending RIGHT NOW in April 2026 with maximum drama, controversy, or urgency. Return ONLY a JSON array of strings like ["Entity Name", ...]. No explanation.',
      messages: [{ role: "user", content: "List the 15 hottest entities right now." }],
    }),
  });

  if (!res.ok) throw new Error(`Entity discovery failed: ${res.status}`);

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Failed to parse entity list from Claude");
    return JSON.parse(match[0]);
  }
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
  const results = await Promise.allSettled(
    entities.map((entity) => generateMarketsForTopic(entity, apiKey))
  );

  let created = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      created += await insertMarkets(result.value, supabase);
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
