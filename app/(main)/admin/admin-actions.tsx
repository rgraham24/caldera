"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Copy, Check } from "lucide-react";
import { slugify } from "@/lib/utils";
import { useAppStore } from "@/store";

export function AdminActions() {
  const { desoPublicKey } = useAppStore();
  const [cycling, setCycling] = useState(false);
  const [cycleStep, setCycleStep] = useState<string | null>(null);
  const [cycleResult, setCycleResult] = useState<string | null>(null);

  const [queueingDeso, setQueueingDeso] = useState(false);
  const [queueDesoResult, setQueueDesoResult] = useState<string | null>(null);
  const [processingDeso, setProcessingDeso] = useState(false);
  const [processDesoResult, setProcessDesoResult] = useState<string | null>(null);

  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);

  const [cleaningSquatters, setCleaningSquatters] = useState(false);
  const [cleanSquattersResult, setCleanSquattersResult] = useState<string | null>(null);

  const [curating, setCurating] = useState(false);
  const [curateResult, setCurateResult] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<string | null>(null);

  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const [generatingForImported, setGeneratingForImported] = useState(false);
  const [generateForImportedResult, setGenerateForImportedResult] = useState<string | null>(null);

  const [categoryTokenImporting, setCategoryTokenImporting] = useState(false);
  const [categoryTokenResult, setCategoryTokenResult] = useState<string | null>(null);

  const [generatingCategorical, setGeneratingCategorical] = useState(false);
  const [categoricalResult, setCategoricalResult] = useState<string | null>(null);

  const [batchIndex, setBatchIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [marqueeImporting, setMarqueeImporting] = useState(false);
  const [marqueeResult, setMarqueeResult] = useState<string | null>(null);

  const [reservedImporting, setReservedImporting] = useState(false);
  const [reservedResult, setReservedResult] = useState<string | null>(null);
  const [reservedPass, setReservedPass] = useState<number | null>(null);

  // Resolution queue
  const [resolutionQueue, setResolutionQueue] = useState<ResolutionMarket[]>([]);
  const [resolutionLoading, setResolutionLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [autoResolving, setAutoResolving] = useState(false);
  const [autoResolveResult, setAutoResolveResult] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedMarkets, setGeneratedMarkets] = useState<GeneratedMarket[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [creatingIdx, setCreatingIdx] = useState<number | null>(null);

  // Claim codes
  const [claimCodes, setClaimCodes] = useState<ClaimCodeRow[]>([]);
  const [claimCodesLoaded, setClaimCodesLoaded] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [singleSlug, setSingleSlug] = useState("");
  const [singleGenerating, setSingleGenerating] = useState(false);

  const handleCycle = async () => {
    setCycling(true);
    setCycleResult(null);
    setCycleStep("Running full autonomous cycle (up to 5 min)...");

    try {
      const res = await fetch("/api/admin/autonomous-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "" }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const { entities, markets_created, dates_fixed, featured_updated } = json.data;
      setCycleResult(
        `✓ Discovered ${entities} entities · Created ${markets_created} markets · ${dates_fixed} dates fixed · ${featured_updated} featured`
      );
    } catch (err) {
      setCycleResult(`Error: ${err instanceof Error ? err.message : "Cycle failed"}`);
    } finally {
      setCycling(false);
      setCycleStep(null);
    }
  };

  const handleCurate = async () => {
    setCurating(true);
    setCurateResult(null);
    try {
      const res = await fetch("/api/admin/curate-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "" }),
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

  const handleValidate = async () => {
    setValidating(true);
    setValidateResult(null);
    try {
      const res = await fetch("/api/admin/validate-existing-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "" }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setValidateResult(data.message);
    } catch (err) {
      setValidateResult(`Error: ${err instanceof Error ? err.message : "Validation failed"}`);
    } finally {
      setValidating(false);
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/admin/backfill-slugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "" }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBackfillResult(`✅ Fixed ${data.fixed} markets with creator tokens`);
    } catch (err) {
      setBackfillResult(`Error: ${err instanceof Error ? err.message : "Backfill failed"}`);
    } finally {
      setBackfilling(false);
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

  const handleMarqueeImport = async () => {
    setMarqueeImporting(true);
    setMarqueeResult(null);
    try {
      const res = await fetch("/api/admin/import-marquee-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "" }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMarqueeResult(
        `✅ ${json.fromDeso} from DeSo · ${json.fromShadow} new shadows · ${json.alreadyExisted} already existed`
      );
    } catch (err) {
      setMarqueeResult(`Error: ${err instanceof Error ? err.message : "Import failed"}`);
    } finally {
      setMarqueeImporting(false);
    }
  };

  const handleReservedImport = async (opts: { resetPass?: boolean } = {}) => {
    setReservedImporting(true);
    setReservedResult(null);
    try {
      const res = await fetch("/api/admin/import-reserved-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desoPublicKey: desoPublicKey ?? "",
          resetPass: opts.resetPass ?? false,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setReservedPass(json.nextPass ?? null);
      setReservedResult(
        `✅ ${json.imported} imported · ${json.skipped} skipped · ${json.profilesFetched} fetched · ${json.message}`
      );
    } catch (err) {
      setReservedResult(`Error: ${err instanceof Error ? err.message : "Import failed"}`);
    } finally {
      setReservedImporting(false);
    }
  };

  const handleGenerateForImported = async () => {
    setGeneratingForImported(true);
    setGenerateForImportedResult(null);
    try {
      const res = await fetch("/api/admin/generate-for-imported", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "", limit: 20 }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setGenerateForImportedResult(`✅ Created ${json.marketsCreated} markets for imported creators`);
    } catch (err) {
      setGenerateForImportedResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setGeneratingForImported(false);
    }
  };

  const handleGenerateCategorical = async () => {
    setGeneratingCategorical(true);
    setCategoricalResult(null);
    try {
      const res = await fetch("/api/admin/generate-categorical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "" }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setCategoricalResult(`✅ Generated ${json.generated} categorical markets`);
    } catch (err) {
      setCategoricalResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setGeneratingCategorical(false);
    }
  };

  const handleCategoryTokenImport = async () => {
    setCategoryTokenImporting(true);
    setCategoryTokenResult(null);
    try {
      const res = await fetch("/api/admin/import-category-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "" }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setCategoryTokenResult(
        "✅ ConflictMarkets, ElectionMarkets, SportsMarkets, ViralMarkets, CryptoMarkets1, EntertainmentMarkets imported as active_verified"
      );
    } catch (err) {
      setCategoryTokenResult(`Error: ${err instanceof Error ? err.message : "Import failed"}`);
    } finally {
      setCategoryTokenImporting(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/admin/bulk-import-deso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchIndex,
          minHolders: 0,
          desoPublicKey: desoPublicKey ?? "",
        }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      if (data.message) {
        setImportResult(`🎉 ${data.message}`);
        return;
      }
      if (data.hasMore) {
        setBatchIndex(data.nextBatchIndex);
        setImportResult(
          `✅ Batch ${data.batchIndex + 1}/${data.totalBatches}: imported ${data.totalImported}, skipped ${data.totalSkipped} (${data.elapsed}ms). Click Import for next batch.`
        );
      } else {
        setImportResult(
          `🎉 All batches complete! Last batch: imported ${data.totalImported}, skipped ${data.totalSkipped}.`
        );
      }
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
        body: JSON.stringify({ topic, desoPublicKey: desoPublicKey ?? "" }),
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

  const loadClaimCodes = async () => {
    try {
      const res = await fetch(`/api/admin/generate-claim-code?desoPublicKey=${encodeURIComponent(desoPublicKey ?? "")}`);
      const { data } = await res.json();
      setClaimCodes(data ?? []);
      setClaimCodesLoaded(true);
    } catch { setClaimCodesLoaded(true); }
  };

  const handleBulkGenerate = async () => {
    setBulkGenerating(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/admin/generate-claim-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "", bulk: true }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setBulkResult(`Generated ${data.generated} claim codes`);
      loadClaimCodes();
    } catch (err) {
      setBulkResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setBulkGenerating(false);
    }
  };

  const handleSingleGenerate = async () => {
    if (!singleSlug.trim()) return;
    setSingleGenerating(true);
    try {
      const res = await fetch("/api/admin/generate-claim-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "", slug: singleSlug.trim() }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setBulkResult(`Code generated: ${data.code}`);
      setSingleSlug("");
      loadClaimCodes();
    } catch (err) {
      setBulkResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setSingleGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const loadResolutionQueue = async () => {
    setResolutionLoading(true);
    try {
      const res = await fetch("/api/admin/markets-to-resolve");
      const json = await res.json();
      setResolutionQueue(json.markets ?? []);
    } catch {
      setResolutionQueue([]);
    } finally {
      setResolutionLoading(false);
    }
  };

  const resolveMarket = async (marketId: string, outcome: "yes" | "no" | "void") => {
    setResolvingId(marketId);
    try {
      const res = await fetch("/api/admin/resolve-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, outcome, desoPublicKey: desoPublicKey ?? "" }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResolutionQueue((q) => q.filter((m) => m.id !== marketId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setResolvingId(null);
    }
  };

  const handleAutoResolve = async () => {
    setAutoResolving(true);
    setAutoResolveResult(null);
    try {
      const res = await fetch("/api/admin/resolve-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? "" }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAutoResolveResult(`✅ AI resolved ${json.resolved} markets · ${json.flagged} flagged for review`);
      loadResolutionQueue();
    } catch (err) {
      setAutoResolveResult(`Error: ${err instanceof Error ? err.message : "Auto-resolve failed"}`);
    } finally {
      setAutoResolving(false);
    }
  };

  const handleAuditProfiles = async () => {
    setAuditing(true);
    setAuditResult(null);
    try {
      const res = await fetch('/api/admin/audit-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? '' }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAuditResult(`✅ ${json.fixed} legitimate profiles confirmed · ${json.removed} fan accounts removed & queued for re-creation`);
    } catch (err) {
      setAuditResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setAuditing(false);
    }
  };

  const handleCleanSquatters = async () => {
    setCleaningSquatters(true);
    setCleanSquattersResult(null);
    try {
      const res = await fetch('/api/admin/clean-squatters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? '' }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setCleanSquattersResult(`✅ ${json.cleaned} squatter profiles stripped & queued for platform wallet creation`);
    } catch (err) {
      setCleanSquattersResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setCleaningSquatters(false);
    }
  };

  const handleQueueDeso = async () => {
    setQueueingDeso(true);
    setQueueDesoResult(null);
    try {
      const res = await fetch('/api/admin/queue-deso-creation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? '' }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setQueueDesoResult(`✅ Queued ${json.queued} creators for DeSo profile creation`);
    } catch (err) {
      setQueueDesoResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setQueueingDeso(false);
    }
  };

  const handleProcessDeso = async () => {
    setProcessingDeso(true);
    setProcessDesoResult(null);
    try {
      const res = await fetch('/api/admin/process-deso-creation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desoPublicKey: desoPublicKey ?? '' }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setProcessDesoResult(`✅ ${json.created} profiles created · ${json.failed} failed`);
    } catch (err) {
      setProcessDesoResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setProcessingDeso(false);
    }
  };

  // Load resolution queue on mount
  useEffect(() => { loadResolutionQueue(); }, []);

  return (
    <div className="space-y-6">
      {/* Autonomous Cycle */}
      <div className="rounded-2xl border border-caldera/30 bg-caldera/5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-caldera">⚡ Autonomous Market Cycle</h2>
        <p className="mb-4 text-xs text-text-muted">
          Discovers 15 hot entities, generates 10 markets each, fixes stale dates, and curates the homepage — all in one shot. Also runs automatically every 6 hours via cron.
        </p>
        <Button
          onClick={handleCycle}
          disabled={cycling}
          className="bg-caldera text-background font-semibold hover:bg-caldera/90"
        >
          {cycling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {cycling ? (cycleStep ?? "Starting...") : "Run Autonomous Cycle"}
        </Button>
        {cycleResult && (
          <p className={`mt-3 text-xs ${cycleResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {cycleResult}
          </p>
        )}
      </div>

      {/* Markets to Resolve */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-amber-400">⚖️ Markets to Resolve ({resolutionQueue.length})</h2>
          <div className="flex gap-2">
            <Button
              onClick={handleAutoResolve}
              disabled={autoResolving || resolutionQueue.length === 0}
              size="sm"
              className="bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-xs font-semibold"
            >
              {autoResolving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {autoResolving ? "Running AI..." : "Auto-Resolve with AI"}
            </Button>
            <Button
              onClick={loadResolutionQueue}
              disabled={resolutionLoading}
              size="sm"
              variant="outline"
              className="text-xs border-border-subtle text-text-muted"
            >
              {resolutionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </div>

        {autoResolveResult && (
          <p className={`mb-3 text-xs ${autoResolveResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {autoResolveResult}
          </p>
        )}

        {resolutionLoading && resolutionQueue.length === 0 && (
          <p className="text-xs text-text-muted">Loading...</p>
        )}
        {!resolutionLoading && resolutionQueue.length === 0 && (
          <p className="text-xs text-text-muted">No markets pending resolution.</p>
        )}

        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {resolutionQueue.map((market) => {
            const daysOverdue = Math.floor(
              (Date.now() - new Date(market.resolve_at).getTime()) / 86400000
            );
            const isResolving = resolvingId === market.id;
            return (
              <div
                key={market.id}
                className="flex items-center justify-between p-3 border border-border-subtle rounded-lg bg-surface"
              >
                <div className="flex-1 mr-4 min-w-0">
                  <div className="text-sm font-medium text-text-primary line-clamp-1">{market.title}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {market.category} · Expired {daysOverdue}d ago
                    {market.creator_slug && ` · $${market.creator_slug}`}
                    {" · "}{Math.round((market.yes_price ?? 0.5) * 100)}% YES
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => resolveMarket(market.id, "yes")}
                    disabled={isResolving}
                    className="text-xs bg-green-500/10 text-green-400 border border-green-500/30 rounded px-2 py-1 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                  >
                    YES
                  </button>
                  <button
                    onClick={() => resolveMarket(market.id, "no")}
                    disabled={isResolving}
                    className="text-xs bg-red-500/10 text-red-400 border border-red-500/30 rounded px-2 py-1 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                  >
                    NO
                  </button>
                  <button
                    onClick={() => resolveMarket(market.id, "void")}
                    disabled={isResolving}
                    className="text-xs bg-zinc-500/10 text-zinc-400 border border-zinc-500/30 rounded px-2 py-1 hover:bg-zinc-500/20 disabled:opacity-50 transition-colors"
                  >
                    VOID
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generate Categorical Markets */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">🎯 Generate Categorical Markets</h2>
        <p className="mb-4 text-xs text-text-muted">
          Generates multi-outcome prediction markets (NBA MVP, UFC champion, elections, etc.) with probability-weighted outcomes. Populates the market_outcomes table.
        </p>
        <Button
          onClick={handleGenerateCategorical}
          disabled={generatingCategorical}
          className="bg-caldera text-background font-semibold hover:bg-caldera/90"
        >
          {generatingCategorical && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {generatingCategorical ? "Generating..." : "Generate Categorical Markets"}
        </Button>
        {categoricalResult && (
          <p className={`mt-3 text-xs ${categoricalResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {categoricalResult}
          </p>
        )}
      </div>

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

      {/* Validate & Clean Stale Markets */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">🧹 Validate & Clean Stale Markets</h2>
        <p className="mb-4 text-xs text-text-muted">
          Runs the relevance gatekeeper on all open markets created in the last 7 days. Markets that fail (already resolved, stale drama, too generic) are permanently deleted.
        </p>
        <Button
          onClick={handleValidate}
          disabled={validating}
          className="bg-no/80 text-white font-semibold hover:bg-no"
        >
          {validating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {validating ? "Validating..." : "Validate & Clean Stale Markets"}
        </Button>
        {validateResult && (
          <p className={`mt-3 text-xs ${validateResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {validateResult}
          </p>
        )}
      </div>

      {/* Fix Missing Tokens (Backfill) */}
      <div className="rounded-2xl border border-orange-500/20 bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">🔗 Fix Missing Tokens (Backfill)</h2>
        <p className="mb-4 text-xs text-text-muted">
          Scans up to 100 open markets with no creator token linked. Extracts entity names from titles,
          queries local DB + entity registry + live DeSo API, and patches any matches found.
          Safe to re-run — only updates markets that currently have no creator_slug.
        </p>
        <Button
          onClick={handleBackfill}
          disabled={backfilling}
          className="bg-orange-500 text-white font-semibold hover:bg-orange-600"
        >
          {backfilling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {backfilling ? "Backfilling (up to 2 min)..." : "🔗 Fix Missing Tokens (Backfill 100)"}
        </Button>
        {backfillResult && (
          <p className={`mt-3 text-xs ${backfillResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {backfillResult}
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

      {/* Import Marquee Profiles */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">🌟 Import Marquee Profiles (DeSo-First)</h2>
        <p className="mb-4 text-xs text-text-muted">
          Imports ~90 marquee celebrities, athletes, pundits, and streamers. Tries each DeSo username variant first — real on-chain data if found, shadow profile otherwise. Creates team + league tokens automatically. Safe to re-run (idempotent). Takes ~60 seconds.
        </p>
        <Button
          onClick={handleMarqueeImport}
          disabled={marqueeImporting}
          className="bg-caldera text-background font-semibold hover:bg-caldera/90"
        >
          {marqueeImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {marqueeImporting ? "Importing (~60s)..." : "Import Marquee Profiles"}
        </Button>
        {marqueeResult && (
          <p className={`mt-3 text-xs ${marqueeResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {marqueeResult}
          </p>
        )}
      </div>

      {/* Import Reserved Profiles */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">🔖 Import Reserved Profiles (28-Pass Strategy)</h2>
        <p className="mb-3 text-xs text-text-muted">
          28 passes total: pass 1 = top by price, pass 2 = newest, passes 3–28 = username prefix a→z. Each click runs the next pass (~100 profiles). Click 28 times for full coverage.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            onClick={() => handleReservedImport()}
            disabled={reservedImporting}
            className="bg-caldera text-background font-semibold hover:bg-caldera/90"
          >
            {reservedImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {reservedImporting
              ? "Importing..."
              : reservedPass
              ? `Import Next Batch (Pass ${reservedPass} of 28)`
              : "Import Next Batch (Pass 1 of 28)"}
          </Button>
          <Button
            onClick={() => handleReservedImport({ resetPass: true })}
            disabled={reservedImporting}
            variant="outline"
            className="border-border-subtle text-text-muted hover:text-text-primary text-xs"
          >
            Restart from Pass 1
          </Button>
        </div>
        {reservedResult && (
          <p className={`mt-1 text-xs ${reservedResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {reservedResult}
          </p>
        )}
      </div>

      {/* Generate Markets for Imported Creators */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">🎯 Generate Markets for Imported Creators</h2>
        <p className="mb-4 text-xs text-text-muted">
          Targets active_unverified creators with 0 markets. Run multiple times to cover all creators.
        </p>
        <Button
          onClick={handleGenerateForImported}
          disabled={generatingForImported}
          className="bg-caldera text-background font-semibold hover:bg-caldera/90"
        >
          {generatingForImported && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {generatingForImported ? "Generating..." : "Generate Markets for Imported Creators"}
        </Button>
        {generateForImportedResult && (
          <p className={`mt-3 text-xs ${generateForImportedResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {generateForImportedResult}
          </p>
        )}
      </div>

      {/* Import Category Tokens */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">🎯 Import Category Tokens</h2>
        <p className="mb-4 text-xs text-text-muted">
          Imports ConflictMarkets, ElectionMarkets, SportsMarkets, ViralMarkets, CryptoMarkets1, and EntertainmentMarkets as active_verified. These earn auto-buy fees from every market in their category. Safe to re-run.
        </p>
        <Button
          onClick={handleCategoryTokenImport}
          disabled={categoryTokenImporting}
          className="bg-caldera text-background font-semibold hover:bg-caldera/90"
        >
          {categoryTokenImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {categoryTokenImporting ? "Importing..." : "Import Category Tokens"}
        </Button>
        {categoryTokenResult && (
          <p className={`mt-3 text-xs ${categoryTokenResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {categoryTokenResult}
          </p>
        )}
      </div>

      {/* Import DeSo Profiles */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Import DeSo Profiles</h2>
        <p className="mb-4 text-xs text-text-muted">
          Fetches curated known usernames in parallel using get-single-profile. 10 batches total — click Import after each to advance. Fast: ~2s per batch.
        </p>
        <Button
          onClick={handleImport}
          disabled={importing}
          className="bg-caldera text-background font-semibold hover:bg-caldera/90"
        >
          {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {importing ? "Importing..." : `Import Batch ${batchIndex + 1} of 10`}
        </Button>
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

      {/* Claim Codes Manager */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">🔑 Claim Codes</h2>
            <p className="mt-1 text-xs text-text-muted">Generate shareable /claim/[code] URLs for unclaimed creators</p>
          </div>
          {!claimCodesLoaded && (
            <Button variant="outline" size="sm" onClick={loadClaimCodes} className="text-xs">
              Load Codes
            </Button>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <Button
            onClick={handleBulkGenerate}
            disabled={bulkGenerating}
            className="bg-caldera text-background font-semibold hover:bg-caldera/90 text-xs"
            size="sm"
          >
            {bulkGenerating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Generate for Top 20 Unclaimed
          </Button>
          <div className="flex gap-2">
            <input
              type="text"
              value={singleSlug}
              onChange={(e) => setSingleSlug(e.target.value)}
              placeholder="creator-slug"
              className="rounded-lg border border-border-subtle bg-background px-3 py-1.5 text-xs text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleSingleGenerate()}
            />
            <Button
              onClick={handleSingleGenerate}
              disabled={singleGenerating || !singleSlug.trim()}
              size="sm"
              className="text-xs"
              variant="outline"
            >
              {singleGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {bulkResult && (
          <p className={`mb-3 text-xs ${bulkResult.startsWith("Error") ? "text-no" : "text-yes"}`}>
            {bulkResult}
          </p>
        )}

        {claimCodesLoaded && claimCodes.length === 0 && (
          <p className="text-xs text-text-faint">No claim codes yet. Generate some above.</p>
        )}

        {claimCodes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-left text-text-muted">
                  <th className="pb-2 pr-4 font-medium">Slug</th>
                  <th className="pb-2 pr-4 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">URL</th>
                </tr>
              </thead>
              <tbody>
                {claimCodes.map((row) => (
                  <tr key={row.id} className="border-b border-border-subtle/50">
                    <td className="py-2 pr-4 font-medium text-text-primary">{row.slug}</td>
                    <td className="py-2 pr-4 font-mono text-caldera">{row.code}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${
                        row.status === "claimed" ? "bg-yes/10 text-yes" :
                        row.status === "expired" ? "bg-no/10 text-no" :
                        "bg-caldera/10 text-caldera"
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="max-w-[200px] truncate text-text-muted">{row.claimUrl}</span>
                        <button
                          onClick={() => copyToClipboard(row.claimUrl, row.id)}
                          className="shrink-0 rounded p-1 text-text-muted hover:text-text-primary transition-colors"
                        >
                          {copiedCode === row.id ? <Check className="h-3.5 w-3.5 text-yes" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Reserved Profiles */}
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-red-400">🔍 Audit & Fix Reserved Profiles</h2>
        <p className="mb-4 text-xs text-text-muted">
          Scans creators with <code className="text-red-400">is_reserved=false</code> and fewer than 100 holders. Verifies each against the live DeSo API — fan accounts get stripped and queued for platform wallet re-creation. Legitimate profiles get their data refreshed.
        </p>
        <Button
          onClick={handleAuditProfiles}
          disabled={auditing}
          className="bg-red-600 text-white font-semibold hover:bg-red-700"
        >
          {auditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {auditing ? 'Auditing (up to 2 min)...' : '🔍 Audit & Fix Reserved Profiles (100)'}
        </Button>
        {auditResult && (
          <p className={`mt-3 text-xs ${auditResult.startsWith('Error') ? 'text-no' : 'text-yes'}`}>
            {auditResult}
          </p>
        )}
      </div>

      {/* Clean Squatter Profiles */}
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-red-400">🧹 Clean Squatter Profiles</h2>
        <p className="mb-4 text-xs text-text-muted">
          Permanent enforcement of the reserved-only rule. Scans up to 200 creators with{' '}
          <code className="text-red-400">is_reserved=false</code> and fewer than 100 holders. Verifies each
          live on DeSo — squatter accounts get their DeSo link stripped and are queued for platform wallet
          re-creation. A creator slug is only valid if the DeSo profile is reserved OR has 100+ coin holders.
        </p>
        <Button
          onClick={handleCleanSquatters}
          disabled={cleaningSquatters}
          className="bg-red-600 text-white font-semibold hover:bg-red-700"
        >
          {cleaningSquatters && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {cleaningSquatters ? 'Cleaning (up to 2 min)...' : '🧹 Clean Squatter Profiles (200)'}
        </Button>
        {cleanSquattersResult && (
          <p className={`mt-3 text-xs ${cleanSquattersResult.startsWith('Error') ? 'text-no' : 'text-yes'}`}>
            {cleanSquattersResult}
          </p>
        )}
      </div>

      {/* DeSo Profile Creation */}
      <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-purple-400">🪙 DeSo Profile Creation</h2>
        <p className="mb-4 text-xs text-text-muted">
          Auto-creates DeSo profiles for every creator using the Caldera platform wallet. Creators without a DeSo username get tokenized automatically — no manual intervention needed.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleQueueDeso}
            disabled={queueingDeso}
            className="bg-purple-600 text-white font-semibold hover:bg-purple-700"
          >
            {queueingDeso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {queueingDeso ? 'Queuing...' : 'Queue All Creators for DeSo Creation'}
          </Button>
          <Button
            onClick={handleProcessDeso}
            disabled={processingDeso}
            variant="outline"
            className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10 font-semibold"
          >
            {processingDeso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {processingDeso ? 'Processing (~20s)...' : 'Process Now (10 profiles)'}
          </Button>
        </div>
        {queueDesoResult && (
          <p className={`mt-3 text-xs ${queueDesoResult.startsWith('Error') ? 'text-no' : 'text-yes'}`}>
            {queueDesoResult}
          </p>
        )}
        {processDesoResult && (
          <p className={`mt-2 text-xs ${processDesoResult.startsWith('Error') ? 'text-no' : 'text-yes'}`}>
            {processDesoResult}
          </p>
        )}
      </div>
    </div>
  );
}

type ResolutionMarket = {
  id: string;
  title: string;
  category: string;
  creator_slug: string | null;
  yes_price: number | null;
  total_volume: number | null;
  resolve_at: string;
};

type GeneratedMarket = {
  title: string;
  description: string;
  category: string;
  resolution_criteria: string;
  resolve_at: string;
  created?: boolean;
};

type ClaimCodeRow = {
  id: string;
  slug: string;
  code: string;
  status: string;
  claimUrl: string;
  created_at: string;
  claimed_at: string | null;
};
