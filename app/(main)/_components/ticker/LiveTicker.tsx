"use client";

/**
 * Live activity ticker. 50px tall horizontal marquee strip below the hero.
 * Pulls real events from /api/activity/recent (cached 30s edge), refreshes
 * every 30s. CSS-only marquee animation (no JS scroll loop). Pauses on hover.
 */

import { useEffect, useRef, useState } from "react";

type ActivityEvent = {
  id: string;
  type: "trade" | "resolution" | "new_market" | "milestone" | "truth";
  text: string;
  emoji: string;
  ts: number;
};

const POLL_MS = 30_000;

export function LiveTicker() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/activity/recent", { signal: ctrl.signal });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: ActivityEvent[] };
        if (!cancelled && Array.isArray(json.data)) {
          setEvents(json.data);
        }
      } catch {
        // Network errors are silent — ticker just keeps showing the last
        // batch of events. No console noise.
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      clearInterval(id);
    };
  }, []);

  if (events.length === 0) return null;

  // Duplicate the list so the CSS marquee animation has continuous content
  // — when the first copy slides off the left, the duplicate is already
  // rolling in from the right.
  const doubled = [...events, ...events];

  return (
    <div
      className="relative flex w-full items-center overflow-hidden border-y"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
        height: "calc(50px + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      {/* LIVE badge */}
      <div
        className="z-10 flex shrink-0 items-center gap-2 border-r px-4"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          height: "100%",
        }}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
          Live
        </span>
      </div>

      {/* Edge fades — text dissolves into the page bg-base color at the
          left (right against the LIVE badge, no gap) and right edges of
          the ticker strip. Widened to 64px for a more gradual dissolve.
          pointer-events-none so they dont eat clicks. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-[68px] z-10 w-16"
        style={{
          background:
            "linear-gradient(to right, var(--bg-base), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16"
        style={{
          background:
            "linear-gradient(to left, var(--bg-base), transparent)",
        }}
      />

      {/* Marquee */}
      <div className="ticker-marquee flex shrink-0 gap-8 whitespace-nowrap px-6 text-sm text-[var(--text-secondary)]">
        {doubled.map((ev, i) => (
          <span
            key={`${ev.id}-${i}`}
            className="inline-flex items-center gap-2"
          >
            <span aria-hidden>{ev.emoji}</span>
            <span>{ev.text}</span>
            <span
              aria-hidden
              className="opacity-30"
              style={{ marginLeft: 16 }}
            >
              ·
            </span>
          </span>
        ))}
      </div>

      <style jsx>{`
        .ticker-marquee {
          animation: ticker-scroll 60s linear infinite;
          will-change: transform;
        }
        .ticker-marquee:hover {
          animation-play-state: paused;
        }
        @keyframes ticker-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
