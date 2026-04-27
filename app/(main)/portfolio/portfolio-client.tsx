"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";
import { TradeTicket } from "@/components/markets/TradeTicket";
import { StakeModal } from "@/components/markets/StakeModal";
import PendingRewards from "@/components/portfolio/PendingRewards";
import PendingPayouts from "@/components/portfolio/PendingPayouts";
import type { Market } from "@/types";

type Position = {
  id: string;
  side: string;
  quantity: number;
  avg_entry_price: number;
  total_cost: number;
  fees_paid: number;
  realized_pnl: number;
  unrealized_pnl_cached: number;
  status: string;
  market: {
    title: string;
    slug: string;
    yes_price: number;
    no_price: number;
    status: string;
  };
};

type WatchlistItem = {
  id: string;
  market: {
    title: string;
    slug: string;
    yes_price: number;
    total_volume: number;
    category: string;
  } | null;
};

type Tab = "open" | "settled" | "watchlist" | "holdings";

type CoinHolding = {
  creatorPublicKey: string;
  username: string;
  displayName: string;
  imageUrl: string | null;
  balanceNanos: number;
  coinPriceUSD: number;
  hasPurchased: boolean;
  creatorSlug?: string | null;
  totalValueUSD?: number;
};

type TradeModal = {
  market: Market;
  feeConfig: Record<string, string>;
  initialMode: "buy" | "sell";
  positionSide: "yes" | "no";
} | null;

