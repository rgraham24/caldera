"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";
import { getDesoIdentity } from "@/lib/deso/identity";

type Step = "loading" | "invalid" | "already_claimed" | "landing" | "verifying" | "tweet_verified" | "connecting" | "success";

type ClaimInfo = {
  name: string;
  slug: string;
  symbol: string;
  twitterHandle: string | null;
  claimCode: string;
  unclaimedEarnings: number;
  marketsCount: number;
};

type ClaimResult = {
  profileClaimed: boolean;
  txHashHex: string | null;
  amountNanos: string;
  escrowUsd: string;
};

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="group relative rounded-xl border p-4 cursor-pointer select-all"
      style={{ background: "var(--bg-base)", borderColor: "var(--border-subtle)" }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <p className="text-sm text-white font-mono leading-relaxed pr-16">{text}</p>
      <span
        className="absolute right-3 top-3 text-xs px-2 py-1 rounded-md transition-all"
        style={{ background: "var(--bg-elevated)", color: copied ? "#22c55e" : "var(--text-tertiary)" }}
      >
        {copied ? "Copied!" : "Copy"}
      </span>
    </div>
  );
}

export default function ClaimPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const { isConnected, desoPublicKey, desoUsername } = useAppStore();

  const [step, setStep] = useState<Step>("loading");
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/claim/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error === "invalid") return setStep("invalid");
        if (data.error === "already_claimed") return setStep("already_claimed");
        setInfo(data.creator);
        setStep("landing");
      })
      .catch(() => setStep("invalid"));
  }, [code]);

  // Stop polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const tweetText = info
    ? `I'm claiming my $${info.symbol || info.name} token on @CalderaMarket 🔥 ${info.claimCode}`
    : "";

  const startVerification = () => {
    setStep("verifying");
    setError(null);
    pollCount.current = 0;

    const check = async () => {
      pollCount.current++;
      try {
        const res = await fetch("/api/claim/tweet-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (data.verified) {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("tweet_verified");
        } else if (pollCount.current >= 30) {
          // 30 polls × 10s = 5 minutes
          if (pollRef.current) clearInterval(pollRef.current);
          setError("Tweet not found after 5 minutes. Make sure you posted from @" + (info?.twitterHandle ?? "your account") + " and try again.");
          setStep("landing");
        }
      } catch {
        // keep polling
      }
    };

    check();
    pollRef.current = setInterval(check, 10000);
  };

  const completeClaim = async () => {
    if (!isConnected) {
      connectDeSoWallet();
      return;
    }
    setStep("connecting");
    setError(null);
    try {
      // ── P2-5.5: Fresh-JWT auth for claim verification ─────────────
      // Backend (P2-5.4) requires desoJwt that proves the caller
      // controls the wallet they're claiming under. Sign right before
      // the POST so iat is fresh (within the 60s recency window).
      const identity = getDesoIdentity();
      let desoJwt: string;
      try {
        desoJwt = await identity.jwt();
      } catch (err) {
        console.error("[claim] identity.jwt() failed:", err);
        setError("Couldn't sign your claim. Please try again or refresh.");
        setStep("tweet_verified");
        return;
      }
      // ── end P2-5.5 ───────────────────────────────────────────────

      const res = await fetch("/api/claim/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, desoPublicKey, desoUsername, handle: info?.twitterHandle ?? "", desoJwt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Claim failed");
        setStep("tweet_verified");
        return;
      }
      setClaimResult({
        profileClaimed: !!data.profileClaimed,
        txHashHex: data.txHashHex ?? null,
        amountNanos: String(data.amountNanos ?? "0"),
        escrowUsd: String(data.escrowUsd ?? "0"),
      });
      setStep("success");
    } catch {
      setError("Something went wrong. Please try again.");
      setStep("tweet_verified");
    }
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-sm px-6">
          <p className="text-2xl font-bold text-white mb-3">Invalid code</p>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>This claim code doesn&apos;t exist or has expired.</p>
          <button onClick={() => router.push("/")} className="text-sm underline" style={{ color: "var(--text-secondary)" }}>Back to Caldera</button>
        </div>
      </div>
    );
  }

  if (step === "already_claimed") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-sm px-6">
          <p className="text-2xl font-bold text-white mb-3">Already claimed</p>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>This profile has already been claimed.</p>
          <button onClick={() => router.push(`/creators/${info?.slug ?? ""}`)} className="text-sm underline" style={{ color: "var(--text-secondary)" }}>View profile</button>
        </div>
      </div>
    );
  }

  if (step === "success") {
    const escrowUsdNum = claimResult ? Number(claimResult.escrowUsd) : 0;
    const hasPayout = escrowUsdNum > 0 && claimResult?.txHashHex;
    const explorerUrl = claimResult?.txHashHex
      ? `https://explorer.deso.com/?query-node=https%3A%2F%2Fnode.deso.org&query=${claimResult.txHashHex}`
      : null;

    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-md px-6">
          <div className="text-5xl mb-4">🎉</div>
          <p className="text-3xl font-bold text-white mb-3">${info?.symbol ?? info?.name} is yours!</p>

          {hasPayout ? (
            <>
              <div className="rounded-xl border p-4 mb-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Sent to your wallet</p>
                <p className="text-3xl font-bold text-amber-400 mb-1">
                  ${escrowUsdNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    View transaction →
                  </a>
                )}
              </div>
              <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
                Plus you&apos;ll earn <span className="text-orange-400 font-semibold">0.5%</span> of every future trade — sent directly to your DeSo wallet.
              </p>
            </>
          ) : (
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
              You&apos;ll now earn <span className="text-orange-400 font-semibold">0.5%</span> of every future market trade about you — sent directly to your DeSo wallet.
            </p>
          )}

          <p className="text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>Connected as @{desoUsername}</p>
          <button
            onClick={() => router.push(`/creators/${info?.slug}`)}
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-gray-100 transition-colors"
          >
            View my profile →
          </button>
        </div>
      </div>
    );
  }

  // ── Main flow ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            CALDERA · CREATOR CLAIM
          </p>
          <h1 className="text-3xl font-bold text-white mb-2">
            Claim your ${info?.symbol ?? info?.name} token
          </h1>
          {info?.unclaimedEarnings && info.unclaimedEarnings > 0 ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              💰 <span className="text-amber-400 font-semibold">${info.unclaimedEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> in fees would have gone to token holders so far.
            </p>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Earn 0.5% of every trade on your markets — automatically.
            </p>
          )}
        </div>

        {/* Stats */}
        <div
          className="rounded-xl border p-5 mb-6"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
        >
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>MARKETS</p>
              <p className="text-2xl font-bold text-white">{info?.marketsCount ?? 0}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>TOKEN</p>
              <p className="text-2xl font-bold text-white">${info?.symbol ?? "—"}</p>
            </div>
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            After claiming, you earn <span className="text-white font-medium">0.5%</span> per trade sent to your wallet, plus <span className="text-white font-medium">0.5%</span> in holder rewards on your token — auto-distributed to fans who hold your coin.
          </p>
        </div>

        {/* Step 1 or 2: Tweet verification */}
        {(step === "landing" || step === "verifying") && (
          <div
            className="rounded-xl border p-5"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
          >
            <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              Step 1 — Verify you&apos;re {info?.twitterHandle ? `@${info.twitterHandle}` : info?.name}
            </p>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Post this exact text from{info?.twitterHandle ? ` @${info.twitterHandle} on` : ""} Twitter / X:
            </p>
            <CopyBox text={tweetText} />
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 w-full rounded-lg border py-2.5 text-sm font-medium transition-colors"
              style={{ borderColor: "rgba(29,155,240,0.4)", color: "#1d9bf0" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Post on X / Twitter
            </a>

            <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
              {step === "verifying" ? (
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Searching for your tweet… checking every 10 seconds (up to 5 min)
                  </p>
                </div>
              ) : (
                <button
                  onClick={startVerification}
                  className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black hover:bg-gray-100 transition-colors"
                >
                  I posted it — verify now →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: DeSo wallet connect */}
        {(step === "tweet_verified" || step === "connecting") && (
          <div
            className="rounded-xl border p-5"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-green-400 text-lg">✓</span>
              <p className="text-sm text-green-400 font-medium">Tweet verified!</p>
            </div>
            <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              Step 2 — Connect your DeSo wallet
            </p>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Connect your DeSo wallet to receive the 0.5% fee on every future trade.
            </p>
            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            {!isConnected ? (
              <button
                onClick={() => connectDeSoWallet()}
                className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black hover:bg-gray-100 transition-colors"
              >
                Connect DeSo Wallet
              </button>
            ) : (
              <div>
                <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>Connected as @{desoUsername}</p>
                <button
                  onClick={completeClaim}
                  disabled={step === "connecting"}
                  className="w-full rounded-lg bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors disabled:opacity-40"
                >
                  {step === "connecting" ? "Completing claim…" : "Complete claim →"}
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs mt-6" style={{ color: "var(--text-tertiary)" }}>
          Code: {code}
        </p>
      </div>
    </div>
  );
}
