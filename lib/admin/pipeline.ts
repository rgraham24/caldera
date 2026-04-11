import { createClient } from "@/lib/supabase/server";
import { generateMarketsForTopic, GeneratedMarket, classifyEntityType, generateCategoricalMarket, CategoricalMarketDraft } from "./market-generator";
export { generateCategoricalMarket } from "./market-generator";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type DiscoveredEntity = {
  name: string;
  source: 'kick' | 'twitch' | 'youtube' | 'reddit' | 'google' | 'brave';
  platformHandle?: string; // exact username if platform gives us one
  context?: string; // the title/snippet this came from
};

// ─── Creator slug blocklist ───────────────────────────────────────────────────
// Hard-blocks specific slug→entity mismatches we've observed in production.
// E.g. "craig" must never attach to Craig Bellamy, Craig Counsell, etc.
// SQL to clear existing bad rows:
// UPDATE markets SET creator_slug = NULL
//   WHERE creator_slug = 'craig' AND id NOT IN (
//     SELECT id FROM markets WHERE title ILIKE '%hubspot%'
//       OR title ILIKE '%dharmesh%' OR title ILIKE '%shah%'
//   );

// ─── Fix existing vs-slug markets ─────────────────────────────────────────────
// Run this SQL in Supabase to link existing VS markets to their primary entity:
//
// UPDATE markets
// SET creator_slug = 'steelovsky'
// WHERE title ILIKE '%steelovsky%'
//   AND (creator_slug IS NULL OR creator_slug LIKE '%vs%' OR creator_slug LIKE '%-%');
//
// UPDATE markets
// SET creator_slug = 'notalbino'
// WHERE (title ILIKE '%notalbino%' OR title ILIKE '%not albino%')
//   AND (creator_slug IS NULL OR creator_slug LIKE '%-%');
//
// UPDATE markets
// SET creator_slug = 'johnnysomali'
// WHERE title ILIKE '%johnny somali%'
//   AND (creator_slug IS NULL OR creator_slug LIKE '%-%');
//
// UPDATE markets
// SET creator_slug = 'clavicular'
// WHERE title ILIKE '%clavicular%'
//   AND (creator_slug IS NULL OR creator_slug LIKE '%-%');

const CREATOR_SLUG_BLOCKLIST: Record<string, string[]> = {
  craig: ["bellamy", "counsell", "wales", "chicago", "cubs", "football"],
};

function isBlocklisted(slug: string, marketTitle: string): boolean {
  const blocked = CREATOR_SLUG_BLOCKLIST[slug];
  if (!blocked) return false;
  const lower = marketTitle.toLowerCase();
  return blocked.some((term) => lower.includes(term));
}

// ─── Creator match guard ──────────────────────────────────────────────────────
// Prevents short/ambiguous slugs from matching unrelated entities.
// E.g. "craig" must NOT match "Craig Counsell" when slug is only 5 chars.

function isGoodCreatorMatch(entityName: string, creatorSlug: string): boolean {
  const entity = entityName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const slug = creatorSlug.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (slug === entity) return true;
  if (slug.includes(entity) && entity.length > 6) return true;
  if (entity.includes(slug) && slug.length > 8) return true;
  return false;
}

// DeSo usernames never have hyphens — reject any slug with dashes (fake pipeline slugs)
function isValidDesoSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_]{1,50}$/.test(slug);
}

// ─── Entity registry lookup ───────────────────────────────────────────────────
// Primary source of truth for linking markets to creators.
// Falls back to isGoodCreatorMatch only when registry has no verified match.

async function lookupEntityRegistry(
  supabase: SupabaseClient,
  entityName: string
): Promise<{ creatorSlug: string | null; leagueFallback: string | null }> {
  const name = entityName.toLowerCase();

  // entity_registry is not yet in generated types — cast explicitly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawData } = await (supabase as any)
    .from("entity_registry")
    .select("creator_slug, canonical_name, entity_type")
    .eq("verified", true);

  const data = rawData as Array<{
    canonical_name: string;
    creator_slug: string | null;
    entity_type: string | null;
  }> | null;

  if (!data) return { creatorSlug: null, leagueFallback: null };

  const match = data.find((e) => {
    const canonical = e.canonical_name.toLowerCase();
    if (canonical === name) return true;
    if (name.includes(canonical) && canonical.length > 6) return true;
    if (canonical.includes(name) && name.length > 6) return true;
    return false;
  });

  if (!match) return { creatorSlug: null, leagueFallback: null };

  const leagueFallback = match.creator_slug
    ? null
    : match.entity_type === "athlete" || match.entity_type === "team"
    ? "sportsmarkets"
    : match.entity_type === "musician"
    ? "entertainmentmarkets"
    : match.entity_type === "streamer"
    ? "viralmarkets"
    : match.entity_type === "pundit" || match.entity_type === "brand"
    ? "conflictmarkets"
    : "viralmarkets";

  return {
    creatorSlug: match.creator_slug ?? null,
    leagueFallback,
  };
}

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

