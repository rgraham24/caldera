"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Creator } from "@/types";
import { formatCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { X, Check, Loader2, ExternalLink } from "lucide-react";
import { VerificationBadge } from "@/components/ui/VerificationBadge";

type StakeModalProps = {
  creator: Creator;
  isOpen: boolean;
  onClose: () => void;
  livePrice?: number;
  desoUsername?: string | null;
  profilePicUrl?: string | null;
  initialTab?: "buy" | "sell";
};

export function StakeModal({
  creator,
  isOpen,
  onClose,
  livePrice,
  desoUsername,
  profilePicUrl,
  initialTab,
}: StakeModalProps) {
  const { isConnected, desoPublicKey, desoBalanceNanos, desoBalanceUSD } =
    useAppStore();
  const [tab, setTab] = useState<"buy" | "sell">(initialTab ?? "buy");
  const [amountUSD, setAmountUSD] = useState("");
  const [coinAmountInput, setCoinAmountInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desoPrice, setDesoPrice] = useState(4.7);

  // Sell-tab balance state
  const [userCoinBalance, setUserCoinBalance] = useState<number>(0);
  const [balanceFetching, setBalanceFetching] = useState(false);

  const coinPrice = livePrice ?? creator.creator_coin_price ?? 0;
  const coinSymbol = desoUsername || creator.creator_coin_symbol;
  const founderReward = creator.founder_reward_basis_points ?? 0;
  const amountNum = parseFloat(amountUSD) || 0;
  const amountDesoNanos = desoPrice > 0 ? Math.floor((amountNum / desoPrice) * 1e9) : 0;
  const estimatedCoins = coinPrice > 0 ? amountNum / coinPrice : 0;

  const [quote, setQuote] = useState<{ coinsToReceive: number; foundersRewardCoins: number } | null>(null);
  const [quoteFetching, setQuoteFetching] = useState(false);
  const [quoteIsEstimate, setQuoteIsEstimate] = useState(false);

  const fetchDesoPrice = useCallback(async () => {
    try {
      const { getDesoPrice } = await import("@/lib/deso/api");
      const price = await getDesoPrice();
      setDesoPrice(price);
    } catch {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchDesoPrice();
      setTab(initialTab ?? "buy");
      setTxHash(null);
      setError(null);
      setAmountUSD("");
      setCoinAmountInput("");
      setQuote(null);
      setUserCoinBalance(0);
    }
  }, [isOpen, fetchDesoPrice]);

  // Fetch user's coin balance when sell tab is active
  useEffect(() => {
    if (tab !== "sell" || !desoPublicKey || !creator.deso_public_key) return;
    setBalanceFetching(true);
    import("@/lib/deso/api")
      .then(({ getUserCreatorCoinBalance }) =>
        getUserCreatorCoinBalance(desoPublicKey, creator.deso_public_key!)
      )
      .then((balance) => {
        setUserCoinBalance(balance ?? 0);
        setBalanceFetching(false);
      })
      .catch(() => setBalanceFetching(false));
  }, [tab, desoPublicKey, creator.deso_public_key]);

  // Quote for buy tab
  useEffect(() => {
    if (tab !== "buy" || amountNum <= 0) {
      setQuote(null);
      return;
    }

    if (!creator.deso_public_key) {
      setQuoteFetching(false);
      setQuoteIsEstimate(true);
      setQuote(coinPrice > 0 ? { coinsToReceive: amountNum / coinPrice, foundersRewardCoins: 0 } : null);
      return;
    }

    const effectiveDesoPrice = desoPrice > 0 ? desoPrice : 4.7;
    const desoToSpendNanos = Math.floor((amountNum / effectiveDesoPrice) * 1e9);
    if (desoToSpendNanos <= 0) { setQuote(null); return; }
    setQuoteFetching(true);
    setQuoteIsEstimate(false);
    import("@/lib/deso/api").then(({ getCreatorCoinQuote }) =>
      getCreatorCoinQuote(
        creator.deso_public_key!,
        desoToSpendNanos,
        desoPublicKey ?? process.env.NEXT_PUBLIC_PLATFORM_WALLET ?? "BC1YLhyuDGeWVgHmh3UQEoKstda525T1LnonYWURBdpgWbFBfRuntP5"
      )
    ).then((q) => {
      setQuote(q);
      setQuoteIsEstimate(false);
      setQuoteFetching(false);
    }).catch(() => setQuoteFetching(false));
  }, [amountNum, tab, desoPrice, creator.deso_public_key, coinPrice, desoPublicKey]);

  const handleConfirm = async () => {
    if (!desoPublicKey || !creator.deso_public_key) return;
    setIsLoading(true);
    setError(null);

    try {
      if (tab === "buy") {
        if (amountNum < 1) {
          setError("Minimum purchase is $1.");
          setIsLoading(false);
          return;
        }
        if (amountDesoNanos > desoBalanceNanos) {
          throw new Error(
            `Insufficient DESO balance. You have ${(desoBalanceNanos / 1e9).toFixed(4)} DESO ($${desoBalanceUSD.toFixed(2)})`
          );
        }
        const { buyCreatorCoin } = await import("@/lib/deso/api");
        const result = await buyCreatorCoin(desoPublicKey, creator.deso_public_key, amountDesoNanos);
        setTxHash(result?.txnHash ?? "");
        fetch("/api/portfolio/coin-purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorId: creator.id,
            creatorSlug: creator.slug,
            desoUsername: desoUsername,
            coinsPurchased: estimatedCoins,
            pricePerCoinUsd: coinPrice,
            desoPriceAtPurchase: desoPrice,
            txHash: result?.txnHash ?? "",
            buyerPublicKey: desoPublicKey ?? "",
            buyerUsername: null,
          }),
        }).catch(() => {});
      } else {
        // Sell
        const coinsToSell = parseFloat(coinAmountInput) || 0;
        if (coinsToSell <= 0) {
          setError("Enter coins to sell.");
          setIsLoading(false);
          return;
        }
        const coinsToSellNanos = Math.floor(coinsToSell * 1e9);
        const { sellCreatorCoin } = await import("@/lib/deso/api");
        const result = await sellCreatorCoin(desoPublicKey, creator.deso_public_key, coinsToSellNanos);
        setTxHash(result?.txnHash ?? "");
        // Decrement coin holding record
        fetch("/api/portfolio/coin-purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorSlug: creator.slug,
            desoUsername: desoUsername,
            coinsPurchased: -coinsToSell,
            buyerPublicKey: desoPublicKey ?? "",
            buyerUsername: null,
          }),
        }).catch(() => {});
      }

      // Refresh DESO balance
      const { getUserDesoBalance } = await import("@/lib/deso/api");
      const bal = await getUserDesoBalance(desoPublicKey);
      useAppStore.getState().setDesoBalance(bal.balanceNanos, bal.balanceUSD);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("rejected") || msg.includes("cancelled") || msg.includes("denied")) {
        setError("Transaction cancelled");
      } else if (msg.includes("slippage") || msg.includes("Price")) {
        setError("Price moved too much. Please try again.");
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const coinsToSellNum = parseFloat(coinAmountInput) || 0;
  const isAmountValid = tab === "buy" ? amountNum > 0 : coinsToSellNum > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border-subtle bg-surface-2 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <Link href={`/creators/${creator.slug}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
            {(profilePicUrl ?? creator.image_url) ? (
              <img
                src={(profilePicUrl ?? creator.image_url)!}
                alt={creator.name}
                className="h-10 w-10 rounded-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-caldera/20 text-sm font-bold text-caldera">
                {creator.name.charAt(0)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold text-text-primary">{creator.name}</p>
                <VerificationBadge
                  isReserved={creator.deso_is_reserved ?? false}
                  isCalderaVerified={creator.is_caldera_verified ?? false}
                />
              </div>
              <p className="text-xs text-text-muted">${coinSymbol} · {formatCurrency(coinPrice)}</p>
            </div>
          </Link>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-text-primary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Success state ── */}
        {txHash ? (
          <div className="py-2">
            <div className="text-center mb-5">
              <div className={cn(
                "mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ring-4",
                tab === "buy" ? "bg-yes/10 ring-yes/20" : "bg-amber-500/10 ring-amber-500/20"
              )}>
                <Check className={cn("h-7 w-7", tab === "buy" ? "text-yes" : "text-amber-400")} />
              </div>
              <p className="text-xl font-bold text-text-primary">
                {tab === "buy" ? "You're in! 🔥" : "Sold! 💰"}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {tab === "buy" ? (
                  <>You now hold <span className="font-semibold text-caldera">${coinSymbol}</span></>
                ) : (
                  <>You sold <span className="font-semibold text-amber-400">{coinsToSellNum.toFixed(4)} ${coinSymbol}</span></>
                )}
              </p>
            </div>

            {tab === "buy" && (
              <>
                <div className="mb-4 rounded-2xl border border-caldera/20 bg-caldera/5 p-4">
                  <div className="grid grid-cols-3 divide-x divide-caldera/10 text-center">
                    <div className="px-2">
                      <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1">You paid</p>
                      <p className="text-sm font-bold font-mono text-text-primary">{formatCurrency(amountNum)}</p>
                    </div>
                    <div className="px-2">
                      <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1">Mkt Cap</p>
                      <p className="text-sm font-bold font-mono text-text-primary">
                        {(() => {
                          const mc = creator.creator_coin_market_cap;
                          if (mc && mc > 0) {
                            if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}M`;
                            if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
                            return `$${mc.toFixed(0)}`;
                          }
                          return "—";
                        })()}
                      </p>
                    </div>
                    <div className="px-2">
                      <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1">Markets</p>
                      <p className="text-sm font-bold font-mono text-yes">{creator.markets_count ?? 0} active</p>
                    </div>
                  </div>
                </div>

                <div className="mb-4 rounded-xl bg-surface p-3 space-y-2">
                  <p className="text-[9px] uppercase tracking-widest text-text-muted font-semibold">What happens now</p>
                  <div className="flex items-start gap-2 text-xs text-text-muted">
                    <span className="text-orange-400 shrink-0">🔥</span>
                    <span>1% of every prediction trade on {creator.name}&apos;s markets auto-buys &amp; burns ${coinSymbol}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-text-muted">
                    <span className="text-caldera shrink-0">📈</span>
                    <span>As supply decreases, fewer tokens exist in circulation</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-text-muted">
                    <span className="text-yes shrink-0">🏆</span>
                    <span>Your position is recorded on-chain as an early holder on {creator.name}&apos;s profile</span>
                  </div>
                </div>
              </>
            )}

            <a
              href={`https://explorer.deso.org/?transaction-id=${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 flex items-center justify-center gap-1 text-[10px] text-text-faint hover:text-text-muted"
            >
              <ExternalLink className="h-3 w-3" />
              Tx: {txHash.slice(0, 20)}...
            </a>

            <Button
              variant="outline"
              className="w-full mb-2 border-border-subtle text-text-primary hover:bg-surface"
              onClick={async () => {
                const shareText = tab === "buy"
                  ? `I just bought $${coinSymbol} on Caldera 🔥\n\nI earn fees from every prediction market about ${creator.name} — automatically.\n\ncaldera.market/creators/${creator.slug}`
                  : `I just sold $${coinSymbol} on Caldera.\n\nCheck prediction markets for ${creator.name}:\ncaldera.market/creators/${creator.slug}`;
                const shareUrl = `https://caldera.market/creators/${creator.slug}`;
                try {
                  if (typeof navigator !== "undefined" && navigator.share) {
                    await navigator.share({ title: `$${coinSymbol} on Caldera`, text: shareText, url: shareUrl });
                  } else {
                    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
                  }
                } catch {
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
                }
              }}
            >
              🐦 Share on X
            </Button>

            <Button onClick={onClose} className="w-full bg-caldera text-background font-semibold hover:bg-caldera/90">
              Done
            </Button>
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div className="grid grid-cols-3 divide-x divide-border-subtle border-b border-border-subtle mb-5">
              <div className="px-4 py-2.5">
                <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1">Price</p>
                <p className="text-sm font-semibold text-text-primary font-mono">{formatCurrency(coinPrice)}</p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1">Mkt Cap</p>
                <p className="text-sm font-semibold text-text-primary font-mono">
                  {(() => {
                    const mc = creator.creator_coin_market_cap;
                    const holders = creator.creator_coin_holders ?? 0;
                    if (mc && mc > 0) {
                      if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}M`;
                      if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
                      return `$${mc.toFixed(0)}`;
                    }
                    if (holders > 0) return `${holders.toLocaleString()} holders`;
                    return "—";
                  })()}
                </p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1">Markets</p>
                <p className={`text-sm font-semibold font-mono ${(creator.markets_count ?? 0) > 0 ? "text-yes" : "text-text-muted"}`}>
                  {(creator.markets_count ?? 0) > 0 ? `${creator.markets_count} active` : "Coming soon"}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="mb-5 flex rounded-lg bg-background p-1">
              <button
                onClick={() => setTab("buy")}
                className={cn(
                  "flex-1 rounded-md py-2 text-sm font-semibold transition-colors",
                  tab === "buy" ? "bg-caldera/10 text-caldera border-b-2 border-caldera" : "text-text-muted"
                )}
              >
                Buy
              </button>
              <button
                onClick={() => setTab("sell")}
                className={cn(
                  "flex-1 rounded-md py-2 text-sm font-semibold transition-colors",
                  tab === "sell" ? "bg-no/10 text-no border-b-2 border-no" : "text-text-muted"
                )}
              >
                Sell
              </button>
            </div>

            {/* ── BUY: USD amount input ── */}
            {tab === "buy" ? (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs text-text-muted">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">$</span>
                  <input
                    type="number" min="0" step="1"
                    value={amountUSD}
                    onChange={(e) => setAmountUSD(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-border-subtle bg-background py-3 pl-7 pr-4 font-mono text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none focus:ring-1 focus:ring-caldera"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  {[2, 5, 10, 25].map((v) => (
                    <button key={v} onClick={() => setAmountUSD(String(v))}
                      className="rounded-md bg-surface px-3 py-1 text-xs text-text-muted hover:text-text-primary transition-colors">
                      ${v}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ── SELL: coin amount input ── */
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-text-muted">
                    {balanceFetching
                      ? "Loading balance…"
                      : `Your balance: ${userCoinBalance.toFixed(4)} $${coinSymbol}`}
                  </span>
                  <button
                    onClick={() => {
                      const max = Math.max(0, userCoinBalance - 0.000001);
                      setCoinAmountInput(max > 0 ? max.toFixed(6) : "");
                    }}
                    className="rounded px-2 py-0.5 bg-surface text-xs text-caldera hover:bg-surface-2 transition-colors"
                  >
                    Max
                  </button>
                </div>
                <label className="mb-1.5 block text-xs text-text-muted">Coins to sell</label>
                <input
                  type="number" min="0" step="any"
                  value={coinAmountInput}
                  onChange={(e) => setCoinAmountInput(e.target.value)}
                  placeholder="0.000000"
                  className="w-full rounded-xl border border-border-subtle bg-background py-3 px-4 font-mono text-sm text-text-primary placeholder:text-text-faint focus:border-no focus:outline-none focus:ring-1 focus:ring-no"
                />
                {/* Quick % buttons */}
                <div className="mt-2 flex gap-2">
                  {[25, 50, 75].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => {
                        const coins = (userCoinBalance - 0.000001) * pct / 100;
                        setCoinAmountInput(Math.max(0, coins).toFixed(6));
                      }}
                      className="flex-1 rounded-md bg-surface px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
                    >
                      {pct}%
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const max = Math.max(0, userCoinBalance - 0.000001);
                      setCoinAmountInput(max > 0 ? max.toFixed(6) : "");
                    }}
                    className="flex-1 rounded-md bg-surface px-2 py-1 text-xs text-no hover:opacity-80 transition-colors"
                  >
                    Max
                  </button>
                </div>
                {/* Estimated USD received */}
                {coinsToSellNum > 0 && (
                  <div className="mt-2 rounded-xl bg-background border border-border-subtle p-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Est. you receive</span>
                      <span className="font-mono text-yes font-semibold">
                        ~{formatCurrency(coinsToSellNum * coinPrice)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Coins</span>
                      <span className="font-mono text-text-primary">
                        {coinsToSellNum.toFixed(6)} ${coinSymbol}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Founder reward warning (buy only) */}
            {tab === "buy" && founderReward > 0 && (
              <div className="mb-3 rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 text-xs text-orange-400">
                ⚠️ {founderReward / 100}% founder reward — creator receives this portion of every purchase.
                {founderReward >= 9000 && " This token has a very high founder reward."}
              </div>
            )}

            {/* Buy preview */}
            {tab === "buy" && amountNum > 0 && (
              <div className="mb-3 rounded-xl bg-background border border-border-subtle p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">You&apos;ll receive</span>
                  <span className="font-mono text-caldera font-semibold">
                    {quoteFetching
                      ? "Calculating..."
                      : quote
                        ? `${quoteIsEstimate ? "~" : ""}${quote.coinsToReceive.toFixed(6)} $${coinSymbol}`
                        : coinPrice > 0
                          ? `~${(amountNum / coinPrice).toFixed(6)} $${coinSymbol}`
                          : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Price per coin</span>
                  <span className="font-mono text-text-primary">{formatCurrency(coinPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">DESO equivalent</span>
                  <span className="font-mono text-text-primary">{(amountDesoNanos / 1e9).toFixed(4)} DESO</span>
                </div>
              </div>
            )}

            {/* Fee breakdown (buy only) */}
            {tab === "buy" && (
              <div className="mb-4 rounded-xl border border-caldera/10 bg-caldera/5 p-3 text-xs">
                <p className="text-[9px] uppercase tracking-widest text-caldera font-semibold mb-2">Where your 2% fee goes</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Caldera platform</span>
                    <span className="text-text-primary">1%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">${coinSymbol} burn</span>
                    <span className="text-orange-400 font-semibold">1% burn 🔥</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Token holders benefit</span>
                    <span className="text-caldera font-semibold">from buy &amp; burn</span>
                  </div>
                </div>
              </div>
            )}

            <p className="mb-4 text-[10px] text-text-faint leading-relaxed">
              Price may vary. DeSo blockchain transactions are irreversible.
            </p>

            {error && <p className="mb-3 text-xs text-no">{error}</p>}

            {/* CTA */}
            <Button
              onClick={handleConfirm}
              disabled={!isConnected || !desoPublicKey || !isAmountValid || isLoading}
              className={cn(
                "w-full font-semibold disabled:opacity-50",
                tab === "sell"
                  ? "bg-no text-white hover:bg-no/90"
                  : "bg-caldera text-background hover:bg-caldera/90"
              )}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {!isConnected || !desoPublicKey
                ? "Connect DeSo Wallet First"
                : !isAmountValid
                  ? tab === "buy" ? "Enter an amount" : "Enter coins to sell"
                  : isLoading
                    ? "Confirming..."
                    : `Confirm ${tab === "buy" ? "Purchase" : "Sale"}`}
            </Button>

            {/* Balance footer */}
            {isConnected && desoPublicKey && (
              <p className="mt-3 text-center text-[10px] text-text-muted">
                {tab === "buy"
                  ? `Your balance: ${(desoBalanceNanos / 1e9).toFixed(4)} DESO (${formatCurrency(desoBalanceUSD)})`
                  : `Holding: ${userCoinBalance.toFixed(4)} $${coinSymbol}`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
