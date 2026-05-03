"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getTokenSymbolDisplay } from "@/lib/utils/tokenSymbol";
import { useAppStore } from "@/store";
import { Search, ChevronDown, TrendingUp, Clock } from "lucide-react";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { NotificationBell } from "./NotificationBell";
import { connectDeSoWallet, disconnectDeSoWallet } from "@/lib/deso/auth";
import { useDesoBalance } from "@/hooks/useDesoBalance";

// ─── Center tabs (Polymarket-style) ──────────────────────────────────────────

type Tab =
  | { id: string; label: string; href: string; icon?: React.ComponentType<{ className?: string }>; title?: string }
  | { divider: true };

const CENTER_TABS: Tab[] = [
  { id: "trending", label: "Trending", href: "/", icon: TrendingUp, title: "Highest volume markets" },
  { id: "new", label: "New", href: "/new", icon: Clock, title: "Recently created" },
  { id: "following", label: "Following", href: "/following", title: "Markets for creators you follow" },
  { divider: true },
  { id: "creators", label: "Creators", href: "/creators" },
  { id: "markets", label: "Markets", href: "/markets" },
  { id: "leaderboard", label: "Leaderboard", href: "/leaderboard" },
];

function CenterTabs() {
  const pathname = usePathname();

  const activeId = (() => {
    if (pathname === "/creators") return "creators";
    if (pathname === "/markets") return "markets";
    if (pathname === "/leaderboard") return "leaderboard";
    if (pathname === "/new") return "new";
    if (pathname === "/following") return "following";
    if (pathname === "/") return "trending";
    return null;
  })();

  return (
    <div className="flex items-center overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: "touch" }}>
      {CENTER_TABS.map((tab, i) => {
        if ("divider" in tab) {
          return (
            <div
              key={`div-${i}`}
              className="mx-1.5 h-4 w-px shrink-0 self-center"
              style={{ background: "var(--border-subtle)" }}
            />
          );
        }
        const Icon = tab.icon;
        const isActive = activeId === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            title={tab.title}
            className="flex shrink-0 items-center gap-1 border-b-2 px-3 py-4 text-sm font-medium whitespace-nowrap transition-colors"
            style={{
              borderColor: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
            }}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Search autocomplete ──────────────────────────────────────────────────────

type SearchResult = {
  markets: Array<{ id: string; slug: string; title: string; category: string; yes_price: number | null }>;
  creators: Array<{ id: string; slug: string; name: string; image_url: string | null; creator_coin_symbol: string | null }>;
};

function SearchBox({
  router,
  searchRef,
  autoFocus,
}: {
  router: ReturnType<typeof import("next/navigation").useRouter>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>({ markets: [], creators: [] });
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(async (value: string) => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
      const data = res.ok ? await res.json() : { markets: [], creators: [] };
      setResults({
        markets: data.markets ?? [],
        creators: data.creators ?? [],
      });
    } catch {
      setResults({ markets: [], creators: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setShowDropdown(false);
      setResults({ markets: [], creators: [] });
      setLoading(false);
      return;
    }
    // Show dropdown with loading skeleton immediately — don't wait for fetch
    setShowDropdown(true);
    setLoading(true);
    debounceRef.current = setTimeout(() => fetchResults(value), 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowDropdown(false);
    } else if (e.key === "Enter" && query.trim()) {
      setShowDropdown(false);
      router.push(`/markets?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const close = () => setShowDropdown(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const hasResults = results.markets.length > 0 || results.creators.length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
      <input
        ref={searchRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (query.length >= 2) {
            setShowDropdown(true);
            if (results.markets.length === 0 && results.creators.length === 0 && !loading) {
              setLoading(true);
              fetchResults(query);
            }
          }
        }}
        placeholder="Search markets, creators, tokens..."
        autoFocus={autoFocus}
        className="w-full rounded-lg border py-1.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none transition-all"
        style={{ background: "var(--bg-surface)", borderColor: showDropdown ? "var(--border-strong)" : "var(--border-subtle)" }}
        autoComplete="off"
      />

      {showDropdown && query.length >= 2 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 overflow-hidden rounded-xl shadow-2xl"
          style={{
            zIndex: 9999,
            background: "#15112a",
            border: "1px solid rgba(124,92,252,0.2)",
          }}
        >
          {loading && (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
              ))}
            </div>
          )}

          {!loading && !hasResults && (
            <div className="px-4 py-6 text-center text-sm" style={{ color: "#8888a0" }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {!loading && results.markets.length > 0 && (
            <div className="px-2 pt-2">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#55556a" }}>
                Markets
              </p>
              {results.markets.map((m) => {
                const yes = Math.round((m.yes_price ?? 0.5) * 100);
                return (
                  <Link
                    key={m.id}
                    href={`/markets/${m.slug}`}
                    onClick={close}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
                    style={{ color: "#f0f0f5" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,92,252,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: "rgba(124,92,252,0.15)", color: "#7C5CFC" }}
                    >
                      {m.category}
                    </span>
                    <span className="flex-1 truncate text-sm">
                      {m.title.length > 60 ? m.title.slice(0, 60) + "…" : m.title}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-emerald-400">{yes}%</span>
                  </Link>
                );
              })}
            </div>
          )}

          {!loading && results.creators.length > 0 && (
            <div className={`px-2 ${results.markets.length > 0 ? "pt-1" : "pt-2"} pb-2`}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#55556a" }}>
                Creators
              </p>
              {results.creators.map((c) => (
                <Link
                  key={c.id}
                  href={`/creators/${c.slug}`}
                  onClick={close}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
                  style={{ color: "#f0f0f5" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,92,252,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.name} className="h-6 w-6 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "#7C5CFC" }}>
                      {(c.name ?? "?")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 truncate text-sm">{c.name}</span>
                  {getTokenSymbolDisplay({ slug: c.slug, creator_coin_symbol: c.creator_coin_symbol }) && (
                    <span className="shrink-0 font-mono text-xs" style={{ color: "#8888a0" }}>{getTokenSymbolDisplay({ slug: c.slug, creator_coin_symbol: c.creator_coin_symbol })}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TopNav ───────────────────────────────────────────────────────────────────

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isConnected = useAppStore((state) => state.isConnected);
  const desoUsername = useAppStore((state) => state.desoUsername);
  const desoProfilePicUrl = useAppStore((state) => state.desoProfilePicUrl);
  const { desoPublicKey, desoBalanceDeso, desoBalanceUSD, setDisconnected, setDesoBalance, openDepositModal } = useAppStore();

  // Idle balance polling (30s) — keeps nav balance fresh without hammering the API
  useDesoBalance(
    isConnected ? desoPublicKey : null,
    (nanos, usd) => setDesoBalance(nanos, usd),
    false
  );

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const isLowBalance = desoBalanceUSD < 1;
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const handleDisconnect = () => {
    setDropdownOpen(false);
    disconnectDeSoWallet();
    setDisconnected();
    router.push("/");
  };

  return (
    <>
      <nav
        className="sticky top-0 z-50"
        style={{
          background: "rgba(10,10,15,0.90)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          {/* ROW 1 — Logo, Search (desktop), Connect */}
          <div className="flex h-12 items-center gap-2 md:h-14 md:gap-3">

            {/* Logo — hidden when search is open on mobile */}
            <Link href="/" className={cn("flex items-center gap-2.5 shrink-0 transition-all", searchOpen ? "hidden md:flex" : "flex")}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="13" stroke="rgba(255,255,255,0.14)" strokeWidth="1"/>
                <circle cx="14" cy="14" r="8.5" stroke="rgba(124,92,252,0.5)" strokeWidth="0.8"/>
                <circle cx="14" cy="14" r="3.2" fill="#7C5CFC"/>
              </svg>
              <span style={{ fontFamily: 'var(--font-dm-serif)', fontSize: '20px', color: '#fff', lineHeight: 1, letterSpacing: '0.01em' }}>
                Caldera
              </span>
            </Link>

            {/* Search — icon on mobile (expands on tap), inline bar on md+ */}
            {/* Mobile: full-width bar when open */}
            {searchOpen && (
              <div className="flex flex-1 items-center gap-2 md:hidden">
                <div className="flex-1">
                  <SearchBox router={router} searchRef={searchRef} autoFocus />
                </div>
                <button
                  onClick={() => setSearchOpen(false)}
                  className="shrink-0 p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  aria-label="Close search"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
                  </svg>
                </button>
              </div>
            )}
            {/* Desktop: always-visible search bar */}
            <div className="hidden md:block md:flex-1 md:max-w-xl">
              <SearchBox router={router} searchRef={searchRef} />
            </div>

            {/* Right side */}
            <div className={cn("flex shrink-0 items-center gap-2 md:gap-3", searchOpen ? "hidden md:flex" : "ml-auto flex")}>

              {/* Search icon — mobile only, toggles expanded search */}
              <button
                onClick={() => setSearchOpen(true)}
                className="flex md:hidden items-center justify-center rounded-lg p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>

              {/* How it works */}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("show-hiw-modal"))}
                className="hidden md:flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm0 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM7.25 7a.75.75 0 0 1 .75-.75h.25a.75.75 0 0 1 .75.75v3.25h.25a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5h.25V7.75H8A.75.75 0 0 1 7.25 7z"/>
                </svg>
                How it works
              </button>

              <NotificationBell />

              {isConnected ? (
                <div className="relative flex items-center gap-1.5" ref={dropdownRef}>
                  <button
                    onClick={() => openDepositModal()}
                    className={cn(
                      "hidden items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors sm:flex",
                      isLowBalance
                        ? "bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <span className="font-mono">${desoBalanceUSD.toFixed(2)}</span>
                    {isLowBalance && <span className="text-[var(--accent)]">· Add →</span>}
                  </button>

                  <button
                    onClick={() => setDropdownOpen((o) => !o)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--bg-elevated)]"
                  >
                    {desoProfilePicUrl && !avatarError ? (
                      <img src={desoProfilePicUrl} alt={desoUsername ?? ""} className="h-7 w-7 rounded-full object-cover" onError={() => setAvatarError(true)} />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                        {(desoUsername ?? "?")[0].toUpperCase()}
                      </div>
                    )}
                    <ChevronDown className="h-3 w-3 text-[var(--text-tertiary)]" />
                  </button>

                  {dropdownOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 w-44 rounded-xl py-1 shadow-xl"
                      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
                    >
                      <button onClick={() => { setDropdownOpen(false); openDepositModal(); }} className="block w-full px-4 py-2 text-left text-sm font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)]">
                        Add Funds
                      </button>
                      <div className="my-1 mx-3 h-px" style={{ background: "var(--border-subtle)" }} />
                      <Link href="/portfolio" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Portfolio</Link>
                      <Link href="/leaderboard" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Leaderboard</Link>
                      <div className="my-1 mx-3 h-px" style={{ background: "var(--border-subtle)" }} />
                      <button onClick={handleDisconnect} className="block w-full px-4 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => connectDeSoWallet()} className="rounded-lg bg-[#7C5CFC] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#6a4ae8] md:px-4">
                  Connect
                </button>
              )}

            </div>
          </div>

        {/* ROW 2 — Category tabs, always visible, scrollable */}
        <div className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <Suspense fallback={<div className="h-10" />}>
            <CenterTabs />
          </Suspense>
        </div>
        </div>
      </nav>
    </>
  );
}