const SEARCH_QUERIES = [
  { query: 'breaking sports news today athletes', category: 'sports' },
  { query: 'trending crypto blockchain news today', category: 'tech' },
  { query: 'streamer drama twitch kick youtube today', category: 'streamers' },
  { query: 'celebrity entertainment news scandal today', category: 'entertainment' },
  { query: 'politics breaking news today', category: 'politics' },
  { query: 'viral trending social media today', category: 'viral' },
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

async function fetchKickFeatured(): Promise<DiscoveredEntity[]> {
  const result = await withTimeout(
    fetch("https://kick.com/api/v2/channels/featured", {
      headers: { "User-Agent": "CalderaMarkets/1.0", Accept: "application/json" },
    }).then((r) => (r.ok ? r.json() : null))
  );
  if (!result) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Array.isArray(result) ? result : [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => {
      const handle = c?.channel?.user?.username ?? c?.slug ?? "";
      return handle ? { name: handle, source: 'kick' as const, platformHandle: handle } : null;
    })
    .filter(Boolean)
    .slice(0, 10) as DiscoveredEntity[];
}

async function fetchTwitchTopStreams(): Promise<DiscoveredEntity[]> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  // Get app access token
  const tokenRes = await withTimeout(
    fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    }).then((r) => (r.ok ? r.json() : null))
  );
  if (!tokenRes?.access_token) return [];

  const streamsRes = await withTimeout(
    fetch("https://api.twitch.tv/helix/streams?first=20", {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${tokenRes.access_token}`,
      },
    }).then((r) => (r.ok ? r.json() : null))
  );
  if (!streamsRes) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (streamsRes.data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => s.user_name ? { name: s.user_name, source: 'twitch' as const, platformHandle: s.user_name } : null)
    .filter(Boolean) as DiscoveredEntity[];
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

export async function discoverEntities(apiKey: string): Promise<DiscoveredEntity[]> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;

  if (braveKey) {
    const [braveResults, lsf, boxing, mma, ksi, loganpaul, youtube, kickEntities, twitchEntities, trends] =
      await Promise.all([
        Promise.all(SEARCH_QUERIES.map((sq) => fetchBraveResults(sq.query, braveKey))),
        fetchRedditHot("LivestreamFail", 10),
        fetchRedditHot("Boxing", 5),
        fetchRedditHot("MMA", 5),
        fetchRedditHot("ksi", 5),
        fetchRedditHot("LoganPaul", 5),
        fetchYouTubeTrending(),
        fetchKickFeatured(),     // now DiscoveredEntity[]
        fetchTwitchTopStreams(),  // now DiscoveredEntity[]
        fetchGoogleTrends(),
      ]);

    // Text-based sources go to Claude for name extraction
    const rawData = [
      ...braveResults,
      lsf, boxing, mma, ksi, loganpaul,
      youtube, trends,
    ].filter(Boolean).join("\n\n");

    const claudeNames = await callClaudeForEntities(
      apiKey,
      `Here are trending news headlines across multiple categories.\nExtract the 15 most newsworthy distinct people, teams, or entities that would make great prediction markets. Include at least 2 from each category: sports, crypto/tech, streamers/creators, entertainment, politics, viral.\nReturn ONLY a JSON array of strings: ["Entity 1", "Entity 2", ...]\n\nFresh data:\n${rawData}`
    );

    const claudeEntities: DiscoveredEntity[] = claudeNames.map((name) => ({
      name,
      source: 'brave' as const,
    }));

    // Kick + Twitch entities have exact platform handles; merge with Claude-extracted
    return [...kickEntities, ...twitchEntities, ...claudeEntities];
  }

  // Fallback: Claude knowledge only
  const names = await callClaudeForEntities(
    apiKey,
    "List 10 trending public figures or entities with maximum drama and controversy in April 2026. Return ONLY a JSON array."
  );
  return names.map((name) => ({ name, source: 'brave' as const }));
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

// Category index tokens — Caldera-owned DeSo profiles that act as
// league-level tokens for each market category.
// Fees auto-buy these tokens from every market in their category.
// If a specific league token exists (e.g. "nba"), it takes priority.
// These are the fallback league tokens when no specific league is set.
export const CATEGORY_TOKENS: Record<string, string> = {
  "Politics": "electionmarkets",
  "Commentary": "conflictmarkets",
  "Sports": "sportsmarkets",
  "Entertainment": "entertainmentmarkets",
  "Streamers": "viralmarkets",
  "Viral": "viralmarkets",
  "Music": "entertainmentmarkets",
  "Tech": "cryptomarkets1",
  "Crypto": "cryptomarkets1",
};

// The category token DeSo usernames to import as active_verified
export const CATEGORY_TOKEN_PROFILES = [
  { name: "Conflict Markets", desoUsername: "ConflictMarkets", category: "Commentary" },
  { name: "Election Markets", desoUsername: "ElectionMarkets", category: "Politics" },
  { name: "Sports Markets", desoUsername: "SportsMarkets", category: "Sports" },
  { name: "Viral Markets", desoUsername: "ViralMarkets", category: "Streamers" },
  { name: "Crypto Markets", desoUsername: "CryptoMarkets1", category: "Tech" },
  { name: "Entertainment Markets", desoUsername: "EntertainmentMarkets", category: "Entertainment" },
];

export async function importCategoryTokens(supabase: AnySupabase): Promise<void> {
  let desoPriceUsd = 5;
  try {
    const pr = await fetch("https://api.deso.org/api/v0/get-exchange-rate");
    const pd = await pr.json();
    const cents = pd?.USDCentsPerDeSoExchangeRate ?? 0;
    desoPriceUsd = cents > 0 ? cents / 100 : 5;
  } catch { /* use fallback */ }

  for (const token of CATEGORY_TOKEN_PROFILES) {
    try {
      const res = await fetch("https://api.deso.org/api/v0/get-single-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Username: token.desoUsername }),
      });
      const data = await res.json();
      const p = data?.Profile;
      if (!p?.Username) {
        console.warn(`[categoryTokens] Not found on DeSo: ${token.desoUsername}`);
        continue;
      }

      const slug = p.Username.toLowerCase();
      const coinPriceNanos = p.CoinPriceDeSoNanos ?? 0;
      const coinPriceUsd = (coinPriceNanos / 1e9) * desoPriceUsd;
      const publicKey = p.PublicKeyBase58Check;

      await supabase.from("creators").upsert({
        slug,
        name: token.name,
        deso_username: p.Username,
        deso_public_key: publicKey,
        creator_coin_symbol: p.Username.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 20),
        // active_verified because Caldera owns these accounts
        token_status: "active_verified",
        creator_coin_price: coinPriceUsd,
        creator_coin_holders: p.CoinEntry?.NumberOfHolders ?? 0,
        image_url: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`,
        bio: `Official ${token.name} token. Earns auto-buy fees from every ${token.category} prediction market on Caldera.`,
        estimated_followers: 0,
      }, { onConflict: "slug", ignoreDuplicates: false });

      console.log(`[categoryTokens] Imported ${token.name} (${slug}) as active_verified`);
    } catch (err) {
      console.warn(`[categoryTokens] Error importing ${token.desoUsername}:`, err);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

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
    return { entityType, team, league: "Streamers" };
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
    return { entityType, team, league: "Commentary" };
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
    return { entityType, team, league: "Commentary" };
  }

  if (entityType === "politician") {
    const team =
      /republican|trump|maga|desantis|rubio|scott/.test(n) ? "republican-party" :
      /democrat|biden|harris|pelosi|schumer|aoc/.test(n) ? "democratic-party" :
      null;
    return { entityType, team, league: "Politics" };
  }

  if (entityType === "musician") {
    return { entityType, team: null, league: "Entertainment" };
  }

  if (entityType === "athlete") {
    return { entityType, team: null, league: "Sports" };
  }

  if (entityType === "brand") {
    return { entityType, team: null, league: "Tech" };
  }

  return { entityType, team: null, league: null };
}

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

