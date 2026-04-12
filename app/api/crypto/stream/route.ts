export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT",
  LINK: "LINKUSDT", DOGE: "DOGEUSDT",
};

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.toUpperCase();
  if (!ticker || !SYMBOLS[ticker]) {
    return new Response(JSON.stringify({ error: "Unknown ticker" }), { status: 400 });
  }

  const resolvedTicker = ticker;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastPrice = 0;

      async function tick() {
        try {
          const symbol = SYMBOLS[resolvedTicker];
          const res = await fetch(
            `https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`,
            { cache: "no-store" }
          );
          const data = await res.json();
          const price = parseFloat(data.price);
          if (price && price !== lastPrice) {
            lastPrice = price;
            const msg = `data: ${JSON.stringify({ ticker: resolvedTicker, price, t: Date.now() })}\n\n`;
            controller.enqueue(encoder.encode(msg));
          }
          // Heartbeat
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }

      // Send immediately
      await tick();
      // Then every 1 second
      const interval = setInterval(tick, 1000);

      return () => clearInterval(interval);
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
