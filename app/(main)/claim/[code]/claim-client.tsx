"use client";

import { useState } from "react";
import Link from "next/link";
import type { Creator } from "@/types";
import { CreatorAvatar } from "@/components/shared/CreatorAvatar";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";

type Props = {
  code: string;
  creator: Creator;
  alreadyClaimed: boolean;
};

const STEPS = [
  { n: 1, title: "Copy your unique code" },
  { n: 2, title: "Post it publicly on any social" },
  { n: 3, title: "Connect your DeSo wallet" },
  { n: 4, title: "Paste your post URL & claim" },
];

export function ClaimClient({ code, creator, alreadyClaimed }: Props) {
  const { isConnected, desoPublicKey } = useAppStore();
  const sym = creator.deso_username ?? creator.creator_coin_symbol ?? creator.slug;

  const [copied, setCopied] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClaim = async () => {
    if (!desoPublicKey || !postUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claim/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, desoPublicKey, socialPostUrl: postUrl.trim() }),
      });
      const { data, error: err } = await res.json();
      if (err) throw new Error(err);
      setSuccess(true);
      setSuccessMsg(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  if (alreadyClaimed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yes/10">
          <Check className="h-7 w-7 text-yes" />
        </div>
        <h1 className="font-display text-2xl font-bold text-text-primary mb-2">Already Claimed</h1>
        <p className="text-text-muted text-sm mb-6">This token has already been claimed by its owner.</p>
        <Link href={`/creators/${creator.slug}`} className="rounded-xl bg-caldera px-6 py-2.5 text-sm font-semibold text-white">
          View ${sym} →
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yes/15">
          <Check className="h-8 w-8 text-yes" />
        </div>
        <h1 className="font-display text-3xl font-bold text-text-primary mb-3">🎉 ${sym} is yours!</h1>
        <p className="text-text-muted text-sm mb-8 max-w-sm">{successMsg}</p>
        <div className="flex gap-3">
          <Link href={`/creators/${creator.slug}`} className="rounded-xl bg-caldera px-6 py-2.5 text-sm font-semibold text-white">
            View your token →
          </Link>
          <Link href="/" className="rounded-xl border border-border-subtle px-6 py-2.5 text-sm text-text-muted hover:text-text-primary">
            Browse markets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      {/* Hero */}
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <CreatorAvatar creator={creator} size="lg" />
        </div>
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
          Claim your <span className="text-caldera">${sym}</span> token
        </h1>
        <p className="text-text-muted text-sm">
          You&apos;re about to earn fees from every prediction market about you on Caldera.
        </p>
      </div>

      {/* Step list */}
      <div className="mb-8 space-y-1">
        {STEPS.map(({ n, title }) => (
          <div key={n} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "var(--bg-surface)" }}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-caldera/15 text-[11px] font-bold text-caldera">
              {n}
            </span>
            <span className="text-sm text-text-primary">{title}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Copy code */}
      <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">Step 1 — Your unique code</p>
        <div className="flex items-center justify-between rounded-xl bg-background px-5 py-4">
          <span className="font-mono text-xl font-bold tracking-widest text-caldera">{code}</span>
          <button onClick={copyCode} className="rounded-lg p-2 text-text-muted hover:text-text-primary transition-colors">
            {copied ? <Check className="h-5 w-5 text-yes" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-text-faint">This code is unique to you. Do not share it with anyone else.</p>
      </div>

      {/* Step 2: Post instructions */}
      <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">Step 2 — Post it publicly</p>
        <p className="text-sm text-text-muted mb-3">
          Post <strong className="text-text-primary font-mono">{code}</strong> publicly on any social platform:
        </p>
        <div className="flex flex-wrap gap-2">
          {["Twitter / X", "TikTok", "Instagram", "Kick", "YouTube Community"].map((s) => (
            <span key={s} className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-muted">
              {s}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-text-faint">Just the code, nothing else needed. The post must be publicly visible.</p>
      </div>

      {/* Step 3: Connect wallet */}
      <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">Step 3 — Connect DeSo wallet</p>
        {isConnected ? (
          <div className="flex items-center gap-2 text-sm text-yes">
            <Check className="h-4 w-4" />
            Wallet connected
          </div>
        ) : (
          <button
            onClick={() => connectDeSoWallet()}
            className="rounded-xl bg-caldera px-5 py-2.5 text-sm font-semibold text-white hover:bg-caldera/90 transition-colors"
          >
            Connect DeSo Wallet
          </button>
        )}
      </div>

      {/* Step 4: Paste URL + claim */}
      <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">Step 4 — Paste your post URL</p>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-background px-3">
          <ExternalLink className="h-4 w-4 shrink-0 text-text-faint" />
          <input
            type="url"
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            placeholder="https://x.com/yourhandle/status/..."
            className="flex-1 bg-transparent py-3 text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
          />
        </div>
        {error && <p className="mb-3 text-xs text-no">{error}</p>}
        <button
          onClick={handleClaim}
          disabled={loading || !isConnected || !postUrl.trim()}
          className="w-full rounded-xl bg-caldera py-3 text-sm font-bold text-white hover:bg-caldera/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying...
            </span>
          ) : (
            "Verify & Claim →"
          )}
        </button>
        {!isConnected && (
          <p className="mt-2 text-center text-[11px] text-text-faint">Connect your wallet first (Step 3)</p>
        )}
      </div>
    </div>
  );
}
