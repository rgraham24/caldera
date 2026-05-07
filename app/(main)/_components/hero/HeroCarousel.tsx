"use client";

/**
 * Coupled-card hero carousel.
 *
 * Layout: 3 cards on lg+, 2 on md, 1 on mobile.
 *
 * Behavior:
 *   - Sliding window of pageSize cards advancing by 1 per tick (8s) with
 *     a 600ms CSS opacity crossfade. With 6 cards and pageSize 3 the
 *     carousel cycles through 6 distinct windows: [0,1,2] -> [1,2,3] ->
 *     [2,3,4] -> [3,4,5] -> [4,5,0] -> [5,0,1] -> back to [0,1,2].
 *     Always shows pageSize cards — no partial-page stubs.
 *   - Pauses on hover and when the tab is hidden (Page Visibility API).
 *   - No pagination dots.
 *
 * If cards.length <= pageSize, there's nothing to slide; rotation is
 * disabled and we render the cards once.
 */

import { useEffect, useRef, useState } from "react";
import type { HeroCard } from "./types";
import { HeroCard as HeroCardView } from "./HeroCard";

type HeroCarouselProps = {
  cards: HeroCard[];
};

const ROTATION_MS = 8_000;
const FADE_MS = 600;

function useResponsivePageSize(): number {
  // Defaults to 3 on the server / before mount; client effect updates.
  const [size, setSize] = useState<number>(3);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w >= 1024) return 3;
      if (w >= 768) return 2;
      return 1;
    };
    const handler = () => setSize(compute());
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return size;
}

export function HeroCarousel({ cards }: HeroCarouselProps) {
  const pageSize = useResponsivePageSize();
  const [pageIdx, setPageIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const hoveredRef = useRef(false);
  const tabHiddenRef = useRef(false);

  // numWindows = number of distinct sliding windows. With sliding-by-1
  // there are exactly cards.length windows (the last one wraps).
  const numWindows = Math.max(1, cards.length);
  const safeIdx = numWindows === 0 ? 0 : pageIdx % numWindows;

  // Auto-rotate. Pause on hover, pause on hidden tab. No rotation when
  // we don't have enough cards to slide (i.e., would just show the same
  // window over and over).
  useEffect(() => {
    if (cards.length <= pageSize) return;

    const interval = setInterval(() => {
      if (hoveredRef.current || tabHiddenRef.current) return;
      setVisible(false);
      setTimeout(() => {
        setPageIdx((prev) => (prev + 1) % numWindows);
        setVisible(true);
      }, FADE_MS / 2);
    }, ROTATION_MS);

    return () => clearInterval(interval);
  }, [cards.length, pageSize, numWindows]);

  // Page Visibility API — pause when tab hidden.
  useEffect(() => {
    const handler = () => {
      tabHiddenRef.current = document.hidden;
    };
    document.addEventListener("visibilitychange", handler);
    handler();
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  if (!cards.length) return null;

  // Build the visible window: pageSize cards starting at safeIdx, wrapping.
  // Capped at cards.length so we never duplicate when cards.length < pageSize.
  const windowSize = Math.min(pageSize, cards.length);
  const visibleCards: HeroCard[] = Array.from(
    { length: windowSize },
    (_, i) => cards[(safeIdx + i) % cards.length]
  );

  return (
    <div
      onMouseEnter={() => {
        hoveredRef.current = true;
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
      }}
    >
      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        style={{
          opacity: visible ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease`,
        }}
      >
        {visibleCards.map((card) => (
          <HeroCardView key={card.market.id} card={card} />
        ))}
      </div>
    </div>
  );
}
