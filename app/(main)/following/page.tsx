"use client";

import { useAppStore } from "@/store";
import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MarketCard } from "@/components/markets/MarketCard";
import type { Market } from "@/types";

const FOLLOWING_FETCH_TIMEOUT_MS = 6000;
const HYDRATION_WAIT_MS = 2000;

export default function FollowingPage() {
  const isConnected = useAppStore((s) => s.isConnected);
  const desoPublicKey = useAppStore((s) => s.desoPublicKey);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Flips true after HYDRATION_WAIT_MS so we can distinguish "still
  // waiting on Zustand persist to commit" from "user is genuinely
  // logged out". Until this flag flips, we keep skeletons up — flashing
  // the Connect Wallet branch for already-logged-in users on every
  // page load is jarring.
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  console.log("[FollowingPage] render", {
    isConnected,
    desoPublicKey: desoPublicKey ? desoPublicKey.slice(0, 12) + "..." : null,
    loading,
    error,
    marketsCount: markets.length,
    waitedTooLong,
  });

  // 2-second window for persist to commit. If desoPublicKey is still
  // null after that, treat the user as genuinely logged out and render
  // the Connect Wallet branch.
  useEffect(() => {
    const t = setTimeout(() => setWaitedTooLong(true), HYDRATION_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    console.log("[FollowingPage] effect fired", {
      desoPublicKey: desoPublicKey ? desoPublicKey.slice(0, 12) + "..." : null,
    });

    // Wait silently for desoPublicKey. CRITICAL: do NOT setLoading(false)
    // here — we want skeletons to keep showing until either a real load
    // completes OR the waitedTooLong timer flips and the render branch
    // switches to Connect Wallet.
    if (!desoPublicKey) return;

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FOLLOWING_FETCH_TIMEOUT_MS);

    const load = async () => {
      setLoading(true);
      setError(false);

      try {
        console.log("[FollowingPage] step 1: fetching /api/following");
        const followRes = await fetch(
          `/api/following?publicKey=${encodeURIComponent(desoPublicKey)}`,
          { signal: controller.signal }
        );
        const { followedKeys = [] } = (await followRes.json()) as {
          followedKeys: string[];
        };
        console.log("[FollowingPage] step 1 done:", { keysCount: followedKeys.length });

        if (cancelled) return;

        if (followedKeys.length === 0) {
          console.log("[FollowingPage] step 1 returned 0 keys, empty markets");
          setMarkets([]);
          return;
        }

        console.log("[FollowingPage] step 2: querying creators");
        const supabase = createClient();
        const { data: creators, error: creatorsErr } = await supabase
          .from("creators")
          .select("id")
          .in("deso_public_key", followedKeys);
        if (creatorsErr) {
          console.error("[FollowingPage] step 2 supabase error:", creatorsErr);
        }

        const creatorIds = (creators ?? []).map((c) => c.id);
        console.log("[FollowingPage] step 2 done:", {
          creatorIdsCount: creatorIds.length,
          firstFew: creatorIds.slice(0, 3),
        });
        if (cancelled) return;

        if (creatorIds.length === 0) {
          console.log("[FollowingPage] step 2 returned 0 creators, empty markets");
          setMarkets([]);
          return;
        }

        console.log("[FollowingPage] step 3: querying markets");
        const { data: creatorMarkets, error: marketsErr } = await supabase
          .from("markets")
          .select("*")
          .in("creator_id", creatorIds)
          .eq("status", "open")
          .order("trending_score", { ascending: false })
          .limit(50);
        if (marketsErr) {
          console.error("[FollowingPage] step 3 supabase error:", marketsErr);
        }
        console.log("[FollowingPage] step 3 done:", {
          marketsCount: creatorMarkets?.length ?? 0,
        });

        if (cancelled) return;
        setMarkets((creatorMarkets ?? []) as Market[]);
      } catch (err) {
        console.error("[FollowingPage] error in load:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
        clearTimeout(timer);
      }
    };

    load();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [desoPublicKey, reloadKey]);

  // Render decision tree:
  //   genuinely logged out (waitedTooLong true + no key)  -> Connect Wallet
  //   waiting on hydration OR mid-load (loading=true)     -> skeletons
  //   error                                               -> error state
  //   markets.length > 0                                  -> grid
  //   markets.length === 0                                -> empty state

  if (waitedTooLong && !isConnected && !desoPublicKey) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-3">Following</h1>
        <p className="text-sm text-text-muted mb-6">
          Connect your wallet to follow creators and see their markets here.
        </p>
        <button
          onClick={() => import("@/lib/deso/auth").then((m) => m.connectDeSoWallet())}
          className="bg-white text-black font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Connect
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Following</h1>
        <p className="text-sm text-text-muted">
          Prediction markets about creators you follow on DeSo
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-sm text-text-muted mb-4">
            Couldn&apos;t load Following — try again later.
          </p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          >
            Retry
          </button>
        </div>
      ) : markets.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20">
          <div
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}
          >
            <UserPlus className="h-5 w-5" />
          </div>
          <p className="text-base font-semibold text-[var(--text-primary)] mb-1">
            No markets yet from creators you follow
          </p>
          <p className="text-sm text-[var(--text-tertiary)] mb-5 max-w-md">
            Browse creators to find someone to follow. Their markets will show
            up here.
          </p>
          <Link
            href="/creators"
            className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-gray-100"
          >
            Browse creators
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
