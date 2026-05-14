"use client";

/**
 * Fan-created market wizard. Four steps:
 *   1. Pick a creator (search via /api/creators/search)
 *   2. Pick a subscriber milestone (presets + free input)
 *   3. Pick a deadline (3/6/12 month chips + date input)
 *   4. Preview + submit → /api/markets/create-fan with
 *      marketType='youtube_subscribers'
 *
 * Chrome modeled on ClaimProfileModal — bottom-sheet on mobile,
 * centered on desktop, drag handle on small screens. Wallet gating
 * defers to the existing connect flow; the create-fan endpoint
 * enforces wallet + IP rate limit + creator-validity server-side.
 *
 * Auto-resolution is NOT live yet — the YouTube API isn't wired.
 * Markets created here are admin-resolved until that lands.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Search } from "lucide-react";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { getCreatorDisplayName } from "@/lib/creators/displayName";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";

type Step = 1 | 2 | 3 | 4;

type CreatorPick = {
  id: string;
  slug: string;
  name: string;
  deso_username: string | null;
  deso_public_key: string | null;
};

type YouTubeStats = {
  channelId: string;
  handle: string | null;
  title: string;
  subscriberCount: number;
  thumbnailUrl: string | null;
  cached: boolean;
  fetchedAt: string;
};

type YoutubeLookupState = "idle" | "loading" | "found" | "not_found" | "error";

type CreateMarketModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const MILESTONE_CHIPS = [
  { label: "1M", value: 1_000_000 },
  { label: "10M", value: 10_000_000 },
  { label: "50M", value: 50_000_000 },
  { label: "100M", value: 100_000_000 },
  { label: "200M", value: 200_000_000 },
];

const DEADLINE_CHIPS = [
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "12 months", months: 12 },
];

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function dateForInput(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addMonths(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function CreateMarketModal({ isOpen, onClose }: CreateMarketModalProps) {
  const router = useRouter();
  const { isConnected, desoPublicKey } = useAppStore();

  const [step, setStep] = useState<Step>(1);
  const [selectedCreator, setSelectedCreator] = useState<CreatorPick | null>(null);
  const [targetSubscribers, setTargetSubscribers] = useState<number>(1_000_000);
  const [resolveAt, setResolveAt] = useState<Date>(addMonths(3));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 1 search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreatorPick[]>([]);
  const [loading, setLoading] = useState(false);

  // YouTube prefetch — populated when a creator is picked in Step 1
  // and consumed by Step 2 (Phase 3 will use subscriberCount to size
  // milestone chips; this phase just wires the data fetch).
  const [youtubeStats, setYoutubeStats] = useState<YouTubeStats | null>(null);
  const [youtubeLookupState, setYoutubeLookupState] =
    useState<YoutubeLookupState>("idle");
  // Tracks the latest lookup's AbortController. A user picking a
  // different creator (or closing the modal) aborts the previous
  // request so a slow A-lookup can't overwrite a fresh B-result.
  const youtubeAbortRef = useRef<AbortController | null>(null);

  // Reset all state when the modal opens. Avoids stale step / creator
  // bleeding into the next open.
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSelectedCreator(null);
    setTargetSubscribers(1_000_000);
    setResolveAt(addMonths(3));
    setSubmitting(false);
    setSubmitError(null);
    setQuery("");
    setResults([]);
    setYoutubeStats(null);
    setYoutubeLookupState("idle");
  }, [isOpen]);

  // Debounced creator search. Empty query returns the top 20 by
  // markets_count — the same default behavior /api/creators/search
  // provides on empty q.
  useEffect(() => {
    if (!isOpen || step !== 1) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/creators/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const json = await res.json();
        setResults((json.creators ?? []) as CreatorPick[]);
      } catch {
        // Aborts throw; ignore.
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen, step]);

  if (!isOpen) return null;

  const displayName = selectedCreator ? getCreatorDisplayName(selectedCreator) : "";
  const youtubeHandle = selectedCreator?.deso_username ?? "";

  const previewTitle = selectedCreator
    ? `Will ${displayName}'s YouTube channel cross ${targetSubscribers.toLocaleString()} subscribers by ${formatDate(resolveAt)}?`
    : "";

  const handleSelectCreator = (c: CreatorPick) => {
    setSelectedCreator(c);
    setStep(2);

    // Cancel any in-flight lookup from a previously selected creator.
    youtubeAbortRef.current?.abort();
    const controller = new AbortController();
    youtubeAbortRef.current = controller;

    setYoutubeStats(null);
    setYoutubeLookupState("loading");

    (async () => {
      try {
        const res = await fetch(
          `/api/creators/${encodeURIComponent(c.slug)}/youtube`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        if (res.status === 404) {
          setYoutubeLookupState("not_found");
          return;
        }
        if (!res.ok) {
          setYoutubeLookupState("error");
          return;
        }
        const json = (await res.json()) as { youtube?: YouTubeStats };
        if (controller.signal.aborted) return;
        if (json.youtube) {
          setYoutubeStats(json.youtube);
          setYoutubeLookupState("found");
        } else {
          setYoutubeLookupState("not_found");
        }
      } catch (err) {
        // AbortError is the expected path when the user picks a new
        // creator before the previous lookup resolves — silent.
        if ((err as { name?: string })?.name === "AbortError") return;
        console.error("[create-market] youtube lookup failed:", err);
        setYoutubeLookupState("error");
      }
    })();
  };

  const handleSubmit = async () => {
    if (!selectedCreator) return;
    if (!isConnected || !desoPublicKey) {
      connectDeSoWallet();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/markets/create-fan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: previewTitle,
          creatorSlug: selectedCreator.slug,
          creatorName: displayName,
          resolveAt: resolveAt.toISOString(),
          category: "Creators",
          desoPublicKey,
          marketType: "youtube_subscribers",
          targetSubscribers,
          creatorYoutubeHandle: youtubeHandle,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to create market");
      }
      const slug = json.market?.slug;
      if (slug) {
        router.push(`/markets/${slug}`);
      }
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const stepHeading =
    step === 1
      ? "Pick a creator"
      : step === 2
        ? selectedCreator
          ? `Milestone for ${displayName}`
          : "Pick a milestone"
        : step === 3
          ? "By when?"
          : "Preview";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-t-2xl border border-border-subtle bg-surface shadow-2xl animate-slide-up md:rounded-2xl md:animate-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Drag handle — mobile only */}
        <div className="md:hidden mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-text-muted/30" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="min-w-0 pr-4">
            <p className="text-[10px] uppercase tracking-widest text-text-muted">
              Step {step} of 4
            </p>
            <p className="mt-0.5 text-sm font-semibold text-text-primary truncate">
              {stepHeading}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {/* ── Step 1: pick a creator ──────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search creators…"
                  className="w-full rounded-lg border border-border-subtle bg-background py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                {loading && results.length === 0 ? (
                  <p className="py-4 text-center text-xs text-text-muted">Searching…</p>
                ) : results.length === 0 ? (
                  <p className="py-4 text-center text-xs text-text-muted">
                    {query ? "No creators found" : "Start typing to search"}
                  </p>
                ) : (
                  results.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCreator(c)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <CreatorAvatar creator={c} size="md" className="h-10 w-10 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {getCreatorDisplayName(c)}
                        </p>
                        {c.deso_username && (
                          <p className="truncate text-xs text-text-muted">@{c.deso_username}</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: pick a milestone ────────────────────────────── */}
          {step === 2 && selectedCreator && (
            <div className="space-y-4">
              {/* Selected creator pill — tappable to go back to search */}
              <div className="flex items-center gap-3 rounded-lg border border-border-subtle p-3">
                <CreatorAvatar
                  creator={selectedCreator}
                  size="md"
                  className="h-8 w-8 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {displayName}
                  </p>
                  {selectedCreator.deso_username && (
                    <p className="truncate text-xs text-text-muted">
                      @{selectedCreator.deso_username}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Change
                </button>
              </div>

              {/* YouTube lookup status — informational only. Phase 3
                  will size milestone chips around the live count. */}
              {youtubeLookupState === "loading" && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <div className="h-3 w-3 rounded-full border border-caldera border-t-transparent animate-spin" />
                  <span>
                    Looking up @{selectedCreator.deso_username ?? selectedCreator.slug} on YouTube…
                  </span>
                </div>
              )}
              {youtubeLookupState === "found" && youtubeStats && (
                <p className="text-xs text-text-muted">
                  Currently{" "}
                  <span className="font-semibold text-text-primary tabular-nums">
                    {youtubeStats.subscriberCount.toLocaleString()}
                  </span>{" "}
                  subscribers
                  {youtubeStats.handle && (
                    <> · {youtubeStats.handle}</>
                  )}
                </p>
              )}
              {(youtubeLookupState === "not_found" ||
                youtubeLookupState === "error") && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-xs text-amber-400">
                    We couldn&apos;t find a YouTube channel for this creator yet.
                    You can still set a milestone, but it&apos;ll need to be
                    manually resolved when the date hits.
                  </p>
                </div>
              )}

              {/* Milestone type — fixed to YouTube subscribers in v1.
                  Rendered as a non-interactive card so the surface
                  foreshadows future types (Spotify, releases, etc). */}
              <div className="rounded-lg border border-border-subtle bg-background p-3">
                <p className="text-[10px] uppercase tracking-widest text-text-muted">
                  Milestone type
                </p>
                <p className="mt-1 text-sm font-semibold text-text-primary">
                  YouTube subscribers
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  More milestone types coming soon.
                </p>
              </div>

              {/* Target — chips populate the input, input is source of truth */}
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-widest text-text-muted">
                  Target
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {MILESTONE_CHIPS.map((m) => (
                    <button
                      key={m.label}
                      onClick={() => setTargetSubscribers(m.value)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        targetSubscribers === m.value
                          ? "bg-caldera text-white"
                          : "border border-border-subtle text-text-muted hover:border-white/20 hover:text-text-primary"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={1}
                  value={targetSubscribers || ""}
                  onChange={(e) =>
                    setTargetSubscribers(
                      Math.max(0, parseInt(e.target.value || "0", 10))
                    )
                  }
                  placeholder="Custom (e.g. 75000000)"
                  className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 font-mono text-sm tabular-nums text-text-primary focus:border-caldera focus:outline-none"
                />
                {targetSubscribers > 0 && (
                  <p className="mt-1 text-xs text-text-muted">
                    {targetSubscribers.toLocaleString()} subscribers
                  </p>
                )}
              </div>

              <button
                onClick={() => setStep(3)}
                disabled={!targetSubscribers || targetSubscribers < 1}
                className="w-full rounded-xl bg-caldera py-3 text-sm font-semibold text-white transition-colors hover:bg-caldera-hover disabled:opacity-50"
              >
                Continue →
              </button>
            </div>
          )}

          {/* ── Step 3: pick a deadline ─────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted">
                When should the market resolve?
              </p>
              <div className="flex flex-wrap gap-2">
                {DEADLINE_CHIPS.map((d) => {
                  const targetDate = addMonths(d.months);
                  const isSelected = sameDay(targetDate, resolveAt);
                  return (
                    <button
                      key={d.label}
                      onClick={() => setResolveAt(targetDate)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-caldera text-white"
                          : "border border-border-subtle text-text-muted hover:border-white/20 hover:text-text-primary"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div>
                <input
                  type="date"
                  value={dateForInput(resolveAt)}
                  min={dateForInput(new Date(Date.now() + 86400000))}
                  max={dateForInput(addMonths(12))}
                  onChange={(e) => setResolveAt(new Date(e.target.value))}
                  className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text-primary focus:border-caldera focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">
                  Resolves on {formatDate(resolveAt)}
                </p>
              </div>
              <button
                onClick={() => setStep(4)}
                className="w-full rounded-xl bg-caldera py-3 text-sm font-semibold text-white transition-colors hover:bg-caldera-hover"
              >
                Continue →
              </button>
              <button
                onClick={() => setStep(2)}
                className="w-full rounded-xl border border-border-subtle py-3 text-sm font-medium text-text-muted transition-colors hover:border-white/20 hover:text-text-primary"
              >
                ← Back
              </button>
            </div>
          )}

          {/* ── Step 4: preview + submit ────────────────────────────── */}
          {step === 4 && selectedCreator && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border-subtle bg-background p-4">
                <p className="mb-2 text-[10px] uppercase tracking-widest text-text-muted">
                  Market
                </p>
                <p className="text-sm font-semibold leading-snug text-text-primary">
                  {previewTitle}
                </p>
                <p className="mt-3 text-xs text-text-muted">
                  Auto-resolves via YouTube data on {formatDate(resolveAt)}.
                </p>
              </div>
              {submitError && <p className="text-xs text-no">{submitError}</p>}
              {!isConnected ? (
                <button
                  onClick={() => connectDeSoWallet()}
                  className="w-full rounded-xl bg-caldera py-3 text-sm font-semibold text-white transition-colors hover:bg-caldera-hover"
                >
                  Connect wallet to create
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full rounded-xl bg-caldera py-3 text-sm font-semibold text-white transition-colors hover:bg-caldera-hover disabled:opacity-50"
                >
                  {submitting ? "Creating…" : "Create market"}
                </button>
              )}
              <button
                onClick={() => setStep(3)}
                className="w-full rounded-xl border border-border-subtle py-3 text-sm font-medium text-text-muted transition-colors hover:border-white/20 hover:text-text-primary"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
