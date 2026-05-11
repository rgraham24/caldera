"use client";

/**
 * Fixed-bottom 4-tab navigation for mobile only. Hidden on md+.
 * Active tab is determined by the current pathname; child tab is
 * highlighted in caldera purple, others read as text-text-muted.
 *
 * Sits above the iOS home-indicator via env(safe-area-inset-bottom)
 * padding. Total height is 64px + safe-area, so the main content
 * wrapper above must reserve that much pb on mobile.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Search, LayoutGrid, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  Icon: typeof House;
  /** A pathname starts-with check; the longest match wins. */
  match: (path: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Home",
    Icon: House,
    match: (p) => p === "/",
  },
  {
    href: "/search",
    label: "Search",
    Icon: Search,
    match: (p) => p.startsWith("/search"),
  },
  {
    href: "/markets",
    label: "Markets",
    Icon: LayoutGrid,
    match: (p) => p.startsWith("/markets"),
  },
  {
    href: "/more",
    label: "More",
    Icon: Menu,
    match: (p) => p.startsWith("/more"),
  },
];

export function MobileTabBar() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-16 items-stretch">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const { Icon } = tab;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-1 transition-colors",
                  active ? "text-caldera" : "text-text-muted hover:text-text-primary"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  size={22}
                  strokeWidth={1.5}
                  className={active ? "fill-caldera/15" : ""}
                />
                <span
                  className={cn(
                    "text-[10px] leading-none",
                    active ? "font-semibold" : "font-medium"
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
