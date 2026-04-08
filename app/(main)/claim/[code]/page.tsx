import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ClaimClient } from "./claim-client";
import type { Creator } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  // Look up the claim code
  const { data: claimRow } = await (supabase as DB)
    .from("claim_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!claimRow) notFound();

  // Fetch the creator
  const { data: creator } = await supabase
    .from("creators")
    .select("*")
    .eq("slug", claimRow.slug)
    .single();

  if (!creator) notFound();

  return (
    <ClaimClient
      code={code}
      creator={creator as Creator}
      alreadyClaimed={claimRow.status === "claimed"}
    />
  );
}
