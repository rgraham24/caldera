"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Search, Menu, X, ChevronDown, TrendingUp, Zap, Clock } from "lucide-react";
import { useState, useRef, useEffect, Suspense } from "react";
import { NotificationBell } from "./NotificationBell";
import { connectDeSoWallet, disconnectDeSoWallet } from "@/lib/deso/auth";

// ─── Center tabs (Polymarket-style) ──────────────────────────────────────────

type Tab =
  | { id: string; label: string; href: string; icon?: React.ComponentType<{ className?: string }> }
  | { divider: true };

const CENTER_TABS: Tab[] = [
  { id: "trending", label: "Trending", href: "/", icon: TrendingUp },
  { id: "breaking", label: "Breaking", href: "/?sort=breaking", icon: Zap },
  { id: "new", label: "New", href: "/?sort=new", icon: Clock },
  { id: "following", label: "Following", href: "/?sort=following" },
  { divider: true },
  { id: "tokens", label: "Tokens", href: "/creators" },
  { id: "creators", label: "Creators", href: "/?category=creators" },
  { id: "sports", label: "Sports", href: "/?category=sports" },
  { id: "music", label: "Music", href: "/?category=music" },
  { id: "politics", label: "Politics", href: "/?category=politics" },
  { id: "tech", label: "Tech", href: "/?category=tech" },
  { id: "entertainment", label: "Entertainment", href: "/?category=entertainment" },
];

function CenterTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeId = (() => {
    if (pathname === "/creators") return "tokens";
    if (pathname !== "/") return null;
    const cat = searchParams.get("category");
    const sort = searchParams.get("sort");
    if (cat) return cat;
    if (sort === "breaking") return "breaking";
    if (sort === "new") return "new";
    if (sort === "following") return "following";
    return "trending";
  })();

  return (
    <div className="flex items-center overflow-x-auto scrollbar-hide">
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

// ─── Mobile menu items ────────────────────────────────────────────────────────

const MOBILE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/markets", label: "Markets" },
  { href: "/creators", label: "Tokens" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/portfolio", label: "Portfolio" },
];

// ─── TopNav ───────────────────────────────────────────────────────────────────

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isConnected = useAppStore((state) => state.isConnected);
  const desoUsername = useAppStore((state) => state.desoUsername);
  const desoProfilePicUrl = useAppStore((state) => state.desoProfilePicUrl);
  const { desoBalanceDeso, desoBalanceUSD, setDisconnected, openDepositModal } = useAppStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

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
          <div className="flex h-14 items-center gap-4">

            {/* Logo — shrink-0 */}
            <Link href="/" className="shrink-0">
              <span className="font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                Caldera
              </span>
            </Link>

            {/* Center tabs — hidden on mobile, scrollable on desktop */}
            <div className="hidden flex-1 overflow-hidden md:block">
              <Suspense fallback={<div className="h-14" />}>
                <CenterTabs />
              </Suspense>
            </div>

            {/* Right side — shrink-0 */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {/* Search */}
              <div className="relative hidden lg:block">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search (/)"
                  className="w-40 rounded-lg border py-1.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all focus:outline-none focus:w-56"
                  style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                />
              </div>

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
                <button onClick={() => connectDeSoWallet()} className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-gray-100">
                  Connect
                </button>
              )}

              {/* Mobile hamburger */}
              <Button variant="ghost" size="icon" className="text-[var(--text-secondary)] md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="pb-4 md:hidden" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              {/* Category scroll strip on mobile */}
              <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
                {CENTER_TABS.filter((t) => !("divider" in t)).map((tab) => {
                  if ("divider" in tab) return null;
                  return (
                    <Link
                      key={tab.id}
                      href={tab.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-col gap-1 pt-1">
                {MOBILE_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex min-h-[44px] items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      pathname === item.href ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
                {isConnected ? (
                  <>
                    <div className="mx-3 my-1 h-px" style={{ background: "var(--border-subtle)" }} />
                    <div className="flex items-center gap-3 px-3 py-2">
                      {desoProfilePicUrl && !avatarError ? (
                        <img src={desoProfilePicUrl} alt={desoUsername ?? ""} className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                          {(desoUsername ?? "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">@{desoUsername}</p>
                        <p className="font-mono text-xs text-[var(--text-secondary)]">{desoBalanceDeso.toFixed(2)} DESO</p>
                      </div>
                    </div>
                    <button onClick={() => { setMobileMenuOpen(false); handleDisconnect(); }} className="flex min-h-[44px] items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button onClick={() => { setMobileMenuOpen(false); connectDeSoWallet(); }} className="mx-3 mt-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-gray-100">
                    Connect Wallet
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
