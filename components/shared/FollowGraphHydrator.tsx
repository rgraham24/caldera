"use client";

/**
 * Hydrates the user's DeSo follow graph into Zustand once per connect.
 * Mounted at the layout shell so every page benefits without per-page
 * fetches. Fires on desoPublicKey change (login / logout / wallet
 * switch); silently no-ops when disconnected.
 *
 * Source of truth: DeSo's blockchain follow graph via /api/following
 * (which proxies to api.deso.org/get-follows-stateless). We never read
 * a local follows table — that was deleted as part of the DeSo-native
 * follow overhaul.
 */

import { useEffect } from "react";
import { useAppStore } from "@/store";

export function FollowGraphHydrator() {
  const hasHydrated = useAppStore((s) => s._hasHydrated);
  const desoPublicKey = useAppStore((s) => s.desoPublicKey);
  const isConnected = useAppStore((s) => s.isConnected);
  const setFollowedDesoKeys = useAppStore((s) => s.setFollowedDesoKeys);

  console.log("[FollowGraphHydrator] mount/render", {
    hasHydrated,
    desoPublicKey: desoPublicKey ? desoPublicKey.slice(0, 12) + "..." : null,
    isConnected,
  });

  useEffect(() => {
    console.log("[FollowGraphHydrator] effect fired", {
      hasHydrated,
      desoPublicKey: desoPublicKey ? desoPublicKey.slice(0, 12) + "..." : null,
    });

    if (!hasHydrated) {
      console.log("[FollowGraphHydrator] bail: not hydrated yet");
      return;
    }
    if (!desoPublicKey) {
      console.log("[FollowGraphHydrator] bail: no desoPublicKey, resetting set");
      setFollowedDesoKeys(new Set());
      return;
    }
    let cancelled = false;
    console.log("[FollowGraphHydrator] fetching /api/following...");
    fetch(`/api/following?publicKey=${encodeURIComponent(desoPublicKey)}`)
      .then((r) => r.json())
      .then((json: { followedKeys?: string[] }) => {
        if (cancelled) return;
        console.log("[FollowGraphHydrator] fetched", {
          keysCount: json.followedKeys?.length ?? 0,
          firstKeys: json.followedKeys?.slice(0, 3) ?? [],
        });
        const fresh = new Set(json.followedKeys ?? []);
        setFollowedDesoKeys(fresh);
        console.log(
          "[FollowGraphHydrator] set updated, followedDesoKeys.size:",
          fresh.size
        );
      })
      .catch((err) => {
        console.error("[FollowGraphHydrator] fetch error", err);
      });
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, desoPublicKey, setFollowedDesoKeys]);

  return null;
}
