import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAdminAuthorized } from "@/lib/admin/auth";

function generateClaimCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `CALDERA-${seg(4)}-${seg(4)}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, creatorSlug, twitterHandle, adminPassword, desoPublicKey } = body;

  if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!action || !creatorSlug) {
    return NextResponse.json({ error: "action and creatorSlug required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: creator, error: fetchErr } = await supabase
    .from("creators")
    .select("*")
    .eq("slug", creatorSlug)
    .maybeSingle();

  if (fetchErr || !creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // ── REJECT ────────────────────────────────────────────────────────────────
  if (action === "reject") {
    await supabase
      .from("creators")
      .update({ verification_status: "rejected" })
      .eq("slug", creatorSlug);

    return NextResponse.json({ success: true, action: "rejected" });
  }

  // ── APPROVE ───────────────────────────────────────────────────────────────
  if (action === "approve") {
    if (!twitterHandle) {
      return NextResponse.json({ error: "twitterHandle required for approval" }, { status: 400 });
    }

    const handle = twitterHandle.replace(/^@/, "").toLowerCase().trim();

    // Step 1-3: set twitter_handle, verified, verification_status
    const updates: Record<string, unknown> = {
      twitter_handle: handle,
      twitter_handle_verified: true,
      verification_status: "approved",
    };

    // Step 4: if slug differs, update slug and all market creator_slugs
    const newSlug = handle;
    if (creator.slug !== newSlug) {
      // Update markets first
      await supabase
        .from("markets")
        .update({ creator_slug: newSlug })
        .eq("creator_slug", creator.slug);

      updates.slug = newSlug;
    }

    // Step 5-6: create DeSo profile via platform wallet
    let desoKey: string | null = creator.deso_public_key ?? null;
    let desoUsername: string | null = creator.deso_username ?? null;

    try {
      const { createDesoProfileForCreator } = await import("@/lib/deso/create-profile");
      const result = await createDesoProfileForCreator({
        username: handle,
        description: `${creator.name} on Caldera — prediction markets. Claim at caldera.market/creators/${newSlug}`,
        profilePicUrl: creator.image_url ?? undefined,
      });

      if (result.success && result.publicKey) {
        desoKey = result.publicKey;
        desoUsername = result.username ?? handle;
        updates.deso_public_key = desoKey;
        updates.deso_username = desoUsername;
        updates.image_url = `https://node.deso.org/api/v0/get-single-profile-picture/${desoKey}`;
      } else {
        console.warn(`[verify-creator] DeSo profile creation failed for ${handle}: ${result.error}`);
      }
    } catch (err) {
      console.error("[verify-creator] DeSo creation error:", err);
    }

    // Step 7: set token_status = 'active_unverified'
    updates.token_status = "active_unverified";

    // Step 8: generate claim_code
    const claimCode = generateClaimCode();
    updates.claim_code = claimCode;
    updates.claim_status = "unclaimed";

    // Write all updates
    await supabase.from("creators").update(updates).eq("id", creator.id);

    return NextResponse.json({
      success: true,
      action: "approved",
      newSlug,
      claimCode,
      desoKey,
      desoUsername,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
