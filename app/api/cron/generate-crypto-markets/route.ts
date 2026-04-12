import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueSlug(base: string): string {
  return `${base}-${Date.now()}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch current BTC + ETH prices
  let btcPrice = 0;
  let ethPrice = 0;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    btcPrice = data?.bitcoin?.usd ?? 0;
    ethPrice = data?.ethereum?.usd ?? 0;
  } catch (err) {
    console.error("[generate-crypto-markets] CoinGecko fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 502 });
  }

  if (btcPrice <= 0 && ethPrice <= 0) {
    return NextResponse.json({ error: "No valid prices returned" }, { status: 502 });
  }

  const supabase = await createClient();
  const now = new Date();
  const fiveMinutes = new Date(now.getTime() + 5 * 60 * 1000);

  const markets: Array<{
    title: string;
    description: string;
    category: string;
    market_type: string;
    creator_slug: string;
    crypto_ticker: string;
    crypto_target_price: number;
    slug: string;
    status: string;
    yes_pool: number;
    no_pool: number;
    yes_price: number;
    no_price: number;
    liquidity: number;
    total_volume: number;
    close_at: string;
    auto_resolve_at: string;
    resolve_at: string;
    rules_text: string;
  }> = [];

  if (btcPrice > 0) {
    const roundedBtc = Math.round(btcPrice / 100) * 100; // round to nearest $100
    markets.push({
      title: `Will BTC be above $${roundedBtc.toLocaleString()} in 5 minutes?`,
      description: `Current BTC price: $${btcPrice.toLocaleString()}. Resolves YES if BTC price is above $${roundedBtc.toLocaleString()} at resolution time.`,
      category: "Crypto",
      market_type: "crypto_5min",
      creator_slug: "bitcoin",
      crypto_ticker: "BTC",
      crypto_target_price: roundedBtc,
      slug: uniqueSlug(slugify(`btc-above-${roundedBtc}`)),
      status: "open",
      yes_pool: 500,
      no_pool: 500,
      yes_price: 0.5,
      no_price: 0.5,
      liquidity: 1000,
      total_volume: 0,
      close_at: fiveMinutes.toISOString(),
      auto_resolve_at: fiveMinutes.toISOString(),
      resolve_at: fiveMinutes.toISOString(),
      rules_text: `Resolves YES if the BTC/USD price reported by CoinGecko is strictly above $${roundedBtc.toLocaleString()} at resolution time. Resolves NO otherwise.`,
    });
  }

  if (ethPrice > 0) {
    const roundedEth = Math.round(ethPrice / 10) * 10; // round to nearest $10
    markets.push({
      title: `Will ETH be above $${roundedEth.toLocaleString()} in 5 minutes?`,
      description: `Current ETH price: $${ethPrice.toLocaleString()}. Resolves YES if ETH price is above $${roundedEth.toLocaleString()} at resolution time.`,
      category: "Crypto",
      market_type: "crypto_5min",
      creator_slug: "ethereum",
      crypto_ticker: "ETH",
      crypto_target_price: roundedEth,
      slug: uniqueSlug(slugify(`eth-above-${roundedEth}`)),
      status: "open",
      yes_pool: 500,
      no_pool: 500,
      yes_price: 0.5,
      no_price: 0.5,
      liquidity: 1000,
      total_volume: 0,
      close_at: fiveMinutes.toISOString(),
      auto_resolve_at: fiveMinutes.toISOString(),
      resolve_at: fiveMinutes.toISOString(),
      rules_text: `Resolves YES if the ETH/USD price reported by CoinGecko is strictly above $${roundedEth.toLocaleString()} at resolution time. Resolves NO otherwise.`,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("markets").insert(markets);
  if (error) {
    console.error("[generate-crypto-markets] Insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[generate-crypto-markets] Created ${markets.length} markets — BTC $${btcPrice}, ETH $${ethPrice}`);
  return NextResponse.json({ created: markets.length, btcPrice, ethPrice });
}
