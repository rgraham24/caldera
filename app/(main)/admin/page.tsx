import { createClient } from "@/lib/supabase/server";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";
import type { Market } from "@/types";
import { AdminActions } from "./admin-actions";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: markets } = await supabase.from("markets").select("*");
  const { data: fees } = await supabase
    .from("fee_earnings")
    .select("*")
    .eq("recipient_type", "platform");

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
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-primary">
        Admin Dashboard
      </h1>

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
  );
}
