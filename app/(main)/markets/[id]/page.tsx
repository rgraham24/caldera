import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { MarketDetailClient } from "./market-detail-client";
import type { CommentWithUser, Creator } from "@/types";

export const revalidate = 0;

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  const supabase = await createClient();

  // Try by UUID first, then fall back to slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

  const { data: market } = await supabase
    .from("markets")
    .select("*")
    .eq(isUuid ? "id" : "slug", slug)
    .single();

  if (!market) notFound();

  const marketId = market.id as string;
  const { data: rawComments } = await supabase
    .from("market_comments")
    .select("*, user:users(id, username, avatar_url, is_verified, deso_public_key)")
    .eq("market_id", marketId)
    .order("created_at", { ascending: false });

  // Enrich comments with creator data when the comment author has a
  // matching creators row (by deso_public_key). users.username is often
  // just a DeSo pubkey for users without a handle — the creator row is
  // the better source of name + avatar + /creators/[slug] link.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commentUserKeys = Array.from(
    new Set(
      ((rawComments ?? []) as Array<{ user?: { deso_public_key?: string | null } }>)
        .map((c) => c.user?.deso_public_key ?? null)
        .filter((k): k is string => Boolean(k))
    )
  );
  let creatorByDesoKey = new Map<string, { slug: string; name: string; image_url: string | null; deso_username: string | null }>();
  if (commentUserKeys.length > 0) {
    const { data: commentCreators } = await supabase
      .from("creators")
      .select("slug, name, image_url, deso_username, deso_public_key")
      .in("deso_public_key", commentUserKeys);
    creatorByDesoKey = new Map(
      (commentCreators ?? []).map((c) => [
        c.deso_public_key as string,
        {
          slug: c.slug as string,
          name: c.name as string,
          image_url: (c.image_url as string | null) ?? null,
          deso_username: (c.deso_username as string | null) ?? null,
        },
      ])
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrichedComments = ((rawComments as unknown as CommentWithUser[]) ?? []).map((c) => {
    const key = c.user?.deso_public_key ?? null;
    return {
      ...c,
      creator: key ? creatorByDesoKey.get(key) ?? null : null,
    };
  });

  const { data: relatedMarkets } = await supabase
    .from("markets")
    .select("*")
    .eq("category", market.category)
    .neq("id", market.id)
    .eq("status", "open")
    .order("trending_score", { ascending: false })
    .limit(3);

  // Recent trades for the Activity tab. Joins to users for the trader's
  // DeSo pubkey, then resolves to a creator row (same fallback chain as
  // comments). Cap at 50; UI can paginate later if/when 50/market is
  // common (currently the platform-wide trade total is in the dozens).
  const { data: rawTrades } = await supabase
    .from("trades")
    .select(
      "id, user_id, side, action_type, quantity, price, gross_amount, created_at, user:users(username, avatar_url, deso_public_key)"
    )
    .eq("market_id", marketId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Reuse the same creator-lookup pattern: fetch creators by
  // deso_public_key for trades whose users have one.
  const tradeUserKeys = Array.from(
    new Set(
      ((rawTrades ?? []) as Array<{ user?: { deso_public_key?: string | null } | null }>)
        .map((t) => t.user?.deso_public_key ?? null)
        .filter((k): k is string => Boolean(k))
    )
  );
  const tradeCreatorByKey = new Map<string, { slug: string; name: string; image_url: string | null }>();
  if (tradeUserKeys.length > 0) {
    // Skip refetch if the comments lookup already covered the same keys.
    const missing = tradeUserKeys.filter((k) => !creatorByDesoKey.has(k));
    if (missing.length > 0) {
      const { data: tradeCreators } = await supabase
        .from("creators")
        .select("slug, name, image_url, deso_public_key")
        .in("deso_public_key", missing);
      for (const c of tradeCreators ?? []) {
        tradeCreatorByKey.set(c.deso_public_key as string, {
          slug: c.slug as string,
          name: c.name as string,
          image_url: (c.image_url as string | null) ?? null,
        });
      }
    }
    for (const k of tradeUserKeys) {
      const fromComments = creatorByDesoKey.get(k);
      if (fromComments && !tradeCreatorByKey.has(k)) {
        tradeCreatorByKey.set(k, {
          slug: fromComments.slug,
          name: fromComments.name,
          image_url: fromComments.image_url,
        });
      }
    }
  }
  const trades = ((rawTrades ?? []) as Array<{
    id: string;
    user_id: string | null;
    side: string;
    action_type: string;
    quantity: number;
    price: number;
    gross_amount: number;
    created_at: string;
    user: { username: string | null; avatar_url: string | null; deso_public_key: string | null } | null;
  }>).map((t) => {
    const key = t.user?.deso_public_key ?? null;
    return {
      ...t,
      creator: key ? tradeCreatorByKey.get(key) ?? null : null,
    };
  });

  // Fetch creator if this is a creator market
  let creator: Creator | null = null;
  if (market.creator_id) {
    const { data: creatorData } = await supabase
      .from("creators")
      .select("*")
      .eq("id", market.creator_id)
      .single();
    creator = creatorData;
  }

  return (
    <MarketDetailClient
      market={market}
      comments={enrichedComments}
      relatedMarkets={relatedMarkets ?? []}
      creator={creator}
      trades={trades}
    />
  );
}
