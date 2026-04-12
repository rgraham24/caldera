import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COINS = [
  { id: "bitcoin", ticker: "BTC", slug: "bitcoin" },
  { id: "ethereum", ticker: "ETH", slug: "caldera-eth" },
  { id: "solana", ticker: "SOL", slug: "solana" },
  { id: "chainlink", ticker: "LINK", slug: "chainlink" },
  { id: "matic-network", ticker: "MATIC", slug: "polygon" },
];

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // Fetch current prices from Binance.US (free, no rate limits, no API key)
  const BINANCE_SYMBOLS: Record<string, string> = {
    bitcoin: "BTCUSDT",
    ethereum: "ETHUSDT",
    solana: "SOLUSDT",
    chainlink: "LINKUSDT",
    "matic-network": "MATICUSDT",
  };
  const rawPrices: Record<string, number> = {};
  await Promise.all(
    COINS.map(async (coin) => {
      const symbol = BINANCE_SYMBOLS[coin.id];
      if (!symbol) return;
      const res = await fetch(`https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`);
      const data = await res.json();
      rawPrices[coin.id] = parseFloat(data.price);
    })
  );
  // Normalise to same shape the rest of the route expects
  const prices: Record<string, { usd: number }> = {};
  for (const [id, usd] of Object.entries(rawPrices)) prices[id] = { usd };

  const now = new Date();
  const resolveAt = new Date(now.getTime() + 5 * 60 * 1000); // +5 minutes
  const resolveStr = resolveAt.toISOString();

  const markets = [];
  for (const coin of COINS) {
    const price = prices[coin.id]?.usd;
    if (!price) continue;

    const above = price * 1.003; // 0.3% above
    const below = price * 0.997; // 0.3% below
    const timeStr = resolveAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/New_York",
    });

    // For sub-$1 coins show enough decimal places; for $1+ coins show no decimals
    function fmtPrice(p: number) {
      if (p >= 100) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
      if (p >= 1)   return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return p.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }

    markets.push({
      title: `Will $${coin.ticker} be above $${fmtPrice(above)} at ${timeStr} ET?`,
      category: "Crypto",
      creator_slug: coin.slug,
      market_type: "binary",
      status: "open",
      crypto_ticker: coin.ticker,
      crypto_target_price: above,
      yes_price: 0.5,
      no_price: 0.5,
      yes_pool: 500,
      no_pool: 500,
      liquidity: 1000,
      close_at: resolveStr,
      resolve_at: resolveStr,
      auto_resolve_at: resolveStr,
      featured_score: 20,
      trending_score: 80,
      slug: `${coin.ticker.toLowerCase()}-above-${Math.floor(above)}-${Date.now()}`,
    });

    markets.push({
      title: `Will $${coin.ticker} be below $${fmtPrice(below)} at ${timeStr} ET?`,
      category: "Crypto",
      creator_slug: coin.slug,
      market_type: "binary",
      status: "open",
      crypto_ticker: coin.ticker,
      crypto_target_price: below,
      yes_price: 0.5,
      no_price: 0.5,
      yes_pool: 500,
      no_pool: 500,
      liquidity: 1000,
      close_at: resolveStr,
      resolve_at: resolveStr,
      auto_resolve_at: resolveStr,
      featured_score: 20,
      trending_score: 80,
      slug: `${coin.ticker.toLowerCase()}-below-${Math.floor(below)}-${Date.now()}`,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("markets").insert(markets).select("id");
  if (error) {
    console.error("[crypto-markets]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[crypto-markets] Created ${data.length} markets`);
  return NextResponse.json({ created: data.length });
}
