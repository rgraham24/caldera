"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";

const ADMIN_PW_KEY = "caldera_admin_pw";
const CORRECT_PW = "caldera-admin-2026";

type OverdueMarket = {
  id: string;
  title: string;
  category: string;
  creator_slug: string | null;
  yes_price: number;
  no_price: number;
  total_volume: number;
  resolve_at: string;
  description: string | null;
  open_positions_count: number;
  days_overdue: number;
};

type ResolvedMarket = {
  id: string;
  title: string;
  category: string;
  resolution_outcome: string;
  resolved_at: string;
  total_volume: number;
};

type ResolutionResult = {
  positionsSettled: number;
  winnersCount: number;
  totalPaidOut: number;
};

export default function AdminResolvePage() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  const [markets, setMarkets] = useState<OverdueMarket[]>([]);
  const [recentlyResolved, setRecentlyResolved] = useState<ResolvedMarket[]>([]);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<OverdueMarket | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [pendingOutcome, setPendingOutcome] = useState<"yes" | "no" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resolveResult, setResolveResult] = useState<ResolutionResult | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(ADMIN_PW_KEY);
      if (stored === CORRECT_PW) setAuthed(true);
    }
  }, []);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/markets-to-resolve?adminPassword=${CORRECT_PW}`
      );
      const d = await res.json();
      setMarkets(d.data ?? []);
    } catch {
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentlyResolved = useCallback(async () => {
    // Use the main markets API filtered to resolved
    try {
      const res = await fetch("/api/markets?status=resolved&limit=10");
      const d = await res.json();
      setRecentlyResolved(
        (d.data ?? []).filter(
          (m: ResolvedMarket) => m.category !== "Crypto"
        ).slice(0, 10)
      );
    } catch {
      setRecentlyResolved([]);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      fetchMarkets();
      fetchRecentlyResolved();
    }
  }, [authed, fetchMarkets, fetchRecentlyResolved]);

  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwInput === CORRECT_PW) {
      localStorage.setItem(ADMIN_PW_KEY, pwInput);
      setAuthed(true);
    } else {
      setPwError("Wrong password");
    }
  };

  const handleResolve = async () => {
    if (!selected || !pendingOutcome) return;
    setConfirming(true);
    setResolveError(null);
    setResolveResult(null);

    try {
      const res = await fetch("/api/admin/resolve-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: selected.id,
          outcome: pendingOutcome,
          adminPassword: CORRECT_PW,
          resolutionNote: resolutionNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setResolveResult({
        positionsSettled: data.positionsSettled,
        winnersCount: data.winnersCount,
        totalPaidOut: data.totalPaidOut,
      });

      // Remove from list and refresh
      setMarkets((prev) => prev.filter((m) => m.id !== selected.id));
      setSelected(null);
      setPendingOutcome(null);
      setResolutionNote("");
      fetchRecentlyResolved();
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "Failed");
    } finally {
      setConfirming(false);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <form
          onSubmit={handlePwSubmit}
          className="w-full max-w-sm rounded-xl border border-[#222] bg-[#111] p-6 space-y-4"
        >
          <h1 className="text-lg font-bold text-white">Admin Access</h1>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Enter admin password"
            className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white placeholder:text-[#555] focus:border-orange-500 focus:outline-none"
          />
          {pwError && <p className="text-xs text-red-400">{pwError}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">⚖️ Resolve Markets</h1>
          <p className="text-sm text-[#888] mt-1">
            {markets.length} market{markets.length !== 1 ? "s" : ""} awaiting resolution
          </p>
        </div>
        <a href="/admin" className="text-xs text-[#888] hover:text-white">
          ← Admin
        </a>
      </div>

      {/* Success flash */}
      {resolveResult && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <p className="text-green-400 font-semibold">✓ Market resolved</p>
          <p className="text-sm text-green-400/80 mt-1">
            {resolveResult.positionsSettled} positions settled · {resolveResult.winnersCount} winners ·{" "}
            {formatCurrency(resolveResult.totalPaidOut)} paid out
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Section 1: Markets awaiting resolution ── */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-[#888] uppercase tracking-widest mb-3">
            Awaiting Resolution
          </h2>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl border border-[#222] bg-[#111]" />
              ))}
            </div>
          ) : markets.length === 0 ? (
            <div className="rounded-xl border border-[#222] bg-[#111] p-8 text-center text-sm text-[#555]">
              No overdue markets. All caught up!
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px_70px_70px] gap-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#555]">
                <span>Title</span>
                <span className="text-right">Category</span>
                <span className="text-right">Volume</span>
                <span className="text-right">Positions</span>
                <span className="text-right">Overdue</span>
              </div>
              {markets.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelected(m);
                    setPendingOutcome(null);
                    setResolveError(null);
                    setResolveResult(null);
                  }}
                  className={`w-full text-left grid grid-cols-[1fr_80px_80px_70px_70px] gap-2 items-center px-3 py-3 rounded-xl border transition-colors ${
                    selected?.id === m.id
                      ? "border-orange-500/50 bg-orange-500/5"
                      : "border-[#222] bg-[#111] hover:border-[#333]"
                  }`}
                >
                  <span className="truncate text-sm text-white">{m.title}</span>
                  <span className="text-right text-xs text-[#888]">{m.category}</span>
                  <span className="text-right text-xs font-mono text-[#888]">
                    {formatCurrency(m.total_volume ?? 0)}
                  </span>
                  <span className="text-right text-xs font-mono text-[#888]">
                    {m.open_positions_count}
                  </span>
                  <span
                    className={`text-right text-xs font-mono font-semibold ${
                      m.days_overdue > 7 ? "text-red-400" : "text-amber-400"
                    }`}
                  >
                    {m.days_overdue}d
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 2: Resolution panel ── */}
        <div className="w-full lg:w-[380px] shrink-0">
          {!selected ? (
            <div className="rounded-xl border border-[#222] bg-[#111] p-8 text-center text-sm text-[#555]">
              ← Select a market to resolve
            </div>
          ) : (
            <div className="rounded-xl border border-[#222] bg-[#111] p-5 space-y-4">
              <h2 className="text-base font-bold text-white leading-snug">{selected.title}</h2>
              {selected.description && (
                <p className="text-xs text-[#888] leading-relaxed">{selected.description}</p>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 border border-[#222] rounded-lg p-3 text-center">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-[#555]">YES</p>
                  <p className="text-sm font-bold text-green-400 font-mono">
                    {Math.round((selected.yes_price ?? 0.5) * 100)}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-[#555]">NO</p>
                  <p className="text-sm font-bold text-red-400 font-mono">
                    {Math.round((selected.no_price ?? 0.5) * 100)}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-[#555]">Volume</p>
                  <p className="text-sm font-bold text-white font-mono">
                    {formatCurrency(selected.total_volume ?? 0)}
                  </p>
                </div>
              </div>

              {/* Choose outcome */}
              {!pendingOutcome ? (
                <div className="space-y-2">
                  <p className="text-xs text-[#888]">Select outcome:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPendingOutcome("yes")}
                      className="rounded-xl border-2 border-green-500/40 bg-green-500/10 py-4 text-base font-bold text-green-400 hover:bg-green-500/20 transition-colors"
                    >
                      ✅ Resolve YES
                    </button>
                    <button
                      onClick={() => setPendingOutcome("no")}
                      className="rounded-xl border-2 border-red-500/40 bg-red-500/10 py-4 text-base font-bold text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      ❌ Resolve NO
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Confirmation step */}
                  <div
                    className={`rounded-xl border p-3 ${
                      pendingOutcome === "yes"
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-red-500/30 bg-red-500/5"
                    }`}
                  >
                    <p
                      className={`text-sm font-semibold ${
                        pendingOutcome === "yes" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      Resolving {pendingOutcome.toUpperCase()}
                    </p>
                    <p className="text-xs text-[#888] mt-1">
                      This will settle {selected.open_positions_count} open positions and cannot be undone.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs text-[#888] mb-1.5">
                      Resolution note / source URL (optional)
                    </label>
                    <input
                      type="text"
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      placeholder="https://... or explanation"
                      className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#555] focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  {resolveError && (
                    <p className="text-xs text-red-400">{resolveError}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPendingOutcome(null)}
                      className="rounded-lg border border-[#333] py-2.5 text-sm text-[#888] hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResolve}
                      disabled={confirming}
                      className={`rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-colors ${
                        pendingOutcome === "yes"
                          ? "bg-green-600 hover:bg-green-500"
                          : "bg-red-600 hover:bg-red-500"
                      }`}
                    >
                      {confirming ? "Resolving…" : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3: Recently resolved ── */}
      {recentlyResolved.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-[#888] uppercase tracking-widest mb-3">
            Recently Resolved
          </h2>
          <div className="rounded-xl border border-[#222] bg-[#111] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#222]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-[#555]">Market</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-[#555]">Category</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-[#555]">Outcome</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-[#555]">Volume</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-[#555]">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {recentlyResolved.map((m) => (
                  <tr key={m.id} className="border-b border-[#1a1a1a] last:border-0">
                    <td className="px-4 py-3 text-white truncate max-w-[200px]">
                      <a href={`/markets/${m.id}`} className="hover:text-orange-400 transition-colors">
                        {m.title}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-[#888] text-xs">{m.category}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          m.resolution_outcome === "yes"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {m.resolution_outcome?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[#888]">
                      {formatCurrency(m.total_volume ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[#555]">
                      {m.resolved_at
                        ? new Date(m.resolved_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
