"use client";

/**
 * Cumulative cash-invested chart for /portfolio.
 *
 * Honest V1: plots running total of (buys minus sells) over the last
 * 30 days — NOT mark-to-market. Caldera doesnt yet snapshot per-market
 * prices densely enough to reconstruct historical portfolio value.
 * The shape still tells the user when they were active and how their
 * net position grew. Robinhood-style minimal chrome (no Y-axis chrome,
 * tooltip on hover, area fill).
 */

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

type Point = { date: string; value: number };
type CurvePayload = {
  points: Point[];
  tradeCount: number;
  currentInvested: number;
};

type Props = {
  desoPublicKey: string;
};

export function EquityCurve({ desoPublicKey }: Props) {
  const [data, setData] = useState<CurvePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/portfolio/curve?desoPublicKey=${encodeURIComponent(desoPublicKey)}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.data) setData(json.data as CurvePayload);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [desoPublicKey]);

  if (loading) {
    return (
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-5">
        <div className="h-[180px] animate-pulse rounded-lg bg-surface-2" />
      </div>
    );
  }

  if (!data || data.points.length === 0) {
    return (
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-5">
        <p className="text-sm text-text-muted">
          Your trading history will appear here once you place your first trade.
        </p>
      </div>
    );
  }

  const isPositive = data.currentInvested >= 0;
  const stroke = isPositive ? "#22c55e" : "#ef4444";
  const fill = isPositive ? "#22c55e" : "#ef4444";

  // Manual ticks: one per unique day. Multiple trades same day were
  // landing as overlapping labels in the auto-tick layout. We pick
  // the FIRST data point that falls on each unique YYYY-MM-DD, then
  // downsample to ~7 evenly-spaced labels if the window is wider.
  const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  const seenDays = new Set<string>();
  const firstPerDay: string[] = [];
  for (const p of data.points) {
    const k = dayKey(p.date);
    if (!seenDays.has(k)) {
      seenDays.add(k);
      firstPerDay.push(p.date);
    }
  }
  const MAX_LABELS = 7;
  let ticks: string[];
  if (firstPerDay.length <= MAX_LABELS) {
    ticks = firstPerDay;
  } else {
    const step = (firstPerDay.length - 1) / (MAX_LABELS - 1);
    ticks = Array.from({ length: MAX_LABELS }, (_, i) =>
      firstPerDay[Math.round(i * step)]
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-5">
      <div className="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-muted">
            Cumulative Invested · 30d
          </p>
          <p className="mt-1 font-mono text-3xl font-bold text-text-primary">
            {formatCurrency(data.currentInvested)}
          </p>
        </div>
        <p className="text-xs text-text-muted">
          across {data.tradeCount} trade{data.tradeCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fill} stopOpacity={0.4} />
                <stop offset="100%" stopColor={fill} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              ticks={ticks}
              tick={{ fill: "#888", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(iso: string) =>
                new Date(iso).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              }
              interval={0}
            />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "#1a1a1a",
                border: "1px solid #2e2e2e",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#888" }}
              itemStyle={{ color: "#f0f0f0" }}
              labelFormatter={(label) =>
                new Date(String(label)).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              }
              formatter={(value) => [formatCurrency(Number(value)), "Invested"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={stroke}
              strokeWidth={2}
              fill="url(#equity-fill)"
              dot={false}
              activeDot={{ r: 4, fill: stroke, stroke: "#000", strokeWidth: 1 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
