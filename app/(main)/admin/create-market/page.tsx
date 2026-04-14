"use client";

import { useState, useEffect } from "react";

const ADMIN_PW_KEY = "caldera_admin_pw";
const CORRECT_PW = "caldera-admin-2026";
const DESO_PK_KEY = "caldera_deso_pk";
const ADMIN_PLACEHOLDER_PK = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";

const CATEGORIES = [
  "Creators",
  "Sports",
  "Entertainment",
  "Politics",
  "Companies",
  "Climate",
  "Tech",
  "Crypto",
];

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const maxDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 180);
  return d.toISOString().slice(0, 10);
};

export default function AdminCreateMarketPage() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  // Quick-create form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Creators");
  const [creatorSlug, setCreatorSlug] = useState("");
  const [resolveDate, setResolveDate] = useState(tomorrow());
  const [yesPrice, setYesPrice] = useState(50);
  const [isBreaking, setIsBreaking] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createResult, setCreateResult] = useState<{ slug: string; id: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Quick-generate state
  const [genCategory, setGenCategory] = useState("Creators");
  const [genCount, setGenCount] = useState(3);
  const [genRunning, setGenRunning] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(ADMIN_PW_KEY);
      if (stored === CORRECT_PW) setAuthed(true);
    }
  }, []);

  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwInput === CORRECT_PW) {
      localStorage.setItem(ADMIN_PW_KEY, pwInput);
      setAuthed(true);
    } else {
      setPwError("Wrong password");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateResult(null);
    setSubmitting(true);

    try {
      const desoPublicKey =
        (typeof window !== "undefined" ? localStorage.getItem(DESO_PK_KEY) : null) ??
        ADMIN_PLACEHOLDER_PK;

      const res = await fetch("/api/markets/admin-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          creatorSlug: creatorSlug.trim() || undefined,
          resolveAt: new Date(resolveDate).toISOString(),
          yesPrice: yesPrice / 100,
          isBreaking,
          isFeatured,
          adminPassword: CORRECT_PW,
          desoPublicKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setCreateResult({ slug: data.data.slug, id: data.data.id });
      setTitle("");
      setIsBreaking(false);
      setIsFeatured(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerate = async () => {
    setGenResult(null);
    setGenRunning(true);
    try {
      let res: Response;
      if (genCategory === "Climate") {
        res = await fetch("/api/admin/generate-climate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: CORRECT_PW, count: genCount }),
        });
      } else {
        res = await fetch("/api/admin/generate-for-imported", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: CORRECT_PW,
            marketsPerCreator: genCount,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setGenResult(
        `✓ Generated ${data.marketsCreated ?? data.created ?? "?"} markets`
      );
    } catch (err) {
      setGenResult(`✗ ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setGenRunning(false);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <form onSubmit={handlePwSubmit} className="w-full max-w-sm rounded-xl border border-[#222] bg-[#111] p-6 space-y-4">
          <h1 className="text-lg font-bold text-white">Admin Access</h1>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Enter admin password"
            className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white placeholder:text-[#555] focus:border-orange-500 focus:outline-none"
          />
          {pwError && <p className="text-xs text-red-400">{pwError}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-white">⚡ Quick Create Market</h1>
        <a href="/admin" className="text-xs text-[#888] hover:text-white">← Admin</a>
      </div>

      {/* ── Quick-create form ── */}
      <form onSubmit={handleCreate} className="rounded-xl border border-[#222] bg-[#111] p-6 space-y-5">
        <h2 className="text-sm font-semibold text-[#888] uppercase tracking-widest">New Market</h2>

        {/* Title */}
        <div>
          <label className="block text-xs text-[#888] mb-1.5">
            Market Title <span className="text-[#555]">({title.length}/120)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Will X happen before Y date?"
            minLength={10}
            maxLength={120}
            required
            className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white placeholder:text-[#555] focus:border-orange-500 focus:outline-none"
          />
        </div>

        {/* Category + Creator slug */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[#888] mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#888] mb-1.5">Creator Slug (optional)</label>
            <input
              type="text"
              value={creatorSlug}
              onChange={(e) => setCreatorSlug(e.target.value)}
              placeholder="e.g. kingjames"
              className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white placeholder:text-[#555] focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Resolve date */}
        <div>
          <label className="block text-xs text-[#888] mb-1.5">Resolve Date</label>
          <input
            type="date"
            value={resolveDate}
            min={tomorrow()}
            max={maxDate()}
            onChange={(e) => setResolveDate(e.target.value)}
            required
            className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
          />
        </div>

        {/* Initial odds slider */}
        <div>
          <label className="block text-xs text-[#888] mb-1.5">
            Initial YES odds — <span className="text-white font-mono">{yesPrice}%</span>{" "}
            <span className="text-[#555]">(NO: {100 - yesPrice}%)</span>
          </label>
          <input
            type="range"
            min={10}
            max={90}
            step={5}
            value={yesPrice}
            onChange={(e) => setYesPrice(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
        </div>

        {/* Toggles */}
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isBreaking}
              onChange={(e) => setIsBreaking(e.target.checked)}
              className="accent-orange-500 h-4 w-4"
            />
            <span className="text-sm text-white">🔥 Breaking</span>
            <span className="text-xs text-[#555]">(+1000 trending)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="accent-orange-500 h-4 w-4"
            />
            <span className="text-sm text-white">📌 Featured</span>
            <span className="text-xs text-[#555]">(pins to hero)</span>
          </label>
        </div>

        {createError && <p className="text-xs text-red-400">{createError}</p>}
        {createResult && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-sm">
            <p className="text-green-400 font-semibold">✓ Market created!</p>
            <a
              href={`/markets/${createResult.slug}`}
              className="text-green-400/80 hover:underline text-xs mt-1 block"
            >
              View market → /markets/{createResult.slug}
            </a>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || title.length < 10}
          className="w-full rounded-lg bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "Creating…" : "⚡ Create Market"}
        </button>
      </form>

      {/* ── Quick Generate section ── */}
      <div className="rounded-xl border border-[#222] bg-[#111] p-6 space-y-5">
        <h2 className="text-sm font-semibold text-[#888] uppercase tracking-widest">Quick Generate (AI)</h2>
        <p className="text-xs text-[#555]">
          Runs the market generation pipeline for a category. Uses Claude to write market questions automatically.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[#888] mb-1.5">Category</label>
            <select
              value={genCategory}
              onChange={(e) => setGenCategory(e.target.value)}
              className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#888] mb-1.5">How many (1–10)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={genCount}
              onChange={(e) => setGenCount(Number(e.target.value))}
              className="w-full rounded-lg border border-[#333] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>

        {genResult && (
          <p className={`text-sm font-mono ${genResult.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
            {genResult}
          </p>
        )}

        <button
          onClick={handleGenerate}
          disabled={genRunning}
          className="w-full rounded-lg bg-[#222] border border-[#333] py-3 text-sm font-semibold text-white hover:bg-[#2a2a2a] disabled:opacity-40"
        >
          {genRunning ? "Generating…" : "Generate Markets"}
        </button>
      </div>
    </div>
  );
}
