import { NextResponse } from "next/server";

const cache: Record<string, { price: number; ts: number }> = {};
const CACHE_TTL = 2000;

const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT",
  LINK: "LINKUSDT", MATIC: "MATICUSDT",
};

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.toUpperCase();
  if (!ticker || !BINANCE_SYMBOLS[ticker]) {
    return NextResponse.json({ error: "Unknown ticker" }, { status: 400 });
  }
  const cached = cache[ticker];
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ ticker, price: cached.price, cached: true });
  }
  try {
    const symbol = BINANCE_SYMBOLS[ticker];
    const res = await fetch(
      `https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`,
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) {
      if (cached) return NextResponse.json({ ticker, price: cached.price, cached: true, stale: true });
      return NextResponse.json({ error: "Price fetch failed" }, { status: 503 });
    }
    const data = await res.json();
    const price = parseFloat(data.price);
    cache[ticker] = { price, ts: Date.now() };
    return NextResponse.json({ ticker, price, cached: false });
  } catch {
    if (cached) return NextResponse.json({ ticker, price: cached.price, cached: true, stale: true });
    return NextResponse.json({ error: "Fetch error" }, { status: 500 });
  }
}
