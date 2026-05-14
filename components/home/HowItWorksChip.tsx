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
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAppStore } from "@/store";

const STORAGE_KEY = "hiw_chip_dismissed";

export function HowItWorksChip() {
  const isConnected = useAppStore((s) => s.isConnected);
  // Start dismissed=true so SSR + initial hydration dont flash the chip
  // for users who have already dismissed it. The localStorage read in
  // the effect below decides the final state.
  const [dismissed, setDismissed] = useState(true);
  // SSR guard for createPortal — document.body doesnt exist on the
  // server. Flip true once mounted on the client, then portal target
  // is safe.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // One-time migration: the dismiss flag used to live in
    // localStorage and persist forever. We're switching to
    // sessionStorage so users get a fresh chance every visit;
    // sweep any leftover localStorage flag so existing dismissers
    // see the chip again next load.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private mode can throw — fine, no state to migrate.
    }
    setDismissed(sessionStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (isConnected || dismissed || !mounted) return null;

  const dismiss = () => {
    try {
      // Session-scoped: chip returns on next visit. Permanent
      // dismiss was too punishing for users who accidentally
      // closed the chip and then lost the only onboarding prompt.
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // sessionStorage can throw in private modes — fall through and
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
  //
  // Portaled to <body> because the homepage wraps its tree in
  // PullToRefresh, which applies `transform: translateY(...)` to its
  // content. ANY transform on an ancestor (even translateY(0)) makes
  // the chip's `position: fixed` scope to that ancestor instead of
  // the viewport — the chip then scrolls off-screen with the page.
  // Portaling makes it a direct <body> child so fixed is viewport-
  // relative again.
  const chip = (
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

  return createPortal(chip, document.body);
}
