import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COINS = [
  { id: "bitcoin",  ticker: "BTC",  slug: "bitcoin" },
  { id: "ethereum", ticker: "ETH",  slug: "caldera-eth" },
  { id: "solana",   ticker: "SOL",  slug: "solana" },
  { id: "chainlink",ticker: "LINK", slug: "chainlink" },
  { id: "dogecoin", ticker: "DOGE", slug: "dogecoin" },
];

const BINANCE_SYMBOLS: Record<string, string> = {
  bitcoin:   "BTCUSDT",
  ethereum:  "ETHUSDT",
  solana:    "SOLUSDT",
  chainlink: "LINKUSDT",
  dogecoin:  "DOGEUSDT",
};

function fmtPrice(p: number): string {
  if (p >= 100) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1)   return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function etTimeStr(date: Date, includeMinutes = true): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    ...(includeMinutes ? { minute: "2-digit" } : {}),
    timeZone: "America/New_York",
  });
}

function getResolutionTimes(now: Date) {
  // 5-min: now + 5 minutes
  const fiveMin = new Date(now.getTime() + 5 * 60 * 1000);

  // 1-hour: top of next UTC hour
  const oneHour = new Date(now);
  oneHour.setUTCMinutes(0, 0, 0);
  oneHour.setUTCHours(oneHour.getUTCHours() + 1);

  // Daily: midnight ET — compute ms until midnight ET then add to real now
  const nowET = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const midnightET = new Date(nowET);
  midnightET.setHours(24, 0, 0, 0);
  const msToMidnight = midnightET.getTime() - nowET.getTime();
  const daily = new Date(now.getTime() + msToMidnight);

  return { fiveMin, oneHour, daily };
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const now = new Date();
  const { fiveMin, oneHour, daily } = getResolutionTimes(now);

  // Fetch current prices from Binance.US
  const rawPrices: Record<string, number> = {};
  await Promise.all(
    COINS.map(async (coin) => {
      const symbol = BINANCE_SYMBOLS[coin.id];
      if (!symbol) return;
      try {
        const res = await fetch(`https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`, { cache: "no-store" });
        const data = await res.json();
        rawPrices[coin.id] = parseFloat(data.price);
      } catch { /* ignore */ }
    })
  );

  // Load existing open crypto markets so we can skip duplicates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingMarkets } = await (supabase as any)
    .from("markets")
    .select("crypto_ticker, auto_resolve_at")
    .eq("status", "open")
    .not("crypto_ticker", "is", null)
    .not("auto_resolve_at", "is", null)
    .gte("auto_resolve_at", now.toISOString());

  // Build a lookup: ticker → set of existing auto_resolve_at windows
  // 5min: within 0–15 min from now
  // 1hr:  within 15 min – 3 hr from now
  // daily: more than 3 hr from now
  const existing5min  = new Set<string>();
  const existing1hr   = new Set<string>();
  const existingDaily = new Set<string>();
  const nowMs = now.getTime();
  for (const m of (existingMarkets ?? []) as { crypto_ticker: string; auto_resolve_at: string }[]) {
    const ms = new Date(m.auto_resolve_at).getTime() - nowMs;
    const mins = ms / 60_000;
    if (mins <= 15)         existing5min.add(m.crypto_ticker);
    else if (mins <= 180)   existing1hr.add(m.crypto_ticker);
    else                    existingDaily.add(m.crypto_ticker);
  }

  const markets: Record<string, unknown>[] = [];

  for (const coin of COINS) {
    const price = rawPrices[coin.id];
    if (!price) continue;

    // ── 5-minute markets (always create — expire every 5 min) ──
    {
      const above = price * 1.003;
      const below = price * 0.997;
      const timeStr = etTimeStr(fiveMin);
      const ts = Date.now();

      markets.push({
        title: `Will $${coin.ticker} be above $${fmtPrice(above)} at ${timeStr} ET?`,
        category: "Crypto", creator_slug: coin.slug, market_type: "binary", status: "open",
        crypto_ticker: coin.ticker, crypto_target_price: above,
        yes_price: 0.5, no_price: 0.5, yes_pool: 500, no_pool: 500, liquidity: 1000,
        close_at: fiveMin.toISOString(), resolve_at: fiveMin.toISOString(), auto_resolve_at: fiveMin.toISOString(),
        featured_score: 20, trending_score: 80,
        slug: `${coin.ticker.toLowerCase()}-above-${Math.floor(above)}-${ts}`,
      });
      markets.push({
        title: `Will $${coin.ticker} be below $${fmtPrice(below)} at ${timeStr} ET?`,
        category: "Crypto", creator_slug: coin.slug, market_type: "binary", status: "open",
        crypto_ticker: coin.ticker, crypto_target_price: below,
        yes_price: 0.5, no_price: 0.5, yes_pool: 500, no_pool: 500, liquidity: 1000,
        close_at: fiveMin.toISOString(), resolve_at: fiveMin.toISOString(), auto_resolve_at: fiveMin.toISOString(),
        featured_score: 20, trending_score: 80,
        slug: `${coin.ticker.toLowerCase()}-below-${Math.floor(below)}-${ts + 1}`,
      });
    }

    // ── 1-hour markets (only if none already exist for this coin) ──
    if (!existing1hr.has(coin.ticker)) {
      const above = price * 1.005;
      const below = price * 0.995;
      const timeStr = etTimeStr(oneHour, false); // "09:00 PM" → "09 PM"

      markets.push({
        title: `Will $${coin.ticker} close above $${fmtPrice(above)} at ${timeStr} ET?`,
        category: "Crypto", creator_slug: coin.slug, market_type: "binary", status: "open",
        crypto_ticker: coin.ticker, crypto_target_price: above,
        yes_price: 0.5, no_price: 0.5, yes_pool: 500, no_pool: 500, liquidity: 1000,
        close_at: oneHour.toISOString(), resolve_at: oneHour.toISOString(), auto_resolve_at: oneHour.toISOString(),
        featured_score: 15, trending_score: 65,
        slug: `${coin.ticker.toLowerCase()}-1hr-above-${Math.floor(above)}-${oneHour.getTime()}`,
      });
      markets.push({
        title: `Will $${coin.ticker} close below $${fmtPrice(below)} at ${timeStr} ET?`,
        category: "Crypto", creator_slug: coin.slug, market_type: "binary", status: "open",
        crypto_ticker: coin.ticker, crypto_target_price: below,
        yes_price: 0.5, no_price: 0.5, yes_pool: 500, no_pool: 500, liquidity: 1000,
        close_at: oneHour.toISOString(), resolve_at: oneHour.toISOString(), auto_resolve_at: oneHour.toISOString(),
        featured_score: 15, trending_score: 65,
        slug: `${coin.ticker.toLowerCase()}-1hr-below-${Math.floor(below)}-${oneHour.getTime()}`,
      });
    }

    // ── Daily markets (only if none already exist for this coin today) ──
    if (!existingDaily.has(coin.ticker)) {
      const above = price * 1.015;
      const below = price * 0.985;
      const dateStr = daily.toLocaleDateString("en-US", {
        month: "short", day: "numeric", timeZone: "America/New_York",
      });

      markets.push({
        title: `Will $${coin.ticker} close above $${fmtPrice(above)} by midnight ET ${dateStr}?`,
        category: "Crypto", creator_slug: coin.slug, market_type: "binary", status: "open",
        crypto_ticker: coin.ticker, crypto_target_price: above,
        yes_price: 0.5, no_price: 0.5, yes_pool: 500, no_pool: 500, liquidity: 1000,
        close_at: daily.toISOString(), resolve_at: daily.toISOString(), auto_resolve_at: daily.toISOString(),
        featured_score: 10, trending_score: 50,
        slug: `${coin.ticker.toLowerCase()}-daily-above-${Math.floor(above)}-${daily.getTime()}`,
      });
      markets.push({
        title: `Will $${coin.ticker} close below $${fmtPrice(below)} by midnight ET ${dateStr}?`,
        category: "Crypto", creator_slug: coin.slug, market_type: "binary", status: "open",
        crypto_ticker: coin.ticker, crypto_target_price: below,
        yes_price: 0.5, no_price: 0.5, yes_pool: 500, no_pool: 500, liquidity: 1000,
        close_at: daily.toISOString(), resolve_at: daily.toISOString(), auto_resolve_at: daily.toISOString(),
        featured_score: 10, trending_score: 50,
        slug: `${coin.ticker.toLowerCase()}-daily-below-${Math.floor(below)}-${daily.getTime()}`,
      });
    }
  }

  if (!markets.length) {
    return NextResponse.json({ created: 0, skipped: "all durations already covered" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("markets").insert(markets).select("id");
  if (error) {
    console.error("[crypto-markets]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Seed initial price snapshots
  if (data?.length) {
    const snapshots = (data as { id: string }[]).map((m) => ({
      market_id: m.id,
      yes_price: 0.5,
      no_price: 0.5,
      total_volume: 0,
      recorded_at: now.toISOString(),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: snapErr } = await (supabase as any).from("market_price_history").insert(snapshots);
    if (snapErr) console.error("[crypto-markets] snapshot seed:", snapErr.message);
  }

  console.log(`[crypto-markets] Created ${data.length} markets (5min + 1hr + daily)`);
  return NextResponse.json({
    created: data.length,
    durations: {
      "5min": markets.filter(m => m.auto_resolve_at === fiveMin.toISOString()).length,
      "1hr":  markets.filter(m => m.auto_resolve_at === oneHour.toISOString()).length,
      "daily": markets.filter(m => m.auto_resolve_at === daily.toISOString()).length,
    }
  });
}