// ─── Entity enrichment ───────────────────────────────────────────────────────
// Classifies entity type via Claude Haiku and checks for existing reserved profiles.
// Returns null on error; returns { skip: true } for events/ambiguous entities.

async function enrichEntity(
  entity: DiscoveredEntity,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{
  type: 'person' | 'org' | 'event' | 'ambiguous';
  twitterHandle?: string;
  existingCreatorId?: string;
  skip: boolean;
} | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const classifyRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Classify this entity for a prediction market platform.
Entity: "${entity.name}"
Source: ${entity.source}
Context: ${entity.context ?? 'none'}
Platform handle: ${entity.platformHandle ?? 'none'}

Reply with JSON only:
{
  "type": "person" | "org" | "event" | "ambiguous",
  "reason": "one sentence",
  "twitterHandle": "@handle or null"
}

Rules:
- person = real individual human (streamer, athlete, politician, celebrity)
- org = brand, team, subreddit, company, league, media outlet
- event = a news story, scandal, or one-time occurrence (not a person or org)
- ambiguous = cannot determine, too vague, or a generic term

For events, set twitterHandle to null.
For persons/orgs from Kick or Twitch, the platformHandle IS their Twitter equivalent — use it.
For persons/orgs from other sources, infer the most likely Twitter handle from your knowledge.`,
        }],
      }),
    });

    const classifyData = await classifyRes.json();
    const text: string = classifyData.content?.[0]?.text ?? '{}';
    let classification: { type: string; reason: string; twitterHandle?: string | null };
    try {
      classification = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      console.warn(`[enrich] Failed to parse classification for "${entity.name}":`, text.slice(0, 80));
      return null;
    }

    if (classification.type === 'event' || classification.type === 'ambiguous') {
      console.log(`[enrich] SKIP "${entity.name}" — type: ${classification.type} (${classification.reason})`);
      return { type: classification.type as 'event' | 'ambiguous', skip: true };
    }

    const handle = (classification.twitterHandle ?? entity.platformHandle ?? '')
      .replace('@', '').toLowerCase().trim();

    if (handle) {
      const { data: existing } = await supabase
        .from('creators')
        .select('id, slug, token_status')
        .eq('deso_username', handle)
        .in('token_status', ['active_unverified', 'active_verified'])
        .maybeSingle();

      if (existing) {
        console.log(`[enrich] MATCHED "${entity.name}" → existing reserved profile: ${existing.slug}`);
        return {
          type: classification.type as 'person' | 'org',
          twitterHandle: handle,
          existingCreatorId: existing.id as string,
          skip: false,
        };
      }
    }

    return {
      type: classification.type as 'person' | 'org',
      twitterHandle: handle || undefined,
      skip: false,
    };
  } catch (err) {
    console.warn(`[enrich] Error enriching "${entity.name}":`, err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findExistingCreator(supabase: any, entityName: string): Promise<string | null> {
  const nameParts = entityName.trim().toLowerCase().split(/\s+/);
  if (nameParts.length === 0) return null;

  // Only do fuzzy match if we have a meaningful name (2+ chars)
  if (entityName.length < 4) return null;

  const { data } = await supabase
    .from("creators")
    .select("id, slug, name")
    .ilike("name", `%${entityName}%`)
    .in("token_status", ["active_unverified", "active_verified"])
    .limit(1)
    .maybeSingle();

  if (data) {
    console.log(`[pipeline-dedup] "${entityName}" matches existing "${data.name}" (${data.slug})`);
    return data.id;
  }
  return null;
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

  // 1b. Secondary dedup — fuzzy name match against reserved profiles
  // Catches cases like "Donald Trump" → "realdonaldtrump"
  const existingId = await findExistingCreator(supabase, entityName);
  if (existingId) {
    const { data: found } = await supabase
      .from("creators")
      .select("id, slug, token_status")
      .eq("id", existingId)
      .single();
    if (found) {
      return {
        id: found.id as string,
        slug: found.slug as string,
        tier: (found.token_status as TokenTier) ?? "shadow",
      };
    }
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

// ─── Fuzzy creator slug lookup ───────────────────────────────────────────────

async function findCreatorSlug(
  entityName: string,
  supabase: SupabaseClient
): Promise<string | null> {
  const normalized = entityName.toLowerCase()
    .replace(/['\-.]/g, '')
    .replace(/\s+/g, '');

  const candidates = [
    normalized,
    entityName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, ''),
    entityName.split(' ')[0].toLowerCase(),
    entityName.split(' ').slice(-1)[0].toLowerCase(),
  ].filter(c => c.length >= 3 && isValidDesoSlug(c));

  // 1. Check local DB first — only return if reserved OR 100+ holders (squatters rejected)
  for (const candidate of candidates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('creators')
      .select('slug, deso_username, is_reserved, creator_coin_holders')
      .eq('slug', candidate)
      .not('deso_username', 'is', null)
      .single();

    if (data?.slug) {
      const isReserved = data.is_reserved === true;
      const holders: number = data.creator_coin_holders ?? 0;

      if (isReserved || holders >= 100) {
        return data.slug;
      }

      // Squatter account — strip DeSo link and queue for platform wallet creation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('creators').update({
        deso_username: null,
        deso_public_key: null,
        token_status: 'pending_deso_creation',
      }).eq('slug', data.slug);
      console.log(`[findCreatorSlug] Squatter rejected: ${data.slug} (reserved:${isReserved}, holders:${holders})`);
      // Fall through to live DeSo check
    }
  }

  // 2. Check entity registry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: registry } = await (supabase as any)
    .from('entity_registry')
    .select('creator_slug, deso_username')
    .ilike('canonical_name', `%${entityName}%`)
    .single();
  if (registry?.creator_slug && isValidDesoSlug(registry.creator_slug)) {
    return registry.creator_slug;
  }

  // 3. Live DeSo API lookup as last resort — ONLY reserved or 100+ holder profiles
  for (const candidate of candidates.slice(0, 3)) {
    try {
      const res = await fetch('https://api.deso.org/api/v0/get-single-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Username: candidate }),
      });
      const desoData = await res.json();
      if (desoData?.Profile?.Username) {
        const isReserved = desoData.Profile.IsReserved === true;
        const holders = desoData.Profile.CoinEntry?.NumberOfHolders ?? 0;

        // ONLY use this profile if it's reserved OR has significant holders
        // Fan-created profiles are worthless — the real person can never claim them
        if (!isReserved && holders < 100) {
          console.log(`[pipeline] Skipping non-reserved low-holder profile: ${candidate} (${holders} holders)`);
          continue;
        }

        // Use exact DeSo username (preserving case)
        const desoUsername = desoData.Profile.Username;
        const slug = desoUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!isValidDesoSlug(slug)) continue;

        await supabase.from('creators').upsert({
          name: desoUsername,
          slug,
          deso_username: desoUsername,
          deso_public_key: desoData.Profile.PublicKeyBase58Check,
          creator_coin_price: (desoData.Profile.CoinPriceDeSoNanos / 1e9) * 4.63,
          creator_coin_holders: holders,
          token_status: 'active_unverified',
          is_reserved: isReserved,
          founder_reward_basis_points: desoData.Profile.CoinEntry?.CreatorBasisPoints ?? 0,
        }, { onConflict: 'slug' });
        return slug;
      }
    } catch { /* skip */ }
  }

  // 4. Local-only creator: known to Caldera but not yet on DeSo.
  //    Queue for platform-wallet DeSo profile creation and return the slug
  //    so the market still links to them.
  for (const candidate of candidates) {
    const { data: localCreator } = await supabase
      .from('creators')
      .select('slug, name, deso_username')
      .eq('slug', candidate)
      .single();

    if (localCreator && !localCreator.deso_username) {
      // Mark as needing a DeSo profile — the autonomous cycle will create it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('creators').update({
        token_status: 'pending_deso_creation',
      }).eq('slug', localCreator.slug);
      console.log(`[findCreatorSlug] Queued for DeSo creation: ${localCreator.slug} (${localCreator.name})`);
      return localCreator.slug;
    }
  }

  return null;
}

// ─── Backfill creator slugs on existing markets ───────────────────────────────

export async function backfillCreatorSlugs(
  supabase: SupabaseClient,
  limit = 50
): Promise<number> {
  const { data: markets } = await supabase
    .from('markets')
    .select('id, title')
    .is('creator_slug', null)
    .eq('status', 'open')
    .limit(limit);

  if (!markets?.length) return 0;

  let updated = 0;
  for (const market of markets) {
    // Extract entity name — strip leading question words and trailing predicate
    const entityName = market.title
      .replace(/^Will (the |a |an )?/i, '')
      .replace(/^Who will (win |be )?/i, '')
      .split(/\s+(win|lose|sign|trade|retire|announce|beat|defeat|score|hit|make|reach|complete|be|have|get|go|do|say|post|tweet|play|stream|release|drop|sell|buy|leave|join|quit|fire|hire|ban|suspend|break|set|claim|take|become|earn|host|appear|attend|face|fight|challenge|top|lead|finish|end|start|open|close|launch|reveal|confirm|deny|admit|file)\b/i)[0]
      .replace(/\?.*$/, '')
      .trim();

    if (!entityName || entityName.length < 3) continue;

    const slug = await findCreatorSlug(entityName, supabase);
    if (!slug || !isValidDesoSlug(slug) || isBlocklisted(slug, market.title)) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('markets')
      .update({ creator_slug: slug })
      .eq('id', market.id);

    if (!error) updated++;

    // Small delay to avoid hammering DeSo API
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[backfillCreatorSlugs] Updated ${updated}/${markets.length} markets`);
  return updated;
}

