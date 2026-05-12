"use client";

/**
 * Global mount point for the SearchOverlay. Listens for the
 * `open-search-overlay` CustomEvent on window and toggles the overlay
 * open. Lives once in the (main) layout so any component can fire
 * the event without prop-drilling — the MobileTabBars Search tab,
 * a desktop hotkey, deep-link redirects, anything.
 *
 * SearchOverlay is dynamic-imported so its ~5KB of state + listeners
 * dont land in the layout bundle until somebody actually opens
 * search.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const SearchOverlay = dynamic(
  () => import("./SearchOverlay").then((m) => ({ default: m.SearchOverlay })),
  { ssr: false }
);

export const OPEN_SEARCH_EVENT = "open-search-overlay";

export function SearchOverlayRoot() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, handler);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, handler);
  }, []);

  return <SearchOverlay isOpen={open} onClose={() => setOpen(false)} />;
}
