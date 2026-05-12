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
  if (creator.token_status === "redirect" && creator.name) {
    redirect(`/creators/${creator.name}`);
  }

  const [{ data: markets }, { data: claimRow }, earnings] = await Promise.all([
    supabase
      .from("markets")
      .select("*")
      .eq("creator_slug", creator.slug)
      .order("trending_score", { ascending: false }),
    (supabase as DB)
      .from("claim_codes")
      .select("code")
      .eq("slug", creator.slug)
      .eq("status", "pending")
      .maybeSingle(),
    getCreatorEarnings(supabase, creator.slug),
  ]);

  // Hide profiles with no DeSo identity AND no markets
  if (
    creator &&
    !creator.deso_username &&
    (!markets || markets.length === 0)
  ) {
    notFound();
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://caldera.market";
  const claimCodeValue = creator.claim_code ?? claimRow?.code ?? null;
  const claimUrl = claimCodeValue ? `${appUrl}/claim/${claimCodeValue}` : null;

  return (
    <CreatorProfileClient
      creator={creator as Creator}
      markets={(markets ?? []) as Market[]}
      earnings={earnings}
      claimUrl={claimUrl}
    />
  );
}
