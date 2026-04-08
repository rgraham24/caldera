import { createClient } from "@/lib/supabase/server";
import { generateMarketsForTopic, GeneratedMarket, classifyEntityType } from "./market-generator";

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

// ─── Shadow profile creation ──────────────────────────────────────────────────
//
// SQL required before this runs (add to Supabase if not present):
//   ALTER TABLE creators ADD COLUMN IF NOT EXISTS token_symbol text;
//   ALTER TABLE creators ADD COLUMN IF NOT EXISTS status text DEFAULT 'shadow';
//   ALTER TABLE creators ADD COLUMN IF NOT EXISTS estimated_followers integer DEFAULT 0;
//   ALTER TABLE markets  ADD COLUMN IF NOT EXISTS creator_slug text;
//   ALTER TABLE markets  ADD COLUMN IF NOT EXISTS is_speculation_pool boolean DEFAULT false;
//
type TokenTier = "hard_reserved" | "speculation_pool" | "shadow";

type EntityContext = {
  entityType: string;
  team: string | null;
  league: string | null;
};

function getEntityContext(entityName: string, entityType: string): EntityContext {
  const n = entityName.toLowerCase();

  if (entityType === "streamer") {
    const team =
      /kick|kick\.com/.test(n) ? "kick" :
      /twitch/.test(n) ? "twitch" :
      /youtube/.test(n) ? "youtube" :
      "streamers";
    return { entityType, team, league: "streamers" };
  }

  if (entityType === "pundit") {
    const team =
      /tucker|hannity|ingraham|gutfeld|fox/.test(n) ? "fox-news" :
      /maddow|hayes|reid|msnbc/.test(n) ? "msnbc" :
      /cooper|tapper|zakaria|cnn/.test(n) ? "cnn" :
      /rogan/.test(n) ? "spotify" :
      /shapiro|prager|daily.wire/.test(n) ? "the-daily-wire" :
      /chamath|palihapitiya/.test(n) ? "all-in-podcast" :
      /bari.weiss|substack/.test(n) ? "substack" :
      null;
    const league =
      /tucker|hannity|shapiro|ingraham|prager|coulter/.test(n) ? "conservative-media" :
      /maddow|hayes|reid/.test(n) ? "progressive-media" :
      /rogan|chamath|friedman|bremmer/.test(n) ? "podcasts" :
      /bari|substack/.test(n) ? "substack" :
      "commentary";
    return { entityType, team, league };
  }

  if (entityType === "journalist") {
    const team =
      /nyt|new.york.times/.test(n) ? "new-york-times" :
      /wsj|wall.street/.test(n) ? "wall-street-journal" :
      /wapo|washington.post/.test(n) ? "washington-post" :
      /cnn/.test(n) ? "cnn" :
      /bbc/.test(n) ? "bbc" :
      /reuters/.test(n) ? "reuters" :
      /ap |associated.press/.test(n) ? "associated-press" :
      null;
    return { entityType, team, league: "journalism" };
  }

  if (entityType === "politician") {
    const team =
      /republican|trump|maga|desantis|rubio|scott/.test(n) ? "republican-party" :
      /democrat|biden|harris|pelosi|schumer|aoc/.test(n) ? "democratic-party" :
      null;
    return { entityType, team, league: "us-politics" };
  }

  if (entityType === "musician") {
    const league =
      /rap|hip.hop|drake|kendrick|travis|wayne|cardi|nicki/.test(n) ? "hiphop" :
      /pop|taylor|ariana|billie|dua/.test(n) ? "pop" :
      /rock|metal/.test(n) ? "rock" :
      "music";
    return { entityType, team: null, league };
  }

  if (entityType === "athlete") {
    return { entityType, team: null, league: "sports" };
  }

  return { entityType, team: null, league: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function generateClaimCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  let p1 = "";
  let p2 = "";
  for (let i = 0; i < 4; i++) p1 += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) p2 += digits[Math.floor(Math.random() * digits.length)];
  return `CALDERA-${p1}-${p2}`;
}

