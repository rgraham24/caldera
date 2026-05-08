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
  const setFollowedDesoKeys = useAppStore((s) => s.setFollowedDesoKeys);

  useEffect(() => {
    if (!desoPublicKey) {
      setFollowedDesoKeys(new Set());
      return;
    }
    let cancelled = false;
    fetch(`/api/following?publicKey=${encodeURIComponent(desoPublicKey)}`)
      .then((r) => r.json())
      .then((json: { followedKeys?: string[] }) => {
        if (cancelled) return;
        setFollowedDesoKeys(new Set(json.followedKeys ?? []));
      })
      .catch(() => {
        // Best-effort. If the fetch fails, follow buttons render as
        // "Follow" by default — clicking still works.
      });
    return () => {
      cancelled = true;
    };
  }, [desoPublicKey, setFollowedDesoKeys]);

  return null;
}
