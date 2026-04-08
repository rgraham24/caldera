"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export function FollowButton({ slug, className }: { slug: string; className?: string }) {
  const desoPublicKey = useAppStore((s) => s.desoPublicKey);
  const isConnected = useAppStore((s) => s.isConnected);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!desoPublicKey) return;
    fetch(`/api/follows?deso_key=${desoPublicKey}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (Array.isArray(data)) setFollowing(data.includes(slug));
      })
      .catch(() => {});
  }, [desoPublicKey, slug]);

  const toggle = async () => {
    if (!isConnected) { connectDeSoWallet(); return; }
    if (!desoPublicKey) return;
    setLoading(true);
    try {
      const method = following ? "DELETE" : "POST";
      await fetch("/api/follows", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deso_key: desoPublicKey, slug }),
      });
      setFollowing((f) => !f);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
        following
          ? "bg-caldera/15 text-caldera border border-caldera/30"
          : "border border-border-subtle text-text-muted hover:border-caldera/30 hover:text-caldera",
        className
      )}
    >
      <Heart className={cn("h-3 w-3", following && "fill-caldera text-caldera")} />
      {following ? "Following" : "Follow"}
    </button>
  );
}
