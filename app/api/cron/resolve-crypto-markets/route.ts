import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Fetch current prices
  const tickers = [...new Set((markets as Array<{ crypto_ticker: string }>).map((m) => m.crypto_ticker))];
  const coinIds: Record<string, string> = {
    BTC: "bitcoin",
    SOL: "solana",
    LINK: "chainlink",
    MATIC: "matic-network",
  };
  const ids = tickers.map((t) => coinIds[t]).filter(Boolean).join(",");

  const priceRes = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
  );
  const prices = await priceRes.json();

  const tickerToPrice: Record<string, number> = {
    BTC: prices["bitcoin"]?.usd,
    SOL: prices["solana"]?.usd,
    LINK: prices["chainlink"]?.usd,
    MATIC: prices["matic-network"]?.usd,
  };

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("markets").update({
      status: "resolved",
      resolution_outcome: outcome,
      resolved_at: now,
    }).eq("id", market.id);

    resolved++;
    console.log(
      `[resolve-crypto] ${market.crypto_ticker} market resolved ${outcome} (price: $${currentPrice} vs target: $${market.crypto_target_price})`
    );
  }

  return NextResponse.json({ resolved });
}
