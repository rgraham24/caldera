import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyFreshDesoJwt } from "@/lib/auth/deso-jwt";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // ── P2-5.3: Fresh-JWT verification for high-value action ─────────
  // Closes CLAIM-2: claim route now requires:
  //  1. Valid session cookie (P2-1, via middleware)
  //  2. Fresh DeSo JWT (this) — proves wallet ownership in last 60s
  //  3. Cookie pubkey == JWT pubkey (cryptographic agreement)
  //
  // Body-supplied desoPublicKey (if present) is IGNORED. All
  // identity comes from cryptographic sources (cookie + JWT).
  const authed = getAuthenticatedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const desoJwt = typeof body?.desoJwt === "string" ? body.desoJwt : null;
  if (!desoJwt) {
    return NextResponse.json(
      { error: "Missing desoJwt", reason: "missing-jwt" },
      { status: 401 }
    );
  }

  const fresh = await verifyFreshDesoJwt(desoJwt, authed.publicKey);
  if (!fresh.ok) {
    return NextResponse.json(
      { error: "Authentication failed", reason: fresh.reason },
      { status: 401 }
    );
  }

  const desoPublicKey = authed.publicKey;
  // ── end P2-5.3 ───────────────────────────────────────────────────

  const supabase = await createClient();

  const { data: creator } = await supabase
    .from("creators")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  if (creator.tier !== "unclaimed") {
    return NextResponse.json({ error: "Profile already claimed or is a public figure" }, { status: 400 });
  }

  if (creator.deso_public_key && creator.deso_public_key !== desoPublicKey) {
    return NextResponse.json(
      { error: "This DeSo account doesn't match this creator's profile" },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  await supabase
    .from("creators")
    .update({
      tier: "verified_creator",
      claimed_at: now,
      deso_public_key: desoPublicKey,
      total_creator_earnings: (creator.total_creator_earnings || 0) + (creator.unclaimed_earnings_escrow || 0),
      unclaimed_earnings_escrow: 0,
    })
    .eq("id", creator.id);

  return NextResponse.json({ data: { claimed: true } });
}
