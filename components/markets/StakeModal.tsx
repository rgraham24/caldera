"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Creator } from "@/types";
import { formatCurrency, cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { X, Check, Loader2, ExternalLink } from "lucide-react";

type StakeModalProps = {
  creator: Creator;
  isOpen: boolean;
  onClose: () => void;
  livePrice?: number;
  desoUsername?: string | null;
  profilePicUrl?: string | null;
};

export function StakeModal({
  creator,
  isOpen,
  onClose,
  livePrice,
  desoUsername,
  profilePicUrl,
}: StakeModalProps) {
  const { isConnected, desoPublicKey, desoBalanceNanos, desoBalanceUSD } =
    useAppStore();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amountUSD, setAmountUSD] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desoPrice, setDesoPrice] = useState(0);

  const coinPrice = livePrice ?? creator.creator_coin_price ?? 0;
  const coinSymbol = desoUsername || creator.creator_coin_symbol;
  const founderReward = creator.founder_reward_basis_points ?? 0;
  const amountNum = parseFloat(amountUSD) || 0;
  const amountDesoNanos = desoPrice > 0 ? Math.floor((amountNum / desoPrice) * 1e9) : 0;
  const estimatedCoins = coinPrice > 0 ? amountNum / coinPrice : 0;

  const [quote, setQuote] = useState<{ coinsToReceive: number; foundersRewardCoins: number } | null>(null);
  const [quoteFetching, setQuoteFetching] = useState(false);

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
      setTxHash(null);
      setError(null);
      setAmountUSD("");
      setQuote(null);
    }
  }, [isOpen, fetchDesoPrice]);

  useEffect(() => {
    if (tab !== "buy" || amountNum <= 0 || desoPrice <= 0 || !creator.deso_public_key || !desoPublicKey) {
      setQuote(null);
      return;
    }
    const desoToSpendNanos = Math.floor((amountNum / desoPrice) * 1e9);
    if (desoToSpendNanos <= 0) { setQuote(null); return; }
    setQuoteFetching(true);
    import("@/lib/deso/api").then(({ getCreatorCoinQuote }) =>
      getCreatorCoinQuote(creator.deso_public_key!, desoToSpendNanos, desoPublicKey)
    ).then(q => {
      setQuote(q);
      setQuoteFetching(false);
    }).catch(() => setQuoteFetching(false));
  }, [amountNum, tab, desoPrice, creator.deso_public_key, desoPublicKey]);

  const handleConfirm = async () => {
    if (!desoPublicKey || !creator.deso_public_key) return;
    setIsLoading(true);
    setError(null);

    try {
      if (tab === "buy" && amountNum < 1) {
        setError("Minimum purchase is $1.");
        setIsLoading(false);
        return;
      }
      if (tab === "buy") {
        if (amountDesoNanos > desoBalanceNanos) {
          throw new Error(
            `Insufficient DESO balance. You have ${(desoBalanceNanos / 1e9).toFixed(4)} DESO ($${desoBalanceUSD.toFixed(2)})`
          );
        }
        const { buyCreatorCoin } = await import("@/lib/deso/api");
        const result = await buyCreatorCoin(
          desoPublicKey,
          creator.deso_public_key,
          amountDesoNanos
        );
        setTxHash(result?.txnHash ?? "");
        // Record purchase for cost basis tracking
        fetch("/api/portfolio/coin-purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorId: creator.id,
            desoUsername: desoUsername,
            coinsPurchased: estimatedCoins,
            pricePerCoinUsd: coinPrice,
            desoPriceAtPurchase: desoPrice,
            txHash: result?.txnHash ?? "",
          }),
        }).catch(() => {});
      } else {
        const coinsToSellNanos = Math.floor(estimatedCoins * 1e9);
        const { sellCreatorCoin } = await import("@/lib/deso/api");
        const result = await sellCreatorCoin(
          desoPublicKey,
          creator.deso_public_key,
          coinsToSellNanos
        );
        setTxHash(result?.txnHash ?? "");
      }

      // Refresh balance
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
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
              <p className="text-sm font-semibold text-text-primary">
                {creator.name}
              </p>
              <p className="text-xs text-text-muted">
                ${coinSymbol} · {formatCurrency(coinPrice)}
              </p>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Success state */}
        {txHash ? (
          <div className="text-center py-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yes/10">
              <Check className="h-6 w-6 text-yes" />
            </div>
            <p className="text-lg font-semibold text-text-primary">
              Purchase confirmed
            </p>
            <p className="mt-1 text-sm text-text-muted">
              {creator.name} coins {tab === "buy" ? "purchased" : "sold"}
            </p>
            <p className="mt-3 font-mono text-xs text-text-muted break-all">
              Tx: {txHash.slice(0, 16)}...
            </p>
            <a
              href={`https://explorer.deso.org/?transaction-id=${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-caldera hover:text-caldera/80"
            >
              View on DeSo Explorer
              <ExternalLink className="h-3 w-3" />
            </a>
            <Button
              variant="outline"
              className="mt-4 w-full border-border-subtle text-text-primary hover:bg-surface"
              onClick={async () => {
                try {
                  // Generate fan card as image using canvas
                  const canvas = document.createElement("canvas");
                  canvas.width = 1080;
                  canvas.height = 1920;
                  const ctx = canvas.getContext("2d")!;

                  // Background
                  ctx.fillStyle = "#0a0a0f";
                  ctx.fillRect(0, 0, 1080, 1920);

                  // Card background
                  ctx.fillStyle = "#111118";
                  ctx.roundRect(80, 600, 920, 720, 32);
                  ctx.fill();

                  // Card border
                  ctx.strokeStyle = "#ffffff1a";
                  ctx.lineWidth = 1;
                  ctx.roundRect(80, 600, 920, 720, 32);
                  ctx.stroke();

                  // Accent line top
                  ctx.fillStyle = "#6366f1";
                  ctx.fillRect(80, 600, 920, 3);

                  // Creator name
                  ctx.fillStyle = "#f0f0f5";
                  ctx.font = "bold 72px -apple-system, sans-serif";
                  ctx.textAlign = "center";
                  ctx.fillText(creator.name, 540, 760);

                  // Symbol
                  ctx.fillStyle = "#8888a0";
                  ctx.font = "40px -apple-system, sans-serif";
                  ctx.fillText(`$${coinSymbol} · ${formatCurrency(coinPrice)} per coin`, 540, 820);

                  // Divider
                  ctx.fillStyle = "#ffffff0f";
                  ctx.fillRect(120, 860, 840, 1);

                  // Stats
                  ctx.fillStyle = "#55556a";
                  ctx.font = "28px -apple-system, sans-serif";
                  ctx.textAlign = "left";
                  ctx.fillText("I INVESTED", 160, 930);
                  ctx.textAlign = "right";
                  ctx.fillText("I EARN FEES FROM", 920, 930);

                  ctx.fillStyle = "#f0f0f5";
                  ctx.font = "bold 64px -apple-system, sans-serif";
                  ctx.textAlign = "left";
                  ctx.fillText(formatCurrency(amountNum), 160, 1010);
                  ctx.textAlign = "right";
                  ctx.fillText(`${creator.markets_count ?? 0} markets`, 920, 1010);

                  // Tagline
                  ctx.fillStyle = "#8888a0";
                  ctx.font = "36px -apple-system, sans-serif";
                  ctx.textAlign = "center";
                  ctx.fillText(`Earn passive income from every prediction`, 540, 1100);
                  ctx.fillStyle = "#f0f0f5";
                  ctx.font = "bold 36px -apple-system, sans-serif";
                  ctx.fillText(`about ${creator.name}`, 540, 1150);

                  // Bottom branding
                  ctx.fillStyle = "#6366f1";
                  ctx.font = "bold 48px -apple-system, sans-serif";
                  ctx.textAlign = "center";
                  ctx.fillText("CALDERA", 540, 1400);
                  ctx.fillStyle = "#55556a";
                  ctx.font = "32px -apple-system, sans-serif";
                  ctx.fillText("caldera.market", 540, 1460);

                  const shareText = `I just bought $${coinSymbol} on Caldera 🔥\n\nI earn fees from every prediction market about ${creator.name} — automatically.\n\ncaldera.market/creators/${creator.slug}`;
                  const shareUrl = `https://caldera.market/creators/${creator.slug}`;

                  // Try native share with image (works for Instagram Stories on mobile)
                  if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
                    canvas.toBlob(async (blob) => {
                      if (!blob) return;
                      const file = new File([blob], `caldera-${creator.slug}.png`, { type: "image/png" });
                      const shareData = {
                        title: `I bought $${coinSymbol} on Caldera`,
                        text: shareText,
                        url: shareUrl,
                        files: [file],
                      };
                      if (navigator.canShare(shareData)) {
                        try {
                          await navigator.share(shareData);
                          return;
                        } catch {
                          // User cancelled or error — fall through
                        }
                      }
                      // Fallback: share without file
                      try {
                        await navigator.share({ title: `I bought $${coinSymbol} on Caldera`, text: shareText, url: shareUrl });
                      } catch {
                        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
                      }
                    }, "image/png");
                  } else {
                    // Desktop: open tweet
                    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
                  }
                } catch {
                  // Ultimate fallback
                  const shareText = `I just bought $${coinSymbol} on Caldera 🔥\n\ncaldera.market/creators/${creator.slug}`;
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
                }
              }}
            >
              Share
            </Button>
            <Button
              onClick={onClose}
              className="mt-3 w-full bg-caldera text-background font-semibold hover:bg-caldera/90"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mb-5 flex rounded-lg bg-background p-1">
              <button
                onClick={() => setTab("buy")}
                className={cn(
                  "flex-1 rounded-md py-2 text-sm font-semibold transition-colors",
                  tab === "buy"
                    ? "bg-caldera/10 text-caldera border-b-2 border-caldera"
                    : "text-text-muted"
                )}
              >
                Buy
              </button>
              <button
                onClick={() => setTab("sell")}
                className={cn(
                  "flex-1 rounded-md py-2 text-sm font-semibold transition-colors",
                  tab === "sell"
                    ? "bg-no/10 text-no border-b-2 border-no"
                    : "text-text-muted"
                )}
              >
                Sell
              </button>
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-text-muted">
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={amountUSD}
                  onChange={(e) => setAmountUSD(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-border-subtle bg-background py-3 pl-7 pr-4 font-mono text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none focus:ring-1 focus:ring-caldera"
                />
              </div>
              <div className="mt-2 flex gap-2">
                {[2, 5, 10, 25].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmountUSD(String(v))}
                    className="rounded-md bg-surface px-3 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {/* Founder reward warning */}
            {tab === "buy" && founderReward > 0 && (
              <div className="mb-3 rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 text-xs text-orange-400">
                ⚠️ {founderReward / 100}% founder reward — creator receives this portion of every purchase.
                {founderReward >= 9000 && " This token has a very high founder reward."}
              </div>
            )}

            {/* Preview */}
            {amountNum > 0 && (
              <div className="mb-4 space-y-1.5 rounded-xl bg-background p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">You&apos;ll receive approx.</span>
                  <span className="font-mono text-text-primary">
                    {tab === "buy"
                      ? quoteFetching
                        ? "Calculating..."
                        : quote
                          ? `${quote.coinsToReceive.toFixed(6)} $${coinSymbol}`
                          : amountNum > 0
                            ? "Enter amount to see quote"
                            : "—"
                      : `${estimatedCoins.toFixed(4)} $${coinSymbol}`
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Current price</span>
                  <span className="font-mono text-text-primary">
                    {formatCurrency(coinPrice)} per coin
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">DESO equivalent</span>
                  <span className="font-mono text-text-primary">
                    {(amountDesoNanos / 1e9).toFixed(4)} DESO
                  </span>
                </div>
                <div className="border-t border-border-subtle/50 pt-1.5 flex justify-between">
                  <span className="text-text-muted">Fee</span>
                  <span className="font-mono text-text-muted">
                    {tab === "buy" ? "2% on buys" : "Free to sell"}
                  </span>
                </div>
              </div>
            )}

            <p className="mb-4 text-[10px] text-text-faint leading-relaxed">
              Price may vary. DeSo blockchain transactions are irreversible.
            </p>

            {error && (
              <p className="mb-3 text-xs text-no">{error}</p>
            )}

            {/* CTA */}
            <Button
              onClick={handleConfirm}
              disabled={
                !isConnected ||
                !desoPublicKey ||
                amountNum <= 0 ||
                isLoading
              }
              className="w-full bg-caldera text-background font-semibold hover:bg-caldera/90 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {!isConnected
                ? "Connect DeSo Wallet First"
                : !desoPublicKey
                ? "Connect DeSo Wallet First"
                : amountNum <= 0
                ? "Enter an amount"
                : isLoading
                ? "Confirming..."
                : `Confirm ${tab === "buy" ? "Purchase" : "Sale"}`}
            </Button>

            {/* Balance */}
            {isConnected && desoPublicKey && (
              <p className="mt-3 text-center text-[10px] text-text-muted">
                Your balance: {(desoBalanceNanos / 1e9).toFixed(4)} DESO (
                {formatCurrency(desoBalanceUSD)})
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
