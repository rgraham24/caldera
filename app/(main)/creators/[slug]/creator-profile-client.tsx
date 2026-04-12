"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Creator, Market } from "@/types";
import { formatCurrency, formatCompactCurrency, formatRelativeTime } from "@/lib/utils";
import { MarketCard } from "@/components/markets/MarketCard";
import { StakeModal } from "@/components/markets/StakeModal";
import { MarketChart } from "@/components/markets/MarketChart";
import { ClaimProfileModal } from "@/components/shared/ClaimProfileModal";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { HolderCalculator } from "@/components/shared/HolderCalculator";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { EarningsPreview } from "@/components/creators/EarningsPreview";
import { FollowButton } from "@/components/shared/FollowButton";
import { VerificationBadge } from "@/components/ui/VerificationBadge";

type BuybackEvent = {
  id: string;
  market_id: string;
  market_title: string | null;
  creator_slug: string | null;
  team_slug: string | null;
  league_slug: string | null;
  trade_amount_usd: number;
  personal_buyback_usd: number;
  team_buyback_usd: number;
  league_buyback_usd: number;
  platform_fee_usd: number;
  created_at: string;
};

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
  claimUrl?: string | null;
};

export function CreatorProfileClient({
  creator,
  markets,
  recentTrades,
  claimUrl,
}: CreatorProfileClientProps) {
  const [showStakeModal, setShowStakeModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [marketTitle, setMarketTitle] = useState('');
  const [resolveDate, setResolveDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState(false);
  const [livePrice, setLivePrice] = useState(creator.creator_coin_price);
  const [livePic, setLivePic] = useState<string | null>(creator.profile_pic_url);
  const [desoUser, setDesoUser] = useState<string | null>(creator.deso_username);
  const [isLive, setIsLive] = useState(false);
  const [buybacks, setBuybacks] = useState<{ events: BuybackEvent[]; totalBuyback: number }>({ events: [], totalBuyback: 0 });

  const handleCreateMarket = async () => {
    if (!marketTitle.trim() || !resolveDate) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/markets/create-fan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: marketTitle.trim(),
          creatorSlug: creator.slug,
          creatorName: creator.name,
          resolveAt: resolveDate,
          category: 'Creators',
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCreateSuccess(true);
      setShowCreateModal(false);
      window.location.reload();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create market');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetch(`/api/creators/${creator.slug}/buybacks`)
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) setBuybacks(data);
      })
      .catch(() => {});
  }, [creator.slug]);

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

  useEffect(() => {
    if (!createSuccess) return;
    const t = setTimeout(() => setCreateSuccess(false), 3000);
    return () => clearTimeout(t);
  }, [createSuccess]);

  const openMarkets = markets.filter((m) => m.status === "open");
  const resolvedMarkets = markets.filter((m) => m.status === "resolved");
  const coinSymbol = desoUser || creator.creator_coin_symbol;

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        {/* Token status banner */}
        {(creator.token_status === "shadow" || !creator.token_status) && (
          <div className="mb-6 rounded-2xl border border-border-subtle/30 bg-surface p-5">
            <p className="text-sm font-medium text-text-primary mb-2">📊 Prediction Market</p>
            <p className="text-sm text-text-muted mb-3">
              {openMarkets.length} active market{openMarkets.length !== 1 ? "s" : ""} ·{" "}
              Token earnings: <span className="text-amber-400">Not yet active</span>
            </p>
            <p className="text-xs text-text-muted mb-3">
              Community fees are held until this profile is claimed.
            </p>
            <p className="text-xs text-text-muted mb-2">
              Are you {creator.name}? Claim this profile to:
            </p>
            <ul className="text-xs text-text-muted space-y-1 mb-3">
              <li>→ Receive a platform fee every time someone predicts about you — automatically</li>
              <li>→ Let your fans buy your token and hold alongside you</li>
              <li>→ See everything people are predicting about you</li>
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              {claimUrl ? (
                <Link
                  href={claimUrl}
                  className="text-sm font-semibold text-caldera hover:text-caldera/80 underline underline-offset-2"
                >
                  Claim this profile →
                </Link>
              ) : (
                <button
                  onClick={() => setShowClaimModal(true)}
                  className="text-sm font-medium text-caldera hover:text-caldera/80"
                >
                  Claim this profile →
                </button>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-orange-500/20">
              <p className="text-xs text-muted-foreground mb-2">
                Know {creator.name}? Tell them about their Caldera profile:
              </p>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  `Hey @${creator.deso_username ?? creator.name.replace(/\s+/g, '')} — fans are making predictions about you on @CalderaMarket and your token is earning fees right now. Claim it free at caldera.market/claim/${creator.slug} 🔥`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-400/30 text-xs text-blue-400 hover:bg-blue-400/10 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Tweet at {creator.name} to claim →
              </a>
            </div>
          </div>
        )}
        {creator.token_status === "active_unverified" && (
          <div className="mb-6 rounded-xl bg-caldera/5 border border-caldera/20 p-3">
            <p className="text-sm text-text-muted">
              Prediction fees flow back into ${coinSymbol} automatically.
            </p>
          </div>
        )}
        {creator.token_status === "needs_review" && (
          <div className="mb-6 rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
            <p className="text-sm text-text-muted">
              ⚠️ This DeSo account has not been verified. Token earnings are paused pending review.
            </p>
          </div>
        )}
        {creator.token_status === "active_verified" && (
          <div className="mb-6 rounded-xl bg-caldera/5 border border-caldera/20 p-3">
            <p className="text-sm text-text-muted">
              Prediction fees flow back into ${coinSymbol} automatically.
            </p>
          </div>
        )}
        {creator.token_status === "claimed" && (
          <div className="mb-6 rounded-xl bg-caldera/5 border border-caldera/20 p-3">
            <p className="text-sm text-text-muted">
              ✅ Caldera verified — {creator.name} earns <span className="text-caldera font-medium">0.75%</span>.
              Token holders earn <span className="text-caldera font-medium">0.75%</span>.
            </p>
          </div>
        )}

        {/* Earnings Preview — prominent for shadow profiles */}
        {(creator.token_status === "shadow" || !creator.token_status) && (
          <div className="mb-6">
            <EarningsPreview
              creator={creator}
              markets={markets}
              onClaimClick={() => setShowClaimModal(true)}
            />
          </div>
        )}

        {/* Profile Header */}
        <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex items-start gap-5">
            <CreatorAvatar creator={creator} size="lg" className="h-20 w-20" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary">
                  {creator.name}
                </h1>
                <VerificationBadge
                  isReserved={creator.deso_is_reserved ?? false}
                  isCalderaVerified={creator.is_caldera_verified ?? false}
                />
              </div>
              <p className="mt-1 text-sm text-text-muted">${coinSymbol}</p>
              <div className="mt-3 flex items-center gap-4">
                <div>
                  <span className="font-display text-2xl font-bold tracking-normal text-text-primary">
                    {desoUser ? formatCurrency(livePrice ?? 0) : "—"}
                  </span>
                  {isLive && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-yes">
                      <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse" /> Live
                    </span>
                  )}
                </div>
                <span className="text-sm text-text-muted">
                  {(creator.creator_coin_holders ?? 0).toLocaleString()} holders
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 md:ml-auto">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 text-sm font-medium hover:bg-orange-500/10 transition-colors"
            >
              + Create Market
            </button>
            <FollowButton slug={creator.slug} />
            {desoUser && creator.token_status !== "shadow" && creator.token_status !== "needs_review" && (
              <button
                onClick={() => setShowStakeModal(true)}
                className="rounded-xl bg-caldera px-5 py-2.5 text-sm font-semibold text-background hover:bg-caldera/90 transition-colors"
              >
                Buy ${coinSymbol}
              </button>
            )}
          </div>
        </div>

        {/* Earnings Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Creator Earnings", value: formatCompactCurrency(creator.total_creator_earnings ?? 0), show: creator.tier === "verified_creator" },
            { label: "Holder Earnings", value: (creator.total_holder_earnings ?? 0) > 0 ? formatCompactCurrency(creator.total_holder_earnings ?? 0) : "—", show: true, tip: "The total amount earned by people who hold this token from prediction activity on Caldera." },
            { label: "Total Volume", value: formatCompactCurrency(markets.reduce((s, m) => s + (m.total_volume ?? 0), 0)), show: true, tip: "The total amount of money predicted on this person across all their markets. Higher volume = more earnings for token holders." },
            { label: "Markets", value: String(markets.length), show: true, tip: "The number of active prediction questions about this person on Caldera right now." },
          ].filter((s) => s.show).map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border-subtle/30 bg-surface p-4">
              <p className="text-xs uppercase tracking-widest text-text-muted">
                {stat.label}
                {stat.tip && <InfoTooltip text={stat.tip} />}
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-yes">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Token chart + calculator — only for active tokens, not shadow */}
        {desoUser && creator.token_status !== "shadow" && creator.token_status !== "needs_review" && (
          <div className="mb-8 rounded-2xl border border-border-subtle/30 bg-surface p-5">
            <h2 className="section-header mb-4">Token Price <InfoTooltip text="The current price to buy one token. Prices rise as more people buy — early buyers get the lowest price." /></h2>
            <MarketChart yesPrice={(livePrice ?? 0) / 200} />
          </div>
        )}

        {/* Shadow token placeholder */}
        {(creator.token_status === "shadow" || creator.token_status === "needs_review") && (
          <div className="mb-8 rounded-2xl border border-border-subtle/30 bg-surface p-5">
            <p className="text-sm text-text-muted">
              🔒 <span className="font-medium text-text-primary">Token not yet active</span>
            </p>
            <p className="mt-1 text-xs text-text-faint">
              This profile hasn&apos;t been claimed. Claim to launch your token and start earning.
            </p>
          </div>
        )}

        {desoUser && creator.token_status !== "shadow" && creator.token_status !== "needs_review" && (
          <div className="mb-8">
            <HolderCalculator
              symbol={coinSymbol || creator.name}
              coinPrice={livePrice ?? 0}
              totalCoinsInCirculation={creator.total_coins_in_circulation ?? 0}
              weeklyVolume={creator.weekly_volume_usd || 0}
              marketCount={openMarkets.length || markets.length || creator.markets_count || 0}
              creatorName={creator.name}
              creatorSlug={creator.slug}
            />
          </div>
        )}

        {/* Buyback Activity Feed */}
        {(buybacks.totalBuyback > 0 || creator.token_status === "shadow" || !creator.token_status) && (
          <div className="mb-8 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-orange-400">🔄 Token Buyback Activity</span>
              <span className="text-xs text-text-muted">Last 20 trades</span>
            </div>
            {buybacks.totalBuyback > 0 ? (
              <p className="text-xs text-text-muted mb-3">
                <span className="font-semibold text-orange-300">${buybacks.totalBuyback.toFixed(4)}</span>{" "}
                auto-bought into ${coinSymbol} from prediction activity
              </p>
            ) : (
              <p className="text-xs text-text-muted mb-3">
                No buybacks yet — every trade on this profile&apos;s markets triggers an auto-buy.
              </p>
            )}
            {buybacks.events.length > 0 ? (
              <div className="space-y-1.5">
                {buybacks.events.map((e) => {
                  const buybackAmt =
                    e.creator_slug === creator.slug ? e.personal_buyback_usd :
                    e.team_slug === creator.slug ? e.team_buyback_usd :
                    e.league_buyback_usd;
                  const role =
                    e.creator_slug === creator.slug ? "personal" :
                    e.team_slug === creator.slug ? "team" :
                    "league";
                  return (
                    <div key={e.id} className="flex items-center justify-between text-xs text-text-muted">
                      <span className="truncate max-w-[60%]">
                        {e.market_title ?? e.market_id}
                        <span className="ml-1 text-text-faint">({role})</span>
                      </span>
                      <span className="font-mono text-orange-300">
                        +${buybackAmt.toFixed(4)}{" "}
                        <span className="text-text-faint">{formatRelativeTime(e.created_at)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-text-faint">Trades will appear here in real time.</p>
            )}
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
            creator.token_status === "claimed" || creator.token_status === "active_verified" ? (
              <p className="text-sm text-text-muted">No active markets right now.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-text-muted">No active markets yet for {creator.name}.</p>
                <p className="text-xs text-text-muted mt-1">
                  Markets are generated automatically.
                  {claimUrl && <span> <a href={claimUrl} className="text-caldera hover:underline">Claim this profile</a> to start earning fees.</span>}
                </p>
              </div>
            )
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

      </div>

      <StakeModal
        creator={creator}
        isOpen={showStakeModal}
        onClose={() => setShowStakeModal(false)}
        livePrice={livePrice ?? undefined}
        desoUsername={desoUser}
        profilePicUrl={livePic}
      />

      {creator.tier === "unclaimed" && (
        <ClaimProfileModal
          creatorName={creator.name}
          creatorSlug={creator.slug}
          isOpen={showClaimModal}
          onClose={() => setShowClaimModal(false)}
        />
      )}

      {/* Create Market Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-6">
            <h2 className="text-lg font-bold mb-1">Create a Market</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Create a prediction market about {creator.name}
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block">
                  Market Question
                </label>
                <input
                  value={marketTitle}
                  onChange={e => setMarketTitle(e.target.value)}
                  placeholder={`Will ${creator.name} ...?`}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                  maxLength={120}
                />
                <div className="text-xs text-[var(--color-text-muted)] mt-1 text-right">
                  {marketTitle.length}/120
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block">
                  Resolve Date
                </label>
                <input
                  type="date"
                  value={resolveDate}
                  onChange={e => setResolveDate(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                  max={new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div className="rounded-lg bg-orange-500/5 border border-orange-500/20 p-3">
                <div className="text-xs font-medium text-orange-400 mb-1">
                  💰 Token Buyback Active
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  1% of every trade on this market auto-buys ${coinSymbol} —{' '}
                  supporting {creator.name}&apos;s creator coin.
                </div>
              </div>
              {createError && (
                <p className="text-xs text-red-400">{createError}</p>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); setCreateError(''); }}
                className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateMarket}
                disabled={creating || !marketTitle.trim() || !resolveDate}
                className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Market'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {createSuccess && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-green-500/90 px-4 py-3 text-sm font-medium text-white shadow-lg">
          Market created successfully! 🎉
        </div>
      )}
    </>
  );
}
