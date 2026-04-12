"use client";

import { useEffect, useRef, useState } from "react";

type PriceUpdate = {
  slug: string;
  creator_coin_price: number;
  creator_coin_market_cap: number;
  creator_coin_holders: number;
};

type SSEMessage = {
  type: "snapshot" | "update";
  prices: PriceUpdate[];
};

export function useLivePrices() {
  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<Map<string, number>>(new Map());
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/prices/stream");
    esRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as SSEMessage;

      setPrices((prev) => {
        const next = new Map(prev);
        for (const p of msg.prices) {
          next.set(p.slug, p);
        }
        return next;
      });

      if (msg.type === "update") {
        setLastUpdated((prev) => {
          const next = new Map(prev);
          const now = Date.now();
          for (const p of msg.prices) {
            next.set(p.slug, now);
          }
          return next;
        });
      }
    };

    es.onerror = () => {
      // Browser handles auto-reconnect for EventSource
    };

    return () => {
      es.close();
    };
  }, []);

  return { prices, lastUpdated };
}
