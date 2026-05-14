/**
 * GET /api/creators/[slug]/youtube
 *
 * Resolves a creator slug to YouTube channel stats. Used by the
 * Create-market wizard's Step 1 → Step 2 transition to prefetch the
 * current subscriber count so milestone chips can render realistic
 * targets.
 *
 * Caching strategy:
 *   - Fresh hit (youtube_stats_updated_at within 15 min) → served
 *     from the creators row, no API call.
 *   - Stale or never-fetched → live API call. On success, persist
 *     youtube_channel_id, youtube_handle, youtube_subscriber_count,
 *     youtube_stats_updated_at back to the creators row so future
 *     reads stay cheap.
 *
 * Lookup chain when no channel ID is stored:
 *   1. Try lib/youtube/getChannelStatsByHandle(deso_username)
 *   2. If still no match → 404 reason='no_youtube_channel'
 *
 * Not admin-gated — anyone using the wizard hits this. Per-IP rate
 * limited via the existing checkRateLimit primitive (30/min). Service
 * client used so the cache-back write works regardless of session.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getChannelStatsByChannelId,
  getChannelStatsByHandle,
  type YouTubeChannelStats,
} from "@/lib/youtube";

const CACHE_FRESH_MS = 15 * 60 * 1000;

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

type CreatorRow = {
  slug: string;
  name: string | null;
  deso_username: string | null;
  youtube_channel_id: string | null;
  youtube_handle: string | null;
  youtube_subscriber_count: number | string | null;
  youtube_stats_updated_at: string | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Rate limit by IP. Fail-open semantics live inside checkRateLimit
  // (missing Upstash env → allowed=true with a logged warning).
  const ip = getIp(req);
  const rl = await checkRateLimit(`creator-youtube:${ip}`, "creator_youtube_lookup");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again in a minute" },
      { status: 429 }
    );
  }

  const supabase = createServiceClient();

  // The new YT columns may not exist yet at the schema level; the
  // generated types don't know about them either. Cast through any
  // so the select tolerates both states.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creator, error } = await (supabase as any)
    .from("creators")
    .select(
      "slug, name, deso_username, youtube_channel_id, youtube_handle, youtube_subscriber_count, youtube_stats_updated_at"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[creator-youtube] supabase error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!creator) {
    return NextResponse.json(
      { error: "Creator not found", reason: "creator_not_found" },
      { status: 404 }
    );
  }

  const row = creator as CreatorRow;

  // ── Cache hit path ────────────────────────────────────────────
  const updatedAt = row.youtube_stats_updated_at
    ? new Date(row.youtube_stats_updated_at).getTime()
    : 0;
  const cacheFresh =
    !!row.youtube_channel_id &&
    row.youtube_subscriber_count != null &&
    updatedAt > Date.now() - CACHE_FRESH_MS;

  if (cacheFresh) {
    return NextResponse.json({
      creator: { slug: row.slug, name: row.name },
      youtube: {
        channelId: row.youtube_channel_id,
        handle: row.youtube_handle,
        title: row.name ?? row.youtube_handle ?? row.slug,
        subscriberCount: Number(row.youtube_subscriber_count),
        thumbnailUrl: null, // not cached; live fetch fills it
        cached: true,
        fetchedAt: row.youtube_stats_updated_at,
      },
    });
  }

  // ── Live API path ─────────────────────────────────────────────
  let stats: YouTubeChannelStats | null = null;
  if (row.youtube_channel_id) {
    stats = await getChannelStatsByChannelId(row.youtube_channel_id);
  } else if (row.deso_username) {
    // Best-effort: DeSo handle often (but not always) matches the
    // YouTube handle for creator-economy users.
    stats = await getChannelStatsByHandle(row.deso_username);
  }

  if (!stats) {
    return NextResponse.json(
      {
        error: "No YouTube channel resolved for this creator",
        reason: "no_youtube_channel",
        creator: { slug: row.slug, name: row.name },
      },
      { status: 404 }
    );
  }

  // Persist back to the creator row. Fire-and-forget — a failure
  // here is non-fatal (we still return the live stats), and the next
  // request will retry the write.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (supabase as any)
    .from("creators")
    .update({
      youtube_channel_id: stats.channelId,
      youtube_handle: stats.handle,
      youtube_subscriber_count: stats.subscriberCount,
      youtube_stats_updated_at: stats.fetchedAt,
    })
    .eq("slug", slug)
    .then(({ error: writeError }: { error: { message: string } | null }) => {
      if (writeError) {
        console.error(
          "[creator-youtube] cache write failed:",
          writeError.message
        );
      }
    });

  return NextResponse.json({
    creator: { slug: row.slug, name: row.name },
    youtube: {
      channelId: stats.channelId,
      handle: stats.handle,
      title: stats.title,
      subscriberCount: stats.subscriberCount,
      thumbnailUrl: stats.thumbnailUrl,
      cached: false,
      fetchedAt: stats.fetchedAt,
    },
  });
}
