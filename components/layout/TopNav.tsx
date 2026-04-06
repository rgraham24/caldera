"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Search, Menu, X, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { NotificationBell } from "./NotificationBell";
import { connectDeSoWallet, disconnectDeSoWallet } from "@/lib/deso/auth";

const NAV_ITEMS = [
  { href: "/", label: "Explore" },
  { href: "/markets", label: "Markets" },
  { href: "/creators", label: "Tokens" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/how-it-works", label: "How it works" },
];

const AUTH_NAV_ITEMS = [
  { href: "/portfolio", label: "Portfolio" },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isAuthenticated,
    desoUsername,
    desoProfilePicUrl,
    desoBalanceDeso,
    setConnected,
    setDisconnected,
  } = useAppStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const userData = await connectDeSoWallet();
      if (!userData) return;
      setConnected(userData);
    } catch (err) {
      console.error("DeSo connect failed:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDropdownOpen(false);
    await disconnectDeSoWallet();
    setDisconnected();
    router.push("/");
  };

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: "rgba(10,10,15,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <span className="font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                Caldera
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium transition-colors border-b-2",
                    pathname === item.href
                      ? "border-[var(--accent)] text-[var(--text-primary)]"
                      : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {isAuthenticated && (
                <>
                  {AUTH_NAV_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors border-b-2",
                        pathname === item.href
                          ? "border-[var(--accent)] text-[var(--text-primary)]"
                          : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search... (/)"
                className="w-48 rounded-lg border py-1.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all focus:outline-none focus:w-64"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
              />
            </div>

            <NotificationBell />

            {isAuthenticated ? (
              /* Connected state — avatar + username + balance + dropdown */
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  {desoProfilePicUrl && !avatarError ? (
                    <img
                      src={desoProfilePicUrl}
                      alt={desoUsername ?? ""}
                      className="h-7 w-7 rounded-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                      {(desoUsername ?? "?")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="hidden text-sm font-medium text-[var(--text-primary)] sm:inline">
                    @{desoUsername}
                  </span>
                  <span className="hidden font-mono text-xs text-[var(--text-secondary)] sm:inline">
                    {desoBalanceDeso.toFixed(2)} DESO
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                </button>

                {dropdownOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 w-44 rounded-xl py-1 shadow-xl"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <Link
                      href="/portfolio"
                      onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    >
                      Portfolio
                    </Link>
                    <Link
                      href="/leaderboard"
                      onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    >
                      Leaderboard
                    </Link>
                    <div
                      className="my-1 mx-3 h-px"
                      style={{ background: "var(--border-subtle)" }}
                    />
                    <button
                      onClick={handleDisconnect}
                      className="block w-full px-4 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-gray-100 disabled:opacity-70"
              >
                {isConnecting && (
                  <svg
                    className="h-3.5 w-3.5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                )}
                {isConnecting ? "Connecting..." : "Connect"}
              </button>
            )}

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="text-[var(--text-secondary)] md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="pb-4 md:hidden" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <div className="flex flex-col gap-1 pt-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] flex items-center",
                    pathname === item.href
                      ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {isAuthenticated ? (
                <>
                  {AUTH_NAV_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] flex items-center",
                        pathname === item.href
                          ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <div className="mx-3 my-1 h-px" style={{ background: "var(--border-subtle)" }} />
                  <div className="flex items-center gap-3 px-3 py-2">
                    {desoProfilePicUrl && !avatarError ? (
                      <img
                        src={desoProfilePicUrl}
                        alt={desoUsername ?? ""}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                        {(desoUsername ?? "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">@{desoUsername}</p>
                      <p className="font-mono text-xs text-[var(--text-secondary)]">
                        {desoBalanceDeso.toFixed(2)} DESO
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleDisconnect();
                    }}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] min-h-[44px] flex items-center text-left"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleConnect();
                  }}
                  disabled={isConnecting}
                  className="mx-3 mt-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-gray-100 disabled:opacity-70"
                >
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
