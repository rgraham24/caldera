"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminGate } from "../admin-gate";
import { useAppStore } from "@/store";

type QueueItem = {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  category: string | null;
  token_status: string | null;
  verification_status: string | null;
  markets_count: number;
  total_volume: number;
  twitter_handle: string | null;
};

const ADMIN_PW_KEY = "caldera_admin_pw";

function VerifyQueue() {
  const { desoPublicKey } = useAppStore();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const adminPassword = typeof window !== "undefined"
    ? localStorage.getItem(ADMIN_PW_KEY) ?? "caldera-admin-2026"
    : "caldera-admin-2026";

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/verify-creator-queue");
      const data = await res.json();
      setQueue(data.queue ?? []);
    } catch {
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const act = async (slug: string, action: "approve" | "reject") => {
    const handle = handles[slug]?.trim();
    if (action === "approve" && !handle) {
      alert("Enter a Twitter handle before approving.");
      return;
    }
    setProcessing((p) => ({ ...p, [slug]: true }));
    try {
      const res = await fetch("/api/admin/verify-creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          creatorSlug: slug,
          twitterHandle: handle,
          adminPassword,
          desoPublicKey,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        let msg: string;
        if (action === "approve") {
          const parts = [`✅ Approved — claim code: ${data.claimCode ?? "—"}`];
          if (data.desoUsername) parts.push(`DeSo: @${data.desoUsername}`);
          else if (data.desoKey) parts.push(`DeSo key: ${data.desoKey.substring(0, 12)}…`);
          else parts.push("DeSo: pending");
          if (data.desoError) parts.push(`⚠️ DeSo error: ${data.desoError}`);
          if (data.newSlug && data.newSlug !== slug) parts.push(`Slug → ${data.newSlug}`);
          msg = parts.join(" | ");
        } else {
          msg = "🚫 Rejected";
        }
        setResults((r) => ({ ...r, [slug]: { ok: !data.desoError, msg } }));
        setQueue((q) => q.filter((c) => c.slug !== slug));
      } else {
        setResults((r) => ({ ...r, [slug]: { ok: false, msg: data.error ?? "Unknown error" } }));
      }
    } catch (err) {
      setResults((r) => ({ ...r, [slug]: { ok: false, msg: String(err) } }));
    } finally {
      setProcessing((p) => ({ ...p, [slug]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle/30 bg-surface p-8 text-center">
        <p className="mb-4 text-text-muted">No creators pending verification</p>
        <p className="text-xs text-text-faint mb-4">
          Queue shows creators with <code className="bg-surface-2 px-1 py-0.5 rounded">token_status = &apos;pending_deso_creation&apos;</code> or <code className="bg-surface-2 px-1 py-0.5 rounded">shadow</code> or <code className="bg-surface-2 px-1 py-0.5 rounded">verification_status = &apos;pending_review&apos;</code> with at least 1 market.
        </p>
        <button
          onClick={fetchQueue}
          className="rounded-lg bg-orange-500/10 border border-orange-500/20 px-4 py-2 text-sm text-orange-400 hover:bg-orange-500/20 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-muted">{queue.length} creator{queue.length !== 1 ? "s" : ""} in queue</p>
        <button
          onClick={fetchQueue}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          ↻ Refresh
        </button>
      </div>
      {queue.map((creator) => (
        <div
          key={creator.id}
          className="rounded-xl border border-border-subtle/30 bg-surface p-5"
        >
          {/* Header row */}
          <div className="flex items-start gap-4">
            {creator.image_url ? (
              <img src={creator.image_url} alt={creator.name} className="h-12 w-12 rounded-full object-cover shrink-0" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-orange-500/20 flex items-center justify-center text-lg font-bold text-orange-400 shrink-0">
                {(creator.name ?? "?")[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-text-primary">{creator.name}</span>
                <code className="text-xs text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">{creator.slug}</code>
                {creator.category && (
                  <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">{creator.category}</span>
                )}
                <span className="text-xs text-text-muted">
                  status: <span className="text-amber-400">{creator.token_status ?? "—"}</span>
                </span>
              </div>
              <div className="mt-1 flex gap-4 text-xs text-text-muted">
                <span>{creator.markets_count} markets</span>
                <span>${(creator.total_volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} volume</span>
                {creator.twitter_handle && (
                  <span className="text-blue-400">@{creator.twitter_handle}</span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span className="text-xs text-text-muted shrink-0">@</span>
              <input
                type="text"
                placeholder="twitter handle (e.g. ninja)"
                value={handles[creator.slug] ?? creator.twitter_handle ?? ""}
                onChange={(e) => setHandles((h) => ({ ...h, [creator.slug]: e.target.value }))}
                className="w-full rounded-lg border border-border-subtle/40 bg-base px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-orange-500/50"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => act(creator.slug, "approve")}
                disabled={processing[creator.slug]}
                className="rounded-lg bg-green-500/15 border border-green-500/30 px-4 py-1.5 text-sm font-medium text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40"
              >
                {processing[creator.slug] ? "…" : "Approve"}
              </button>
              <button
                onClick={() => act(creator.slug, "reject")}
                disabled={processing[creator.slug]}
                className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
              >
                Reject
              </button>
            </div>
          </div>

          {/* Result message */}
          {results[creator.slug] && (
            <p className={`mt-2 text-xs ${results[creator.slug].ok ? "text-green-400" : "text-red-400"}`}>
              {results[creator.slug].msg}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function VerifyCreatorsPage() {
  return (
    <AdminGate>
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary">Verification Queue</h1>
          <p className="mt-1 text-sm text-text-muted">
            Creators with markets pending DeSo coin creation. Type the verified Twitter handle and approve to create their DeSo profile and generate a claim code.
          </p>
        </div>
        <VerifyQueue />
      </div>
    </AdminGate>
  );
}
