import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kraken v2 WebSocket — public, no auth, no geo-restrictions
// Binance.US WS connects but delivers no messages; Binance.com is US geo-blocked (451)
const KRAKEN_SYMBOLS: Record<string, string> = {
  BTC: "BTC/USD",
  ETH: "ETH/USD",
  SOL: "SOL/USD",
  LINK: "LINK/USD",
  DOGE: "DOGE/USD",
};

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.toUpperCase();
  if (!ticker || !KRAKEN_SYMBOLS[ticker]) {
    return new Response(JSON.stringify({ error: "Unknown ticker" }), { status: 400 });
  }

  const resolvedTicker = ticker;
  const krakenSymbol = KRAKEN_SYMBOLS[resolvedTicker];
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const ws = new WebSocket("wss://ws.kraken.com/v2");
      let frameCount = 0;

      ws.on("open", () => {
        console.log(`[crypto-stream] Kraken WS connected for ${resolvedTicker}`);
        ws.send(JSON.stringify({
          method: "subscribe",
          params: { channel: "ticker", symbol: [krakenSymbol] },
        }));
      });

      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          // Only handle ticker update events
          if (msg.channel !== "ticker" || msg.type !== "update") return;
          const tick = msg.data?.[0];
          if (!tick?.last) return;

          const price = parseFloat(tick.last);
          if (!price) return;

          frameCount++;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                ticker: resolvedTicker,
                price,
                bid: parseFloat(tick.bid),
                ask: parseFloat(tick.ask),
                t: Date.now(),
              })}\n\n`
            )
          );
        } catch { /* ignore parse errors */ }
      });

      ws.on("error", (err) => {
        console.error(`[crypto-stream] Kraken WS error for ${resolvedTicker}:`, err.message);
        controller.close();
      });

      ws.on("close", () => {
        console.log(`[crypto-stream] Kraken WS closed for ${resolvedTicker} after ${frameCount} frames`);
        controller.close();
      });

      return () => {
        ws.close();
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
