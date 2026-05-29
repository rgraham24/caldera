"use client";

/**
 * Full-screen search overlay. Renders an input field that owns keyboard
 * focus the moment it opens, plus live-filtered results below.
 *
 * Backed by the existing /api/search endpoint TopNavs SearchBox already
 * uses — returns { markets, creators } with the same shape. Debounced
 * 150ms so a fast typer doesnt thrash the server.
 *
 * Recent searches persist in localStorage[caldera_recent_searches] —
 * last 5 unique queries, most-recent first. Tapping a result saves the
 * current query to that list before navigating.
 *
 * Trigger: another component opens this by mounting it with isOpen=true.
 * No internal trigger UI — callers (e.g. /search page) own the button
 * that opens this.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Search } from "lucide-react";
import { formatCompactCurrency } from "@/lib/utils";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { SearchBrowseContent } from "@/components/search/SearchBrowseContent";

const RECENT_KEY = "caldera_recent_searches";
const RECENT_MAX = 5;
const DEBOUNCE_MS = 150;

type SearchResult = {
  markets: Array<{
    id: string;
    slug: string;
    title: string;
    category: string;
    yes_price: number | null;
  }>;
  creators: Array<{
    id: string;
    slug: string;
    name: string;
    image_url: string | null;
    creator_coin_symbol: string | null;
    creator_coin_market_cap?: number | null;
    deso_public_key?: string | null;
    is_bitclout_original?: boolean | null;
    verification_status?: string | null;
  }>;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return;
  try {
    const cur = loadRecent();
    const next = [trimmed, ...cur.filter((x) => x !== trimmed)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage blocked — silently no-op
  }
}

export function SearchOverlay({ isOpen, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>({ markets: [], creators: [] });
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  // Reset state + auto-focus on open. Reads recent searches each time
  // so newly saved entries from prior opens stay current.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults({ markets: [], creators: [] });
    setLoading(false);
    setRecent(loadRecent());
    // Defer focus to the next tick so the input is fully mounted +
    // the iOS soft keyboard opens reliably.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  // ESC closes the overlay
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Debounced fetch on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults({ markets: [], creators: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        // TODO(search-api): /api/search has two issues observed during
        // Mobile Push 2 architecture pass — NOT fixed here, separate
        // chunk. (1) Its .select on creators omits creator_coin_market_cap,
        // so this overlays MKT CAP subtitle never renders. (2) Its .or(
        // `name.ilike.%${q}%,slug.ilike.%${q}%`) is built by string-
        // concat — a q containing comma, paren, or backslash will
        // mangle the PostgREST filter and return empty results. Fix
        // is to .ilike on each field separately or sanitize q.
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = res.ok ? await res.json() : { markets: [], creators: [] };
        setResults({
          markets: Array.isArray(data.markets) ? data.markets : [],
          creators: Array.isArray(data.creators) ? data.creators : [],
        });
      } catch {
        setResults({ markets: [], creators: [] });
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // TODO: remove once full SQL dedup ships (deferred — see audit
  // 2026-05-11). Keeps search clean while dead stub rows exist.
  // 8 popular creators (LeBron, Logan Paul, Elon, Jake Paul, etc)
  // have 2-3 rows in creators; only one has is_bitclout_original +
  // deso_public_key, the others are archived empty stubs.
  //
  // NOTE: this useMemo MUST stay above the `if (!isOpen) return null`
  // below. Calling it after the early return triggers React #310
  // ("Rendered more hooks than during the previous render") the
  // moment isOpen flips false -> true — the closed-render skipped
  // this hook, the open-render calls it.
  const dedupedCreators = useMemo(() => {
    const groups = new Map<string, typeof results.creators>();
    for (const c of results.creators) {
      const key = (c.name ?? "").toLowerCase().trim();
      if (!key) continue;
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    const out: typeof results.creators = [];
    for (const arr of groups.values()) {
      if (arr.length === 1) {
        out.push(arr[0]);
        continue;
      }
      // Multiple rows same name — keep the canonical one (verified +
      // has a pubkey), drop the archived stubs.
      const canonical =
        arr.find((c) => c.is_bitclout_original && c.deso_public_key) ?? arr[0];
      out.push(canonical);
    }
    return out;
  }, [results.creators]);

  if (!isOpen) return null;

  const handleResultClick = () => {
    saveRecent(query);
    onClose();
  };

  const handleRecentClick = (q: string) => {
    setQuery(q);
    inputRef.current?.focus();
  };

  const showEmpty = query.trim().length < 2;
  const showNoResults =
    !showEmpty && !loading && results.markets.length === 0 && dedupedCreators.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Header */}
      <div
        className="flex items-center gap-2 border-b border-border-subtle px-3 py-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <div className="relative flex-1">
          <Search
            size={18}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search creators, markets, coins..."
            className="w-full rounded-lg border border-border-subtle bg-surface py-2.5 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-caldera/40 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                saveRecent(query);
                onClose();
                router.push(`/markets?q=${encodeURIComponent(query.trim())}`);
              }
            }}
          />
        </div>
        <button
          onClick={onClose}
          type="button"
          className="shrink-0 rounded-lg p-2 text-text-muted hover:text-text-primary"
          aria-label="Close search"
        >
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Body — bottom padding clears the fixed MobileTabBar (h-16 + safe
          area), which now renders ON TOP of this overlay, so scrolled
          content is never hidden behind the bar. */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom) + 1rem)" }}
      >
        {showEmpty && (
          <div>
            {recent.length > 0 && (
              <div className="mb-8">
                <p className="mb-3 text-[11px] uppercase tracking-widest font-semibold text-text-muted">
                  Recent searches
                </p>
                <div className="flex flex-wrap gap-2">
                  {recent.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleRecentClick(q)}
                      type="button"
                      className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text-primary hover:border-caldera/30"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Same browse hub the /search page renders — shared component,
                so the overlay's default state can't drift from the page. */}
            <SearchBrowseContent onNavigate={onClose} />
          </div>
        )}

        {loading && (
          <p className="mt-8 text-center text-sm text-text-muted">Searching…</p>
        )}

        {showNoResults && (
          <p className="mt-8 text-center text-sm text-text-muted">
            Nothing matches. Try a different angle.
          </p>
        )}

        {!showEmpty && !loading && dedupedCreators.length > 0 && (
          <section className="mb-6">
            <p className="mb-2 text-[11px] uppercase tracking-widest font-semibold text-text-muted">
              Creators
            </p>
            <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
              {dedupedCreators.slice(0, 5).map((c, i, arr) => (
                <Link
                  key={c.id}
                  href={`/creators/${c.slug}`}
                  onClick={handleResultClick}
                  className={`flex items-center gap-3 px-3 py-3 hover:bg-surface-2 transition-colors ${
                    i < arr.length - 1 ? "border-b border-border-subtle/50" : ""
                  }`}
                >
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.image_url}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover bg-surface-2 shrink-0"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-caldera/20 flex items-center justify-center text-xs font-bold text-caldera shrink-0">
                      {(c.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-semibold text-text-primary">
                      <span className="truncate">{c.name}</span>
                      <VerificationBadge creator={c} />
                    </p>
                    {c.creator_coin_market_cap != null && Number(c.creator_coin_market_cap) > 0 && (
                      <p className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
                        {formatCompactCurrency(Number(c.creator_coin_market_cap))} MKT CAP
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!showEmpty && !loading && results.markets.length > 0 && (
          <section>
            <p className="mb-2 text-[11px] uppercase tracking-widest font-semibold text-text-muted">
              Markets
            </p>
            <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
              {results.markets.slice(0, 5).map((m, i, arr) => {
                const yes = Math.round((m.yes_price ?? 0) * 100);
                return (
                  <Link
                    key={m.id}
                    href={`/markets/${m.slug}`}
                    onClick={handleResultClick}
                    className={`flex items-center gap-3 px-3 py-3 hover:bg-surface-2 transition-colors ${
                      i < arr.length - 1 ? "border-b border-border-subtle/50" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-text-primary leading-snug">
                        {m.title}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-muted">
                        {m.category}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
                        yes >= 50 ? "text-yes" : "text-no"
                      }`}
                    >
                      {yes}%
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
