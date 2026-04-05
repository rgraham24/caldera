"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Search, Menu, X } from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Explore" },
  { href: "/markets", label: "Markets" },
  { href: "/creators", label: "Creators" },
  { href: "/leaderboard", label: "Leaderboard" },
];

const AUTH_NAV_ITEMS = [
  { href: "/portfolio", label: "Portfolio" },
];

export function TopNav() {
  const pathname = usePathname();
  const { user, isAuthenticated, desoBalanceNanos } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border-visible/40 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <div className="flex h-[4.25rem] items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="wordmark-glow font-display text-2xl font-bold tracking-tight text-caldera">
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
                    "rounded-lg px-3 py-2 text-sm font-medium uppercase tracking-wide transition-colors",
                    pathname === item.href
                      ? "bg-surface-2 text-text-primary"
                      : "text-text-muted hover:bg-surface hover:text-text-primary"
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
                        "rounded-lg px-3 py-2 text-sm font-medium uppercase tracking-wide transition-colors",
                        pathname === item.href
                          ? "bg-surface-2 text-text-primary"
                          : "text-text-muted hover:bg-surface hover:text-text-primary"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                  {user?.username && (
                    <Link
                      href={`/profile/${user.username}`}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium uppercase tracking-wide transition-colors",
                        pathname.startsWith("/profile/")
                          ? "bg-surface-2 text-text-primary"
                          : "text-text-muted hover:bg-surface hover:text-text-primary"
                      )}
                    >
                      Profile
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-text-muted hover:text-text-primary"
            >
              <Search className="h-4 w-4" />
            </Button>

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                {desoBalanceNanos > 0 && (
                  <span className="hidden font-mono text-xs text-text-muted sm:inline">
                    {(desoBalanceNanos / 1e9).toFixed(2)} DESO
                  </span>
                )}
                <Link href={`/profile/${user?.username}`}>
                  <Button variant="ghost" size="sm" className="text-text-muted">
                    {user?.username}
                  </Button>
                </Link>
              </div>
            ) : (
              <Link href="/login">
                <Button
                  size="sm"
                  className="bg-caldera text-white hover:bg-caldera/90"
                >
                  Connect
                </Button>
              </Link>
            )}

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="text-text-muted md:hidden"
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
          <div className="border-t border-border-subtle pb-4 md:hidden">
            <div className="flex flex-col gap-1 pt-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-surface-2 text-text-primary"
                      : "text-text-muted hover:text-text-primary"
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
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        pathname === item.href
                          ? "bg-surface-2 text-text-primary"
                          : "text-text-muted hover:text-text-primary"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                  {user?.username && (
                    <Link
                      href={`/profile/${user.username}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        pathname.startsWith("/profile/")
                          ? "bg-surface-2 text-text-primary"
                          : "text-text-muted hover:text-text-primary"
                      )}
                    >
                      Profile
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