/** Score an entity's tier based on estimated follower count from Brave search */
async function scoreEntityTier(
  entityName: string,
  braveKey?: string
): Promise<{ tier: TokenTier; estimatedFollowers: number }> {
  if (!braveKey) return { tier: "shadow", estimatedFollowers: 0 };
  try {
    const text = await fetchBraveResults(
      `${entityName} followers Instagram TikTok Twitter verified`,
      braveKey
    );
    if (!text) return { tier: "shadow", estimatedFollowers: 0 };

    // Match patterns like "12.5M followers", "850K followers", "1,200,000 followers"
    let estimatedFollowers = 0;
    const mMatch = text.match(/(\d+(?:\.\d+)?)\s*M\s*followers/i);
    const kMatch = text.match(/(\d+(?:\.\d+)?)\s*K\s*followers/i);
    const rawMatch = text.match(/([\d,]+)\s*followers/i);

    if (mMatch) {
      estimatedFollowers = Math.round(parseFloat(mMatch[1]) * 1_000_000);
    } else if (kMatch) {
      estimatedFollowers = Math.round(parseFloat(kMatch[1]) * 1_000);
    } else if (rawMatch) {
      estimatedFollowers = parseInt(rawMatch[1].replace(/,/g, ""), 10);
    }

    const lowerText = text.toLowerCase();
    const isOfficialBrand =
      /\b(nfl|nba|nhl|mlb|nascar|official|verified)\b/.test(lowerText);

    let tier: TokenTier;
    if (estimatedFollowers >= 1_000_000 || (isOfficialBrand && estimatedFollowers >= 500_000)) {
      tier = "hard_reserved";
    } else if (estimatedFollowers >= 100_000) {
      tier = "speculation_pool";
    } else {
      tier = "shadow";
    }

    return { tier, estimatedFollowers };
  } catch {
    return { tier: "shadow", estimatedFollowers: 0 };
  }
}

/** Extract the most likely social handle from Brave search text */
function extractHandle(text: string, fallback: string): string {
  // Look for @username patterns
  const atMatch = text.match(/@([a-zA-Z0-9_]{3,30})/);
  if (atMatch) {
    const h = atMatch[1].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (h.length >= 2) return h;
  }
  return fallback;
}