// ─── Step 3: Generate + insert markets ────────────────────────────────────────

// ─── VS market helpers ────────────────────────────────────────────────────────

function isVsMarket(title: string): boolean {
  return /\svs\.?\s|\sversus\s/i.test(title);
}

function extractVsEntities(title: string): [string, string] | null {
  const match = title.match(
    /(\w[\w\s]*?)\s+vs\.?\s+([\w][\w\s]*?)(?:\s+(?:fight|match|battle|event|game|bout|race|competition))?[?!.]?$/i
  );
  if (!match) return null;
  return [match[1].trim(), match[2].trim()];
}

/** Derive varied starting pools from market title so odds feel organic, not all 62/38. */
function getStartingOdds(title: string): { yesPool: number; noPool: number; yesPrice: number; noPrice: number } {
  const lower = title.toLowerCase();

  // Strong YES lean — things likely to happen
  if (
    /will.*win|will.*sign|will.*release|will.*drop|will.*confirm|will.*announce/.test(lower) &&
    /champion|title|deal|comeback|record/.test(lower)
  ) {
    const yes = 550 + Math.floor(Math.random() * 150); // 55-70% yes
    return { yesPool: 1000 - yes, noPool: yes, yesPrice: yes / 1000, noPrice: (1000 - yes) / 1000 };
  }

  // Strong NO lean — things unlikely to happen
  if (/will.*retire|will.*quit|will.*arrested|will.*banned|will.*sued/.test(lower)) {
    const yes = 200 + Math.floor(Math.random() * 200); // 20-40% yes
    return { yesPool: 1000 - yes, noPool: yes, yesPrice: yes / 1000, noPrice: (1000 - yes) / 1000 };
  }

  // Controversy / drama — could go either way, slight NO lean
  if (/drama|beef|feud|fight|controversy|exposed|cancel/.test(lower)) {
    const yes = 300 + Math.floor(Math.random() * 250); // 30-55% yes
    return { yesPool: 1000 - yes, noPool: yes, yesPrice: yes / 1000, noPrice: (1000 - yes) / 1000 };
  }

  // Default — slight YES lean with randomness
  const yes = 400 + Math.floor(Math.random() * 300); // 40-70% yes
  return { yesPool: 1000 - yes, noPool: yes, yesPrice: yes / 1000, noPrice: (1000 - yes) / 1000 };
}

