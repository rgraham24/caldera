"use client";

/**
 * Floating 'How it works' chip on Home for non-connected mobile users.
 *
 * Sits 80px from the bottom (above the MobileTabBars 64px + safe-area)
 * and centers horizontally. Dismissed state persists in localStorage so
 * the chip doesnt reappear next session.
 *
 * Hidden on desktop (md:hidden) — desktop users have a 'How it works'
 * link in the top nav already.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "@/store";

const STORAGE_KEY = "hiw_chip_dismissed";

export function HowItWorksChip() {
  const isConnected = useAppStore((s) => s.isConnected);
  // Start dismissed=true so SSR + initial hydration dont flash the chip
  // for users who have already dismissed it. The localStorage read in
  // the effect below decides the final state.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (isConnected || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage can throw in private modes — fall through and
      // just hide for this session.
    }
    setDismissed(true);
  };

  const open = () => {
    window.dispatchEvent(new CustomEvent("show-hiw-modal"));
  };

  // Polymarket-style: solid caldera pill, two regions with a thin
  // divider. Each region is its own button so the tap targets dont
  // bleed into each other. Both meet the 36px tap-target floor —
  // px-4 py-2.5 / px-3 py-2.5 both render at ~40px on the short
  // axis.
  return (
    <div className="fixed bottom-[80px] left-1/2 z-40 -translate-x-1/2 md:hidden flex items-center rounded-full bg-caldera shadow-lg overflow-hidden">
      <button
        onClick={open}
        type="button"
        className="px-4 py-2.5 text-sm font-semibold text-white hover:bg-caldera-hover transition-colors"
      >
        How it works
      </button>
      <div className="h-5 w-px bg-white/20" aria-hidden="true" />
      <button
        onClick={dismiss}
        type="button"
        aria-label="Dismiss"
        className="px-3 py-2.5 text-white hover:bg-caldera-hover transition-colors"
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
