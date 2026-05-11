"use client";

/**
 * Modal for setting / editing / clearing a manual cost basis on
 * a creator coin holding. Backed by /api/portfolio/coins/cost-basis
 * which writes a source='manual' row into user_coin_purchases.
 *
 * The save flow is upsert-style on the API side: existing manual
 * rows for this user+creator are deleted before insert, so this
 * modal doesnt need to distinguish create-vs-update — it just
 * POSTs the new value and the server reconciles.
 */

import { useEffect, useState } from "react";

type Props = {
  isOpen: boolean;
  ticker: string;
  desoPublicKey: string;
  coinsHeld: number;
  currentAvg: number | null; // pre-fill when editing
  isManual: boolean; // controls visibility of "Clear cost basis"
  onClose: () => void;
  onSaved: () => void;
};

export function CostBasisModal({
  isOpen,
  ticker,
  desoPublicKey,
  coinsHeld,
  currentAvg,
  isManual,
  onClose,
  onSaved,
}: Props) {
  const [value, setValue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(currentAvg != null ? String(currentAvg) : "");
      setError(null);
    }
  }, [isOpen, currentAvg]);

  if (!isOpen) return null;

  const isEdit = currentAvg != null && isManual;

  const handleSave = async () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a price greater than 0");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/coins/cost-basis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          deso_public_key: desoPublicKey,
          coins_held: coinsHeld,
          avg_price_usd: parsed,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Failed to save");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/coins/cost-basis", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ deso_public_key: desoPublicKey }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Failed to clear");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full rounded-t-2xl border border-border-subtle bg-bg shadow-2xl animate-slide-up md:max-w-sm md:rounded-2xl md:animate-none">
        {/* Drag handle — mobile only */}
        <div className="md:hidden mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-text-muted/30" />
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="min-w-0 pr-4">
            <p className="text-xs text-text-muted uppercase tracking-widest font-semibold mb-0.5">
              {isEdit ? "Edit cost basis" : "Set cost basis"}
            </p>
            <p className="text-sm font-semibold text-text-primary truncate">
              ${ticker.toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="shrink-0 rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          <p className="mb-4 text-xs text-text-muted leading-relaxed">
            Tell us your average buy price per coin. We&apos;ll track your gain/loss from there.
          </p>

          <label className="block mb-1.5 text-[11px] uppercase tracking-widest text-text-muted">
            Avg buy price (USD)
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2">
            <span className="text-text-muted font-mono">$</span>
            <input
              type="number"
              step="0.0001"
              min="0"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              className="flex-1 bg-transparent text-text-primary font-mono text-sm outline-none placeholder:text-text-faint"
              placeholder="0.00"
              disabled={submitting}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted font-mono">
            Applies to your current balance of {coinsHeld.toFixed(4)} coins.
          </p>

          {error && (
            <p className="mt-3 text-xs text-no">{error}</p>
          )}

          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={submitting}
              className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent)]/90 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary hover:border-white/30 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          {isEdit && (
            <button
              onClick={handleClear}
              disabled={submitting}
              className="mt-3 w-full text-xs text-text-muted hover:text-no transition-colors disabled:opacity-50"
            >
              Clear cost basis
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
