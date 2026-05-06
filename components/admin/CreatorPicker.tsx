"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Check, Loader2 } from "lucide-react";

export type PickerCreator = {
  id: string;
  slug: string;
  name: string;
  deso_username: string | null;
  deso_public_key: string;
  token_status: string;
  markets_count: number | null;
  claim_status: string | null;
};

type Props = {
  value: PickerCreator | null;
  onChange: (creator: PickerCreator | null) => void;
  placeholder?: string;
};

export function CreatorPicker({
  value,
  onChange,
  placeholder = "Search creators by name, slug, or DeSo handle...",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerCreator[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Phase 3 client dedupe — Phase 5 will add unique constraint at DB level.
  // Search results are ordered by markets_count DESC; first occurrence per
  // deso_public_key is the most-active row, which is the desired canonical
  // pick for an admin selecting a creator to attach a market to.
  const dedupeByPubkey = (rows: PickerCreator[]): PickerCreator[] => {
    const seen = new Set<string>();
    const out: PickerCreator[] = [];
    for (const r of rows) {
      if (!r.deso_public_key || seen.has(r.deso_public_key)) continue;
      seen.add(r.deso_public_key);
      out.push(r);
    }
    return out;
  };

  // Debounced search
  const fetchResults = useCallback(async (q: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = q.trim().length > 0
        ? `/api/creators/search?q=${encodeURIComponent(q.trim())}`
        : "/api/creators/search";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        setResults([]);
      } else {
        setResults(dedupeByPubkey(data.creators ?? []));
      }
    } catch (err) {
      setError(String(err));
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      fetchResults(query);
    }, 250);
    return () => clearTimeout(t);
  }, [query, isOpen, fetchResults]);

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [isOpen]);

  function handleSelect(creator: PickerCreator) {
    onChange(creator);
    setIsOpen(false);
    setQuery("");
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleFocus() {
    setIsOpen(true);
    if (results.length === 0) {
      fetchResults(query);
    }
  }

  // Selected chip view
  if (value && !isOpen) {
    return (
      <div ref={containerRef} className="relative">
        <div
          className="flex items-center justify-between gap-2 rounded-lg border border-orange-500/40 bg-orange-500/5 px-3 py-2.5 cursor-pointer hover:border-orange-500/60"
          onClick={() => setIsOpen(true)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Check className="h-4 w-4 text-orange-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm text-white font-medium truncate">
                {value.name}
              </div>
              <div className="text-xs text-[#888] truncate">
                @{value.deso_username ?? value.slug} · {value.markets_count ?? 0} markets · {statusLabel(value.token_status)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="text-[#888] hover:text-white shrink-0"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Search input view
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#555]" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-[#555] focus:border-orange-500 focus:outline-none"
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-lg border border-[#333] bg-[#0a0a0a] shadow-lg">
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-[#888]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}

          {!isLoading && error && (
            <div className="px-3 py-3 text-sm text-red-400">
              Error: {error}
            </div>
          )}

          {!isLoading && !error && results.length === 0 && (
            <div className="px-3 py-4 text-sm text-[#888]">
              No verified creators match. To create a market about a new
              creator, the creator must first be imported and verified.
            </div>
          )}

          {!isLoading && !error && results.length > 0 && (
            <ul>
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-[#1a1a1a] border-b border-[#222] last:border-b-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">
                        {c.name}
                      </div>
                      <div className="text-xs text-[#888] truncate">
                        @{c.deso_username ?? c.slug} · {c.markets_count ?? 0} markets · {statusLabel(c.token_status)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "claimed": return "claimed";
    case "active_verified": return "verified";
    case "active_unverified": return "unverified";
    default: return status;
  }
}
