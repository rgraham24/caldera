import { createServiceClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { CreatorProfileClient } from "./creator-profile-client";
import { getCreatorEarnings } from "@/lib/creators/earnings";
import type { Market, Creator } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceClient();

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

  const [{ data: markets }, { data: recentTrades }, { data: claimRow }, earnings] = await Promise.all([
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

    getCreatorEarnings(supabase, creator.slug),
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

  // recentTrades was a placeholder fetch (empty market_id list); the real
  // list is in `trades` above. Reference unused variable so the linter is
  // happy.
  void recentTrades;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.caldera.market";

  // Prefer claim_code from creators table (new system), fall back to claim_codes table
  const claimCodeValue = creator.claim_code ?? claimRow?.code ?? null;
  const claimUrl = claimCodeValue ? `${appUrl}/claim/${claimCodeValue}` : null;

  return (
    <CreatorProfileClient
      creator={creator as Creator}
      markets={(markets ?? []) as Market[]}
      earnings={earnings}
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
