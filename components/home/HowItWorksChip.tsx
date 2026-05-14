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
import { Info, X } from "lucide-react";
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

  // Polymarket-style full-width bar that sits flush above the
  // MobileTabBar. Frosted treatment matches the tab bar's
  // bg-surface/85 backdrop-blur-xl so the two read as a single
  // bottom-sheet stack.
  //
  // bottom offset: calc(4rem + safe-area-inset-bottom). 4rem (64px)
  // matches the tab bar's h-16 content height; adding the safe-area
  // inset clears the iOS home-indicator padding the tab bar adds.
  // Result: chip's bottom edge sits exactly at the tab bar's top
  // border on every device.
  //
  // Tap targets: both buttons use py-/p- with matching negative
  // margins so each hit area is >= 36px without inflating the
  // visible bar height.
  //
  // Portaled to <body> because the homepage wraps its tree in
  // PullToRefresh, which applies `transform: translateY(...)` to its
  // content. ANY transform on an ancestor (even translateY(0)) makes
  // the chip's `position: fixed` scope to that ancestor instead of
  // the viewport — the chip then scrolls off-screen with the page.
  // Portaling makes it a direct <body> child so fixed is viewport-
  // relative again.
  const chip = (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 md:hidden flex items-center justify-between border-t border-border-subtle/60 bg-surface/90 backdrop-blur-xl px-4 py-3">
      <button
        onClick={open}
        type="button"
        className="flex items-center gap-2 text-sm font-medium text-text-primary py-2 -my-2"
      >
        <Info className="h-4 w-4 text-caldera" strokeWidth={2} />
        How it works
      </button>
      <button
        onClick={dismiss}
        type="button"
        aria-label="Dismiss"
        className="p-2.5 -m-2.5 text-text-muted hover:text-text-primary transition-colors"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );

  return createPortal(chip, document.body);
}
