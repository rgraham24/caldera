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
import { Info, X } from "lucide-react";
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

  return (
    <div className="fixed bottom-[80px] left-1/2 z-40 -translate-x-1/2 md:hidden">
      <div className="flex items-center gap-3 rounded-full border border-caldera/30 bg-caldera/10 px-4 py-2 backdrop-blur-md">
        <button
          onClick={open}
          className="flex items-center gap-2 text-sm font-medium text-caldera"
          type="button"
        >
          <Info size={16} strokeWidth={1.75} />
          How it works
        </button>
        <button
          onClick={dismiss}
          className="text-caldera/60 hover:text-caldera transition-colors"
          aria-label="Dismiss"
          type="button"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
