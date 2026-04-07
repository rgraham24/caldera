"use client";

import { useState, useEffect } from "react";
import type { Creator } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { StakeModal } from "@/components/markets/StakeModal";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";

type CreatorCoinExplainerProps = {
  creator: Creator;
  creatorFeePercent: number;
};

export function CreatorCoinExplainer({
  creator,
  creatorFeePercent,
}: CreatorCoinExplainerProps) {
  const [open, setOpen] = useState(true);
  const [showStakeModal, setShowStakeModal] = useState(false);

  const [livePrice, setLivePrice] = useState(creator.creator_coin_price);
  const [liveHolders, setLiveHolders] = useState(creator.creator_coin_holders);
  const [livePic, setLivePic] = useState<string | null>(creator.profile_pic_url);
  const [desoUser, setDesoUser] = useState<string | null>(creator.deso_username);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    fetch(`/api/creators/${creator.slug}/coin-data`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data) {
          setLivePrice(data.priceUSD);
          setLiveHolders(data.holders);
          if (data.profilePicUrl) setLivePic(data.profilePicUrl);
          if (data.desoUsername) setDesoUser(data.desoUsername);
          setIsLive(data.live);
        }
      })
      .catch(() => {});
  }, [creator.slug]);

  return (
    <>
      <div className="rounded-xl border border-caldera/20 bg-caldera/5">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 p-4 text-left"
        >
          <Link href={`/creators/${creator.slug}`} className="flex-1 text-sm font-medium text-text-primary hover:text-caldera transition-colors">
            {creator.name}
          </Link>
          {open ? (
            <ChevronUp className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          )}
        </button>
        {open && (
          <div className="border-t border-caldera/10 px-4 pb-4 pt-3">
            <p className="text-sm text-text-muted leading-relaxed">
              {creator.tier === "verified_creator" ? (
                <>1% of every trade auto-buys <span className="text-caldera font-medium">${desoUser || creator.creator_coin_symbol}</span> on DeSo. Proportional to your holdings.</>
              ) : (
                <>1% of every trade auto-buys <span className="text-caldera font-medium">${desoUser || creator.creator_coin_symbol}</span>. {creator.name} hasn&apos;t claimed this profile yet.</>
              )}
            </p>

            <div className="mt-3 flex items-center gap-4 rounded-lg bg-surface p-3">
              <CreatorAvatar creator={creator} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/creators/${creator.slug}`} className="text-sm font-semibold text-text-primary hover:text-caldera transition-colors">
                    {creator.name}
                  </Link>
                  <span className="text-[10px] tracking-widest text-text-muted">
                    ${desoUser || creator.creator_coin_symbol}
                  </span>
                  {isLive && (
                    <span className="flex items-center gap-1 text-[10px] text-yes">
                      <span className="h-1.5 w-1.5 rounded-full bg-yes animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-bold tracking-normal text-text-primary">
                    {desoUser ? formatCurrency(livePrice) : "—"}
                  </span>
                  <span className="text-xs text-text-muted">
                    {liveHolders.toLocaleString()} holders
                  </span>
                </div>
              </div>
              {desoUser ? (
                <button
                  onClick={() => setShowStakeModal(true)}
                  className="rounded-lg bg-caldera/10 px-3 py-1.5 text-xs font-medium text-caldera border border-caldera/20 hover:bg-caldera/20 transition-colors"
                >
                  Buy ${desoUser}
                </button>
              ) : (
                <span className="text-[10px] text-text-faint">Not on DeSo yet</span>
              )}
            </div>
          </div>
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
