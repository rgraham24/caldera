import type { Market } from "@/types";
import { MarketGrid } from "@/components/markets/MarketGrid";

type TrendingMarketsProps = {
  markets: Market[];
};

export function TrendingMarkets({ markets }: TrendingMarketsProps) {
  return (
    <section>
      <h2 className="section-header mb-5">
        Trending Markets
      </h2>
      <MarketGrid markets={markets} />
    </section>
  );
}
