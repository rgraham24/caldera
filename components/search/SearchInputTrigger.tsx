"use client";

/**
 * Button styled as a search input. On tap it opens the SearchOverlay.
 * Lives on /search above the BROWSE pills as the primary entry point
 * to text search.
 */

import { useState } from "react";
import { Search } from "lucide-react";
import { SearchOverlay } from "./SearchOverlay";

export function SearchInputTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative w-full text-left"
        aria-label="Open search"
      >
        <Search
          size={18}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <span className="flex w-full items-center rounded-xl border border-border-subtle bg-surface px-12 py-3 text-sm text-text-muted">
          Search creators, markets, coins...
        </span>
      </button>
      <SearchOverlay isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
