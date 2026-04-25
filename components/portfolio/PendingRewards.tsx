"use client";

/**
 * P3-4.5 + P3-4.7 — Pending holder rewards section on /portfolio.
 *
 * Fetches /api/holder-rewards/balance on mount, renders one row per
 * token with a Claim button. Click → POST /api/holder-rewards/claim
 * → refresh balance + show persistent success banner.
 *
 * The success banner lives at the component level (not per-row) so
 * it persists even after the just-claimed row disappears from the
 * refreshed list. Auto-dismisses after 8 seconds; user can also
 * dismiss manually.
 *
 * Hides itself entirely when there are no pending rewards AND no
 * recent success to show.
 *
 * See docs/P3-4-holder-rewards-claim-design.md for the full design.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

type PendingEntry = {
  tokenSlug: string;
  tokenType: string;
  displayLabel: string;
  rowCount: number;
  totalUsd: string;
  creatorPublicKey: string | null;
};

type ClaimResult = {
  ok: boolean;
  txHashHex?: string;
  claimedUsd?: string;
  claimedNanos?: string;
  rowsCount?: number;
  tokenSlug?: string;
  reason?: string;
  error?: string;
};

type RecentSuccess = {
  tokenSlug: string;
  displayLabel: string;
  txHashHex: string;
  usd: string;
  nanos: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "claiming"; tokenSlug: string }
  | { kind: "error"; tokenSlug: string; message: string };

const SUCCESS_AUTO_DISMISS_MS = 8000;

const FAIL_REASON_MESSAGES: Record<string, string> = {
  "no-pending-rewards": "No rewards to claim for this token.",
  "token-not-claimable": "This token isn't claimable yet.",
  "amount-too-small": "Amount is too small to send. Accrue more first.",
  "platform-insufficient-funds":
    "Platform funds too low — admin notified. Try again later.",
  "concurrent-claim": "Another claim is already in progress.",
  "price-fetch-failed": "Couldn't fetch current price. Try again.",
  "ledger-update-failed":
    "Sent on-chain but ledger update failed. Admin will reconcile.",
};

function reasonMessage(
  reason: string | undefined,
  fallback = "Claim failed."
): string {
  if (!reason) return fallback;
  return FAIL_REASON_MESSAGES[reason] ?? `${fallback} (${reason})`;
}

function formatUsd(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

function formatNanos(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString();
}

export default function PendingRewards() {
  const [entries, setEntries] = useState<PendingEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [recentSuccess, setRecentSuccess] = useState<RecentSuccess | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/holder-rewards/balance");
      if (!res.ok) {
        setEntries([]);
        return;
      }
      const json = (await res.json()) as { pending: PendingEntry[] };
      setEntries(json.pending ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-dismiss success banner after a delay
  useEffect(() => {
    if (!recentSuccess) return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setRecentSuccess(null);
    }, SUCCESS_AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [recentSuccess]);

  const dismissSuccess = useCallback(() => {
    setRecentSuccess(null);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  const claim = useCallback(
    async (tokenSlug: string, displayLabel: string) => {
      setStatus({ kind: "claiming", tokenSlug });
      try {
        const res = await fetch("/api/holder-rewards/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenSlug }),
        });
        const json = (await res.json()) as ClaimResult;
        if (res.ok && json.ok && json.txHashHex) {
          // Show persistent banner BEFORE refreshing the list
          setRecentSuccess({
            tokenSlug,
            displayLabel,
            txHashHex: json.txHashHex,
            usd: json.claimedUsd ?? "0",
            nanos: json.claimedNanos ?? "0",
          });
          setStatus({ kind: "idle" });
          // Now refresh — claimed row will disappear from list
          refresh();
        } else {
          setStatus({
            kind: "error",
            tokenSlug,
            message: reasonMessage(json.reason, json.error ?? "Claim failed."),
          });
        }
      } catch (e) {
        setStatus({
          kind: "error",
          tokenSlug,
          message: e instanceof Error ? e.message : "Network error.",
        });
      }
    },
    [refresh]
  );

  // ── Render guards ────────────────────────────────────────────
  if (loading) return null;

  const hasEntries = entries !== null && entries.length > 0;
  const hasSuccess = recentSuccess !== null;

  if (!hasEntries && !hasSuccess) return null;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold">Pending Rewards</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Paid in creator coins, not DESO
          </p>
        </div>
      </div>

      {/* Persistent success banner (lives outside the entries list) */}
      {recentSuccess && (
        <div
          className={cn(
            "rounded-lg border border-yes/30 bg-yes/10",
            "px-4 py-3 mb-3 flex items-start justify-between gap-3"
          )}
        >
          <div className="flex-1">
            <div className="text-sm font-semibold text-yes">
              ✓ Claimed {formatUsd(recentSuccess.usd)} of{" "}
              {recentSuccess.displayLabel}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {formatNanos(recentSuccess.nanos)} nanos sent ·{" "}
              <a
                href={`https://explorer.deso.org/?transaction-id=${recentSuccess.txHashHex}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-yes"
              >
                view tx
              </a>
            </div>
          </div>
          <button
            onClick={dismissSuccess}
            className="text-text-muted hover:text-text-primary text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {hasEntries && (
        <div className="divide-y divide-border-subtle">
          {entries!.map((entry) => {
            const isClaiming =
              status.kind === "claiming" && status.tokenSlug === entry.tokenSlug;
            const showError =
              status.kind === "error" && status.tokenSlug === entry.tokenSlug;

            return (
              <div
                key={entry.tokenSlug}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">
                      {entry.displayLabel}
                    </span>
                    <span className="text-sm text-text-muted">
                      {formatUsd(entry.totalUsd)}
                    </span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {entry.rowCount} accrual{entry.rowCount !== 1 ? "s" : ""}
                  </div>
                  {showError && status.kind === "error" && (
                    <div className="text-xs mt-1 text-no">
                      {status.message}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => claim(entry.tokenSlug, entry.displayLabel)}
                  disabled={!entry.creatorPublicKey || isClaiming}
                  className={cn(
                    "rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white",
                    "disabled:opacity-50 disabled:cursor-not-allowed transition"
                  )}
                  title={
                    !entry.creatorPublicKey
                      ? "Token has no creator profile yet"
                      : undefined
                  }
                >
                  {isClaiming ? "Claiming…" : "Claim"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
