"use client";

import { useState } from "react";
import type { Market } from "@/types";
import { MarketStatusBadge } from "@/components/markets/MarketStatusBadge";
import {
  formatCompactCurrency,
  formatRelativeTime,
  slugify,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useAppStore } from "@/store";

type AdminMarketsClientProps = {
  markets: Market[];
};

export function AdminMarketsClient({ markets: initialMarkets }: AdminMarketsClientProps) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [showCreate, setShowCreate] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Market | null>(null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Market Management
        </h1>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger
            render={<Button className="bg-caldera text-white hover:bg-caldera/90" />}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Create Market
          </DialogTrigger>
          <DialogContent className="bg-surface border-border-subtle max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-text-primary">Create Market</DialogTitle>
            </DialogHeader>
            <CreateMarketForm
              onCreated={(market) => {
                setMarkets((prev) => [market, ...prev]);
                setShowCreate(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Markets table */}
      <div className="rounded-xl border border-border-subtle bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-text-muted">
              <th className="px-4 py-3 text-left font-medium">Title</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Volume</th>
              <th className="px-4 py-3 text-right font-medium">Resolves</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => (
              <tr
                key={market.id}
                className="border-b border-border-subtle last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-4 py-3 text-text-primary max-w-xs truncate">
                  {market.title}
                </td>
                <td className="px-4 py-3">
                  <MarketStatusBadge status={market.status} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-muted">
                  {formatCompactCurrency(market.total_volume)}
                </td>
                <td className="px-4 py-3 text-right text-text-muted text-xs">
                  {market.resolve_at
                    ? formatRelativeTime(market.resolve_at)
                    : "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  {market.status === "open" && (
                    <Dialog
                      open={resolveTarget?.id === market.id}
                      onOpenChange={(open) =>
                        setResolveTarget(open ? market : null)
                      }
                    >
                      <DialogTrigger
                        render={<Button variant="ghost" size="sm" className="text-caldera" />}
                      >
                        Resolve
                      </DialogTrigger>
                      <DialogContent className="bg-surface border-border-subtle">
                        <DialogHeader>
                          <DialogTitle className="text-text-primary">
                            Resolve Market
                          </DialogTitle>
                        </DialogHeader>
                        <ResolveMarketForm
                          market={market}
                          onResolved={(outcome) => {
                            setMarkets((prev) =>
                              prev.map((m) =>
                                m.id === market.id
                                  ? {
                                      ...m,
                                      status: outcome === "cancelled" ? "cancelled" : "resolved",
                                      resolution_outcome: outcome,
                                    }
                                  : m
                              )
                            );
                            setResolveTarget(null);
                          }}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateMarketForm({
  onCreated,
}: {
  onCreated: (market: Market) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const title = form.get("title") as string;

    try {
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: slugify(title),
          description: form.get("description"),
          category: form.get("category"),
          rulesText: form.get("rulesText"),
          resolutionSourceUrl: form.get("resolutionSourceUrl") || undefined,
          closeAt: form.get("closeAt") || undefined,
          resolveAt: form.get("resolveAt") || undefined,
          initialLiquidity: parseFloat(form.get("initialLiquidity") as string) || 1000,
          featured: form.get("featured") === "on",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create market");
      }

      const { data } = await res.json();
      onCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-text-muted">Title</label>
        <input
          name="title"
          required
          className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Category</label>
        <select
          name="category"
          required
          className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none"
        >
          <option value="crypto">Crypto</option>
          <option value="sports">Sports</option>
          <option value="politics">Politics</option>
          <option value="entertainment">Entertainment</option>
          <option value="creators">Creators</option>
          <option value="trends">Trends</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Description</label>
        <textarea
          name="description"
          rows={2}
          className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none resize-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Rules</label>
        <textarea
          name="rulesText"
          rows={2}
          className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none resize-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Resolution Source URL</label>
        <input
          name="resolutionSourceUrl"
          type="url"
          className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs text-text-muted">Close Date</label>
          <input
            name="closeAt"
            type="datetime-local"
            className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Resolution Date</label>
          <input
            name="resolveAt"
            type="datetime-local"
            className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">
          Initial Liquidity ($)
        </label>
        <input
          name="initialLiquidity"
          type="number"
          defaultValue="1000"
          min="100"
          className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          name="featured"
          type="checkbox"
          id="featured"
          className="rounded border-border-subtle"
        />
        <label htmlFor="featured" className="text-sm text-text-muted">
          Featured
        </label>
      </div>

      {error && <p className="text-xs text-no">{error}</p>}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-caldera text-white hover:bg-caldera/90"
      >
        {isSubmitting ? "Creating..." : "Create Market"}
      </Button>
    </form>
  );
}

function ResolveMarketForm({
  market,
  onResolved,
}: {
  market: Market;
  onResolved: (outcome: string) => void;
}) {
  const [outcome, setOutcome] = useState<string>("yes");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desoPublicKey = useAppStore((s) => s.desoPublicKey);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch(`/api/markets/${market.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          sourceUrl: form.get("sourceUrl") || undefined,
          notes: form.get("notes") || undefined,
          desoPublicKey: desoPublicKey ?? "",
          adminPassword: process.env.NEXT_PUBLIC_ADMIN_PASSWORD,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to resolve");
      }

      onResolved(outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-text-muted">{market.title}</p>

      <div>
        <label className="mb-2 block text-xs text-text-muted">Outcome</label>
        <div className="flex gap-2">
          {["yes", "no", "cancelled"].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setOutcome(opt)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                outcome === opt
                  ? opt === "yes"
                    ? "bg-yes text-white"
                    : opt === "no"
                    ? "bg-no text-white"
                    : "bg-text-muted text-white"
                  : "bg-surface-2 text-text-muted"
              }`}
            >
              {opt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-muted">Source URL</label>
        <input
          name="sourceUrl"
          type="url"
          className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Notes</label>
        <textarea
          name="notes"
          rows={2}
          className="w-full rounded-lg border border-border-subtle bg-background p-2 text-sm text-text-primary focus:border-caldera focus:outline-none resize-none"
        />
      </div>

      {error && <p className="text-xs text-no">{error}</p>}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-caldera text-white hover:bg-caldera/90"
      >
        {isSubmitting ? "Resolving..." : "Confirm Resolution"}
      </Button>
    </form>
  );
}
