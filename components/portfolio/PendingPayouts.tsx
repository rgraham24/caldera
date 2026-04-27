"use client";

/**
 * P3-3.8b — Claimable winnings section on /portfolio.
 *
 * Fetches /api/positions/payouts on mount, renders one row per
 * actionable payout (pending | failed | in_flight | blocked_insolvent)
 * with a contextual button. Click → POST /api/positions/[id]/claim-winnings
 * → refresh + show persistent success banner.
 *
 * Mirrors components/portfolio/PendingRewards.tsx (P3-4) — same
 * banner pattern, same auto-dismiss, same reason messages.
 *
 * Filters OUT claimed rows: the success banner handles recent claims;
 * older claimed payouts are visible in the settled tab's PnL.
 *
 * Hides entirely when nothing actionable AND no recent success.
 *
 * See docs/P3-3-resolution-payout-design.md.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

type PayoutEntry = {
  payoutId: string;
  positionId: string;
  marketId: string;
  marketSlug: string;
  marketTitle: string;
  side: string;
  winningShares: number;
  payoutAmountUsd: number;
  claimStatus: string;
  claimTxHash: string | null;
  claimedAt: string | null;
  claimFailedReason: string | null;
  resolvedAt: string | null;
};

type ClaimResult = {
  ok: boolean;
  payoutId?: string;
  positionId?: string;
  txHashHex?: string;
  payoutUsd?: number;
  payoutNanos?: string;
  desoUsdRate?: number;
  reason?: string;
  error?: string;
};

type RecentSuccess = {
  positionId: string;
  marketTitle: string;
  side: string;
  txHashHex: string;
  payoutUsd: number;
  payoutNanos: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "claiming"; positionId: string }
  | { kind: "error"; positionId: string; message: string };

const SUCCESS_AUTO_DISMISS_MS = 8000;

const FAIL_REASON_MESSAGES: Record<string, string> = {
  "no-payout": "No winnings to claim.",
  "not-owner": "You don't own this payout.",
  "not-claimable": "This payout can't be claimed right now.",
  "amount-too-small": "Amount is too small to send.",
  "platform-insufficient-funds":
    "Platform funds too low — admin notified. Try again later.",
  "concurrent-claim": "Another claim is in progress.",
  "price-fetch-failed": "Couldn't fetch DESO price. Try again.",
  "transfer-failed": "On-chain transfer failed. Try again.",
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

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

function formatNanos(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString();
}

export default function PendingPayouts() {
  const [entries, setEntries] = useState<PayoutEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [recentSuccess, setRecentSuccess] = useState<RecentSuccess | null>(
    null
  );
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/positions/payouts");
      if (!res.ok) {
        setEntries([]);
        return;
      }
      const json = (await res.json()) as { payouts: PayoutEntry[] };
      // Filter out claimed — settled tab handles those; success banner
      // handles fresh ones.
      const actionable = (json.payouts ?? []).filter(
        (p) => p.claimStatus !== "claimed"
      );
      setEntries(actionable);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-dismiss success banner
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
    async (entry: PayoutEntry) => {
      setStatus({ kind: "claiming", positionId: entry.positionId });
      try {
        const res = await fetch(
          `/api/positions/${entry.positionId}/claim-winnings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }
        );
        const json = (await res.json()) as ClaimResult;
        if (res.ok && json.ok && json.txHashHex) {
          setRecentSuccess({
            positionId: entry.positionId,
            marketTitle: entry.marketTitle,
            side: entry.side,
            txHashHex: json.txHashHex,
            payoutUsd: json.payoutUsd ?? entry.payoutAmountUsd,
            payoutNanos: json.payoutNanos ?? "0",
          });
          setStatus({ kind: "idle" });
          refresh();
        } else {
          setStatus({
            kind: "error",
            positionId: entry.positionId,
            message: reasonMessage(json.reason, json.error ?? "Claim failed."),
          });
        }
      } catch (e) {
        setStatus({
          kind: "error",
          positionId: entry.positionId,
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
          <h2 className="text-base font-semibold">Claimable Winnings</h2>
          <p className="text-xs text-text-muted mt-0.5">Paid in DESO</p>
        </div>
      </div>

      {/* Persistent success banner */}
      {recentSuccess && (
        <div
          className={cn(
            "rounded-lg border border-yes/30 bg-yes/10",
            "px-4 py-3 mb-3 flex items-start justify-between gap-3"
          )}
        >
          <div className="flex-1">
            <div className="text-sm font-semibold text-yes">
              ✓ Claimed {formatUsd(recentSuccess.payoutUsd)} on{" "}
              {recentSuccess.marketTitle}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {formatNanos(recentSuccess.payoutNanos)} nanos sent ·{" "}
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
              status.kind === "claiming" &&
              status.positionId === entry.positionId;
            const showError =
              status.kind === "error" &&
              status.positionId === entry.positionId;
            const isFailedRow = entry.claimStatus === "failed";
            const isInFlightRow = entry.claimStatus === "in_flight";
            const isBlocked = entry.claimStatus === "blocked_insolvent";
            const disabled = isClaiming || isInFlightRow || isBlocked;

            let buttonLabel: string;
            if (isClaiming) buttonLabel = "Claiming…";
            else if (isInFlightRow) buttonLabel = "Processing…";
            else if (isBlocked) buttonLabel = "Pending platform funding";
            else if (isFailedRow) buttonLabel = "Retry";
            else buttonLabel = "Claim";

            return (
              <div
                key={entry.payoutId}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        entry.side === "yes"
                          ? "bg-yes/10 text-yes"
                          : "bg-no/10 text-no"
                      )}
                    >
                      {entry.side}
                    </span>
                    <span className="text-sm font-semibold truncate">
                      {entry.marketTitle}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-sm text-text-muted">
                      {formatUsd(entry.payoutAmountUsd)}
                    </span>
                    {isFailedRow && entry.claimFailedReason && (
                      <span
                        className="text-xs text-no truncate"
                        title={entry.claimFailedReason}
                      >
                        Failed: {entry.claimFailedReason.slice(0, 60)}
                      </span>
                    )}
                  </div>
                  {showError && status.kind === "error" && (
                    <div className="text-xs mt-1 text-no">
                      {status.message}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => claim(entry)}
                  disabled={disabled}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-sm font-semibold whitespace-nowrap",
                    "disabled:opacity-50 disabled:cursor-not-allowed transition",
                    isBlocked
                      ? "border border-border-subtle text-text-muted"
                      : "bg-[var(--accent)] text-white"
                  )}
                  title={
                    isBlocked
                      ? "Platform wallet is being topped up"
                      : isFailedRow && entry.claimFailedReason
                        ? entry.claimFailedReason
                        : undefined
                  }
                >
                  {buttonLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
