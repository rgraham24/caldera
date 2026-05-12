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
import { OPEN_SEARCH_EVENT } from "@/components/search/SearchOverlayRoot";

type LucideRef = typeof House;

type LinkTab = {
  kind: "link";
  href: string;
  label: string;
  Icon: LucideRef;
  match: (path: string) => boolean;
};

type ActionTab = {
  kind: "action";
  label: string;
  Icon: LucideRef;
  onClick: () => void;
  // Action tabs never own a route, so they never match a pathname.
  match: (path: string) => boolean;
};

type Tab = LinkTab | ActionTab;

const TABS: Tab[] = [
  {
    kind: "link",
    href: "/",
    label: "Home",
    Icon: House,
    match: (p) => p === "/",
  },
  {
    // Search no longer routes to /search — opens the global SearchOverlay
    // directly via a custom event. SearchOverlayRoot in the (main) layout
    // listens and toggles open. Active state piggybacks on /search so
    // deep-links into /search still highlight the tab.
    kind: "action",
    label: "Search",
    Icon: Search,
    onClick: () => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT)),
    match: (p) => p.startsWith("/search"),
  },
  {
    kind: "link",
    href: "/markets",
    label: "Markets",
    Icon: LayoutGrid,
    match: (p) => p.startsWith("/markets"),
  },
  {
    kind: "link",
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
          const innerClassName = cn(
            "flex h-full w-full flex-col items-center justify-center gap-1 transition-colors",
            active ? "text-caldera" : "text-text-muted hover:text-text-primary"
          );
          const inner = (
            <>
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
            </>
          );

          return (
            <li key={tab.label} className="flex-1">
              {tab.kind === "link" ? (
                <Link
                  href={tab.href}
                  className={innerClassName}
                  aria-current={active ? "page" : undefined}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={tab.onClick}
                  className={innerClassName}
                  aria-label={tab.label}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