export async function createShadowProfileIfNeeded(
  entityName: string,
  supabase: AnySupabase
): Promise<{ id: string; slug: string; tier: TokenTier } | null> {
  const baseSlug = slugify(entityName);

  // 1. Check if creator already exists
  const { data: existing } = await supabase
    .from("creators")
    .select("id, slug, token_status")
    .eq("slug", baseSlug)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id as string,
      slug: existing.slug as string,
      tier: (existing.token_status as TokenTier) ?? "shadow",
    };
  }

  // 2. Run tier scoring + handle search in parallel
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  const [{ tier, estimatedFollowers }, handleSearchText] = await Promise.all([
    scoreEntityTier(entityName, braveKey),
    braveKey
      ? fetchBraveResults(`${entityName} TikTok OR Instagram OR Twitter handle`, braveKey).catch(() => "")
      : Promise.resolve(""),
  ]);

  // 3. Derive final slug from handle search
  let finalSlug = baseSlug;
  if (handleSearchText) {
    const candidate = extractHandle(handleSearchText, baseSlug);
    if (candidate !== baseSlug) {
      const { data: taken } = await supabase
        .from("creators")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!taken) finalSlug = candidate;
    }
  }

  const sym = finalSlug.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 20);

  // 4. Create shadow profile
  const { data: creator, error } = await supabase
    .from("creators")
    .upsert(
      {
        slug: finalSlug,
        name: entityName,
        creator_coin_symbol: sym,
        token_status: tier,
        estimated_followers: estimatedFollowers,
        creator_coin_price: 0,
        creator_coin_holders: 0,
        markets_count: 0,
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (error || !creator) {
    console.warn(`[createShadowProfile] Failed for ${entityName}:`, error?.message);
    return null;
  }

  // 5. Auto-generate a claim code (skip if one already exists for this slug)
  const { data: existingCode } = await supabase
    .from("claim_codes")
    .select("id")
    .eq("slug", finalSlug)
    .eq("status", "pending")
    .maybeSingle();

  if (!existingCode) {
    const code = generateClaimCode();
    await supabase
      .from("claim_codes")
      .insert({ slug: finalSlug, code, status: "pending" });
  }

  console.log(`[createShadowProfile] Created ${tier} profile: ${finalSlug} (${entityName}, ~${estimatedFollowers.toLocaleString()} followers)`);
  return { id: creator.id as string, slug: finalSlug, tier };
}

// ─── Step 3: Generate + insert markets ────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function insertMarkets(
  markets: GeneratedMarket[],
  supabase: SupabaseClient,
  creatorId?: string | null,
  creatorSlug?: string | null,
  tier: TokenTier = "shadow",
  teamSlug?: string | null,
  leagueSlug?: string | null
): Promise<number> {
  if (tier === "hard_reserved") {
    console.log(`[insertMarkets] Skipping — hard_reserved creator: ${creatorSlug}`);
    return 0;
  }

  const isSpeculationPool = tier === "speculation_pool";

  let created = 0;
  for (const market of markets) {
    const slug = uniqueSlug(slugify(market.title));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any = {
      title: market.title,
      slug,
      description: market.description,
      category: market.category,
      rules_text: market.resolution_criteria,
      resolve_at: market.resolve_at,
      status: "open",
      yes_pool: isSpeculationPool ? 33 : 380,
      no_pool: isSpeculationPool ? 33 : 620,
      yes_price: 0.5,
      no_price: 0.5,
      liquidity: isSpeculationPool ? 33 : 1000,
      total_volume: 0,
    };
    if (isSpeculationPool) row.is_speculation_pool = true;
    if (creatorId) row.creator_id = creatorId;
    if (creatorSlug) row.creator_slug = creatorSlug;
    if (teamSlug) row.team_creator_slug = teamSlug;
    if (leagueSlug) row.league_creator_slug = leagueSlug;
    const { error } = await supabase.from("markets").insert(row);
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

    // Create shadow profiles for each entity before generating markets
    const profileResults = await Promise.all(
      batch.map((entity) => createShadowProfileIfNeeded(entity, supabase))
    );

    // Skip market generation for hard_reserved entities entirely
    const entitiesToGenerate = batch.filter((_, j) => profileResults[j]?.tier !== "hard_reserved");

    const results = await Promise.allSettled(
      entitiesToGenerate.map((entity) => generateMarketsForTopic(entity, apiKey))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled" && result.value?.length > 0) {
        const entity = entitiesToGenerate[j];
        const batchIdx = batch.indexOf(entity);
        const profile = profileResults[batchIdx];
        const filtered = await filterStaleMarkets(result.value, apiKey, entity);
        if (filtered.length > 0) {
          const entityType = classifyEntityType(entity);
          const ctx = getEntityContext(entity, entityType);

          let teamProfile: { id: string; slug: string } | null = null;
          let leagueProfile: { id: string; slug: string } | null = null;

          if (ctx.team) {
            const tp = await createShadowProfileIfNeeded(ctx.team, supabase);
            if (tp) teamProfile = { id: tp.id, slug: tp.slug };
          }
          if (ctx.league) {
            const lp = await createShadowProfileIfNeeded(ctx.league, supabase);
            if (lp) leagueProfile = { id: lp.id, slug: lp.slug };
          }

          created += await insertMarkets(
            filtered,
            supabase,
            profile?.id ?? null,
            profile?.slug ?? null,
            profile?.tier ?? "shadow",
            teamProfile?.slug ?? null,
            leagueProfile?.slug ?? null
          );
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

// ─── Step 6: Resolve expired markets ─────────────────────────────────────────

const RESOLVER_SYSTEM = (dateLabel: string) =>
  `You are a prediction market resolver. For each market, determine the most likely outcome based on the title and current date (${dateLabel}).

Return ONLY a JSON array with this structure:
[{ "id": "market_id", "outcome": "yes" | "no" | "void" | "needs_review", "reasoning": "one sentence" }]

Rules:
- "yes" if the event clearly happened based on public knowledge
- "no" if the event clearly did not happen by the resolve date
- "void" if the market is ambiguous, the event is ongoing, or you cannot determine outcome
- "needs_review" if the market requires human judgment (legal cases, close calls)
- When in doubt, use "needs_review" — do NOT guess on ambiguous markets
- Creator coin price markets (e.g. "pumps 20%") — use "void" unless you have strong signal
- Never resolve a market as "yes" unless you are highly confident it occurred`;

export async function resolveExpiredMarkets(
  apiKey: string,
  supabase: SupabaseClient
): Promise<{ resolved: number; flagged: number }> {
  const now = new Date().toISOString();
  const dateLabel = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Fetch all open markets past their resolve date
  const { data: expired } = await supabase
    .from("markets")
    .select("id, title, description, category, yes_pool, no_pool, yes_price, no_price")
    .eq("status", "open")
    .lt("resolve_at", now)
    .limit(50);

  if (!expired?.length) return { resolved: 0, flagged: 0 };

  console.log(`[resolveExpiredMarkets] Found ${expired.length} expired markets`);

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
      system: RESOLVER_SYSTEM(dateLabel),
      messages: [{
        role: "user",
        content: `Resolve these expired prediction markets:\n${JSON.stringify(
          expired.map((m) => ({ id: m.id, title: m.title, category: m.category }))
        )}`,
      }],
    }),
  });

  if (!res.ok) {
    console.error("[resolveExpiredMarkets] Claude API error:", res.status);
    return { resolved: 0, flagged: 0 };
  }

  const claudeData = await res.json();
  const text: string = claudeData.content?.[0]?.text ?? "";

  let resolutions: { id: string; outcome: string; reasoning: string }[];
  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    resolutions = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
  } catch {
    console.error("[resolveExpiredMarkets] Failed to parse resolutions");
    return { resolved: 0, flagged: 0 };
  }

  let resolved = 0;
  let flagged = 0;

  for (const r of resolutions) {
    if (r.outcome === "needs_review" || r.outcome === "void") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("markets")
        .update({
          status: r.outcome === "void" ? "voided" : "needs_review",
          resolution_note: r.reasoning,
          resolved_at: now,
        })
        .eq("id", r.id);
      if (!error) flagged++;
    } else if (r.outcome === "yes" || r.outcome === "no") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("markets")
        .update({
          status: "resolved",
          resolution_outcome: r.outcome,
          resolution_note: r.reasoning,
          resolved_at: now,
        })
        .eq("id", r.id);
      if (!error) resolved++;
    }
  }

  console.log(`[resolveExpiredMarkets] Resolved: ${resolved}, Flagged: ${flagged}`);
  return { resolved, flagged };
}

