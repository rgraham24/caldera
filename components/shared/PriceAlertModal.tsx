"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Check, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type PriceAlertModalProps = {
  creatorId: string;
  creatorName: string;
  desoUsername: string;
  currentPrice: number;
  isOpen: boolean;
  onClose: () => void;
};

export function PriceAlertModal({
  creatorId,
  creatorName,
  desoUsername,
  currentPrice,
  isOpen,
  onClose,
}: PriceAlertModalProps) {
  const [alertType, setAlertType] = useState<"above" | "below">("above");
  const [targetPrice, setTargetPrice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const price = parseFloat(targetPrice);
    if (!price || price <= 0) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_id: creatorId,
          deso_username: desoUsername,
          alert_type: alertType,
          target_price_usd: price,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set alert");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border-subtle bg-surface-2 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-text-primary">
            Price alert for ${desoUsername}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-yes/10">
              <Check className="h-5 w-5 text-yes" />
            </div>
            <p className="text-sm font-medium text-text-primary">Alert set</p>
            <p className="mt-1 text-xs text-text-muted">
              You&apos;ll be notified when ${desoUsername} crosses {formatCurrency(parseFloat(targetPrice))}
            </p>
            <Button onClick={onClose} className="mt-4 w-full bg-caldera text-background font-semibold">Done</Button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs text-text-muted">
              Current price: <span className="font-mono text-caldera">{formatCurrency(currentPrice)}</span>
              <span className="ml-1 text-yes text-[10px]">Live</span>
            </p>

            <div className="mb-4 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={alertType === "above"}
                  onChange={() => setAlertType("above")}
                  className="accent-caldera"
                />
                <span className="text-sm text-text-primary">Alert when price goes above</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={alertType === "below"}
                  onChange={() => setAlertType("below")}
                  className="accent-caldera"
                />
                <span className="text-sm text-text-primary">Alert when price goes below</span>
              </label>
            </div>

            <div className="mb-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-border-subtle bg-background py-3 pl-7 pr-4 font-mono text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
                />
              </div>
              <p className="mt-1.5 text-[10px] text-text-faint">
                We&apos;ll notify you in-app when the price crosses this level
              </p>
            </div>

            {error && <p className="mb-3 text-xs text-no">{error}</p>}

            <Button
              onClick={handleSubmit}
              disabled={!targetPrice || parseFloat(targetPrice) <= 0 || isLoading}
              className="w-full bg-caldera text-background font-semibold hover:bg-caldera/90"
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Set Alert
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
