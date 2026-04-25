"use client";

/**
 * P3-4.5 — Pending holder rewards section on /portfolio.
 *
 * Fetches /api/holder-rewards/balance on mount, renders one row per
 * token with a Claim button. Click → POST /api/holder-rewards/claim
 * → refresh balance.
 *
 * Hides itself entirely when there are no pending rewards (most users).
 *
 * See docs/P3-4-holder-rewards-claim-design.md for the full design.
 */

import { useEffect, useState, useCallback } from "react";
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
  rowsCount?: number;
  tokenSlug?: string;
  reason?: string;
  error?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "claiming"; tokenSlug: string }
  | { kind: "success"; tokenSlug: string; txHashHex: string; usd: string }
  | { kind: "error"; tokenSlug: string; message: string };

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

export default function PendingRewards() {
  const [entries, setEntries] = useState<PendingEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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

  const claim = useCallback(
    async (tokenSlug: string) => {
      setStatus({ kind: "claiming", tokenSlug });
      try {
        const res = await fetch("/api/holder-rewards/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenSlug }),
        });
        const json = (await res.json()) as ClaimResult;
        if (res.ok && json.ok && json.txHashHex) {
          setStatus({
            kind: "success",
            tokenSlug,
            txHashHex: json.txHashHex,
            usd: json.claimedUsd ?? "0",
          });
          // Refresh in background — claimed rows won't appear anymore
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
  if (loading) {
    // Don't show a heavy skeleton — a thin loading line is enough
    return null;
  }

  if (!entries || entries.length === 0) {
    // Hide entirely when no rewards. Most users see nothing.
    return null;
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            Pending Rewards
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Paid in creator coins, not DESO
          </p>
        </div>
      </div>

      <div className="divide-y divide-border-subtle">
        {entries.map((entry) => {
          const isClaiming =
            status.kind === "claiming" && status.tokenSlug === entry.tokenSlug;
          const showSuccess =
            status.kind === "success" && status.tokenSlug === entry.tokenSlug;
          const showError =
            status.kind === "error" && status.tokenSlug === entry.tokenSlug;

          return (
            <div
              key={entry.tokenSlug}
              className="py-3 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {entry.displayLabel}
                  </span>
                  <span className="text-sm text-text-muted">
                    {formatUsd(entry.totalUsd)}
                  </span>
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {entry.rowCount} accrual{entry.rowCount !== 1 ? "s" : ""}
                </div>
                {showSuccess && status.kind === "success" && (
                  <div className="text-xs mt-1 text-yes">
                    Sent ✓ — {formatUsd(status.usd)}{" "}
                    <a
                      href={`https://explorer.deso.org/?transaction-id=${status.txHashHex}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      view tx
                    </a>
                  </div>
                )}
                {showError && status.kind === "error" && (
                  <div className="text-xs mt-1 text-no">{status.message}</div>
                )}
              </div>
              <button
                onClick={() => claim(entry.tokenSlug)}
                disabled={
                  !entry.creatorPublicKey || isClaiming || showSuccess
                }
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
                {isClaiming ? "Claiming…" : showSuccess ? "Claimed" : "Claim"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
