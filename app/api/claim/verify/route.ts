import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { code, desoPublicKey, desoUsername, handle } = await req.json();

  if (!code || !desoPublicKey || !handle) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: claimRaw } = await supabase
    .from("claim_codes")
    .select("*")
    .eq("code", code)
    .eq("status", "pending")
    .maybeSingle();

  if (!claimRaw) {
    return NextResponse.json({ error: "Invalid or already claimed code" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claim = claimRaw as any;

  const { data: creatorRaw } = await supabase
    .from("creators")
    .select("id, name, slug, deso_username")
    .eq("slug", claim.slug)
    .maybeSingle();

  if (!creatorRaw) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creator = creatorRaw as any;

  const normalizedHandle = handle.replace(/^@/, "").toLowerCase().trim();
  const normalizedCreatorSlug = creator.slug.toLowerCase().trim();
  const normalizedDesoUsername = (creator.deso_username ?? "").toLowerCase().trim();

  const handleMatches =
    normalizedHandle === normalizedCreatorSlug ||
    normalizedHandle === normalizedDesoUsername ||
    normalizedCreatorSlug.includes(normalizedHandle) ||
    normalizedHandle.includes(normalizedCreatorSlug);

  if (!handleMatches) {
    return NextResponse.json(
      { error: "Handle doesn't match this profile. Contact us if you think this is wrong." },
      { status: 400 }
    );
  }

  await supabase
    .from("claim_codes")
    .update({
      status: "claimed",
      claimed_at: new Date().toISOString(),
      claimed_by_deso_key: desoPublicKey,
    })
    .eq("code", code);

  await supabase
    .from("creators")
    .update({
      claimed: true,
      claimed_by_deso_key: desoPublicKey,
      claimed_at: new Date().toISOString(),
      token_status: "active_verified",
    })
    .eq("id", creator.id);

  await supabase
    .from("users")
    .upsert(
      {
        deso_public_key: desoPublicKey,
        username: desoUsername || normalizedHandle,
        is_creator: true,
        creator_id: creator.id,
      },
      { onConflict: "deso_public_key" }
    );

  return NextResponse.json({ success: true, slug: creator.slug });
}
