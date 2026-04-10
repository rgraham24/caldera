"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/store";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setConnected } = useAppStore();

  useEffect(() => {
    const handleCallback = async () => {
      const publicKey =
        searchParams.get("public_key") ||
        searchParams.get("publicKey") ||
        (() => {
          try {
            const payload = searchParams.get("payload");
            if (!payload) return null;
            const decoded = JSON.parse(decodeURIComponent(decodeURIComponent(payload)));
            return (
              decoded.publicKeyAdded ||
              decoded.PublicKeyBase58Check ||
              (decoded.users ? Object.keys(decoded.users)[0] : null)
            );
          } catch {
            try {
              const payload = searchParams.get("payload");
              const decoded = JSON.parse(decodeURIComponent(payload!));
              return (
                decoded.publicKeyAdded ||
                decoded.PublicKeyBase58Check ||
                (decoded.users ? Object.keys(decoded.users)[0] : null)
              );
            } catch {
              return null;
            }
          }
        })();

      if (!publicKey) {
        const returnTo = localStorage.getItem("caldera_auth_return") || "/";
        localStorage.removeItem("caldera_auth_return");
        router.push(returnTo);
        return;
      }

      const prevKey = localStorage.getItem("caldera_auth_prev_key");
      if (prevKey !== publicKey) {
        localStorage.removeItem("caldera_welcomed");
        localStorage.setItem("caldera_auth_prev_key", publicKey);
      }

      try {
        // FIX: fetch profile + live price in parallel (no more hardcoded $5.25)
        const [profileRes, priceRes] = await Promise.all([
          fetch("https://api.deso.org/api/v0/get-single-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ PublicKeyBase58Check: publicKey }),
          }).then((r) => r.json()),
          fetch("https://api.deso.org/api/v0/get-exchange-rate").then((r) => r.json()),
        ]);

        const balanceNanos: number = profileRes.Profile?.DESOBalanceNanos || 0;
        const desoPrice = (priceRes?.USDCentsPerDeSoExchangeRate ?? 525) / 100;
        const balanceUSD = (balanceNanos / 1e9) * desoPrice;
        const balanceDeso = balanceNanos / 1e9;
        const username = profileRes.Profile?.Username || publicKey.substring(0, 8);
        const avatarUrl = `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`;

        // FIX: upsert user into Supabase so they land in the users table
        await fetch("/api/auth/deso-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey, username, avatarUrl }),
        }).catch((e) => console.warn("[auth/callback] supabase upsert failed:", e));

        localStorage.removeItem("caldera_welcomed");
        setConnected({ publicKey, username, profilePicUrl: avatarUrl, balanceUSD, balanceDeso });
      } catch (e) {
        console.error("[auth/callback] profile fetch failed:", e);
        localStorage.removeItem("caldera_welcomed");
        setConnected({
          publicKey,
          username: publicKey.substring(0, 8),
          profilePicUrl: "",
          balanceUSD: 0,
          balanceDeso: 0,
        });
      }

      const returnTo = localStorage.getItem("caldera_auth_return") || "/";
      localStorage.removeItem("caldera_auth_return");
      await new Promise((r) => setTimeout(r, 200));
      router.push(returnTo);
    };

    handleCallback();
  }, [searchParams, router, setConnected]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
      <div className="text-center">
        <div className="text-white text-lg font-medium mb-2">Connecting your wallet...</div>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Just a moment</div>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
          <div className="text-center">
            <div className="text-white text-lg font-medium mb-2">Connecting your wallet...</div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Just a moment</div>
          </div>
        </div>
      }
    >
      <AuthC
cat > ~/Dropbox/My\ Mac\ \(MacBook-Pro.lan1\)/Downloads/rankio/caldera/components/layout/TopNav.tsx << 'EOF'
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Search, Menu, X, ChevronDown, TrendingUp, Zap, Clock } from "lucide-react";
import { useState, useRef, useEffect, Suspense } from "react";
import { NotificationBell } from "./NotificationBell";
import { connectDeSoWallet, disconnectDeSoWallet } from "@/lib/deso/auth";
import { useDesoBalance } from "@/hooks/useDesoBalance";

type Tab =
  | { id: string; label: string; href: string; icon?: React.ComponentType<{ className?: string }>; title?: string }
  | { divider: true };

