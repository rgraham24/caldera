"use client";

/**
 * Creator earnings dashboard — the public, shareable surface that
 * shows what a creator is (or would be) earning on Caldera.
 *
 * Layout, top to bottom:
 *   1. Hero strip — avatar + display name + handle + status line
 *   2. The Big Number — accrued $ if isPreLaunch=false, else "Ready
 *      to earn" framing. One headline. No competing numbers.
 *   3. 4-tile KPI strip
 *   4. Buyback activity feed (hidden when empty)
 *   5. Active markets grid (top 6)
 *   6. Top holders (hidden when none)
 *   7. Sticky-bottom claim CTA on mobile (unclaimed only)
 *
 * "Real" earnings come from buyback_events via getCreatorEarnings on
 * the server. The page never renders a $0.00 primary number — the
 * pre-launch fallback exists for that case.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAppStore } from "@/store";
import { formatCurrency, formatCompactCurrency, formatRelativeTime } from "@/lib/utils";
import { getCreatorDisplayName } from "@/lib/creators/displayName";
import type { CreatorEarnings } from "@/lib/creators/earnings";
import type { Creator, Market } from "@/types";

import { MarketCard } from "@/components/markets/MarketCard";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { ClaimProfileModal } from "@/components/shared/ClaimProfileModal";

const StakeModal = dynamic(
  () =>
    import("@/components/markets/StakeModal").then((m) => ({
      default: m.StakeModal,
    })),
  { ssr: false }
);

const HolderLeaderboard = dynamic(
  () =>
    import("@/components/creators/HolderLeaderboard").then((m) => ({
      default: m.HolderLeaderboard,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-32 animate-pulse rounded-2xl bg-surface-2" />
    ),
  }
);

type BuybackEvent = {
  id: string;
  market_id: string;
  market_title: string | null;
  trade_amount_usd: number;
  personal_buyback_usd: number;
  created_at: string;
};

type CreatorProfileClientProps = {
  creator: Creator;
  markets: Market[];
  earnings: CreatorEarnings;
  claimUrl?: string | null;
};

export function CreatorProfileClient({
  creator,
  markets,
  earnings,
  claimUrl,
}: CreatorProfileClientProps) {
  const displayName = getCreatorDisplayName(creator);
  const isUnclaimed = creator.claim_status !== "claimed";
  const coinSymbol =
    creator.creator_coin_symbol ||
    creator.deso_username ||
    displayName;
  const coinLabel = `$${coinSymbol.toUpperCase()}`;

  const { desoPublicKey } = useAppStore();
  const isOwner = Boolean(
    desoPublicKey && creator.deso_public_key === desoPublicKey
  );

  const [livePrice, setLivePrice] = useState<number | null>(
    creator.creator_coin_price ?? null
  );
  const [livePic, setLivePic] = useState<string | null>(
    creator.profile_pic_url ?? null
  );
  const [desoUser, setDesoUser] = useState<string | null>(
    creator.deso_username ?? null
  );
  const [isLive, setIsLive] = useState(false);

  const [showStakeModal, setShowStakeModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [buybacks, setBuybacks] = useState<BuybackEvent[]>([]);

  useEffect(() => {
    fetch(`/api/creators/${creator.slug}/buybacks`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.events)) setBuybacks(data.events.slice(0, 10));
      })
      .catch(() => {});
  }, [creator.slug]);

  useEffect(() => {
    fetch(`/api/creators/${creator.slug}/coin-data`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) return;
        if (typeof data.priceUSD === "number") setLivePrice(data.priceUSD);
        if (data.profilePicUrl) setLivePic(data.profilePicUrl);
        if (data.desoUsername) setDesoUser(data.desoUsername);
        setIsLive(Boolean(data.live));
      })
      .catch(() => {});
  }, [creator.slug]);

  const openMarkets = markets.filter((m) => m.status === "open");
  const visibleMarkets = [...openMarkets]
    .sort((a, b) => (b.trending_score ?? 0) - (a.trending_score ?? 0))
    .slice(0, 6);
  const totalVolume = markets.reduce(
    (s, m) => s + Number(m.total_volume ?? 0),
    0
  );

  const openClaim = () => {
    if (claimUrl) {
      window.location.href = claimUrl;
    } else {
      setShowClaimModal(true);
    }
  };

  const scrollToMarkets = () => {
    document
      .getElementById("active-markets")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showStickyClaim = isUnclaimed && !isOwner;
  const showHolders =
    creator.claim_status === "claimed" ||
    (creator.creator_coin_holders ?? 0) > 0;

  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-6 md:py-16">
        {/* ── HERO STRIP ────────────────────────────────────────── */}
        <section className="mb-10 flex flex-col items-center gap-5 text-center md:mb-12 md:flex-row md:items-center md:gap-6 md:text-left">
          <CreatorAvatar
            creator={creator}
            size="lg"
            className="h-24 w-24 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-center gap-2 md:justify-start">
              <h1 className="truncate font-display text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
                {displayName}
              </h1>
              <VerificationBadge creator={creator} size="md" />
            </div>
            {desoUser && (
              <p className="mt-1 text-sm text-text-muted">@{desoUser}</p>
            )}
            <p className="mt-3 text-[10px] uppercase tracking-widest text-text-muted">
              {isUnclaimed ? "Reserved profile" : "Profile claimed"}
            </p>
          </div>
        </section>

        {/* ── THE BIG NUMBER ────────────────────────────────────── */}
        <section className="mb-12 rounded-2xl border border-border-subtle/40 bg-surface p-8 md:p-12">
          {!earnings.isPreLaunch ? (
            <>
              <p className="text-center text-[10px] uppercase tracking-widest text-text-muted">
                Accumulated for {displayName}
              </p>
              <p className="mt-4 text-center font-display text-6xl font-semibold tabular-nums text-caldera md:text-7xl">
                ${earnings.accruedUsd.toFixed(2)}
              </p>
              <p className="mt-3 text-center text-sm text-text-muted">
                From {earnings.accruedTradeCount}{" "}
                {earnings.accruedTradeCount === 1 ? "trade" : "trades"}
                {earnings.lastEventAt && (
                  <> · Last activity {formatRelativeTime(earnings.lastEventAt)}</>
                )}
              </p>
              <div className="mt-8 flex flex-col gap-3 md:mt-10 md:flex-row md:gap-4">
                {isUnclaimed && (
                  <button
                    onClick={openClaim}
                    className="flex-1 rounded-xl bg-caldera px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-caldera-hover"
                  >
                    Claim this profile →
                  </button>
                )}
                <button
                  onClick={() => setShowStakeModal(true)}
                  className="flex-1 rounded-xl border border-border-subtle px-5 py-3 text-sm font-medium text-text-primary transition-colors hover:border-white/20"
                >
                  Buy {coinLabel}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-center text-[10px] uppercase tracking-widest text-text-muted">
                Ready to earn
              </p>
              <p className="mx-auto mt-4 max-w-2xl text-center font-display text-4xl font-semibold leading-tight text-text-primary md:text-5xl">
                {displayName} earns 1% of every trade
              </p>
              <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-text-muted md:text-base">
                Auto-buys {coinLabel} on every market trade.
                {isUnclaimed && (
                  <> {displayName} inherits the full balance when they claim.</>
                )}
              </p>
              <div className="mt-8 flex flex-col gap-3 md:mt-10 md:flex-row md:gap-4">
                {openMarkets.length > 0 && (
                  <button
                    onClick={scrollToMarkets}
                    className="flex-1 rounded-xl bg-caldera px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-caldera-hover"
                  >
                    Trade {displayName}&apos;s markets →
                  </button>
                )}
                <button
                  onClick={() => setShowStakeModal(true)}
                  className="flex-1 rounded-xl border border-border-subtle px-5 py-3 text-sm font-medium text-text-primary transition-colors hover:border-white/20"
                >
                  Buy {coinLabel}
                </button>
              </div>
            </>
          )}
        </section>

        {/* ── STATS STRIP ──────────────────────────────────────── */}
        <section className="mb-12 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile
            label="Coin Price"
            value={livePrice ? formatCurrency(livePrice) : "—"}
            live={isLive && !!livePrice}
          />
          <Tile
            label="Holders"
            value={(creator.creator_coin_holders ?? 0).toLocaleString()}
          />
          <Tile label="Markets Active" value={String(openMarkets.length)} />
          <Tile
            label="Total Volume"
            value={formatCompactCurrency(totalVolume)}
          />
        </section>

        {/* ── BUYBACK ACTIVITY ─────────────────────────────────── */}
        {buybacks.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-[10px] uppercase tracking-widest text-text-muted">
              Buyback activity
            </h2>
            <div className="divide-y divide-border-subtle/40 overflow-hidden rounded-2xl border border-border-subtle/40 bg-surface">
              {buybacks.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0 pr-4">
                    <p className="truncate text-sm text-text-primary">
                      {e.market_title ?? "Trade"}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      ${Number(e.trade_amount_usd).toFixed(2)} trade ·{" "}
                      {formatRelativeTime(e.created_at)}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-caldera">
                    +${Number(e.personal_buyback_usd).toFixed(4)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── ACTIVE MARKETS ───────────────────────────────────── */}
        {openMarkets.length > 0 && (
          <section id="active-markets" className="mb-12 scroll-mt-24">
            <h2 className="mb-5 text-[10px] uppercase tracking-widest text-text-muted">
              Active markets · {openMarkets.length}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleMarkets.map((m) => (
                <MarketCard key={m.id} market={m} />
              ))}
            </div>
            {openMarkets.length > 6 && (
              <p className="mt-5 text-center text-xs text-text-muted">
                Showing top 6 of {openMarkets.length} active markets, ranked by activity.
              </p>
            )}
          </section>
        )}

        {/* ── TOP HOLDERS ──────────────────────────────────────── */}
        {showHolders && (
          <section className="mb-12">
            <h2 className="mb-5 text-[10px] uppercase tracking-widest text-text-muted">
              Top {coinLabel} holders
            </h2>
            <HolderLeaderboard
              creatorSlug={creator.slug}
              coinSymbol={coinSymbol}
              creator={creator}
            />
          </section>
        )}

        {/* Spacer so the mobile sticky claim bar doesn't cover content */}
        {showStickyClaim && <div className="h-20 md:hidden" />}
      </div>

      {/* ── MOBILE STICKY CLAIM BAR ────────────────────────────── */}
      {showStickyClaim && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border-subtle bg-surface px-4 py-3 md:hidden"
          style={{
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          }}
        >
          <Link
            href={`/creators/${creator.slug}`}
            className="flex-1 truncate text-xs text-text-muted"
          >
            {displayName} hasn&apos;t claimed yet.
          </Link>
          <button
            onClick={openClaim}
            className="rounded-lg bg-caldera px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-caldera-hover"
          >
            Claim →
          </button>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────── */}
      <StakeModal
        creator={creator}
        isOpen={showStakeModal}
        onClose={() => setShowStakeModal(false)}
        livePrice={livePrice ?? undefined}
        desoUsername={desoUser}
        profilePicUrl={livePic}
      />
      <ClaimProfileModal
        creatorName={displayName}
        creatorSlug={creator.slug}
        isOpen={showClaimModal}
        onClose={() => setShowClaimModal(false)}
      />
    </>
  );
}

function Tile({
  label,
  value,
  live,
}: {
  label: string;
  value: string;
  live?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle/40 bg-surface p-4 md:p-5">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-text-muted">
        {label}
        {live && (
          <span
            aria-label="Live"
            className="inline-block h-1 w-1 rounded-full bg-yes animate-pulse"
          />
        )}
      </p>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-text-primary md:text-2xl">
        {value}
      </p>
    </div>
  );
}
