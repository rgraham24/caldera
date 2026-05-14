/**
 * YouTube Data API v3 helper — fetches channel stats by channel ID
 * or handle, with a short in-memory cache so the auto-resolver and
 * the wizard preview don't hammer quota during testing.
 *
 * Direct REST calls (no SDK) keep the bundle slim. All public
 * functions return null on any failure (network, 4xx/5xx, missing
 * item) and log to console.error with context. The only thrown
 * error is when YOUTUBE_API_KEY is unset — that's a deploy
 * misconfiguration and should fail loud, not silent.
 */

export type YouTubeChannelStats = {
  /** Canonical UC... ID. Always present in a successful response. */
  channelId: string;
  /** "@handle" form when YouTube returns one (snippet.customUrl). */
  handle: string | null;
  title: string;
  /**
   * Subscriber count as a number. Channels with hidden subscriber
   * counts surface as 0 here — the API returns subscriberCount: "0"
   * + hiddenSubscriberCount: true in that case and we don't currently
   * thread the hidden flag through. Auto-resolution should treat 0
   * subscribers as "cannot resolve" if hiddenSubscriberCount is a
   * worry; add a hidden flag here if/when that becomes load-bearing.
   */
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  thumbnailUrl: string | null;
  fetchedAt: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<
  string,
  { stats: YouTubeChannelStats; expiresAt: number }
>();

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error(
      "YOUTUBE_API_KEY env var is not set. Configure it in Vercel (Production + Preview + Development) or .env.local."
    );
  }
  return key;
}

// UC... IDs are always 24 chars, prefix UC, alphanumeric / - / _.
function isChannelId(input: string): boolean {
  return /^UC[A-Za-z0-9_-]{22}$/.test(input);
}

type ParsedInput =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string }
  | null;

/** Normalize any of the accepted input shapes into id-or-handle. */
function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // youtube.com/channel/UC...
  const channelUrlMatch = trimmed.match(
    /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/
  );
  if (channelUrlMatch) return { kind: "id", value: channelUrlMatch[1] };

  // youtube.com/@handle  (optional trailing slash / path)
  const handleUrlMatch = trimmed.match(/youtube\.com\/@([A-Za-z0-9._-]+)/);
  if (handleUrlMatch) return { kind: "handle", value: handleUrlMatch[1] };

  // Bare channel ID (UC + 22)
  if (isChannelId(trimmed)) return { kind: "id", value: trimmed };

  // Bare handle (with or without leading @)
  const bare = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  // Strip any trailing slash / path noise the user might paste
  const cleaned = bare.split(/[/?#]/)[0];
  if (!cleaned) return null;
  return { kind: "handle", value: cleaned };
}

type YTChannelResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      customUrl?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
    statistics?: {
      subscriberCount?: string;
      hiddenSubscriberCount?: boolean;
      viewCount?: string;
      videoCount?: string;
    };
  }>;
};

function mapToStats(
  item: NonNullable<YTChannelResponse["items"]>[number]
): YouTubeChannelStats {
  const thumbs = item.snippet?.thumbnails;
  const thumbnailUrl =
    thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? null;
  return {
    channelId: item.id,
    handle: item.snippet?.customUrl ?? null,
    title: item.snippet?.title ?? "",
    subscriberCount: Number(item.statistics?.subscriberCount ?? "0"),
    viewCount: Number(item.statistics?.viewCount ?? "0"),
    videoCount: Number(item.statistics?.videoCount ?? "0"),
    thumbnailUrl,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchChannels(
  params: URLSearchParams
): Promise<YouTubeChannelStats | null> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[youtube] API error ${res.status}:`,
        body.slice(0, 500)
      );
      return null;
    }
    const data = (await res.json()) as YTChannelResponse;
    const item = data.items?.[0];
    if (!item) return null;
    const stats = mapToStats(item);
    cache.set(stats.channelId, {
      stats,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return stats;
  } catch (err) {
    console.error("[youtube] fetch failed:", err);
    return null;
  }
}

/**
 * Fetch channel stats for a known UC... channel ID. Returns null if
 * the channel doesn't exist or the API call fails.
 */
export async function getChannelStatsByChannelId(
  channelId: string
): Promise<YouTubeChannelStats | null> {
  if (!isChannelId(channelId)) {
    console.error("[youtube] invalid channel ID format:", channelId);
    return null;
  }
  const cached = cache.get(channelId);
  if (cached && cached.expiresAt > Date.now()) return cached.stats;

  const key = getApiKey();
  const params = new URLSearchParams({
    part: "statistics,snippet",
    id: channelId,
    key,
  });
  return fetchChannels(params);
}

/**
 * Resolve any of the accepted input shapes to channel stats:
 *   - "@mrbeast" / "mrbeast"
 *   - "UCX6OQ3DkcsbYNE6H8uQQuVA"
 *   - "https://youtube.com/@mrbeast"
 *   - "https://youtube.com/channel/UC..."
 * Returns null if the input can't be parsed or no channel matches.
 */
export async function getChannelStatsByHandle(
  input: string
): Promise<YouTubeChannelStats | null> {
  const parsed = parseInput(input);
  if (!parsed) return null;

  if (parsed.kind === "id") {
    return getChannelStatsByChannelId(parsed.value);
  }

  const key = getApiKey();

  // Primary lookup — modern @handle resolver.
  const params = new URLSearchParams({
    part: "statistics,snippet",
    forHandle: `@${parsed.value}`,
    key,
  });
  const byHandle = await fetchChannels(params);
  if (byHandle) return byHandle;

  // Fallback — legacy channels predating handles still resolve via
  // forUsername (rare for creators large enough to be on Caldera, but
  // cheap to try and saves a confusing null for early YT accounts).
  const fallback = new URLSearchParams({
    part: "statistics,snippet",
    forUsername: parsed.value,
    key,
  });
  return fetchChannels(fallback);
}
