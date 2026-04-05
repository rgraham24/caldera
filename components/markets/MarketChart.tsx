"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState, useMemo } from "react";

type MarketChartProps = {
  yesPrice: number;
};

// Generate synthetic historical data from current price
function generateChartData(currentPrice: number, days: number) {
  const data = [];
  const now = Date.now();
  const msPerDay = 86400000;

  // Walk backward from current price with random variance
  let price = currentPrice;
  const points = [];

  for (let i = days; i >= 0; i--) {
    points.push({ price, time: now - i * msPerDay });
    // Random walk — bias toward current price
    const drift = (currentPrice - price) * 0.05;
    const noise = (Math.random() - 0.5) * 0.06;
    price = Math.max(0.01, Math.min(0.99, price + drift + noise));
  }

  // Ensure the last point is the actual current price
  points[points.length - 1].price = currentPrice;

  for (const p of points) {
    data.push({
      date: new Date(p.time).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      price: Math.round(p.price * 100),
    });
  }

  return data;
}

const PERIODS = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "All", days: 90 },
];

export function MarketChart({ yesPrice }: MarketChartProps) {
  const [period, setPeriod] = useState(1); // index into PERIODS

  const data = useMemo(
    () => generateChartData(yesPrice, PERIODS[period].days),
    [yesPrice, period]
  );

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {PERIODS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => setPeriod(i)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              period === i
                ? "bg-surface-2 text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#888888" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#888888" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}¢`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111111",
                border: "1px solid #222222",
                borderRadius: "8px",
                fontSize: 12,
              }}
              labelStyle={{ color: "#888888" }}
              formatter={(value) => [`${value}¢`, "YES"]}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#22c55e" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
