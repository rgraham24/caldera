"use client";

/**
 * Mobile-only pull-to-refresh wrapper. Listens to touch events on its
 * own container, tracks downward drag when window scrollY === 0, and
 * fires onRefresh once the user passes the threshold (60px). Shows a
 * caldera-tinted Loader2 spinner that fades in as the user pulls and
 * spins while the refresh runs.
 *
 * No external dep — vanilla touchstart/touchmove/touchend with refs
 * for the live values + state for render only.
 *
 * Hidden on desktop (the indicator never renders past md:); browser
 * refresh handles that case.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type Props = {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
};

const TRIGGER_PX = 60;
const MAX_PULL_PX = 120;
const DAMPING = 0.5;

export function PullToRefresh({ onRefresh, children }: Props) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs mirror state so the touch handlers (registered once) read
  // current values without re-binding.
  const startYRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updatePull = (next: number) => {
      pullRef.current = next;
      setPull(next);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (window.scrollY > 0) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        updatePull(Math.min(dy * DAMPING, MAX_PULL_PX));
      }
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      startYRef.current = null;
      if (pullRef.current > TRIGGER_PX && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        // Lock the indicator visible while refreshing.
        Promise.resolve(onRefresh()).finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          updatePull(0);
        });
      } else {
        updatePull(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh]);

  const showSpinner = pull > 20 || refreshing;
  const spinnerOpacity = refreshing ? 1 : Math.min(pull / TRIGGER_PX, 1);
  // Pin spinner at TRIGGER_PX height while refreshing so the user has
  // a stable indicator to watch; otherwise track the pull distance.
  const indicatorHeight = refreshing ? TRIGGER_PX : pull;

  return (
    <div ref={containerRef} className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-center md:hidden"
        style={{
          height: indicatorHeight,
          transition: refreshing || pull === 0 ? "height 200ms ease-out" : undefined,
        }}
      >
        {showSpinner && (
          <Loader2
            size={20}
            strokeWidth={2}
            className={`text-caldera ${refreshing ? "animate-spin" : ""}`}
            style={{ opacity: spinnerOpacity }}
          />
        )}
      </div>
      <div
        style={{
          transform: `translateY(${refreshing ? TRIGGER_PX : pull}px)`,
          transition:
            refreshing || pull === 0
              ? "transform 200ms ease-out"
              : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
