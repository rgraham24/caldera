"use client";

import { useRef, useState } from "react";
import type { Market } from "@/types";
import { formatPercent, formatCompactCurrency, formatRelativeTime } from "@/lib/utils";
import { Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type ShareCardProps = {
  market: Market;
  creatorName?: string;
};

export function ShareCard({ market, creatorName }: ShareCardProps) {
  const [showCard, setShowCard] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const yesPercent = Math.round(market.yes_price * 100);
  const shareText = `I think "${market.title}" → ${yesPercent}% likely. Trade it on @CalderaMarkets`;
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/markets/${market.slug}`;

  const handleShareX = () => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank");
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowCard(!showCard)}
        className="text-text-muted hover:text-text-primary"
      >
        <Share2 className="mr-1.5 h-4 w-4" />
        Share
      </Button>

      {showCard && (
        <div className="mt-3 space-y-3">
          {/* Preview card */}
          <div
            ref={cardRef}
            className="rounded-2xl border border-border-subtle bg-surface p-5"
            style={{ maxWidth: 400 }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="wordmark-glow font-display text-sm font-bold text-caldera">Caldera</span>
              <span className="text-[10px] text-text-muted">caldera.markets</span>
            </div>
            <p className="mb-3 font-display text-base font-bold leading-tight text-text-primary">
              {market.title}
            </p>
            <div className="mb-3 flex items-baseline gap-2">
              <span className={`font-display text-3xl font-bold ${yesPercent >= 50 ? "text-yes" : "text-no"}`}>
                {formatPercent(market.yes_price)} YES
              </span>
            </div>
            {creatorName && (
              <p className="mb-2 text-xs text-caldera">{creatorName} · People Market</p>
            )}
            <div className="flex items-center justify-between text-[10px] text-text-muted">
              <span>{formatCompactCurrency(market.total_volume)} volume</span>
              <span>{market.resolve_at && formatRelativeTime(market.resolve_at)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleShareX}
              className="bg-caldera text-background font-semibold hover:bg-caldera/90"
            >
              Share on X
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopyLink}
              className="text-text-muted"
            >
              {copied ? <Check className="mr-1 h-3 w-3 text-yes" /> : <Copy className="mr-1 h-3 w-3" />}
              {copied ? "Copied" : "Copy Link"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
