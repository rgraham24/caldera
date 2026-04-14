import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { code, desoPublicKey, desoUsername, handle } = await req.json();

  if (!code || !desoPublicKey) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // ── New system: claim_code on creators table ──────────────────────────────
  const { data: creator } = await supabase
    .from("creators")
    .select("id, name, slug, deso_username, claim_status, verification_status")
    .eq("claim_code", code)
    .maybeSingle();

  if (creator) {
    if (creator.claim_status === "claimed") {
      return NextResponse.json({ error: "Already claimed" }, { status: 409 });
    }

    if (creator.claim_status !== "pending_claim") {
      return NextResponse.json(
        { error: "Tweet not yet verified. Complete tweet verification first." },
        { status: 400 }
      );
    }

    await supabase.from("creators").update({
      claim_status: "claimed",
      claimed_at: now,
      claimed_deso_key: desoPublicKey,
      token_status: "claimed",
      // Keep deso_username from admin-created profile; update if user provides one
      ...(desoUsername ? { deso_username: desoUsername } : {}),
    }).eq("id", creator.id);

    await supabase.from("users").upsert(
      {
        deso_public_key: desoPublicKey,
        username: desoUsername || handle || creator.slug,
        is_creator: true,
        creator_id: creator.id,
      },
      { onConflict: "deso_public_key" }
    );

    return NextResponse.json({ success: true, slug: creator.slug });
  }

  // ── Legacy system: claim_codes table ─────────────────────────────────────
  const { data: claim } = await supabase
    .from("claim_codes")
    .select("*")
    .eq("code", code)
    .eq("status", "pending")
    .maybeSingle() as { data: Record<string, string> | null };

  if (!claim) {
    return NextResponse.json({ error: "Invalid or already claimed code" }, { status: 404 });
  }

  const { data: legacyCreator } = await supabase
    .from("creators")
    .select("id, name, slug, deso_username")
    .eq("slug", claim.slug)
    .maybeSingle();

  if (!legacyCreator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const normalizedHandle = (handle ?? "").replace(/^@/, "").toLowerCase().trim();
  const normalizedSlug = legacyCreator.slug.toLowerCase().trim();
  const normalizedDesoUsername = (legacyCreator.deso_username ?? "").toLowerCase().trim();

  const handleMatches =
    !normalizedHandle ||
    normalizedHandle === normalizedSlug ||
    normalizedHandle === normalizedDesoUsername ||
    normalizedSlug.includes(normalizedHandle) ||
    normalizedHandle.includes(normalizedSlug);

  if (!handleMatches) {
    return NextResponse.json(
      { error: "Handle doesn't match this profile. Contact us if you think this is wrong." },
      { status: 400 }
    );
  }

  await supabase.from("claim_codes").update({
    status: "claimed",
    claimed_at: now,
    claimed_by_deso_key: desoPublicKey,
  }).eq("code", code);

  await supabase.from("creators").update({
    claim_status: "claimed",
    claimed_at: now,
    claimed_deso_key: desoPublicKey,
    token_status: "claimed",
  }).eq("id", legacyCreator.id);

  await supabase.from("users").upsert(
    {
      deso_public_key: desoPublicKey,
      username: desoUsername || normalizedHandle || legacyCreator.slug,
      is_creator: true,
      creator_id: legacyCreator.id,
    },
    { onConflict: "deso_public_key" }
  );

  return NextResponse.json({ success: true, slug: legacyCreator.slug });
}
