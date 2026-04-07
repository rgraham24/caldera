"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { slugify } from "@/lib/utils";

const ADMIN_PASSWORD = "caldera-admin-2026";

export function AdminActions() {
  const [curating, setCurating] = useState(false);
  const [curateResult, setCurateResult] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [importCount, setImportCount] = useState(100);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedMarkets, setGeneratedMarkets] = useState<GeneratedMarket[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [creatingIdx, setCreatingIdx] = useState<number | null>(null);

  const handleCurate = async () => {
    setCurating(true);
    setCurateResult(null);
    try {
      const res = await fetch("/api/admin/curate-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setCurateResult(`Featured ${data.featured} markets from ${data.total_evaluated} evaluated`);
    } catch (err) {
      setCurateResult(`Error: ${err instanceof Error ? err.message : "Curation failed"}`);
    } finally {
      setCurating(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/creators/sync-from-deso");
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setSyncResult(`Synced ${data.synced} creators from DeSo blockchain`);
    } catch (err) {
      setSyncResult(`Error: ${err instanceof Error ? err.message : "Sync failed"}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/admin/import-deso-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: importCount, adminPassword: ADMIN_PASSWORD }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setImportResult(`Imported ${data.imported}, skipped ${data.skipped} of ${data.total} profiles`);
    } catch (err) {
      setImportResult(`Error: ${err instanceof Error ? err.message : "Import failed"}`);
    } finally {
      setImporting(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setGenError(null);
    setGeneratedMarkets([]);
    try {
      const res = await fetch("/api/admin/generate-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, adminPassword: ADMIN_PASSWORD }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setGeneratedMarkets(data);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateMarket = async (market: GeneratedMarket, idx: number) => {
    setCreatingIdx(idx);
    try {
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: market.title,
          slug: slugify(market.title),
          description: market.description,
          category: market.category,
          rulesText: market.resolution_criteria,
          resolveAt: market.resolve_at,
          initialLiquidity: 1000,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create");
      }
      setGeneratedMarkets((prev) =>
        prev.map((m, i) => (i === idx ? { ...m, created: true } : m))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create market");
    } finally {
      setCreatingIdx(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Homepage Curation */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">AI Homepage Curation</h2>
        <p className="mb-4 text-xs text-text-muted">
          Claude evaluates the top 50 markets by volume + 24h activity and picks the 8 best for homepage featuring.
        </p>
        <Button
          onClick={handleCurate}
          disabled={curating}
          className="bg-caldera text-background font-semibold hover:bg-caldera/90"
        >
          {curating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {curating ? "Curating..." : "Curate Homepage"}
        </Button>
        {curateResult && (
          <p className={`mt-3 text-xs ${curateResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {curateResult}
          </p>
        )}
      </div>

      {/* DeSo Sync */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">DeSo Sync</h2>
        <p className="mb-4 text-xs text-text-muted">
          Pull the top creator profiles from the DeSo blockchain and update the database.
        </p>
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="bg-caldera text-background font-semibold hover:bg-caldera/90"
        >
          {syncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {syncing ? "Syncing..." : "Sync Creators from DeSo"}
        </Button>
        {syncResult && (
          <p className={`mt-3 text-xs ${syncResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {syncResult}
          </p>
        )}
      </div>

      {/* Import DeSo Profiles */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Import DeSo Profiles</h2>
        <p className="mb-4 text-xs text-text-muted">
          Bulk import creator profiles from DeSo ordered by coin price. Upserts on slug.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={1000}
            value={importCount}
            onChange={(e) => setImportCount(Number(e.target.value))}
            className="w-24 rounded-lg border border-border-subtle bg-background px-3 py-1.5 text-sm text-text-primary focus:border-caldera focus:outline-none"
          />
          <span className="text-xs text-text-muted">profiles</span>
          <Button
            onClick={handleImport}
            disabled={importing}
            className="bg-caldera text-background font-semibold hover:bg-caldera/90"
          >
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {importing ? "Importing..." : "Import Profiles"}
          </Button>
        </div>
        {importResult && (
          <p className={`mt-3 text-xs ${importResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {importResult}
          </p>
        )}
      </div>

      {/* AI Market Generator */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">AI Market Generator ✦ Research-Powered</h2>
        <p className="mb-4 text-xs text-text-muted">
          Enter any creator, topic, or event. Claude researches what&apos;s happening right now, then generates 10 high-urgency prediction markets.
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Elon Musk and Tesla in 2026"
            className="flex-1 rounded-lg border border-border-subtle bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          />
          <Button
            onClick={handleGenerate}
            disabled={generating || !topic.trim()}
            className="bg-caldera text-background font-semibold hover:bg-caldera/90"
          >
            {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {generating ? "Researching + Generating..." : "Generate 10 Markets"}
          </Button>
        </div>

        {genError && <p className="mt-3 text-xs text-no">{genError}</p>}

        {generatedMarkets.length > 0 && (
          <div className="mt-4 space-y-3">
            {generatedMarkets.map((market, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border-subtle bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary leading-snug">
                      {market.title}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">{market.description}</p>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-text-faint">
                      <span className="capitalize">{market.category}</span>
                      <span>·</span>
                      <span>Resolves {new Date(market.resolve_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleCreateMarket(market, idx)}
                    disabled={creatingIdx === idx || market.created}
                    className={
                      market.created
                        ? "bg-yes/20 text-yes border border-yes/30 cursor-default"
                        : "bg-caldera text-background hover:bg-caldera/90"
                    }
                  >
                    {market.created ? (
                      "✓ Created"
                    ) : creatingIdx === idx ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <><Plus className="mr-1 h-3.5 w-3.5" /> Create</>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type GeneratedMarket = {
  title: string;
  description: string;
  category: string;
  resolution_criteria: string;
  resolve_at: string;
  created?: boolean;
};
