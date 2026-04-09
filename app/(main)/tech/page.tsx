import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Market } from "@/types";

export default async function TechPage() {
  const supabase = await createClient();
  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "open")
    .ilike("category", "tech")
    .order("total_volume", { ascending: false })
    .limit(50);

  const items = (markets ?? []) as Market[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">💻 Tech &amp; Crypto Markets</h1>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          AI, blockchain, and tech industry predictions
        </p>
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">No tech markets open right now.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((market) => {
            const yes = Math.round((market.yes_price ?? 0.5) * 100);
            return (
              <Link
                key={market.id}
                href={`/markets/${market.slug}`}
                className="flex flex-col rounded-xl p-4 transition-colors"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(249,115,22,0.4)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
              >
                <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-orange-400">
                  {market.category}
                </div>
                <p className="mb-auto line-clamp-2 text-sm font-semibold leading-snug text-[var(--text-primary)]">
                  {market.title}
                </p>
                {market.creator_slug && (
                  <span className="mt-1 text-xs text-orange-400">${market.creator_slug}</span>
                )}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className="font-mono text-lg font-bold tabular-nums"
                      style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}
                    >
                      {yes}%
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">YES</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${yes}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
