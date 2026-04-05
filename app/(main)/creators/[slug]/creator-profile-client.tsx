"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Creator, Market } from "@/types";
import { formatCurrency, formatCompactCurrency, formatRelativeTime } from "@/lib/utils";
import { TierBadge } from "@/components/shared/TierBadge";
import { MarketCard } from "@/components/markets/MarketCard";
import { StakeModal } from "@/components/markets/StakeModal";
import { MarketChart } from "@/components/markets/MarketChart";
import { ExternalLink } from "lucide-react";

type CreatorProfileClientProps = {
  creator: Creator;
  markets: Market[];
  recentTrades: Array<{
    id: string;
    side: string;
    quantity: number;
    price: number;
    created_at: string;
    market: { title: string; slug: string };
  }>;
};

export function CreatorProfileClient({
  creator,
  markets,
  recentTrades,
}: CreatorProfileClientProps) {
  const [showStakeModal, setShowStakeModal] = useState(false);
  const [livePrice, setLivePrice] = useState(creator.creator_coin_price);
  const [livePic, setLivePic] = useState<string | null>(creator.profile_pic_url);
  const [desoUser, setDesoUser] = useState<string | null>(creator.deso_username);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    fetch(`/api/creators/${creator.slug}/coin-data`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data) {
          setLivePrice(data.priceUSD);
          if (data.profilePicUrl) setLivePic(data.profilePicUrl);
          if (data.desoUsername) setDesoUser(data.desoUsername);
          setIsLive(data.live);
        }
      })
      .catch(() => {});
  }, [creator.slug]);

  const openMarkets = markets.filter((m) => m.status === "open");
  const resolvedMarkets = markets.filter((m) => m.status === "resolved");
  const coinSymbol = desoUser || creator.creator_coin_symbol;

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        {/* Unclaimed banner */}
        {creator.tier === "unclaimed" && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm text-amber-300">
              Is this you? Claim your profile to start earning from predictions about you.
            </p>
            <button className="mt-2 text-sm font-medium text-amber-400 hover:text-amber-300">
              Claim Profile →
            </button>
          </div>
        )}

        {/* Profile Header */}
        <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex items-start gap-5">
            {livePic ? (
              <img src={livePic} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-caldera/10 text-3xl font-bold text-caldera">
                {creator.name.charAt(0)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary">
                  {creator.name}
                </h1>
                <TierBadge tier={creator.tier} size="md" />
              </div>
              <p className="mt-1 text-sm text-text-muted">${coinSymbol}</p>
              <div className="mt-3 flex items-center gap-4">
                <div>
                  <span className="font-display text-2xl font-bold tracking-normal text-text-primary">
                    {desoUser ? formatCurrency(livePrice) : "—"}
                  </span>
                  {isLive && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-yes">
                      <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse" /> Live
                    </span>
                  )}
                </div>
                <span className="text-sm text-text-muted">
                  {creator.creator_coin_holders.toLocaleString()} holders
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-3 md:ml-auto">
            {desoUser && (
              <button
                onClick={() => setShowStakeModal(true)}
                className="rounded-xl bg-caldera px-5 py-2.5 text-sm font-semibold text-background hover:bg-caldera/90 transition-colors"
              >
                Get Involved →
              </button>
            )}
          </div>
        </div>

        {/* Earnings Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Creator Earnings", value: formatCompactCurrency(creator.total_creator_earnings), show: creator.tier === "verified_creator" },
            { label: "Holder Earnings", value: formatCompactCurrency(creator.total_holder_earnings), show: true },
            { label: "Total Volume", value: formatCompactCurrency(markets.reduce((s, m) => s + m.total_volume, 0)), show: true },
            { label: "Markets", value: String(markets.length), show: true },
          ].filter((s) => s.show).map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border-subtle/30 bg-surface p-4">
              <p className="text-xs uppercase tracking-widest text-text-muted">{stat.label}</p>
              <p className="mt-1 font-mono text-xl font-bold text-yes">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Coin Chart */}
        {desoUser && (
          <div className="mb-8 rounded-2xl border border-border-subtle/30 bg-surface p-5">
            <h2 className="section-header mb-4">Coin Price</h2>
            <MarketChart yesPrice={livePrice / 200} />
          </div>
        )}

        {/* Active Markets */}
        <div className="mb-8">
          <h2 className="section-header mb-5">Active Markets</h2>
          {openMarkets.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {openMarkets.map((m) => <MarketCard key={m.id} market={m} />)}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No active markets yet</p>
          )}
        </div>

        {/* Resolved Markets */}
        {resolvedMarkets.length > 0 && (
          <div className="mb-8">
            <h2 className="section-header mb-5">Resolved Markets</h2>
            <div className="rounded-2xl border border-border-subtle/30 bg-surface divide-y divide-border-subtle/30">
              {resolvedMarkets.map((m) => (
                <Link key={m.id} href={`/markets/${m.slug}`} className="flex items-center justify-between px-5 py-3 hover:bg-surface-2 transition-colors">
                  <span className="text-sm text-text-primary">{m.title}</span>
                  <span className={`text-sm font-bold ${m.resolution_outcome === "yes" ? "text-yes" : "text-no"}`}>
                    {m.resolution_outcome?.toUpperCase()}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {recentTrades.length > 0 && (
          <div className="mb-8">
            <h2 className="section-header mb-5">Recent Activity</h2>
            <div className="space-y-2">
              {recentTrades.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm text-text-muted">
                  <span className={`font-semibold ${t.side === "yes" ? "text-yes" : "text-no"}`}>
                    {t.side.toUpperCase()}
                  </span>
                  <span>on</span>
                  <Link href={`/markets/${t.market.slug}`} className="text-text-primary hover:text-caldera">
                    {t.market.title}
                  </Link>
                  <span>· {formatRelativeTime(t.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tradeable link */}
        {desoUser && (
          <p className="flex items-center gap-1 text-xs text-text-muted">
            Tradeable on DeSo blockchain
            <a
              href={`https://explorer.deso.org/?public-key=${creator.deso_public_key}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </p>
        )}
      </div>

      <StakeModal
        creator={creator}
        isOpen={showStakeModal}
        onClose={() => setShowStakeModal(false)}
        livePrice={livePrice}
        desoUsername={desoUser}
        profilePicUrl={livePic}
      />
    </>
  );
}
