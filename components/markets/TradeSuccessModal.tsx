"use client";

/**
 * Trade success confirmation. Replaces the inline emoji-explosion
 * success block TradeTicket used to render in-place.
 *
 * Design reference: Cash App send confirmation, Linear task complete,
 * Stripe payment success. Calm, confident, dignified. No confetti,
 * no auto-dismiss.
 *
 * Mobile (< md): bottom sheet, slides up, rounded-t-2xl, drag handle.
 * Desktop (md+): centered 480px modal, rounded-2xl, backdrop-blur.
 *
 * Buy flow renders the creator-coin flow visualization:
 *   $X.XX → @creator
 *      ↓  (one-time pulse animation along this arrow)
 *   [avatar] Creator name ✓
 *   "Inherits on claim"
 *
 * Sell flow skips that section — sells dont trigger the 1% buyback.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Check } from "lucide-react";
import type { Market, Creator } from "@/types";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { getCreatorDisplayName } from "@/lib/creators/displayName";

type TradeSuccess = {
  shares: number;
  side: string;
  mode: "buy" | "sell";
  amountUsd: number;
  payout?: number;
  txHashHex?: string;
};

type TradeSuccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  market: Market;
  creator?: Creator | null;
  success: TradeSuccess;
};

// 1% of every buy auto-buys the creators coin in v2's fee split.
// Sells dont trigger this slice (no creator-coin contribution shown
// in the sell-mode summary).
const CREATOR_COIN_BUY_RATE = 0.01;

function CreatorAvatar({
  creator,
  size = 32,
}: {
  creator: Creator;
  size?: number;
}) {
  const dim = { width: size, height: size };
  const initial = getCreatorDisplayName(creator).charAt(0).toUpperCase();
  if (creator.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={creator.image_url}
        alt=""
        style={dim}
        className="rounded-full object-cover bg-surface-2 shrink-0"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <span
      style={dim}
      className="inline-flex items-center justify-center rounded-full bg-caldera/20 text-xs font-semibold text-caldera shrink-0"
    >
      {initial}
    </span>
  );
}

function buildTweetUrl({
  market,
  creator,
  success,
}: {
  market: Market;
  creator?: Creator | null;
  success: TradeSuccess;
}): string {
  const SIDE = success.side.toUpperCase();
  const amountUsd = success.amountUsd.toFixed(2);
  let text: string;

  if (success.mode === "sell") {
    const payoutStr =
      typeof success.payout === "number" ? success.payout.toFixed(2) : amountUsd;
    text =
      `Just closed my ${SIDE} position on "${market.title}" for $${payoutStr}.\n\n` +
      `www.caldera.market`;
  } else if (!creator) {
    text =
      `Just bought $${amountUsd} of ${SIDE} on "${market.title}".\n\n` +
      `www.caldera.market`;
  } else {
    const displayName = getCreatorDisplayName(creator);
    const coinHandle = creator.deso_username
      ? `$${creator.deso_username.toUpperCase()}`
      : `${displayName}'s coin`;
    const claimSubject = displayName;
    text =
      `Just bought $${amountUsd} of ${SIDE} on "${market.title}"\n\n` +
      `1% of every trade buys ${coinHandle} — ${claimSubject} inherits it when they claim.\n\n` +
      `www.caldera.market`;
  }
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export function TradeSuccessModal({
  isOpen,
  onClose,
  market,
  creator,
  success,
}: TradeSuccessModalProps) {
  const router = useRouter();

  // SSR guard for createPortal — document.body doesnt exist on the
  // server. mounted flips true on first client render, after which
  // the portal target is safe to reference.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const isBuy = success.mode === "buy";
  const SIDE = success.side.toUpperCase();
  const buybackUsd = success.amountUsd * CREATOR_COIN_BUY_RATE;
  const coinHandle = creator?.deso_username
    ? `$${creator.deso_username.toUpperCase()}`
    : creator
      ? `${getCreatorDisplayName(creator)}'s coin`
      : null;

  // Approx fill price per share — gross USD divided by shares. Floor at
  // 0 to avoid -0 / NaN edge cases when shares is 0.
  const pricePerShareCents =
    success.shares > 0
      ? Math.max(0, Math.round((success.amountUsd / success.shares) * 100))
      : 0;

  const onShare = () => {
    const url = buildTweetUrl({ market, creator, success });
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const onViewPosition = () => {
    router.push("/portfolio");
    onClose();
  };

  // Portal to document.body so the modal escapes any ancestor
  // stacking-context trap. TradeTickets root div uses the
  // 'trade-panel-glow' class which (almost certainly) applies a
  // transform/filter that pins descendant 'position: fixed'
  // elements into its stacking context — preventing the modal
  // from painting over the live ticker + TopNav even at z-50.
  // Portaling makes the modal a direct <body> child so its z-50
  // compares cleanly with the ticker's z-50 in the body's stacking
  // context, and (as later DOM) wins the tiebreaker.
  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-start md:overflow-y-auto md:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-h-[90vh] overflow-y-auto rounded-t-2xl border border-border-subtle bg-background shadow-2xl animate-slide-up md:max-w-[480px] md:my-[5vh] md:rounded-2xl md:animate-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Drag handle — mobile only */}
        <div className="md:hidden mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-text-muted/30" />

        {/* Close X */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
        >
          <X size={18} strokeWidth={1.75} />
        </button>

        <div className="px-6 pt-8 pb-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-center gap-2">
            <Check size={20} strokeWidth={2.5} className="text-caldera" />
            <span className="text-base font-semibold text-text-primary">
              {isBuy ? "Position confirmed" : "Position closed"}
            </span>
          </div>

          {/* Trade summary — lead with dollar amount per Polymarket convention.
              Prediction-market language only (no 'bet' / 'stake' / 'wager'). */}
          <div className="mb-6 text-center space-y-2">
            {isBuy ? (
              <>
                <p className="text-base font-semibold text-text-primary">
                  You bought{" "}
                  <span className="tabular-nums">
                    ${success.amountUsd.toFixed(2)}
                  </span>{" "}
                  of{" "}
                  <span
                    className={success.side === "yes" ? "text-yes" : "text-no"}
                  >
                    {SIDE}
                  </span>
                </p>
                <p className="text-sm font-semibold text-text-primary leading-snug max-w-sm mx-auto">
                  {market.title}
                </p>
                {success.shares > 0 && (
                  <p className="text-xs text-text-muted tabular-nums">
                    {success.shares.toFixed(1)} shares
                    {pricePerShareCents > 0 && <> at {pricePerShareCents}¢</>}
                    {" — pays "}
                    <span className="font-semibold">${success.shares.toFixed(2)}</span>
                    {" if correct"}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-text-primary">
                  You closed your{" "}
                  <span
                    className={success.side === "yes" ? "text-yes" : "text-no"}
                  >
                    {SIDE}
                  </span>{" "}
                  position
                  {typeof success.payout === "number" && (
                    <>
                      {" for "}
                      <span className="tabular-nums">
                        ${success.payout.toFixed(2)}
                      </span>
                    </>
                  )}
                </p>
                <p className="text-sm font-semibold text-text-primary leading-snug max-w-sm mx-auto">
                  {market.title}
                </p>
                {success.shares > 0 && typeof success.payout === "number" && (
                  <p className="text-xs text-text-muted tabular-nums">
                    {success.shares.toFixed(1)} shares closed at ~
                    {Math.round((success.payout / success.shares) * 100)}¢
                  </p>
                )}
              </>
            )}
          </div>

          {/* Flow visualization — buy only. Skipped on sell since sells
              dont trigger the 1% creator-coin buy. */}
          {isBuy && (
            <>
              <div className="h-px bg-border-subtle" />
              <div className="py-6">
                <p className="mb-5 text-[10px] uppercase tracking-widest font-semibold text-text-muted text-center">
                  Your trade just contributed
                </p>

                <div className="flex flex-col items-center gap-3">
                  {/* Line A — 1% lead in caldera-purple (the compelling
                      story); dollar amount demoted to a smaller muted
                      sub-line. '1%' holds across all trade sizes and
                      reads psychologically larger than '\$0.01'. */}
                  {coinHandle ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-lg font-bold tabular-nums text-caldera">
                          1%
                        </span>
                        <span className="text-sm text-text-muted">→ {coinHandle}</span>
                      </div>
                      {success.amountUsd > 0 && (
                        <p className="text-xs text-text-muted tabular-nums">
                          (${buybackUsd.toFixed(2)} from your ${success.amountUsd.toFixed(2)})
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted text-center max-w-xs">
                      Trading on this creator buys their coin every time.
                    </p>
                  )}

                  {/* Arrow with one-time pulse */}
                  <div className="relative h-6 w-px bg-border-subtle">
                    <span
                      className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-caldera animate-pulse-down"
                      aria-hidden="true"
                    />
                  </div>

                  {/* Line C — creator card */}
                  {creator ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="inline-flex items-center gap-2">
                        <CreatorAvatar creator={creator} size={32} />
                        <span className="text-sm font-semibold text-text-primary">
                          {getCreatorDisplayName(creator)}
                        </span>
                        <VerificationBadge creator={creator} />
                      </div>
                      <p className="text-xs text-text-muted">
                        Inherits on claim
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">
                      Inherits on claim
                    </p>
                  )}
                </div>
              </div>
              <div className="h-px bg-border-subtle" />
            </>
          )}

          {/* Actions — mobile: stacked, Share on top; desktop: side by
              side, Share on the right (primary position). */}
          <div className="mt-6 flex flex-col gap-3 md:flex-row-reverse">
            <button
              onClick={onShare}
              className="w-full rounded-lg bg-caldera text-white font-semibold py-3 text-sm hover:bg-caldera-hover transition-colors md:flex-1"
            >
              Share
            </button>
            <button
              onClick={onViewPosition}
              className="w-full rounded-lg border border-border-subtle text-text-muted font-medium py-3 text-sm hover:text-text-primary hover:border-white/20 transition-colors md:flex-1"
            >
              View position
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
