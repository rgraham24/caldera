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
  const desoPublicKey = useAppStore((s) => s.desoPublicKey);
  const isConnected = useAppStore((s) => s.isConnected);
  const setFollowedDesoKeys = useAppStore((s) => s.setFollowedDesoKeys);

  console.log("[FollowGraphHydrator] mount/render", {
    desoPublicKey: desoPublicKey ? desoPublicKey.slice(0, 12) + "..." : null,
    isConnected,
  });

  useEffect(() => {
    console.log("[FollowGraphHydrator] effect fired", {
      desoPublicKey: desoPublicKey ? desoPublicKey.slice(0, 12) + "..." : null,
    });

    // Wait for desoPublicKey to be truthy. When persist hasn't committed
    // yet OR the user is genuinely logged out, we silently no-op — the
    // set stays at its initial empty value, which is the correct UI.
    // Once persist commits the stored desoPublicKey, the dep change
    // re-fires this effect and we hydrate the set.
    if (!desoPublicKey) return;

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
  }, [desoPublicKey, setFollowedDesoKeys]);

  return null;
}
