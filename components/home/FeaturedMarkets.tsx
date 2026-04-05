import type { Market } from "@/types";
import { MarketCard } from "@/components/markets/MarketCard";

type FeaturedMarketsProps = {
  markets: Market[];
};

export function FeaturedMarkets({ markets }: FeaturedMarketsProps) {
  if (markets.length === 0) return null;

  return (
    <section>
      <h2 className="section-header mb-5">
        Featured Markets
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {markets.map((market) => (
          <div key={market.id} className="min-w-[320px] max-w-[380px] flex-shrink-0">
            <MarketCard market={market} />
          </div>
        ))}
      </div>
    </section>
  );
}
