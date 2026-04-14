import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/claim/tweet-verify
 * Verifies that the creator posted a tweet containing their claim code.
 * Uses Brave Search to find the tweet on twitter.com / x.com.
 */
export async function POST(req: NextRequest) {
  const { code } = await req.json();

  if (!code) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Look up creator by claim_code
  const { data: creator } = await supabase
    .from("creators")
    .select("id, slug, name, twitter_handle, claim_code, claim_status, verification_status")
    .eq("claim_code", code)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json({ error: "Invalid claim code" }, { status: 404 });
  }

  if (creator.claim_status === "claimed") {
    return NextResponse.json({ error: "Already claimed" }, { status: 409 });
  }

  if (creator.verification_status !== "approved") {
    return NextResponse.json({ error: "Creator not approved for claiming" }, { status: 400 });
  }

  const handle = creator.twitter_handle;
  const claimCode = creator.claim_code;

  if (!handle || !claimCode) {
    return NextResponse.json({ error: "Creator missing twitter_handle or claim_code" }, { status: 400 });
  }

  // ── Search for the tweet via Brave Search ─────────────────────────────────
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!braveKey) {
    // No API key — grant in dev/testing fallback
    console.warn("[tweet-verify] No BRAVE_SEARCH_API_KEY, granting verification in dev mode");
    await supabase.from("creators").update({ claim_status: "pending_claim" }).eq("id", creator.id);
    return NextResponse.json({ verified: true, method: "dev_bypass" });
  }

  const query = `"${claimCode}" site:twitter.com OR site:x.com`;

  try {
    const searchRes = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": braveKey,
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!searchRes.ok) {
      return NextResponse.json({ verified: false, reason: "Search unavailable" });
    }

    const searchData = await searchRes.json();
    const results: Array<{ url?: string; title?: string; description?: string }> =
      searchData?.web?.results ?? [];

    // Check if any result contains the claim code AND the twitter handle
    const handleLower = handle.toLowerCase();
    const codeLower = claimCode.toLowerCase();

    const found = results.some((r) => {
      const text = `${r.url ?? ""} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase();
      return text.includes(codeLower) && text.includes(handleLower);
    });

    if (found) {
      await supabase.from("creators").update({ claim_status: "pending_claim" }).eq("id", creator.id);
      return NextResponse.json({ verified: true });
    }

    return NextResponse.json({ verified: false, reason: "Tweet not found yet" });
  } catch (err) {
    console.error("[tweet-verify] Search error:", err);
    return NextResponse.json({ verified: false, reason: "Search error" });
  }
}
