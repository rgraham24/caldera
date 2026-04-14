"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/store";
import { connectDeSoWallet } from "@/lib/deso/auth";

type ClaimState = "loading" | "invalid" | "already_claimed" | "ready" | "verifying" | "success";

type CreatorInfo = {
  name: string;
  slug: string;
  symbol: string;
  markets_count: number;
  total_volume: number;
};

export default function ClaimPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const { isConnected, desoPublicKey, desoUsername } = useAppStore();

  const [state, setState] = useState<ClaimState>("loading");
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");

  useEffect(() => {
    if (!code) return;
    fetch(`/api/claim/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error === "invalid") return setState("invalid");
        if (data.error === "already_claimed") return setState("already_claimed");
        setCreator(data.creator);
        setState("ready");
      })
      .catch(() => setState("invalid"));
  }, [code]);

  const handleClaim = async () => {
    if (!isConnected) {
      connectDeSoWallet();
      return;
    }
    setState("verifying");
    setError(null);
    try {
      const res = await fetch("/api/claim/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          desoPublicKey,
          desoUsername,
          handle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        setState("ready");
        return;
      }
      setState("success");
    } catch {
      setError("Something went wrong. Please try again.");
      setState("ready");
    }
  };

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-sm px-6">
          <p className="text-2xl font-bold text-white mb-3">Invalid code</p>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            This claim code doesn&apos;t exist or has expired.
          </p>
          <button onClick={() => router.push("/")} className="text-sm underline" style={{ color: "var(--text-secondary)" }}>
            Back to Caldera
          </button>
        </div>
      </div>
    );
  }

  if (state === "already_claimed") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-sm px-6">
          <p className="text-2xl font-bold text-white mb-3">Already claimed</p>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            This profile has already been claimed by its creator.
          </p>
          <button onClick={() => router.push("/")} className="text-sm underline" style={{ color: "var(--text-secondary)" }}>
            Back to Caldera
          </button>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-md px-6">
          <div className="text-4xl mb-4">✓</div>
          <p className="text-2xl font-bold text-white mb-3">Profile claimed!</p>
          <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
            You now own <span className="text-white font-medium">${creator?.symbol}</span> on Caldera.
          </p>
          <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
            Every market about you auto-buys &amp; burns ${creator?.symbol} — benefiting all token holders, including you.
          </p>
          <button
            onClick={() => router.push(`/creators/${creator?.slug}`)}
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-gray-100 transition-colors"
          >
            View my profile →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            CALDERA · CREATOR CLAIM
          </p>
          <h1 className="text-3xl font-bold text-white mb-2">
            This is your profile.
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            People are already predicting on <span className="text-white font-medium">{creator?.name}</span>.
            Claim it to earn from every trade.
          </p>
        </div>

        {/* Stats card */}
        <div className="rounded-xl border p-5 mb-6" style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>MARKETS</p>
              <p className="text-2xl font-bold text-white">{creator?.markets_count ?? 0}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>TOKEN</p>
              <p className="text-2xl font-bold text-white">${creator?.symbol}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Token holders earn <span className="text-white font-medium">up to 1.5%</span> of every trade on your markets — automatically, forever.
            </p>
          </div>
        </div>

        {/* Claim form */}
        <div className="rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}>
          {!isConnected ? (
            <div className="text-center">
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                Connect your DeSo wallet to claim this profile.
              </p>
              <button
                onClick={() => connectDeSoWallet()}
                className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black hover:bg-gray-100 transition-colors"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xs font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
                STEP 2 — VERIFY YOUR IDENTITY
              </p>
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                Enter your social handle so we can verify you&apos;re really <span className="text-white">{creator?.name}</span>.
              </p>
              <div className="mb-4">
                <label className="text-xs mb-1.5 block" style={{ color: "var(--text-tertiary)" }}>
                  Your Twitter / Instagram / YouTube handle
                </label>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@yourhandle"
                  className="w-full rounded-lg border px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none transition-colors"
                  style={{ background: "var(--bg-base)", borderColor: "var(--border-subtle)" }}
                />
              </div>
              {error && (
                <p className="text-xs mb-3 text-red-400">{error}</p>
              )}
              <button
                onClick={handleClaim}
                disabled={!handle.trim() || state === "verifying"}
                className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {state === "verifying" ? "Verifying..." : "Claim my profile →"}
              </button>
              <p className="text-xs text-center mt-3" style={{ color: "var(--text-tertiary)" }}>
                Connected as @{desoUsername}
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--text-tertiary)" }}>
          Code: {code}
        </p>
      </div>
    </div>
  );
}
