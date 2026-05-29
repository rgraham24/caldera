"use client";

/**
 * Fixed-bottom 4-tab navigation for mobile only. Hidden on md+.
 * Active tab is determined by the current pathname; child tab is
 * highlighted in caldera purple, others read as text-text-muted.
 *
 * Sits above the iOS home-indicator via env(safe-area-inset-bottom)
 * padding. Total height is 64px + safe-area, so the main content
 * wrapper above must reserve that much pb on mobile.
 *
 * z-[70] keeps the bar ABOVE the SearchOverlay (z-[60]) so it stays
 * visible and tappable while search is open (Polymarket parity). The
 * link tabs fire CLOSE_SEARCH_EVENT on tap so we close the overlay
 * before navigating, never leaving search mounted on top of the
 * destination page.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Search, LayoutGrid, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OPEN_SEARCH_EVENT,
  CLOSE_SEARCH_EVENT,
} from "@/components/search/SearchOverlayRoot";

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

  // The Search tab opens an overlay, not a route, so pathname can't tell
  // us when it's active. Track the overlay's open state off the same
  // events SearchOverlayRoot broadcasts — this stays correct no matter
  // HOW it closes (X button, tapping a result, or a nav tab).
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setSearchOpen(true);
    const onClose = () => setSearchOpen(false);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener(CLOSE_SEARCH_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener(CLOSE_SEARCH_EVENT, onClose);
    };
  }, []);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border-subtle/60 bg-surface/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-16 items-stretch">
        {TABS.map((tab) => {
          // Search (action tab) is active iff its overlay is open. Route
          // tabs are active only when their path matches AND the overlay
          // is closed — so search and a route tab never light at once.
          const active =
            tab.kind === "action" ? searchOpen : tab.match(pathname) && !searchOpen;
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
                  // Close the search overlay (if open) before navigating so
                  // it never sits mounted on top of the destination page.
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent(CLOSE_SEARCH_EVENT))
                  }
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
