import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // Fetch all open crypto_5min markets past their auto_resolve_at
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: markets, error } = await (supabase as any)
    .from("markets")
    .select("id, title, crypto_ticker, crypto_target_price, auto_resolve_at")
    .eq("market_type", "crypto_5min")
    .eq("status", "open")
    .lt("auto_resolve_at", new Date().toISOString());

  if (error) {
    console.error("[resolve-crypto-markets] Fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!markets || markets.length === 0) {
    return NextResponse.json({ resolved: 0 });
  }

  // Fetch current prices once for all tickers needed
  const tickers = [...new Set((markets as Array<{ crypto_ticker: string }>).map((m) => m.crypto_ticker))];
  const geckoIds = tickers.map((t) => {
    if (t === "BTC") return "bitcoin";
    if (t === "ETH") return "ethereum";
    return t.toLowerCase();
  });

  let currentPrices: Record<string, number> = {};
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds.join(",")}&vs_currencies=usd`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    // Map back: "bitcoin" → BTC, "ethereum" → ETH
    for (const ticker of tickers) {
      const geckoId = ticker === "BTC" ? "bitcoin" : ticker === "ETH" ? "ethereum" : ticker.toLowerCase();
      currentPrices[ticker] = data?.[geckoId]?.usd ?? 0;
    }
  } catch (err) {
    console.error("[resolve-crypto-markets] CoinGecko fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch current prices" }, { status: 502 });
  }

  let resolved = 0;
  for (const market of markets as Array<{
    id: string;
    title: string;
    crypto_ticker: string;
    crypto_target_price: number;
    auto_resolve_at: string;
  }>) {
    const currentPrice = currentPrices[market.crypto_ticker] ?? 0;
    if (currentPrice <= 0) {
      console.warn(`[resolve-crypto-markets] No price for ${market.crypto_ticker}, skipping ${market.id}`);
      continue;
    }

    const outcome = currentPrice > market.crypto_target_price ? "yes" : "no";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("markets")
      .update({
        status: "resolved",
        resolution_outcome: outcome,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", market.id);

    if (updateError) {
      console.error(`[resolve-crypto-markets] Update error for ${market.id}:`, updateError.message);
    } else {
      resolved++;
      console.log(
        `[resolve-crypto-markets] ${market.title} → ${outcome.toUpperCase()} (current: $${currentPrice}, target: $${market.crypto_target_price})`
      );
    }
  }

  return NextResponse.json({ resolved, total: markets.length });
}
