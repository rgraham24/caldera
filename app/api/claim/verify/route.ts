import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

async function isCodePublic(code: string, socialPostUrl: string): Promise<boolean> {
  // 1. Try Brave Search API
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`"${code}"`)}&count=5`,
        { headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": braveKey } }
      );
      if (res.ok) {
        const json = await res.json();
        const results: Array<{ url: string; description?: string }> = json?.web?.results ?? [];
        if (results.some((r) => (r.description ?? "").includes(code) || r.url.includes(code))) {
          return true;
        }
      }
    } catch { /* fall through to direct fetch */ }
  }

  // 2. Direct URL fetch fallback
  if (socialPostUrl) {
    try {
      const res = await fetch(socialPostUrl, {
        headers: { "User-Agent": "CalderaBot/1.0 (+https://caldera.market)" },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        if (html.includes(code)) return true;
      }
    } catch { /* not found */ }
  }

  return false;
}

// POST /api/claim/verify
// Body: { code, desoPublicKey, socialPostUrl }
export async function POST(req: NextRequest) {
  const { code, desoPublicKey, socialPostUrl } = await req.json();

  if (!code || !desoPublicKey || !socialPostUrl) {
    return NextResponse.json(
      { error: "code, desoPublicKey, and socialPostUrl are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Look up claim code
  const { data: claimRow } = await (supabase as DB)
    .from("claim_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!claimRow) {
    return NextResponse.json({ error: "Invalid claim code" }, { status: 404 });
  }
  if (claimRow.status === "claimed") {
    return NextResponse.json({ error: "This code has already been used" }, { status: 400 });
  }

  // Look up creator
  const { data: creator } = await supabase
    .from("creators")
    .select("id, slug, name, deso_username, creator_coin_symbol, token_status")
    .eq("slug", claimRow.slug)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // Check public post
  const found = await isCodePublic(code, socialPostUrl);
  if (!found) {
    return NextResponse.json(
      {
        error:
          "Could not find the code at that URL. Make sure the post is public and try again — it can take a few minutes to be indexed.",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // Mark claim code as claimed
  await (supabase as DB)
    .from("claim_codes")
    .update({ status: "claimed", claimed_at: now, claimed_by_deso_key: desoPublicKey, social_post_url: socialPostUrl })
    .eq("code", code);

  // Update creator record
  await supabase
    .from("creators")
    .update({
      deso_public_key: desoPublicKey,
      token_status: "active_verified",
      tier: "verified_creator",
    } as DB)
    .eq("id", creator.id);

  const sym = creator.deso_username ?? creator.creator_coin_symbol ?? creator.slug;

  return NextResponse.json({
    data: {
      success: true,
      slug: creator.slug,
      symbol: sym,
      message: `$${sym} token is now yours! You'll earn fees from every market trade.`,
    },
  });
}
