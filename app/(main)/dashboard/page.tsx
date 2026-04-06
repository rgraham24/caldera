"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatCurrency, formatCompactCurrency } from "@/lib/utils";
import { useAppStore } from "@/store";

type DashboardData = {
  creator: { name: string; total_creator_earnings: number; total_holder_earnings: number };
  markets: Array<{
    id: string;
    title: string;
    slug: string;
    yes_price: number;
    total_volume: number;
    status: string;
  }>;
  weeklyEarnings: number;
  monthlyEarnings: number;
};

export default function DashboardPage() {
  const { isAuthenticated } = useAppStore();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    // In production: fetch from /api/dashboard
    // For now: mock data
    setData({
      creator: { name: "Creator", total_creator_earnings: 4847.20, total_holder_earnings: 3200 },
      markets: [],
      weeklyEarnings: 127.40,
      monthlyEarnings: 892.10,
    });
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-text-primary">Creator Dashboard</h1>
        <p className="mt-2 text-text-muted">Connect your account to view your creator dashboard.</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-caldera px-6 py-2.5 text-sm font-semibold text-background">
          Connect →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-2 font-display text-3xl font-bold tracking-tight text-text-primary">
        Creator Dashboard
      </h1>
      <p className="mb-8 text-text-muted">Your earnings from prediction markets on Caldera.</p>

      {/* Earnings summary */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border-subtle/30 bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-text-muted">This Week</p>
          <p className="mt-1 font-mono text-2xl font-bold text-yes tracking-normal">
            {data ? formatCurrency(data.weeklyEarnings) : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-border-subtle/30 bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-text-muted">This Month</p>
          <p className="mt-1 font-mono text-2xl font-bold text-yes tracking-normal">
            {data ? formatCurrency(data.monthlyEarnings) : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-border-subtle/30 bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-text-muted">All Time</p>
          <p className="mt-1 font-mono text-2xl font-bold text-text-primary tracking-normal">
            {data ? formatCurrency(data.creator.total_creator_earnings) : "—"}
          </p>
        </div>
      </div>

      {/* Active markets */}
      <div className="mb-8">
        <h2 className="section-header mb-4">Your Markets</h2>
        {data?.markets && data.markets.length > 0 ? (
          <div className="rounded-2xl border border-border-subtle/30 bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted">
                  <th className="px-4 py-3 text-left font-medium">Market</th>
                  <th className="px-4 py-3 text-right font-medium">Probability</th>
                  <th className="px-4 py-3 text-right font-medium">Volume</th>
                  <th className="px-4 py-3 text-right font-medium">Your Earnings</th>
                </tr>
              </thead>
              <tbody>
                {data.markets.map((m) => (
                  <tr key={m.id} className="border-b border-border-subtle/20 hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <Link href={`/markets/${m.slug}`} className="text-text-primary hover:text-caldera">
                        {m.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{Math.round(m.yes_price * 100)}%</td>
                    <td className="px-4 py-3 text-right font-mono text-text-muted">{formatCompactCurrency(m.total_volume)}</td>
                    <td className="px-4 py-3 text-right font-mono text-yes">{formatCurrency(m.total_volume * 0.0075)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No active markets yet. Markets about you will appear here.</p>
        )}
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-border-subtle/30 bg-surface p-5">
        <p className="text-sm text-text-muted">
          As a verified creator, you earn <span className="text-caldera font-medium">0.75%</span> of every trade on prediction markets about you.
          Earnings are calculated in real-time and displayed here.
        </p>
      </div>
    </div>
  );
}
