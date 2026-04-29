"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminGate } from "../admin-gate";

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetStatus = "healthy" | "tight" | "insolvent" | "unknown";

type SerializedDesoBreakdown = {
  open_position_worst_case_nanos: string;
  pending_position_payouts_nanos: string;
  creator_escrow_nanos: string;
};

type SerializedCoinEntry = {
  nanos: string;
  breakdown: {
    pending_holder_rewards_usd: number;
    pending_holder_rewards_rows: number;
    current_coin_price_usd: number | null;
  };
};

type SerializedSnapshot = {
  asOf: string;
  desoUsdRate: number;
  walletBalances: { deso_nanos: string; creatorCoins: Record<string, string> };
  liability: {
    deso_nanos: string;
    deso_breakdown: SerializedDesoBreakdown;
    creatorCoins: Record<string, SerializedCoinEntry>;
  };
  extractable: { deso_nanos: string; creatorCoins: Record<string, string> };
  status: { deso: AssetStatus; creatorCoins: Record<string, AssetStatus> };
  warnings: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ADMIN_PW_KEY = "caldera_admin_pw";
const REFRESH_INTERVAL_S = 60;
const ZERO = BigInt(0);
const BILLION = BigInt(1_000_000_000);

function nanosToComponents(nanos: string): { sign: string; whole: bigint; frac: string } {
  const n = BigInt(nanos);
  const negative = n < ZERO;
  const abs = negative ? -n : n;
  return {
    sign: negative ? "-" : "",
    whole: abs / BILLION,
    frac: (abs % BILLION).toString().padStart(9, "0"),
  };
}

function formatNanosAsDeso(nanos: string, decimals = 4): string {
  const { sign, whole, frac } = nanosToComponents(nanos);
  return `${sign}${whole}.${frac.slice(0, decimals)} DESO`;
}

function formatCoinNanos(nanos: string, slug: string, decimals = 4): string {
  const { sign, whole, frac } = nanosToComponents(nanos);
  return `${sign}${whole}.${frac.slice(0, decimals)} $${slug}`;
}

function formatUsd(nanos: string, rate: number): string {
  const n = BigInt(nanos);
  const negative = n < ZERO;
  const abs = negative ? -n : n;
  const usd = (Number(abs) / 1e9) * rate;
  const fmt = usd.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return negative ? `-${fmt}` : fmt;
}

function statusClass(s: AssetStatus): string {
  if (s === "healthy") return "text-yes";
  if (s === "tight") return "text-amber-500";
  if (s === "insolvent") return "text-no";
  return "text-text-muted";
}

function statusBadge(s: AssetStatus): string {
  return s.toUpperCase();
}

// ─── Loading / Error views ────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-sm text-text-muted">Loading treasury snapshot…</p>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center">
        <p className="mb-4 text-sm text-no">Failed to load treasury: {message}</p>
        <button
          onClick={onRetry}
          className="rounded-lg border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-primary hover:bg-surface transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ─── Snapshot view ────────────────────────────────────────────────────────────

function SnapshotView({
  snapshot,
  lastFetched,
  onRefresh,
}: {
  snapshot: SerializedSnapshot;
  lastFetched: Date | null;
  onRefresh: () => void;
}) {
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_S);

  useEffect(() => {
    setCountdown(REFRESH_INTERVAL_S);
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [lastFetched]);

  const { desoUsdRate, warnings, walletBalances, liability, extractable, status } = snapshot;
  const bd = liability.deso_breakdown;

  // Union of all coin slugs across wallet + liability + extractable
  const allCoinSlugs = Array.from(
    new Set([
      ...Object.keys(walletBalances.creatorCoins),
      ...Object.keys(liability.creatorCoins),
      ...Object.keys(extractable.creatorCoins),
    ])
  ).sort();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Treasury</h1>
          <p className="mt-1 text-xs text-text-muted">
            as of {new Date(snapshot.asOf).toLocaleString()} ·{" "}
            DESO/USD ${desoUsdRate.toFixed(2)} ·{" "}
            auto-refresh in {countdown}s
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="rounded-lg border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-primary hover:bg-surface transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* ── Warnings ───────────────────────────────────────────────── */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="mb-2 text-xs font-semibold text-amber-400">WARNINGS</p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-300">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── DESO summary card ──────────────────────────────────────── */}
      <div className="rounded-lg border border-border-subtle bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">DESO</h2>
          <span className={`text-sm font-bold ${statusClass(status.deso)}`}>
            {statusBadge(status.deso)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Wallet", nanos: walletBalances.deso_nanos, colored: false },
            { label: "Liability", nanos: liability.deso_nanos, colored: false },
            { label: "Extractable", nanos: extractable.deso_nanos, colored: true },
          ].map(({ label, nanos, colored }) => (
            <div key={label}>
              <p className="text-xs text-text-muted">{label}</p>
              <p className={`mt-1 font-mono text-lg font-bold ${colored ? statusClass(status.deso) : "text-text-primary"}`}>
                {formatNanosAsDeso(nanos)}
              </p>
              <p className="text-xs text-text-muted">{formatUsd(nanos, desoUsdRate)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── DESO breakdown ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-border-subtle bg-surface p-6">
        <h2 className="mb-4 text-base font-semibold text-text-primary">DESO Liability Breakdown</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs text-text-muted">
              <th className="pb-2 text-left font-medium">Source</th>
              <th className="pb-2 text-right font-medium">DESO</th>
              <th className="pb-2 text-right font-medium">USD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {[
              { label: "Open positions worst-case", nanos: bd.open_position_worst_case_nanos },
              { label: "Pending position payouts", nanos: bd.pending_position_payouts_nanos },
              { label: "Creator escrow", nanos: bd.creator_escrow_nanos },
            ].map(({ label, nanos }) => (
              <tr key={label}>
                <td className="py-2 text-text-primary">{label}</td>
                <td className="py-2 text-right font-mono text-text-primary">{formatNanosAsDeso(nanos, 6)}</td>
                <td className="py-2 text-right text-text-muted">{formatUsd(nanos, desoUsdRate)}</td>
              </tr>
            ))}
            <tr className="border-t border-border-subtle font-semibold">
              <td className="pt-3 text-text-primary">TOTAL</td>
              <td className="pt-3 text-right font-mono text-text-primary">{formatNanosAsDeso(liability.deso_nanos, 6)}</td>
              <td className="pt-3 text-right text-text-muted">{formatUsd(liability.deso_nanos, desoUsdRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Creator coins table ────────────────────────────────────── */}
      {allCoinSlugs.length > 0 && (
        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <h2 className="mb-4 text-base font-semibold text-text-primary">Creator Coins</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs text-text-muted">
                  <th className="pb-2 text-left font-medium">Asset</th>
                  <th className="pb-2 text-right font-medium">Wallet</th>
                  <th className="pb-2 text-right font-medium">Liability</th>
                  <th className="pb-2 text-right font-medium">Extractable</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {allCoinSlugs.map((slug) => {
                  const walletNanos = walletBalances.creatorCoins[slug] ?? null;
                  const liabilityNanos = liability.creatorCoins[slug]?.nanos ?? null;
                  const extractableNanos = extractable.creatorCoins[slug] ?? null;
                  const coinStatus = status.creatorCoins[slug] ?? null;
                  return (
                    <tr key={slug}>
                      <td className="py-2 font-medium text-text-primary">${slug}</td>
                      <td className="py-2 text-right font-mono text-text-primary">
                        {walletNanos ? formatCoinNanos(walletNanos, slug) : "—"}
                      </td>
                      <td className="py-2 text-right font-mono text-text-primary">
                        {liabilityNanos ? formatCoinNanos(liabilityNanos, slug) : "—"}
                      </td>
                      <td className={`py-2 text-right font-mono ${coinStatus ? statusClass(coinStatus) : "text-text-muted"}`}>
                        {extractableNanos ? formatCoinNanos(extractableNanos, slug) : "—"}
                      </td>
                      <td className={`py-2 text-right text-xs font-bold ${coinStatus ? statusClass(coinStatus) : "text-text-muted"}`}>
                        {coinStatus ? statusBadge(coinStatus) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard (fetch logic) ──────────────────────────────────────────────────

function TreasuryDashboard() {
  const [snapshot, setSnapshot] = useState<SerializedSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const password =
        typeof window !== "undefined"
          ? (localStorage.getItem(ADMIN_PW_KEY) ?? "caldera-admin-2026")
          : "caldera-admin-2026";
      const res = await fetch("/api/admin/treasury", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.status === 401) {
        if (typeof window !== "undefined") localStorage.removeItem(ADMIN_PW_KEY);
        throw new Error("Unauthorized — password rejected. Reload to re-enter.");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? json.message ?? "unknown error");
      setSnapshot(json.snapshot as SerializedSnapshot);
      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, REFRESH_INTERVAL_S * 1000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  if (loading && !snapshot) return <LoadingView />;
  if (error && !snapshot) return <ErrorView message={error} onRetry={fetchSnapshot} />;
  if (!snapshot) return null;
  return <SnapshotView snapshot={snapshot} lastFetched={lastFetched} onRefresh={fetchSnapshot} />;
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function TreasuryPage() {
  return (
    <AdminGate>
      <TreasuryDashboard />
    </AdminGate>
  );
}
