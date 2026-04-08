"use client";

import { useState } from "react";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  initialFollowing?: boolean;
  className?: string;
};

export function FollowButton({ slug, initialFollowing = false, className }: Props) {
  const desoPublicKey = useAppStore((s) => s.desoPublicKey);
  const isConnected = useAppStore((s) => s.isConnected);
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isConnected) { connectDeSoWallet(); return; }
    if (!desoPublicKey) return;

    // Optimistic update
    const prev = following;
    setFollowing((f) => !f);
    setLoading(true);

    try {
      const method = prev ? "DELETE" : "POST";
      const res = await fetch("/api/follows", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, desoPublicKey }),
      });
      if (!res.ok) {
        // Revert on error
        setFollowing(prev);
      }
    } catch {
      setFollowing(prev); // revert
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
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
