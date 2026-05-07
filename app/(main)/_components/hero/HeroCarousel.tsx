"use client";

/**
 * Client-side hero carousel. Chunk 2 ships a static 3-up render that proves
 * the data flow (markets + creator + fresh DeSo price). Chunk 4 replaces
 * this with the auto-rotating coupled-card design.
 */

import type { HeroCard } from "./types";
import { HeroCard as HeroCardView } from "./HeroCard";

type HeroCarouselProps = {
  cards: HeroCard[];
};

export function HeroCarousel({ cards }: HeroCarouselProps) {
  if (!cards.length) return null;
  const visible = cards.slice(0, 3);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {visible.map((card) => (
        <HeroCardView key={card.market.id} card={card} />
      ))}
    </div>
  );
}
