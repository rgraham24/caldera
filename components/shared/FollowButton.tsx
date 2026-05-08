"use client";

/**
 * Follow / unfollow button. Writes to the DeSo blockchain follow graph
 * (UPDATE_FOLLOWING_STATUS) via the user's own derived key — no platform
 * seed involvement. Reads initial state from Zustand `followedDesoKeys`,
 * which is hydrated on connect by FollowGraphHydrator.
 *
 * Cost: each follow / unfollow burns ~250 DeSo nanos (a fraction of a
 * cent). The first action in a session triggers a permissions popup
 * authorizing up to 1000 follow txs.
 */

import { useState } from "react";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";
import { followCreator } from "@/lib/deso/api";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** DeSo public key of the creator being (un)followed. Required. */
  creatorDesoPublicKey: string | null | undefined;
  className?: string;
};

export function FollowButton({ creatorDesoPublicKey, className }: Props) {
  const desoPublicKey = useAppStore((s) => s.desoPublicKey);
  const isConnected = useAppStore((s) => s.isConnected);
  const followedDesoKeys = useAppStore((s) => s.followedDesoKeys);
  const addFollowedDesoKey = useAppStore((s) => s.addFollowedDesoKey);
  const removeFollowedDesoKey = useAppStore((s) => s.removeFollowedDesoKey);
  const [loading, setLoading] = useState(false);

  const following = creatorDesoPublicKey
    ? followedDesoKeys.has(creatorDesoPublicKey)
    : false;

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isConnected) { connectDeSoWallet(); return; }
    if (!desoPublicKey || !creatorDesoPublicKey) return;
    if (loading) return;

    // Optimistic update
    if (following) removeFollowedDesoKey(creatorDesoPublicKey);
    else addFollowedDesoKey(creatorDesoPublicKey);
    setLoading(true);

    try {
      await followCreator(desoPublicKey, creatorDesoPublicKey, following);
    } catch {
      // Rollback on error (insufficient DeSo, user rejected, network).
      // TODO: surface insufficient-balance with a "Get DeSo" link if we
      // want to differentiate that error from a generic failure.
      if (following) addFollowedDesoKey(creatorDesoPublicKey);
      else removeFollowedDesoKey(creatorDesoPublicKey);
    } finally {
      setLoading(false);
    }
  };

  // No deso_public_key on the creator → can't follow them on-chain. Hide.
  if (!creatorDesoPublicKey) return null;

  const disabled = !isConnected || loading;

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title={!isConnected ? "Connect to follow" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-60",
        following
          ? "bg-caldera/15 text-caldera border border-caldera/30"
          : "border border-border-subtle text-text-muted hover:border-caldera/30 hover:text-caldera",
        className
      )}
    >
      <Heart className={cn("h-3 w-3 transition-all", following && "fill-caldera text-caldera")} />
      {following ? "Following" : "Follow"}
    </button>
  );
}
