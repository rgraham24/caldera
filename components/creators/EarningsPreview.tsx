"use client";

import { useState } from "react";
import type { Creator, Market } from "@/types";
import { formatCurrency, formatCompactCurrency } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

type EarningsPreviewProps = {
  creator: Creator;
  markets: Market[];
  onClaimClick?: () => void;
};

export function EarningsPreview({ creator, markets, onClaimClick }: EarningsPreviewProps) {
  const [copied, setCopied] = useState(false);

  const totalVolume = markets.reduce((s, m) => s + m.total_volume, 0);
  const creatorShareIfClaimed = totalVolume * 0.0075;
  const communityPool = totalVolume * 0.015;
  const topMarket = markets.sort((a, b) => b.total_volume - a.total_volume)[0];
  const sym = creator.deso_username || creator.creator_coin_symbol || creator.name;

  const shareText = `Hey @${sym}, you have ${formatCurrency(creatorShareIfClaimed)} in potential earnings on @CalderaMarkets from prediction markets about you. Claim your profile → caldera.markets/creators/${creator.slug}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareX = () => {
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  if (totalVolume === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle/30 bg-surface p-6">
        <p className="text-sm font-medium text-text-primary mb-2">
          💰 What {creator.name} could earn on Caldera
        </p>
        <p className="text-sm text-text-muted">
          No prediction markets yet. When markets are created, {creator.name} could earn 0.75% of every trade by claiming this profile.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-caldera/20 bg-gradient-to-b from-caldera/5 to-transparent p-6">
      <p className="text-sm font-medium text-text-muted mb-4">
        💰 What {creator.name} could be earning on Caldera
      </p>

      {/* Big numbers */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-surface p-3">
          <p className="font-mono text-xl font-bold text-text-primary tracking-normal">
            {formatCompactCurrency(totalVolume)}
          </p>
          <p className="mt-0.5 text-[10px] text-text-muted">Total volume on your markets</p>
        </div>
        <div className="rounded-xl bg-surface p-3">
          <p className="font-mono text-xl font-bold text-caldera tracking-normal">
            {formatCurrency(creatorShareIfClaimed)}
          </p>
          <p className="mt-0.5 text-[10px] text-text-muted">Your share if claimed (0.75%)</p>
        </div>
        <div className="rounded-xl bg-surface p-3">
          <p className="font-mono text-xl font-bold text-amber-400 tracking-normal">
            {formatCurrency(communityPool)}
          </p>
          <p className="mt-0.5 text-[10px] text-text-muted">Community pool so far</p>
        </div>
      </div>

      {/* Market context */}
      <p className="text-sm text-text-muted mb-2">
        {markets.length} prediction market{markets.length !== 1 ? "s" : ""} about {creator.name}
      </p>
      {topMarket && (
        <p className="text-xs text-text-muted mb-4">
          Most active: &ldquo;{topMarket.title.slice(0, 50)}...&rdquo; · {Math.round(topMarket.yes_price * 100)}% YES · {formatCompactCurrency(topMarket.total_volume)} vol
        </p>
      )}

      {/* CTA */}
      {onClaimClick && (
        <button
          onClick={onClaimClick}
          className="mb-4 w-full rounded-xl bg-caldera px-5 py-3 text-sm font-semibold text-background hover:bg-caldera/90 transition-colors"
        >
          Claim this profile and start earning →
        </button>
      )}

      {/* Share */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-text-muted">Share with {creator.name}:</p>
        <button
          onClick={handleShareX}
          className="rounded-lg bg-surface px-3 py-1 text-xs font-medium text-caldera hover:bg-surface-2"
        >
          Share on X
        </button>
        <button
          onClick={handleCopy}
          className="rounded-lg bg-surface px-3 py-1 text-xs font-medium text-text-muted hover:text-text-primary"
        >
          {copied ? <Check className="inline h-3 w-3 text-yes" /> : <Copy className="inline h-3 w-3" />}
          {copied ? " Copied" : " Copy"}
        </button>
      </div>

      {/* Watch claim */}
      {creator.claim_watcher_count !== undefined && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={async () => {
              await fetch(`/api/creators/${creator.slug}/watch-claim`, { method: "POST" });
            }}
            className="text-xs text-text-muted hover:text-caldera transition-colors"
          >
            🔔 Notify me when {creator.name} claims
          </button>
          {(creator.claim_watcher_count || 0) > 0 && (
            <span className="text-[10px] text-text-faint">
              {creator.claim_watcher_count} waiting
            </span>
          )}
        </div>
      )}
    </div>
  );
}