async function isDuplicateMarket(
  title: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const normalized = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  // Check exact title match
  const { data: exact } = await supabase
    .from('markets')
    .select('id')
    .ilike('title', title)
    .eq('status', 'open')
    .limit(1);

  if (exact && exact.length > 0) return true;

  // Check fuzzy match — if 70%+ of words match an existing title
  const words = normalized.split(/\s+/).filter(w => w.length > 3);
  if (words.length < 3) return false;

  // Take first 5 significant words and search
  const keyWords = words.slice(0, 5).join(' & ');
  const { data: similar } = await supabase
    .from('markets')
    .select('id, title')
    .textSearch('title', keyWords)
    .eq('status', 'open')
    .limit(3);

  if (!similar || similar.length === 0) return false;

  // Check word overlap ratio
  for (const market of similar) {
    const existingWords = market.title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 3);

    const overlap = words.filter(w => existingWords.includes(w)).length;
    const ratio = overlap / Math.max(words.length, existingWords.length);

    if (ratio > 0.7) return true;
  }

  return false;
}

async function insertMarkets(
  markets: GeneratedMarket[],
  supabase: SupabaseClient,
  creatorId?: string | null,
  creatorSlug?: string | null,
  tier: TokenTier = "shadow",
  teamSlug?: string | null,
  leagueSlug?: string | null,
  entityName?: string | null
): Promise<number> {
  if (tier === "hard_reserved") {
    console.log(`[insertMarkets] Skipping — hard_reserved creator: ${creatorSlug}`);
    return 0;
  }

  const isSpeculationPool = tier === "speculation_pool";

  // Look up entity registry for league fallback
  const entityLookup = entityName
    ? await lookupEntityRegistry(supabase, entityName)
    : { creatorSlug: null, leagueFallback: null };

  // Use fuzzy findCreatorSlug for accurate creator matching
  const finalCreatorSlug = entityName
    ? await findCreatorSlug(entityName, supabase)
    : null;
  const finalLeagueSlug = entityLookup.leagueFallback ?? leagueSlug ?? null;

  if (entityName && finalCreatorSlug) {
    console.log(`[insertMarkets] Fuzzy match: ${entityName} → ${finalCreatorSlug}`);
  }

  let created = 0;
  for (const market of markets) {
    // ── Level 1: Duplicate prevention ─────────────────────────────────────────
    const isDupe = await isDuplicateMarket(market.title, supabase);
    if (isDupe) {
      console.log(`[pipeline] Skipping duplicate: ${market.title}`);
      continue;
    }

    // ── VS markets → categorical ──────────────────────────────────────────────
    if (isVsMarket(market.title)) {
      const entities = extractVsEntities(market.title);
      if (entities) {
        const [entity1, entity2] = entities;
        const slug1 = entity1.toLowerCase().replace(/[^a-z0-9]/g, '');
        const slug2 = entity2.toLowerCase().replace(/[^a-z0-9]/g, '');
        const draft: CategoricalMarketDraft = {
          title: market.title,
          description: market.description,
          category: market.category,
          outcomes: [
            { label: entity1, slug: slug1, probability: 0.5 },
            { label: entity2, slug: slug2, probability: 0.5 },
          ],
        };
        await insertCategoricalMarket(draft, supabase);
        created++;
        console.log(`[insertMarkets] VS market → categorical: "${market.title}" (${entity1} vs ${entity2})`);
        continue;
      }
    }

    const slug = uniqueSlug(slugify(market.title));
    const odds = isSpeculationPool ? null : getStartingOdds(market.title);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any = {
      title: market.title,
      slug,
      description: market.description,
      category: market.category,
      rules_text: market.resolution_criteria,
      resolve_at: market.resolve_at,
      status: "open",
      yes_pool: isSpeculationPool ? 33 : Math.round(odds!.yesPool),
      no_pool: isSpeculationPool ? 33 : Math.round(odds!.noPool),
      yes_price: isSpeculationPool ? 0.5 : odds!.yesPrice,
      no_price: isSpeculationPool ? 0.5 : odds!.noPrice,
      liquidity: isSpeculationPool ? 66 : 1000,
      total_volume: 0,
    };
    // Use category token as league fallback if no specific league set
    const effectiveLeagueSlug =
      finalLeagueSlug ??
      CATEGORY_TOKENS[market.category] ??
      CATEGORY_TOKENS["Entertainment"] ??
      null;

    if (isSpeculationPool) row.is_speculation_pool = true;
    if (creatorId) row.creator_id = creatorId;
    const allowedCreatorSlug =
      finalCreatorSlug &&
      isValidDesoSlug(finalCreatorSlug) &&
      !isBlocklisted(finalCreatorSlug, market.title)
        ? finalCreatorSlug
        : null;
    if (allowedCreatorSlug) row.creator_slug = allowedCreatorSlug;
    if (teamSlug) row.team_creator_slug = teamSlug;
    if (effectiveLeagueSlug) row.league_creator_slug = effectiveLeagueSlug;
    const { error } = await supabase.from("markets").insert(row);
    if (!error) created++;
  }
  return created;
}

