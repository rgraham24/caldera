/**
 * /search — creator-led browse hub. Pure browse — no input.
 *
 * Text search lives in a global overlay that the bottom tab bars
 * Search tab opens directly (no navigation to /search just to
 * type). This page is the destination for users who tap a BROWSE
 * pill or TOPIC tile from inside the overlay, or who deep-link
 * here from elsewhere. The overlay is mounted at the layout level
 * in app/(main)/layout.tsx via <SearchOverlayRoot />.
 */

import Link from "next/link";
import { Sparkles, TrendingUp, Flame, Droplet, Clock } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { formatCompactCurrency } from "@/lib/utils";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import type { Creator } from "@/types";

export const revalidate = 60;

type BrowsePill = {
  label: string;
  href: string;
  Icon: typeof Sparkles;
};

const BROWSE: BrowsePill[] = [
  { label: "New", href: "/new", Icon: Sparkles },
  { label: "Trending", href: "/?filter=trending", Icon: TrendingUp },
  { label: "Hot", href: "/?filter=hot", Icon: Flame },
  { label: "Liquid", href: "/markets?sort=volume", Icon: Droplet },
  { label: "Ending Soon", href: "/markets?sort=ending", Icon: Clock },
];

type Topic = { emoji: string; label: string; href: string };

const TOPICS: Topic[] = [
  { emoji: "🎵", label: "Music", href: "/markets?category=music" },
  { emoji: "⚽", label: "Sports", href: "/markets?category=sports" },
  { emoji: "🎬", label: "Entertainment", href: "/markets?category=entertainment" },
  { emoji: "🏛", label: "Politics", href: "/markets?category=politics" },
  { emoji: "💻", label: "Tech", href: "/markets?category=tech" },
  { emoji: "📺", label: "Commentary", href: "/markets?category=commentary" },
  { emoji: "🏢", label: "Companies", href: "/markets?category=companies" },
  { emoji: "🔥", label: "Viral", href: "/markets?category=viral" },
];

async function getTopCreators(): Promise<Creator[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("creators")
    .select(
      "id, slug, name, image_url, deso_username, deso_public_key, creator_coin_symbol, creator_coin_price, creator_coin_market_cap, creator_coin_holders, is_bitclout_original, verification_status, claim_status, token_status, deso_is_reserved"
    )
    .not("deso_public_key", "is", null)
    .neq("token_status", "archived")
    .neq("token_status", "speculation_pool")
    .gt("creator_coin_market_cap", 0)
    .order("creator_coin_market_cap", { ascending: false })
    .limit(6);
  return (data ?? []) as Creator[];
}

export default async function SearchPage() {
  const topCreators = await getTopCreators();

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-12 md:px-6 lg:px-8">
      {/* Browse pills */}
      <section className="mb-8">
        <h2 className="section-header mb-3 text-xs uppercase tracking-widest text-text-muted">
          Browse
        </h2>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
          {BROWSE.map((p) => {
            const { Icon } = p;
            return (
              <Link
                key={p.label}
                href={p.href}
                className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-all duration-200 ease-out hover:border-caldera/20 hover:bg-caldera/5"
              >
                <Icon size={16} strokeWidth={1.75} className="text-caldera" />
                {p.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Top creators */}
      {topCreators.length > 0 && (
        <section className="mb-8">
          <h2 className="section-header mb-3 text-xs uppercase tracking-widest text-text-muted">
            Top Creators
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {topCreators.map((creator) => (
              <Link
                key={creator.id}
                href={`/creators/${creator.slug}`}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface p-3 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-caldera/20 hover:shadow-lg hover:shadow-caldera/10"
              >
                <CreatorAvatar creator={creator} size="md" className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {creator.name}
                  </p>
                  <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wider text-text-muted">
                    {formatCompactCurrency(Number(creator.creator_coin_market_cap ?? 0))} MKT CAP
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Topics */}
      <section>
        <h2 className="section-header mb-3 text-xs uppercase tracking-widest text-text-muted">
          Topics
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {TOPICS.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-caldera/20 hover:shadow-lg hover:shadow-caldera/10"
            >
              <span className="text-2xl leading-none">{t.emoji}</span>
              <span className="text-sm font-semibold text-text-primary">{t.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
