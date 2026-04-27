import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMarket } from "@/lib/markets/resolution";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Find expired crypto markets
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: markets } = await (supabase as any)
    .from("markets")
    .select("id, crypto_ticker, crypto_target_price, title")
    .eq("status", "open")
    .not("crypto_ticker", "is", null)
    .not("auto_resolve_at", "is", null)
    .lt("auto_resolve_at", now);

  if (!markets?.length) return NextResponse.json({ resolved: 0 });

  // Fetch current prices from Binance.US (free, no rate limits, no API key)
  const BINANCE_SYMBOLS: Record<string, string> = {
    BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT",
    LINK: "LINKUSDT", DOGE: "DOGEUSDT",
  };
  const tickers = [...new Set((markets as Array<{ crypto_ticker: string }>).map((m) => m.crypto_ticker))];
  const tickerToPrice: Record<string, number> = {};
  await Promise.all(
    tickers.map(async (ticker) => {
      const symbol = BINANCE_SYMBOLS[ticker];
      if (!symbol) return;
      const res = await fetch(`https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`);
      const data = await res.json();
      tickerToPrice[ticker] = parseFloat(data.price);
    })
  );

  let resolved = 0;
  for (const market of markets as Array<{
    id: string;
    crypto_ticker: string;
    crypto_target_price: number;
    title: string;
  }>) {
    const currentPrice = tickerToPrice[market.crypto_ticker];
    if (!currentPrice || !market.crypto_target_price) continue;

    // Determine outcome: YES if title says "above" and price is above target, etc.
    const isAboveMarket = market.title?.toLowerCase().includes("above");
    const outcome =
      isAboveMarket
        ? currentPrice > market.crypto_target_price
          ? "yes"
          : "no"
        : currentPrice < market.crypto_target_price
        ? "yes"
        : "no";

    const result = await resolveMarket(supabase, {
      marketId: market.id,
      outcome,
      resolutionNote: "CRON_CRYPTO_AUTO_RESOLVED",
      sourceUrl: null,
      resolvedByUserId: null,
    });
    if (!result.ok) {
      console.error("[crypto-cron] resolveMarket failed", {
        marketId: market.id,
        reason: result.reason,
        detail: result.detail,
      });
      continue;
    }

    resolved++;
    console.log(
      `[resolve-crypto] ${market.crypto_ticker} market resolved ${outcome} (price: $${currentPrice} vs target: $${market.crypto_target_price})`
    );
  }

  return NextResponse.json({ resolved });
}