export async function bulkGenerateAndInsert(
  entities: Array<string | DiscoveredEntity>,
  apiKey: string,
  supabase: SupabaseClient
): Promise<number> {
  const BATCH_SIZE = 3;
  let created = 0;

  // Normalize string[] | DiscoveredEntity[] to DiscoveredEntity[]
  const normalized: DiscoveredEntity[] = entities.map((e) =>
    typeof e === 'string' ? { name: e, source: 'brave' as const } : e
  );

  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);

    // Enrich each entity (classify type, match reserved profiles) then create/find profile
    const profileResults = await Promise.all(
      batch.map(async (entity) => {
        const enrichment = await enrichEntity(entity, supabase);

        // Events and ambiguous entities: skip token creation; market can still be generated
        if (enrichment?.skip) {
          console.log(`[pipeline] Skipping token creation for: ${entity.name}`);
          return null;
        }

        // If enrichment matched an existing reserved profile, reuse it
        if (enrichment?.existingCreatorId) {
          const { data: found } = await supabase
            .from('creators')
            .select('id, slug, token_status')
            .eq('id', enrichment.existingCreatorId)
            .single();
          if (found) {
            return {
              id: found.id as string,
              slug: found.slug as string,
              tier: (found.token_status as TokenTier) ?? 'shadow',
            };
          }
        }

        // Otherwise create/find a shadow profile with the enriched handle or original name
        const nameToUse = enrichment?.twitterHandle ?? entity.platformHandle ?? entity.name;
        return createShadowProfileIfNeeded(nameToUse, supabase);
      })
    );

    // Skip market generation for hard_reserved entities entirely
    const entitiesToGenerate = batch.filter((_, j) => profileResults[j]?.tier !== "hard_reserved");

    const results = await Promise.allSettled(
      entitiesToGenerate.map((entity) => generateMarketsForTopic(entity.name, apiKey))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled" && result.value?.length > 0) {
        const entity = entitiesToGenerate[j];
        const batchIdx = batch.indexOf(entity);
        const profile = profileResults[batchIdx];
        const filtered = await filterStaleMarkets(result.value, apiKey, entity.name);
        if (filtered.length > 0) {
          const entityType = classifyEntityType(entity.name);
          const ctx = getEntityContext(entity.name, entityType);

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
            leagueProfile?.slug ?? null,
            entity.name
          );
        }
      }
    }

    if (i + BATCH_SIZE < normalized.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return created;
}

