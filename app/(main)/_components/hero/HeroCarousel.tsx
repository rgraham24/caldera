"use client";

/**
 * Coupled-card hero carousel.
 *
 * Layout: 3 cards on lg+, 2 on md, 1 with horizontal scroll-snap on mobile.
 *
 * Behavior:
 *   - Auto-rotates the visible "page" every 8s with a 600ms CSS opacity
 *     crossfade. No framer-motion (not in deps); plain CSS only.
 *   - Pauses on hover and when the tab is hidden (Page Visibility API).
 *   - No pagination dots — kill list per design brief.
 *
 * Pages: with N cards and pageSize P, there are ceil(N/P) pages. Each tick
 * advances to the next page; the last page wraps to page 0.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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

  const pages = useMemo(() => {
    if (!cards.length) return [];
    const out: HeroCard[][] = [];
    for (let i = 0; i < cards.length; i += pageSize) {
      out.push(cards.slice(i, i + pageSize));
    }
    return out;
  }, [cards, pageSize]);

  // Clamp the page index in render rather than via setState in an effect.
  // pageSize can change on resize, which can leave pageIdx out of range.
  const safePageIdx = pages.length === 0 ? 0 : pageIdx % pages.length;

  // Auto-rotate. Pause on hover, pause on hidden tab.
  useEffect(() => {
    if (pages.length <= 1) return;

    const interval = setInterval(() => {
      if (hoveredRef.current || tabHiddenRef.current) return;
      setVisible(false);
      setTimeout(() => {
        setPageIdx((prev) => (prev + 1) % pages.length);
        setVisible(true);
      }, FADE_MS / 2);
    }, ROTATION_MS);

    return () => clearInterval(interval);
  }, [pages.length]);

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

  const visibleCards = pages[safePageIdx] ?? [];

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
