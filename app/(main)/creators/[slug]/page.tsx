import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CreatorProfileClient } from "./creator-profile-client";
import type { Market, Creator } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Try slug first, then deso_username as fallback
  let { data: creator } = await supabase
    .from("creators")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!creator) {
    const { data: byUsername } = await supabase
      .from("creators")
      .select("*")
      .eq("deso_username", slug)
      .single();
    creator = byUsername;
  }

  if (!creator) notFound();

  const [{ data: markets }, { data: recentTrades }, { data: claimRow }] = await Promise.all([
    supabase
      .from("markets")
      .select("*")
      .eq("creator_slug", creator.slug)
      .order("trending_score", { ascending: false }),

    supabase
      .from("trades")
      .select("*, market:markets(title, slug)")
      .in("market_id", []) // filled below after markets fetch
      .order("created_at", { ascending: false })
      .limit(10),

    // Look up existing pending claim code for this creator
    (supabase as DB)
      .from("claim_codes")
      .select("code")
      .eq("slug", creator.slug)
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  // Re-fetch trades with actual market IDs
  const marketIds = (markets ?? []).map((m: { id: string }) => m.id);
  const { data: trades } = marketIds.length
    ? await supabase
        .from("trades")
        .select("*, market:markets(title, slug)")
        .in("market_id", marketIds)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };

  // Hide completely empty shadow profiles — no markets and no DeSo username
  if (
    creator &&
    (creator.token_status === "shadow" || !creator.token_status) &&
    !creator.deso_username &&
    (!markets || markets.length === 0)
  ) {
    notFound();
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://caldera.market";
  const claimUrl = claimRow?.code ? `${appUrl}/claim/${claimRow.code}` : null;

  return (
    <CreatorProfileClient
      creator={creator as Creator}
      markets={(markets ?? []) as Market[]}
      recentTrades={(trades as unknown as Array<{
        id: string;
        side: string;
        quantity: number;
        price: number;
        created_at: string;
        market: { title: string; slug: string };
      }>) ?? []}
      claimUrl={claimUrl}
    />
  );
}