export async function generateMarketsForImportedCreators(
  apiKey: string,
  supabase: SupabaseClient,
  limit = 20
): Promise<number> {
  // Fetch creators who have 0 markets and are active_unverified or active_verified
  const { data: creators } = await supabase
    .from("creators")
    .select("slug, name, token_status")
    .in("token_status", ["active_unverified", "active_verified"])
    .eq("markets_count", 0)
    .not("name", "in", '("ConflictMarkets","ElectionMarkets","SportsMarkets","ViralMarkets","CryptoMarkets1","EntertainmentMarkets")')
    .limit(limit);

  if (!creators?.length) return 0;

  console.log(`[generateForImported] Found ${creators.length} creators with 0 markets`);

  const entities = creators.map((c: { name: string }) => c.name);
  return await bulkGenerateAndInsert(entities, apiKey, supabase);
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
    // Still create team/league even if creator already exists —
    // bulk-import may have created the profile without team/league tokens
    if (profile.team) await createShadowProfileIfNeeded(profile.team, supabase);
    if (profile.league) await createShadowProfileIfNeeded(profile.league, supabase);
    console.log(`[marqueeImport] Already exists: ${slug} — team/league ensured`);
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

// ─── Categorical market insertion ────────────────────────────────────────────

export async function insertCategoricalMarket(
  market: CategoricalMarketDraft,
  supabase: SupabaseClient
): Promise<void> {
  const isDupe = await isDuplicateMarket(market.title, supabase);
  if (isDupe) {
    console.log(`[pipeline] Skipping duplicate categorical: ${market.title}`);
    return;
  }

  const resolveAt = new Date();
  resolveAt.setDate(resolveAt.getDate() + 60);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: marketRow, error } = await (supabase as any)
    .from("markets")
    .insert({
      title: market.title,
      description: market.description,
      category: market.category,
      market_type: "categorical",
      status: "open",
      slug: uniqueSlug(slugify(market.title)),
      resolve_at: resolveAt.toISOString(),
      yes_price: 0.5,
      no_price: 0.5,
      liquidity: 1000,
      yes_pool: 500,
      no_pool: 500,
      total_volume: 0,
    })
    .select()
    .single();

  if (error || !marketRow) {
    console.error("[insertCategoricalMarket] Insert failed:", error);
    return;
  }

  const cleanedOutcomes = market.outcomes.filter(o =>
    !/(other|field|someone|catch.all|tbd|unknown)/i.test(o.label)
  );

  const total = cleanedOutcomes.reduce((sum, o) => sum + o.probability, 0);
  const normalized = cleanedOutcomes.map(o => ({
    ...o,
    probability: o.probability / total,
  }));

  const outcomesData = normalized.map((outcome, i) => ({
    market_id: marketRow.id,
    label: outcome.label,
    slug: outcome.slug,
    creator_slug: outcome.slug,
    probability: outcome.probability,
    pool_size: Math.round(outcome.probability * 1000),
    image_url: outcome.image_url ?? null,
    display_order: i,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("market_outcomes").insert(outcomesData);
}

// ─── Auto-claim verification ──────────────────────────────────────────────────

export async function checkPendingClaims(supabase: AnySupabase): Promise<number> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!braveKey) return 0;

  // Get pending claim codes
  const { data: codes } = await supabase
    .from("claim_codes")
    .select("slug, code")
    .eq("status", "pending")
    .limit(20);

  if (!codes?.length) return 0;

  let claimed = 0;
  for (const { slug, code } of codes) {
    try {
      // Search for the claim code being posted publicly
      const searchText = await fetchBraveResults(code, braveKey);
      if (searchText && searchText.includes(code)) {
        // Code found publicly — auto-verify
        await supabase
          .from("claim_codes")
          .update({ status: "claimed", claimed_at: new Date().toISOString() })
          .eq("code", code);

        await supabase
          .from("creators")
          .update({ token_status: "claimed" })
          .eq("slug", slug);

        console.log(`[checkPendingClaims] Auto-claimed: ${slug} via code ${code}`);
        claimed++;
      }
    } catch { continue; }
  }
  return claimed;
}

// ─── DeSo profile auto-creation ───────────────────────────────────────────────

export async function processPendingDesoCreations(
  supabase: SupabaseClient,
  limit = 10
): Promise<{ created: number; failed: number }> {
  const { createDesoProfileForCreator } = await import('../deso/create-profile');

  const { data: pending } = await supabase
    .from('creators')
    .select('slug, name, image_url')
    .eq('token_status', 'pending_deso_creation')
    .limit(limit);

  if (!pending?.length) return { created: 0, failed: 0 };

  let created = 0;
  let failed = 0;

  for (const creator of pending) {
    const result = await createDesoProfileForCreator({
      username: creator.slug,
      description: `${creator.name} on Caldera — prediction markets and creator tokens. Claim at caldera.market/claim/${creator.slug}`,
      profilePicUrl: creator.image_url ?? undefined,
    });

    if (result.success && result.publicKey) {
      await supabase.from('creators').update({
        deso_username: result.username ?? creator.slug,
        deso_public_key: result.publicKey,
        token_status: 'active_unverified',
        image_url: result.publicKey
          ? `https://node.deso.org/api/v0/get-single-profile-picture/${result.publicKey}`
          : creator.image_url,
      }).eq('slug', creator.slug);

      created++;
      console.log(`[deso-create] Created profile for ${creator.name} (${creator.slug})`);
    } else {
      await supabase.from('creators').update({
        token_status: 'deso_creation_failed',
      }).eq('slug', creator.slug);

      failed++;
      console.log(`[deso-create] Failed for ${creator.slug}: ${result.error}`);
    }

    // Rate limit — DeSo allows ~1 profile creation per 2 seconds
    await new Promise(r => setTimeout(r, 2000));
  }

  return { created, failed };
}

export async function queueAllCreatorsForDesoCreation(
  supabase: SupabaseClient
): Promise<number> {
  const { data } = await supabase
    .from('creators')
    .update({ token_status: 'pending_deso_creation' })
    .is('deso_username', null)
    .not('token_status', 'eq', 'pending_deso_creation')
    .not('token_status', 'eq', 'deso_creation_failed')
    .select('slug');

  return data?.length ?? 0;
}

// ─── Audit and fix fan-account contamination ──────────────────────────────────
// Removes DeSo links from profiles that are not IsReserved and have <100 holders.
// Those are fan accounts — the real person can never claim them.
// Marks them as pending_deso_creation so the platform wallet creates a real profile.

export async function auditAndFixReservedProfiles(
  supabase: SupabaseClient,
  limit = 50
): Promise<{ fixed: number; removed: number }> {
  // Cast to any — is_reserved and founder_reward_basis_points not yet in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: creators } = await db
    .from('creators')
    .select('slug, deso_username, is_reserved, creator_coin_holders')
    .eq('is_reserved', false)
    .not('deso_username', 'is', null)
    .lt('creator_coin_holders', 100)
    .limit(limit);

  if (!creators?.length) return { fixed: 0, removed: 0 };

  let fixed = 0;
  let removed = 0;

  for (const creator of creators as Array<{ slug: string; deso_username: string; is_reserved: boolean; creator_coin_holders: number }>) {
    try {
      const res = await fetch('https://api.deso.org/api/v0/get-single-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Username: creator.deso_username }),
      });
      const data = await res.json();
      const profile = data?.Profile;

      if (!profile) {
        // Profile doesn't exist on DeSo — strip the link
        await db.from('creators').update({
          deso_username: null,
          token_status: 'shadow',
        }).eq('slug', creator.slug);
        removed++;
        console.log(`[audit] Stripped missing profile: ${creator.slug}`);
        continue;
      }

      const isReserved = profile.IsReserved === true;
      const holders = profile.CoinEntry?.NumberOfHolders ?? 0;

      if (!isReserved && holders < 100) {
        // Fan account with low holders — queue for platform wallet creation
        await db.from('creators').update({
          deso_username: null,
          deso_public_key: null,
          is_reserved: false,
          token_status: 'pending_deso_creation',
          creator_coin_price: 0,
          creator_coin_holders: 0,
        }).eq('slug', creator.slug);
        removed++;
        console.log(`[audit] Removed fan account link: ${creator.slug} (${creator.deso_username}, ${holders} holders)`);
      } else {
        // Legitimate profile — update with accurate data
        await db.from('creators').update({
          is_reserved: isReserved,
          creator_coin_price: (profile.CoinPriceDeSoNanos / 1e9) * 4.63,
          creator_coin_holders: holders,
          founder_reward_basis_points: profile.CoinEntry?.CreatorBasisPoints ?? 0,
        }).eq('slug', creator.slug);
        fixed++;
        console.log(`[audit] Confirmed legitimate: ${creator.slug} (reserved=${isReserved}, ${holders} holders)`);
      }

      await new Promise(r => setTimeout(r, 300));
    } catch { /* skip */ }
  }

  return { fixed, removed };
}

