"use client";

/**
 * Horizontal strip rendered above the market title on the detail page.
 * Anchors the market to its creator so users immediately see whose
 * coin gets the 1% buyback per trade. Skipped entirely for markets
 * without a creator_id (rare in v2).
 */

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { Creator } from "@/types";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { FollowButton } from "@/components/shared/FollowButton";
import { formatCurrency } from "@/lib/utils";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";

const StakeModal = dynamic(
  () => import("./StakeModal").then((m) => ({ default: m.StakeModal })),
  { ssr: false }
);

type Props = {
  creator: Creator;
};

export function MarketCreatorStrip({ creator }: Props) {
  const [stakeOpen, setStakeOpen] = useState(false);
  const isConnected = useAppStore((s) => s.isConnected);

  const sym =
    creator.creator_coin_symbol ||
    creator.deso_username?.toUpperCase() ||
    creator.slug.toUpperCase();
  const price = creator.creator_coin_price ?? 0;
  const isVerified =
    creator.is_bitclout_original === true ||
    creator.verification_status === "approved";

  const handleBuy = () => {
    if (!isConnected) {
      connectDeSoWallet();
      return;
    }
    setStakeOpen(true);
  };

  return (
    <>
      <div
        className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
      >
        <Link
          href={`/creators/${creator.slug}`}
          className="flex items-center gap-3 group min-w-0 flex-1"
        >
          <CreatorAvatar creator={creator} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                {creator.name}
              </span>
              {isVerified && (
                <span className="text-[var(--accent)] text-xs" aria-label="Verified">
                  ✓
                </span>
              )}
            </div>
            {creator.deso_username && (
              <p className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                @{creator.deso_username}
              </p>
            )}
          </div>
        </Link>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
              ${sym}
            </div>
            <div className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">
              {price > 0.01 ? formatCurrency(price) : "—"}
            </div>
          </div>
          <FollowButton creatorDesoPublicKey={creator.deso_public_key} />
          <button
            type="button"
            onClick={handleBuy}
            className="rounded-lg bg-[#7C5CFC] hover:bg-[#6a4ae8] text-white text-xs font-semibold px-3 py-1.5 transition-colors active:scale-[0.98] border border-[#7C5CFC]/20"
          >
            Buy ${sym}
          </button>
        </div>
      </div>

      {stakeOpen && (
        <StakeModal
          creator={creator}
          isOpen={stakeOpen}
          onClose={() => setStakeOpen(false)}
          desoUsername={creator.deso_username}
        />
      )}
    </>
  );
}
