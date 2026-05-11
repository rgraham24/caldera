"use client";

import Link from "next/link";
import {
  Heart,
  Wallet,
  Trophy,
  HelpCircle,
  Info,
  FileText,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  Icon: LucideIcon;
  label: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
};

function NavLink({ item }: { item: NavItem }) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
        <item.Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="flex-1 text-sm font-medium text-text-primary">{item.label}</span>
      <ChevronRight size={18} strokeWidth={1.75} className="text-text-faint" />
    </>
  );

  const className = cn(
    "flex h-14 w-full items-center gap-3 border-b border-border-subtle px-4 transition-colors",
    "hover:bg-surface-2 active:bg-surface-2"
  );

  if (item.onClick) {
    return (
      <button onClick={item.onClick} className={className} type="button">
        {content}
      </button>
    );
  }
  if (item.external && item.href) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }
  if (item.href) {
    return (
      <Link href={item.href} className={className}>
        {content}
      </Link>
    );
  }
  return null;
}

// Inline X glyph — lucide-react ships Twitter with the old bird and
// nothing matching the current X mark, so we draw it directly.
function XGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function Section({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <section className="mb-8">
      <h2 className="px-4 mb-3 text-[11px] uppercase tracking-widest font-semibold text-text-muted">
        {title}
      </h2>
      <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden">
        {items.map((item, i) => (
          <div key={i} className={i === items.length - 1 ? "[&>*]:border-b-0" : ""}>
            <NavLink item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function MorePageClient() {
  const openHowItWorks = () => {
    window.dispatchEvent(new CustomEvent("show-hiw-modal"));
  };

  const forYou: NavItem[] = [
    { Icon: Heart, label: "Following", href: "/following" },
    { Icon: Wallet, label: "Portfolio", href: "/portfolio" },
    { Icon: Trophy, label: "Leaderboard", href: "/leaderboard" },
  ];

  const learn: NavItem[] = [
    { Icon: HelpCircle, label: "How it works", onClick: openHowItWorks },
    { Icon: Info, label: "About", href: "/about" },
  ];

  // Community uses the custom X glyph; cast through LucideIcon so the
  // shared NavItem type stays uniform.
  const community: NavItem[] = [
    {
      Icon: XGlyph as unknown as LucideIcon,
      label: "X / Twitter",
      href: "https://x.com/CalderaMarket",
      external: true,
    },
  ];

  const legal: NavItem[] = [{ Icon: FileText, label: "Terms of Service", href: "/terms" }];

  return (
    <main className="mx-auto max-w-md px-4 py-6 md:hidden">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-primary">More</h1>
      <Section title="For You" items={forYou} />
      <Section title="Learn" items={learn} />
      <Section title="Community" items={community} />
      <Section title="Legal" items={legal} />
    </main>
  );
}
