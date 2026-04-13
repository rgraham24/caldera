import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
  LINK: "LINKUSDT",
  DOGE: "DOGEUSDT",
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // Get all open crypto markets
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: markets } = await (supabase as any)
    .from("markets")
    .select("id, crypto_ticker, yes_price, no_price, total_volume")
    .eq("status", "open")
    .not("crypto_ticker", "is", null)
    .not("auto_resolve_at", "is", null);

  if (!markets?.length) return NextResponse.json({ snapshots: 0 });

  // Fetch current prices from Binance.US
  const prices: Record<string, number> = {};
  const tickers = [...new Set<string>(
    (markets as { crypto_ticker: string }[]).map((m) => m.crypto_ticker).filter(Boolean)
  )];

  await Promise.all(
    tickers.map(async (ticker) => {
      const symbol = BINANCE_SYMBOLS[ticker];
      if (!symbol) return;
      try {
        const res = await fetch(
          `https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        prices[ticker] = parseFloat(data.price);
      } catch {
        // ignore individual failures
      }
    })
  );

  const now = new Date().toISOString();
  const snapshots = (markets as {
    id: string;
    crypto_ticker: string;
    yes_price: number;
    no_price: number;
    total_volume: number;
  }[])
    .filter((m) => prices[m.crypto_ticker])
    .map((m) => ({
      market_id: m.id,
      yes_price: m.yes_price ?? 0.5,
      no_price: m.no_price ?? 0.5,
      total_volume: m.total_volume ?? 0,
      recorded_at: now,
    }));

  if (!snapshots.length) return NextResponse.json({ snapshots: 0 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("market_price_history").insert(snapshots);
  if (error) console.error("[snapshot-crypto]", error.message);

  return NextResponse.json({ snapshots: snapshots.length });
}
