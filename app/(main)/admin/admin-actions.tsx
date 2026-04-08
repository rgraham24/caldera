"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Copy, Check } from "lucide-react";
import { slugify } from "@/lib/utils";

const ADMIN_PASSWORD = "caldera-admin-2026";

export function AdminActions() {
  const [cycling, setCycling] = useState(false);
  const [cycleStep, setCycleStep] = useState<string | null>(null);
  const [cycleResult, setCycleResult] = useState<string | null>(null);

  const [curating, setCurating] = useState(false);
  const [curateResult, setCurateResult] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<string | null>(null);

  const [importCount, setImportCount] = useState(100);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [marqueeImporting, setMarqueeImporting] = useState(false);
  const [marqueeResult, setMarqueeResult] = useState<string | null>(null);

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
        body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
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

  const handleValidate = async () => {
    setValidating(true);
    setValidateResult(null);
    try {
      const res = await fetch("/api/admin/validate-existing-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
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
        body: JSON.stringify({ password: ADMIN_PASSWORD }),
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

  const loadClaimCodes = async () => {
    try {
      const res = await fetch(`/api/admin/generate-claim-code?adminPassword=${ADMIN_PASSWORD}`);
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
        body: JSON.stringify({ adminPassword: ADMIN_PASSWORD, bulk: true }),
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
        body: JSON.stringify({ adminPassword: ADMIN_PASSWORD, slug: singleSlug.trim() }),
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

type ClaimCodeRow = {
  id: string;
  slug: string;
  code: string;
  status: string;
  claimUrl: string;
  created_at: string;
  claimed_at: string | null;
};