// ─── Clean squatter profiles (one-time audit) ─────────────────────────────────
// Fetches all creators where is_reserved=false AND creator_coin_holders < 100
// AND deso_username IS NOT NULL. Verifies each against live DeSo API.
// If still not reserved and < 100 holders: strips DeSo link and queues for
// platform wallet creation. Returns count of profiles cleaned.

export async function cleanSquatterProfiles(
  supabase: SupabaseClient,
  limit = 200
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: creators } = await db
    .from('creators')
    .select('slug, deso_username, is_reserved, creator_coin_holders')
    .eq('is_reserved', false)
    .not('deso_username', 'is', null)
    .lt('creator_coin_holders', 100)
    .limit(limit);

  if (!creators?.length) return 0;

  let cleaned = 0;

  for (const creator of creators as Array<{
    slug: string;
    deso_username: string;
    is_reserved: boolean;
    creator_coin_holders: number;
  }>) {
    try {
      const res = await fetch('https://api.deso.org/api/v0/get-single-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Username: creator.deso_username }),
      });
      const data = await res.json();
      const profile = data?.Profile;

      const isReserved = profile?.IsReserved === true;
      const holders: number = profile?.CoinEntry?.NumberOfHolders ?? 0;

      if (!isReserved && holders < 100) {
        await db.from('creators').update({
          deso_username: null,
          deso_public_key: null,
          token_status: 'pending_deso_creation',
        }).eq('slug', creator.slug);
        cleaned++;
        console.log(`[cleanSquatterProfiles] Cleaned squatter: ${creator.slug} (${creator.deso_username}, reserved:${isReserved}, holders:${holders})`);
      }

      await new Promise(r => setTimeout(r, 300));
    } catch { /* skip */ }
  }

  return cleaned;
}
