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

type AiFlaggedMarket = {
  id: string;
  title: string;
  category: string;
  yes_price: number;
  no_price: number;
  total_volume: number;
  resolve_at: string;
  description: string | null;
  resolution_note: string | null;
  ai_suggested_outcome: string | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  ai_source_hint: string | null;
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

function useResolveMarket(onSuccess: () => void) {
  const [confirming, setConfirming] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveResult, setResolveResult] = useState<ResolutionResult | null>(null);

  const doResolve = useCallback(
    async (marketId: string, outcome: "yes" | "no", note?: string) => {
      setConfirming(true);
      setResolveError(null);
      setResolveResult(null);
      try {
        const res = await fetch("/api/admin/resolve-market", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketId,
            outcome,
            adminPassword: CORRECT_PW,
            resolutionNote: note,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        setResolveResult({
          positionsSettled: data.positionsSettled,
          winnersCount: data.winnersCount,
          totalPaidOut: data.totalPaidOut,
        });
        onSuccess();
      } catch (err) {
        setResolveError(err instanceof Error ? err.message : "Failed");
      } finally {
        setConfirming(false);
      }
    },
    [onSuccess]
  );

  return { confirming, resolveError, resolveResult, doResolve, setResolveResult };
}

export default function AdminResolvePage() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  const [markets, setMarkets] = useState<OverdueMarket[]>([]);
  const [aiFlagged, setAiFlagged] = useState<AiFlaggedMarket[]>([]);
  const [recentlyResolved, setRecentlyResolved] = useState<ResolvedMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiRunResult, setAiRunResult] = useState<string | null>(null);

  const [selected, setSelected] = useState<OverdueMarket | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [pendingOutcome, setPendingOutcome] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(ADMIN_PW_KEY);
      if (stored === CORRECT_PW) setAuthed(true);
    }
  }, []);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/markets-to-resolve?adminPassword=${CORRECT_PW}`);
      const d = await res.json();
      setMarkets(d.data ?? []);
    } catch {
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAiFlagged = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/auto-resolve-status?adminPassword=${CORRECT_PW}`);
      const d = await res.json();
      setAiFlagged(d.data ?? []);
    } catch {
      setAiFlagged([]);
    }
  }, []);

  const fetchRecentlyResolved = useCallback(async () => {
    try {
      const res = await fetch("/api/markets?status=resolved&limit=10");
      const d = await res.json();
      setRecentlyResolved(
        (d.data ?? []).filter((m: ResolvedMarket) => m.category !== "Crypto").slice(0, 10)
      );
    } catch {
      setRecentlyResolved([]);
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchMarkets();
    fetchAiFlagged();
    fetchRecentlyResolved();
  }, [fetchMarkets, fetchAiFlagged, fetchRecentlyResolved]);

  useEffect(() => {
    if (authed) refreshAll();
  }, [authed, refreshAll]);

  const { confirming, resolveError, resolveResult, doResolve, setResolveResult } =
    useResolveMarket(() => {
      setMarkets((prev) => prev.filter((m) => m.id !== selected?.id));
      setAiFlagged((prev) => prev.filter((m) => m.id !== selected?.id));
      setSelected(null);
      setPendingOutcome(null);
      setResolutionNote("");
      fetchRecentlyResolved();
    });

  const handleResolve = () => {
    if (!selected || !pendingOutcome) return;
    doResolve(selected.id, pendingOutcome, resolutionNote.trim() || undefined);
  };

  const handleAiApprove = (m: AiFlaggedMarket, outcome: "yes" | "no") => {
    doResolve(
      m.id,
      outcome,
      `Confirmed by admin. AI reasoning: ${m.ai_reasoning ?? ""}`
    );
    setAiFlagged((prev) => prev.filter((x) => x.id !== m.id));
  };

  const runAiResolution = async () => {
    setAiRunning(true);
    setAiRunResult(null);
    try {
      const res = await fetch("/api/admin/auto-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: CORRECT_PW }),
      });
      const d = await res.json();
      setAiRunResult(
        `Processed ${d.processed ?? 0} — Auto-resolved: ${d.autoResolved?.length ?? 0}, Flagged: ${d.flaggedForReview?.length ?? 0}, Skipped: ${d.skipped?.length ?? 0}`
      );
      refreshAll();
    } catch {
      setAiRunResult("Error running AI resolution");
    } finally {
      setAiRunning(false);
    }
  };

  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwInput === CORRECT_PW) {
      localStorage.setItem(ADMIN_PW_KEY, pwInput);
      setAuthed(true);
    } else {
      setPwError("Wrong password");
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
          <button type="submit" className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500">
            Enter
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">⚖️ Resolve Markets</h1>
          <p className="text-sm text-[#888] mt-1">
            {markets.length} overdue · {aiFlagged.length} in AI queue
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runAiResolution}
            disabled={aiRunning}
            className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40"
          >
            {aiRunning ? "Running AI…" : "🤖 Run AI Resolution"}
          </button>
          <a href="/admin" className="text-xs text-[#888] hover:text-white">← Admin</a>
        </div>
      </div>

      {/* AI run result */}
      {aiRunResult && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3">
          <p className="text-sm text-purple-400">🤖 {aiRunResult}</p>
        </div>
      )}

      {/* Success flash */}
      {resolveResult && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <p className="text-green-400 font-semibold">✓ Market resolved</p>
          <p className="text-sm text-green-400/80 mt-1">
            {resolveResult.positionsSettled} positions settled · {resolveResult.winnersCount} winners ·{" "}
            {formatCurrency(resolveResult.totalPaidOut)} paid out
          </p>
          <button onClick={() => setResolveResult(null)} className="text-xs text-green-400/50 mt-1 hover:text-green-400">dismiss</button>
        </div>
      )}

      {/* ── AI Resolution Queue ── */}
      {aiFlagged.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-3">
            🤖 AI Resolution Queue — {aiFlagged.length} awaiting confirmation
          </h2>
          <div className="space-y-3">
            {aiFlagged.map((m) => (
              <div key={m.id} className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white leading-snug">{m.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-[#555]">{m.category}</span>
                      {m.ai_confidence !== null && (
                        <span className="text-[10px] font-mono text-purple-400">{m.ai_confidence}% confident</span>
                      )}
                      {m.ai_suggested_outcome && m.ai_suggested_outcome !== "unknown" && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          m.ai_suggested_outcome === "yes"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-red-500/15 text-red-400"
                        }`}>
                          Suggested: {m.ai_suggested_outcome.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {m.ai_reasoning && (
                  <div className="rounded-lg bg-[#0a0a0a] border border-[#222] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-widest text-purple-400 font-semibold mb-1">AI Reasoning</p>
                    <p className="text-xs text-[#aaa] leading-relaxed">{m.ai_reasoning}</p>
                    {m.ai_source_hint && (
                      <p className="text-[10px] text-[#555] mt-1">Source hint: {m.ai_source_hint}</p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {m.ai_suggested_outcome && m.ai_suggested_outcome !== "unknown" && (
                    <button
                      onClick={() => handleAiApprove(m, m.ai_suggested_outcome as "yes" | "no")}
                      className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 transition-colors"
                    >
                      ✓ Approve {m.ai_suggested_outcome.toUpperCase()}
                    </button>
                  )}
                  <button
                    onClick={() => handleAiApprove(m, "yes")}
                    className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors"
                  >
                    ✅ YES
                  </button>
                  <button
                    onClick={() => handleAiApprove(m, "no")}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    ❌ NO
                  </button>
                  <a
                    href={`/markets/${m.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#555] hover:text-[#888] ml-auto"
                  >
                    View →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error from resolve */}
      {resolveError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-sm text-red-400">{resolveError}</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Section 1: Markets awaiting resolution ── */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-[#888] uppercase tracking-widest mb-3">
            Awaiting Manual Resolution
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
                    setResolutionNote("");
                  }}
                  className={`w-full text-left grid grid-cols-[1fr_80px_80px_70px_70px] gap-2 items-center px-3 py-3 rounded-xl border transition-colors ${
                    selected?.id === m.id
                      ? "border-orange-500/50 bg-orange-500/5"
                      : "border-[#222] bg-[#111] hover:border-[#333]"
                  }`}
                >
                  <span className="truncate text-sm text-white">{m.title}</span>
                  <span className="text-right text-xs text-[#888]">{m.category}</span>
                  <span className="text-right text-xs font-mono text-[#888]">{formatCurrency(m.total_volume ?? 0)}</span>
                  <span className="text-right text-xs font-mono text-[#888]">{m.open_positions_count}</span>
                  <span className={`text-right text-xs font-mono font-semibold ${m.days_overdue > 7 ? "text-red-400" : "text-amber-400"}`}>
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

              <div className="grid grid-cols-3 gap-2 border border-[#222] rounded-lg p-3 text-center">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-[#555]">YES</p>
                  <p className="text-sm font-bold text-green-400 font-mono">{Math.round((selected.yes_price ?? 0.5) * 100)}%</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-[#555]">NO</p>
                  <p className="text-sm font-bold text-red-400 font-mono">{Math.round((selected.no_price ?? 0.5) * 100)}%</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-[#555]">Volume</p>
                  <p className="text-sm font-bold text-white font-mono">{formatCurrency(selected.total_volume ?? 0)}</p>
                </div>
              </div>

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
                  <div className={`rounded-xl border p-3 ${pendingOutcome === "yes" ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                    <p className={`text-sm font-semibold ${pendingOutcome === "yes" ? "text-green-400" : "text-red-400"}`}>
                      Resolving {pendingOutcome.toUpperCase()}
                    </p>
                    <p className="text-xs text-[#888] mt-1">
                      This will settle {selected.open_positions_count} open positions and cannot be undone.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-[#888] mb-1.5">Resolution note / source URL (optional)</label>
                    <input
                      type="text"
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      placeholder="https://... or explanation"
                      className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#555] focus:border-orange-500 focus:outline-none"
                    />
                  </div>
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
                      className={`rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-colors ${pendingOutcome === "yes" ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
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
          <h2 className="text-xs font-semibold text-[#888] uppercase tracking-widest mb-3">Recently Resolved</h2>
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
                      <a href={`/markets/${m.id}`} className="hover:text-orange-400 transition-colors">{m.title}</a>
                    </td>
                    <td className="px-4 py-3 text-[#888] text-xs">{m.category}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${m.resolution_outcome === "yes" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        {m.resolution_outcome?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[#888]">{formatCurrency(m.total_volume ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-xs text-[#555]">
                      {m.resolved_at ? new Date(m.resolved_at).toLocaleDateString() : "—"}
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
