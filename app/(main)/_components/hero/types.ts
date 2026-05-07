import type { Market } from "@/types";

export type HeroCreator = {
  slug: string;
  name: string;
  deso_username: string | null;
  image_url: string | null;
  coin_symbol: string | null;
  /** USD price; 0 means "no data" — render as em-dash, not "$0". */
  price_usd: number;
  holders: number;
  /** ISO timestamp; epoch (1970) means "never refreshed". */
  coin_data_updated_at: string;
  /**
   * Filled in by Chunk 3's getCreatorCoinMomentum once daily snapshots exist.
   * For tonight, this is null on every card.
   */
  momentum: { changePercent: number | null; comparedTo: "baseline" | "1d" | "7d" } | null;
};

export type HeroCard = {
  market: Market;
  creator: HeroCreator | null;
};