export function PortfolioClient() {
  const [tab, setTab] = useState<Tab>("open");
  const [positions, setPositions] = useState<Position[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [coinHoldings, setCoinHoldings] = useState<CoinHolding[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [tradeModal, setTradeModal] = useState<TradeModal>(null);
  type CoinTradeModal = { creator: { id: string; name: string; slug: string; deso_username: string | null; deso_public_key: string | null; creator_coin_price: number | null; creator_coin_holders: number | null; creator_coin_market_cap: number | null; markets_count: number | null; image_url: string | null; deso_is_reserved: boolean | null; is_caldera_verified: boolean | null; entity_type: string | null; [key: string]: any; }; initialMode: "buy" | "sell"; } | null;
  const [coinTradeModal, setCoinTradeModal] = useState<CoinTradeModal>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const { isConnected, desoPublicKey, desoBalanceDeso, desoBalanceUSD, openDepositModal } = useAppStore();

  const fetchPositions = useCallback(() => {
    if (!desoPublicKey) return;
    fetch(`/api/portfolio?desoPublicKey=${encodeURIComponent(desoPublicKey)}`)
      .then((r) => r.json())
      .then((json) => { if (json.data) setPositions(json.data); })
      .catch(() => {});
  }, [desoPublicKey]);

  useEffect(() => {
    if (!desoPublicKey) {
      setLoading(false);
      return;
    }
    fetch(`/api/portfolio?desoPublicKey=${encodeURIComponent(desoPublicKey)}`)
      .then((r) => r.json())
      .then((json) => { if (json.data) setPositions(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [desoPublicKey]);

  const openTradeModal = async (pos: Position, mode: "buy" | "sell") => {
    setModalLoading(true);
    try {
      const [marketRes, configRes] = await Promise.all([
        fetch(`/api/markets/${pos.market.slug}`).then((r) => r.json()),
        fetch("/api/admin/config").then((r) => r.json()).catch(() => ({ data: {} })),
      ]);
      const market: Market = marketRes.data ?? marketRes;
      const feeConfig: Record<string, string> = configRes.data ?? {
        standard_platform_fee: "0.02",
        creator_market_platform_fee: "0.015",
        creator_market_creator_fee: "0.01",
      };
      setTradeModal({ market, feeConfig, initialMode: mode, positionSide: pos.side as "yes" | "no" });
    } catch {
      // silently fail
    } finally {
      setModalLoading(false);
    }
  };

  const openCoinTradeModal = async (h: CoinHolding, mode: "buy" | "sell") => {
    setModalLoading(true);
    try {
      const identifier = h.creatorSlug || h.username;
      const res = await fetch(`/api/creators/${identifier}`);
      const json = await res.json();
      const creatorObj = json.creator ?? json.data ?? json;
      if (creatorObj?.id) setCoinTradeModal({ creator: creatorObj, initialMode: mode });
    } catch {
      // silently fail
    } finally {
      setModalLoading(false);
    }
  };

  // Load coin holdings when tab is selected
  useEffect(() => {
    const key = desoPublicKey ?? useAppStore.getState().desoPublicKey;
    if (tab !== "holdings" || !key) return;

    // Check session cache first for instant load
    const cacheKey = `holdings_${key}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached);
        // Use cache if less than 60 seconds old
        if (Date.now() - ts < 60000 && data.length > 0) {
          setCoinHoldings(data);
          return;
        }
      } catch {}
    }

    const loadHoldings = async () => {
      setHoldingsLoading(true);
      try {
        const k = desoPublicKey ?? useAppStore.getState().desoPublicKey;
        if (!k) { setCoinHoldings([]); return; }
        const res = await fetch(`/api/portfolio/coins?publicKey=${encodeURIComponent(k)}`);
        const { holdings = [] } = await res.json() as { holdings: CoinHolding[] };
        setCoinHoldings(holdings);
        // Cache for 60 seconds
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: holdings, ts: Date.now() }));
      } catch {
        setCoinHoldings([]);
      } finally {
        setHoldingsLoading(false);
      }
    };
    loadHoldings();
  }, [tab, desoPublicKey]);

  const openPositions = positions.filter((p) => p.status === "open");
  const settledPositions = positions.filter((p) => p.status === "settled");

  const totalValue = openPositions.reduce((sum, p) => {
    const currentPrice =
      p.side === "yes" ? p.market.yes_price : p.market.no_price;
    return sum + p.quantity * currentPrice;
  }, 0);

  const totalUnrealizedPnl = openPositions.reduce((sum, p) => {
    const currentPrice = p.side === "yes" ? p.market.yes_price : p.market.no_price;
    return sum + (currentPrice - p.avg_entry_price) * p.quantity;
  }, 0);
  const totalRealizedPnl = settledPositions.reduce(
    (sum, p) => sum + p.realized_pnl,
    0
  );
  const totalFeesPaid = positions.reduce((sum, p) => sum + p.fees_paid, 0);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center md:px-6 lg:px-8">
        <p className="mb-4 text-text-muted">Connect your wallet to view your portfolio.</p>
        <button
          onClick={connectDeSoWallet}
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-gray-100"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center md:px-6 lg:px-8">
        <p className="text-text-muted">Loading portfolio...</p>
      </div>
    );
  }

  return (
    <>
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-primary">
        Portfolio
      </h1>

      {/* Wallet section */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-text-primary">Your Wallet</h2>
          <button
            onClick={openDepositModal}
            className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent)]/90"
          >
            Add Funds
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-text-muted">DESO Balance</p>
            <p className="mt-1 font-mono text-base font-semibold text-text-primary">
              {desoBalanceDeso.toFixed(4)} DESO
            </p>
            <p className="font-mono text-xs text-text-muted">
              ≈ ${desoBalanceUSD.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">USD Value</p>
            <p className="mt-1 font-mono text-base font-semibold text-yes">
              ${desoBalanceUSD.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Total Value", value: formatCurrency(totalValue) },
          {
            label: "Unrealized PnL",
            value: formatCurrency(totalUnrealizedPnl),
            color: totalUnrealizedPnl >= 0 ? "text-yes" : "text-no",
          },
          {
            label: "Realized PnL",
            value: formatCurrency(totalRealizedPnl),
            color: totalRealizedPnl >= 0 ? "text-yes" : "text-no",
          },
          { label: "Fees Paid", value: formatCurrency(totalFeesPaid) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border-subtle bg-surface p-4"
          >
            <p className="text-xs text-text-muted">{stat.label}</p>
            <p
              className={cn(
                "mt-1 font-mono text-lg font-semibold",
                stat.color || "text-text-primary"
              )}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <PendingRewards />
      <PendingPayouts />

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-surface p-1">
        {(
          [
            { key: "open" as Tab, label: `Open (${openPositions.length})` },
            { key: "settled" as Tab, label: `Settled (${settledPositions.length})` },
            { key: "watchlist" as Tab, label: `Watchlist (${watchlist.length})` },
            { key: "holdings" as Tab, label: "Creator Holdings" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-surface-2 text-text-primary"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "open" && (
        <div className="rounded-xl border border-border-subtle bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted">
                <th className="px-4 py-3 text-left font-medium">Market</th>
                <th className="px-4 py-3 text-left font-medium">Side</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Avg Entry</th>
                <th className="px-4 py-3 text-right font-medium">Current</th>
                <th className="px-4 py-3 text-right font-medium">PnL</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((pos) => {
                const currentPrice =
                  pos.side === "yes"
                    ? pos.market.yes_price
                    : pos.market.no_price;
                return (
                  <tr
                    key={pos.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/markets/${pos.market.slug}`}
                        className="text-text-primary hover:text-caldera"
                      >
                        {pos.market.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold",
                          pos.side === "yes"
                            ? "bg-yes/10 text-yes"
                            : "bg-no/10 text-no"
                        )}
                      >
                        {pos.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {pos.quantity.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {(pos.avg_entry_price * 100).toFixed(1)}¢
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {(currentPrice * 100).toFixed(1)}¢
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono font-medium",
                        (currentPrice - pos.avg_entry_price) * pos.quantity >= 0
                          ? "text-yes"
                          : "text-no"
                      )}
                    >
                      {formatCurrency((currentPrice - pos.avg_entry_price) * pos.quantity)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => openTradeModal(pos, "buy")}
                          disabled={modalLoading}
                          className="rounded-lg bg-[#7C5CFC] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#6a4ae8] disabled:opacity-50"
                        >
                          Buy
                        </button>
                        <button
                          onClick={() => openTradeModal(pos, "sell")}
                          disabled={modalLoading}
                          className="rounded-lg border border-no/40 px-2.5 py-1 text-xs font-semibold text-no transition-colors hover:bg-no/10 disabled:opacity-50"
                        >
                          Sell
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {openPositions.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    No open positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settled" && (
        <div className="rounded-xl border border-border-subtle bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted">
                <th className="px-4 py-3 text-left font-medium">Market</th>
                <th className="px-4 py-3 text-left font-medium">Side</th>
                <th className="px-4 py-3 text-right font-medium">Outcome</th>
                <th className="px-4 py-3 text-right font-medium">PnL</th>
              </tr>
            </thead>
            <tbody>
              {settledPositions.map((pos) => (
                <tr
                  key={pos.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/markets/${pos.market.slug}`}
                      className="text-text-primary hover:text-caldera"
                    >
                      {pos.market.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-semibold",
                        pos.side === "yes"
                          ? "bg-yes/10 text-yes"
                          : "bg-no/10 text-no"
                      )}
                    >
                      {pos.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-text-muted">
                    {pos.market.status === "resolved" ? "Resolved" : "-"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono font-medium",
                      pos.realized_pnl >= 0 ? "text-yes" : "text-no"
                    )}
                  >
                    {formatCurrency(pos.realized_pnl)}
                  </td>
                </tr>
              ))}
              {settledPositions.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    No settled positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "watchlist" && (
        <div className="rounded-xl border border-border-subtle bg-surface divide-y divide-border-subtle">
          {watchlist.map(
            (w) =>
              w.market && (
                <Link
                  key={w.id}
                  href={`/markets/${w.market.slug}`}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {w.market.title}
                    </p>
                  </div>
                  <span className="font-mono text-sm text-text-muted">
                    {formatCompactCurrency(w.market.total_volume)}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold",
                      w.market.yes_price >= 0.5 ? "text-yes" : "text-no"
                    )}
                  >
                    {Math.round(w.market.yes_price * 100)}%
                  </span>
                </Link>
              )
          )}
          {watchlist.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-text-muted">
              No items in watchlist
            </p>
          )}
        </div>
      )}

      {tab === "holdings" && (
        <div>
          {holdingsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-surface animate-pulse" />
              ))}
            </div>
          ) : coinHoldings.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface px-5 py-10 text-center">
              <p className="text-sm text-text-muted">No creator coin holdings found.</p>
              <p className="mt-1 text-xs text-text-muted">
                Buy creator coins on the Tokens page to see them here.
              </p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border-subtle bg-surface p-4">
                  <p className="text-xs text-text-muted">Holdings Value</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-text-primary">
                    {formatCurrency(coinHoldings.reduce((s, h) => s + (h.totalValueUSD ?? (h.balanceNanos / 1e9) * h.coinPriceUSD), 0))}
                  </p>
                </div>
                <div className="rounded-xl border border-border-subtle bg-surface p-4">
                  <p className="text-xs text-text-muted">Creators Held</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-caldera">
                    {coinHoldings.filter((h) => (h.totalValueUSD ?? 0) >= 0.01).length}
                  </p>
                </div>
                <div className="rounded-xl border border-border-subtle bg-surface p-4 col-span-2 md:col-span-1">
                  <p className="text-xs text-text-muted">Total Coins</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-text-primary">
                    {coinHoldings.length}
                  </p>
                </div>
              </div>

              {/* Holding cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {coinHoldings.map((h) => {
                  const coinsHeld = h.balanceNanos / 1e9;
                  const valueUSD = h.totalValueUSD ?? coinsHeld * h.coinPriceUSD;
                  return (
                    <div key={h.creatorPublicKey} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4 hover:border-caldera/30 transition-colors">
                      {h.imageUrl ? (
                        <img src={h.imageUrl} alt={h.displayName || h.username} className="h-10 w-10 rounded-full object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-caldera/20 flex items-center justify-center shrink-0 text-sm font-bold text-caldera">
                          {(h.displayName || h.username || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {h.creatorSlug ? (
                          <Link href={`/creators/${h.creatorSlug}`} className="text-sm font-semibold text-text-primary truncate hover:text-caldera block">
                            {h.displayName || h.username || h.creatorPublicKey.slice(0, 10)}
                          </Link>
                        ) : (
                          <p className="text-sm font-semibold text-text-primary truncate">{h.displayName || h.username || h.creatorPublicKey.slice(0, 10)}</p>
                        )}
                        <p className="text-xs text-text-muted font-mono">{coinsHeld.toFixed(4)} coins · {formatCurrency(h.coinPriceUSD)}/coin</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <p className="text-sm font-semibold font-mono text-text-primary">{formatCurrency(valueUSD)}</p>
                        <div className="flex gap-1">
                          <button onClick={() => openCoinTradeModal(h, "buy")} disabled={modalLoading} className="rounded-md bg-[#7C5CFC] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-[#6a4ae8] transition-colors disabled:opacity-50">Buy</button>
                          <button onClick={() => openCoinTradeModal(h, "sell")} disabled={modalLoading} className="rounded-md border border-border-subtle px-2 py-0.5 text-[10px] font-semibold text-text-muted hover:text-text-primary hover:border-white/30 transition-colors disabled:opacity-50">Sell</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>

    {/* Trade modal */}
    {tradeModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) { setTradeModal(null); setCoinHoldings([]); } }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        {/* Panel */}
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border-subtle bg-bg shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <div className="min-w-0 pr-4">
              <p className="text-xs text-text-muted uppercase tracking-widest font-semibold mb-0.5">
                {tradeModal.initialMode === "buy" ? "Buy More" : "Sell Position"}
              </p>
              <p className="text-sm font-semibold text-text-primary truncate">
                {tradeModal.market.title}
              </p>
            </div>
            <button
              onClick={() => { setTradeModal(null); setCoinHoldings([]); }}
              className="shrink-0 rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              ✕
            </button>
          </div>
          {/* TradeTicket */}
          <div className="p-4 max-h-[80vh] overflow-y-auto">
            <TradeTicket
              market={tradeModal.market}
              feeConfig={tradeModal.feeConfig}
              onTradeComplete={() => { setTradeModal(null); fetchPositions(); }}
              initialMode={tradeModal.initialMode}
            />
          </div>
        </div>
      </div>
    )}

    {/* Modal loading spinner */}
    {modalLoading && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-xl border border-border-subtle bg-surface px-6 py-4 text-sm text-text-muted">
          Loading market…
        </div>
      </div>
    )}

    {coinTradeModal && (
      <StakeModal
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        creator={coinTradeModal.creator as any}
        isOpen={!!coinTradeModal}
        onClose={() => { setCoinTradeModal(null); setCoinHoldings([]); setTab("holdings"); }}
        desoUsername={coinTradeModal.creator?.deso_username}
        livePrice={coinTradeModal.creator?.creator_coin_price ?? undefined}
        initialTab={coinTradeModal.initialMode}
      />
    )}
    </>
  );
}
