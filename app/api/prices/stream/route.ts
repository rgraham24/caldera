import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Module-level cache of last known prices (shared across requests in the same worker)
const priceCache = new Map<string, { price: number; mcap: number; holders: number }>();

async function fetchLatestPrices() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("creators")
    .select("slug, creator_coin_price, creator_coin_market_cap, creator_coin_holders")
    .gt("creator_coin_price", 0)
    .not("token_status", "eq", "archived");
  return data ?? [];
}

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial snapshot immediately
      const initial = await fetchLatestPrices();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "snapshot", prices: initial })}\n\n`)
      );

      // Seed cache from initial fetch
      for (const c of initial) {
        priceCache.set(c.slug, {
          price: c.creator_coin_price ?? 0,
          mcap: c.creator_coin_market_cap ?? 0,
          holders: c.creator_coin_holders ?? 0,
        });
      }

      // Poll every 5 seconds, push only changed creators
      const interval = setInterval(async () => {
        try {
          const latest = await fetchLatestPrices();
          const changes: typeof latest = [];

          for (const creator of latest) {
            const cached = priceCache.get(creator.slug);
            const newPrice = creator.creator_coin_price ?? 0;

            if (!cached || Math.abs(cached.price - newPrice) > 0.001) {
              changes.push(creator);
              priceCache.set(creator.slug, {
                price: newPrice,
                mcap: creator.creator_coin_market_cap ?? 0,
                holders: creator.creator_coin_holders ?? 0,
              });
            }
          }

          if (changes.length > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "update", prices: changes })}\n\n`)
            );
          }

          // Heartbeat to keep connection alive through proxies
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }, 2000);

      // Cleanup on client disconnect
      return () => clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