// ─── Marquee profile import (DeSo-first) ─────────────────────────────────────

export type MarqueeProfile = {
  name: string;
  desoUsernames: string[];
  team: string | null;
  league: string | null;
};

export async function importMarqueeProfileDeSoFirst(
  profile: MarqueeProfile,
  supabase: AnySupabase
): Promise<{ slug: string; status: string; source: "deso" | "shadow" } | null> {

  // 1. Fetch live DESO price
  let desoPriceUsd = 5;
  try {
    const pr = await fetch("https://api.deso.org/api/v0/get-exchange-rate");
    const pd = await pr.json();
    const cents = pd?.USDCentsPerDeSoExchangeRate ?? 0;
    desoPriceUsd = cents > 0 ? cents / 100 : (pd?.USDCentsPerDeSoReserveExchangeRate ?? 500) / 100;
  } catch { /* use fallback */ }

  // 2. Try each DeSo username variant
  let desoProfile: {
    username: string;
    publicKey: string;
    coinPriceNanos: number;
    holders: number;
    isVerified: boolean;
    description: string;
    profilePicUrl: string;
  } | null = null;

  for (const username of profile.desoUsernames) {
    try {
      const res = await fetch("https://api.deso.org/api/v0/get-single-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Username: username }),
      });
      const data = await res.json();
      if (data?.Profile?.Username) {
        const p = data.Profile;
        const coinPriceNanos = p.CoinPriceDeSoNanos ?? 0;
        const holders = p.CoinEntry?.NumberOfHolders ?? 0;
        if (coinPriceNanos === 0 && holders === 0) continue;
        desoProfile = {
          username: p.Username,
          publicKey: p.PublicKeyBase58Check,
          coinPriceNanos,
          holders,
          isVerified: p.IsVerified ?? false,
          description: p.Description ?? "",
          profilePicUrl: `https://node.deso.org/api/v0/get-single-profile-picture/${p.PublicKeyBase58Check}`,
        };
        break;
      }
    } catch { continue; }
  }

  // 3. Determine token_status
  // IMPORTANT: active_unverified means real DeSo coin exists but person hasn't claimed.
  // Per our fee policy, personal token auto-buy is BLOCKED for active_unverified —
  // fees route to team/league only until they claim. This protects unclaimed celebrities.
  let tokenStatus: string;
  if (desoProfile) {
    if (desoProfile.isVerified) tokenStatus = "active_verified";
    else if (desoProfile.coinPriceNanos > 0 && desoProfile.holders > 0) tokenStatus = "active_unverified";
    else tokenStatus = "shadow";
  } else {
    tokenStatus = "shadow";
  }

  const slug = desoProfile
    ? desoProfile.username.toLowerCase()
    : slugify(profile.name);

  // 4. Check if already exists
  const { data: existing } = await supabase
    .from("creators")
    .select("id, slug, token_status")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    console.log(`[marqueeImport] Already exists: ${slug}`);
    return { slug, status: "already_exists", source: desoProfile ? "deso" : "shadow" };
  }

  // 5. Upsert creator
  const coinPriceUsd = desoProfile
    ? (desoProfile.coinPriceNanos / 1e9) * desoPriceUsd
    : 0;
  const sym = slug.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 20);

  const { data: creator, error } = await supabase
    .from("creators")
    .upsert(
      {
        slug,
        name: profile.name,
        creator_coin_symbol: sym,
        token_status: tokenStatus,
        deso_public_key: desoProfile?.publicKey ?? null,
        deso_username: desoProfile?.username ?? null,
        creator_coin_price: coinPriceUsd,
        creator_coin_holders: desoProfile?.holders ?? 0,
        image_url: desoProfile?.profilePicUrl ?? null,
        bio: desoProfile?.description ?? null,
        markets_count: 0,
        estimated_followers: tokenStatus === "active_unverified" ? 1_000_000 : 0,
      },
      { onConflict: "slug" }
    )
    .select("id, slug")
    .single();

  if (error || !creator) {
    console.warn(`[marqueeImport] Failed: ${profile.name}:`, error?.message);
    return null;
  }

  // 6. Generate claim code for unclaimed profiles
  if (tokenStatus !== "active_verified") {
    const { data: existingCode } = await supabase
      .from("claim_codes")
      .select("id")
      .eq("slug", slug)
      .eq("status", "pending")
      .maybeSingle();
    if (!existingCode) {
      const code = generateClaimCode();
      await supabase.from("claim_codes").insert({ slug, code, status: "pending" });
    }
  }

  // 7. Create team and league shadow profiles
  if (profile.team) await createShadowProfileIfNeeded(profile.team, supabase);
  if (profile.league) await createShadowProfileIfNeeded(profile.league, supabase);

  const source = desoProfile ? "deso" : "shadow";
  console.log(`[marqueeImport] ${profile.name} → ${slug} (${tokenStatus}, ${source}, $${coinPriceUsd.toFixed(2)})`);
  return { slug, status: tokenStatus, source };
}