const CENTER_TABS: Tab[] = [
  { id: "trending",      label: "Trending",      href: "/",              icon: TrendingUp, title: "Highest volume markets" },
  { id: "breaking",      label: "Breaking",      href: "/breaking",      icon: Zap,        title: "Resolving within 7 days" },
  { id: "new",           label: "New",           href: "/new",           icon: Clock,      title: "Recently created" },
  { id: "following",     label: "Following",     href: "/following",                       title: "Markets for creators you follow" },
  { divider: true },
  { id: "tokens",        label: "Tokens",        href: "/tokens" },
  { id: "creators",      label: "Creators",      href: "/creators" },
  { id: "sports",        label: "Sports",        href: "/sports" },
  { id: "music",         label: "Music",         href: "/music" },
  { id: "politics",      label: "Politics",      href: "/politics" },
  { id: "tech",          label: "Tech",          href: "/tech" },
  { id: "entertainment", label: "Entertainment", href: "/entertainment" },
];

function CenterTabs() {
  const pathname = usePathname();
  const activeId = (() => {
    if (pathname === "/tokens")        return "tokens";
    if (pathname === "/creators")      return "creators";
    if (pathname === "/sports")        return "sports";
    if (pathname === "/music")         return "music";
    if (pathname === "/politics")      return "politics";
    if (pathname === "/tech")          return "tech";
    if (pathname === "/entertainment") return "entertainment";
    if (pathname === "/breaking")      return "breaking";
    if (pathname === "/new")           return "new";
    if (pathname === "/following")     return "following";
    if (pathname === "/")              return "trending";
    return null;
  })();

  return (
    <div className="flex items-center overflow-x-auto scrollbar-hide">
      {CENTER_TABS.map((tab, i) => {
        if ("divider" in tab) {
          return <div key={`div-${i}`} className="mx-1.5 h-4 w-px shrink-0 self-center" style={{ background: "var(--border-subtle)" }} />;
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

// FIX: "Tokens" was pointing to /creators — corrected to /tokens
const MOBILE_LINKS = [
  { href: "/",            label: "Home" },
  { href: "/markets",     label: "Markets" },
  { href: "/tokens",      label: "Tokens" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/portfolio",   label: "Portfolio" },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isConnected = useAppStore((state) => state.isConnected);
  const desoUsername = useAppStore((state) => state.desoUsername);
  const desoProfilePicUrl = useAppStore((state) => state.desoProfilePicUrl);
  const { desoPublicKey, desoBalanceDeso, desoBalanceUSD, setDisconnected, setDesoBalance, openDepositModal } = useAppStore();

  useDesoBalance(isConnected ? desoPublicKey : null, (nanos, usd) => setDesoBalance(nanos, usd), false);

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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
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

  // FIX: search Enter key routes to /markets?q=...
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && e.currentTarget.value.trim()) {
      router.push(`/markets?q=${encodeURIComponent(e.currentTarget.value.trim())}`);
    }
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
            <Link href="/" className="shrink-0">
              <span className="font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]">Caldera</span>
            </Link>

            <div className="relative hidden flex-1 md:block max-w-xl">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search markets, creators, tokens..."
                className="w-full rounded-lg border py-1.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none transition-all"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                onKeyDown={handleSearchKeyDown}
              />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("show-hiw-modal"))}
                className="hidden md:flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm0 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM7.25 7a.75.75 0 0 1 .75-.75h.25a.75.75 0 0 1 .75.75v3.25h.25a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5h.25V7.75H8A.75.75 0 0 1 7.25 7z" />
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
                    <div className="absolute right-0 top-full mt-1 w-44 rounded-xl py-1 shadow-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
                      <button onClick={() => { setDropdownOpen(false); openDepositModal(); }} className="block w-full px-4 py-2 text-left text-sm font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)]">Add Funds</button>
                      <div className="my-1 mx-3 h-px" style={{ background: "var(--border-subtle)" }} />
                      <Link href="/portfolio" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Portfolio</Link>
                      <Link href="/leaderboard" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Leaderboard</Link>
                      <div className="my-1 mx-3 h-px" style={{ background: "var(--border-subtle)" }} />
                      <button onClick={handleDisconnect} className="block w-full px-4 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Disconnect</button>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => connectDeSoWallet()} className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-gray-100">
                  Connect
                </button>
              )}

              <Button variant="ghost" size="icon" className="text-[var(--text-secondary)] md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          <div className="hidden md:block border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <Suspense fallback={<div className="h-10" />}>
              <CenterTabs />
            </Suspense>
          </div>

          {mobileMenuOpen && (
            <div className="pb-4 md:hidden" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
                {CENTER_TABS.filter((t) => !("divider" in t)).map((tab) => {
                  if ("divider" in tab) return null;
                  return (
                    <Link key={tab.id} href={tab.href} onClick={() => setMobileMenuOpen(false)} className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
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
