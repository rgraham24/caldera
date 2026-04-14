import { createClient } from "@/lib/supabase/server";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";
import type { Market } from "@/types";
import { AdminActions } from "./admin-actions";
import { AdminGate } from "./admin-gate";

export default async function AdminPage() {
  const supabase = await createClient();

  const [
    { data: markets },
    { data: fees },
    { count: overdueCount },
  ] = await Promise.all([
    supabase.from("markets").select("*"),
    supabase.from("fee_earnings").select("*").eq("recipient_type", "platform"),
    supabase
      .from("markets")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .lt("resolve_at", new Date().toISOString())
      .neq("category", "Crypto")
      .is("resolution_outcome", null),
  ]);

  const allMarkets = (markets ?? []) as Market[];

  const totalVolume = allMarkets.reduce((sum, m) => sum + (m.total_volume || 0), 0);
  const totalFees = (fees ?? []).reduce((sum, f: { amount: number }) => sum + (f.amount || 0), 0);
  const openMarkets = allMarkets.filter((m) => m.status === "open").length;
  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const resolvingThisWeek = allMarkets.filter((m) => {
    if (m.status !== "open" || !m.resolve_at) return false;
    return new Date(m.resolve_at) <= weekFromNow;
  }).length;

  const stats = [
    { label: "Total Volume", value: formatCompactCurrency(totalVolume) },
    { label: "Fees Collected", value: formatCurrency(totalFees) },
    { label: "Open Markets", value: String(openMarkets) },
    { label: "Resolving This Week", value: String(resolvingThisWeek) },
  ];

  return (
    <AdminGate>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <h1 className="font-display text-2xl font-bold text-text-primary">
            Admin Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <a
              href="/admin/resolve"
              className="relative inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-sm font-bold text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              ⚖️ Resolve Markets
              {(overdueCount ?? 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {(overdueCount ?? 0) > 99 ? "99+" : overdueCount}
                </span>
              )}
            </a>
            <a
              href="/admin/create-market"
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-500 transition-colors"
            >
              ⚡ Quick Create Market
            </a>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border-subtle bg-surface p-5"
            >
              <p className="text-xs text-text-muted">{stat.label}</p>
              <p className="mt-2 font-mono text-2xl font-bold text-text-primary">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <AdminActions />
      </div>
    </AdminGate>
  );
}
