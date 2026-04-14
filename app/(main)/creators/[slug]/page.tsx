import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
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

  // Redirect old wrong-slug URLs to the correct canonical slug
  // (creator.name holds the correct slug when token_status = 'redirect')
  if (creator.token_status === "redirect" && creator.name) {
    redirect(`/creators/${creator.name}`);
  }

  const [{ data: markets }, { data: recentTrades }, { data: claimRow }, { data: volumeRows }] = await Promise.all([
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

    // Sum total_volume across all markets tied to this creator (by creator_slug OR category_token_slug)
    (supabase as DB)
      .from("markets")
      .select("total_volume")
      .or(`creator_slug.eq.${creator.slug},category_token_slug.eq.${creator.slug}`)
      .limit(10000),
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

  // Hide profiles with no DeSo identity AND no markets
  if (
    creator &&
    !creator.deso_username &&
    (!markets || markets.length === 0)
  ) {
    notFound();
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://caldera.market";
  const claimUrl = claimRow?.code ? `${appUrl}/claim/${claimRow.code}` : null;

  const holderEarnings = Math.round(
    (volumeRows ?? []).reduce((sum: number, m: { total_volume: number | null }) => sum + (m.total_volume ?? 0), 0) * 0.01 * 100
  ) / 100;

  return (
    <CreatorProfileClient
      creator={creator as Creator}
      markets={(markets ?? []) as Market[]}
      holderEarnings={holderEarnings}
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
