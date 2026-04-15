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
    .select("*, user:users(id, username, avatar_url, is_verified)")
    .eq("market_id", marketId)
    .order("created_at", { ascending: false });

  const { data: relatedMarkets } = await supabase
    .from("markets")
    .select("*")
    .eq("category", market.category)
    .neq("id", market.id)
    .eq("status", "open")
    .order("trending_score", { ascending: false })
    .limit(3);

  const { data: configRows } = await supabase
    .from("platform_config")
    .select("*");

  const feeConfig: Record<string, string> = {};
  (configRows as Array<{ key: string; value: string }> | null)?.forEach(
    (row) => {
      feeConfig[row.key] = row.value;
    }
  );

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
      comments={(rawComments as unknown as CommentWithUser[]) ?? []}
      relatedMarkets={relatedMarkets ?? []}
      feeConfig={feeConfig}
      creator={creator}
    />
  );
}
