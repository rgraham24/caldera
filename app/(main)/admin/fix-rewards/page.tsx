"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Check, ExternalLink } from "lucide-react";

const CATEGORY_TOKENS = [
  "EntertainmentMarkets",
  "CryptoMarkets1",
  "ViralMarkets",
  "ConflictMarkets",
  "ElectionMarkets",
  "SportsMarkets",
];

type TokenStatus = {
  status: "idle" | "building" | "signing" | "submitting" | "done" | "error";
  txHash?: string;
  error?: string;
};

export default function FixRewardsPage() {
  const [seedPhrase, setSeedPhrase] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [selected, setSelected] = useState(CATEGORY_TOKENS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TokenStatus>({ status: "idle" });

  const [fixAllRunning, setFixAllRunning] = useState(false);
  const [allStatuses, setAllStatuses] = useState<Record<string, TokenStatus>>({});

  const canSubmit = seedPhrase.trim().length > 0 && publicKey.trim().length > 0;

  const handleFix = async (username: string, setter: (s: TokenStatus) => void) => {
    if (!canSubmit) {
      setter({ status: "error", error: "Seed phrase and public key are required" });
      return;
    }

    setter({ status: "building" });

    try {
      // Step 1: Build unsigned tx
      const txRes = await fetch("/api/admin/update-founder-reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: "caldera-admin-2026",
          username,
          updaterPublicKey: publicKey.trim(),
        }),
      });
      const txData = await txRes.json();
      if (txData.error) {
        setter({ status: "error", error: txData.error });
        return;
      }

      setter({ status: "signing" });

      // Step 2: Sign and submit server-side using seed phrase
      const submitRes = await fetch("/api/admin/sign-and-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: "caldera-admin-2026",
          transactionHex: txData.transactionHex,
          seedPhrase: seedPhrase.trim(),
        }),
      });
      const submitData = await submitRes.json();

      if (submitData.success) {
        setter({ status: "done", txHash: submitData.txHash });
      } else {
        setter({ status: "error", error: submitData.error ?? "Submit failed" });
      }
    } catch (err) {
      setter({ status: "error", error: String(err) });
    }
  };

  const handleFixOne = async () => {
    setIsLoading(true);
    setResult({ status: "idle" });
    await handleFix(selected, setResult);
    setIsLoading(false);
  };

  const handleFixAll = async () => {
    setFixAllRunning(true);
    setAllStatuses({});
    for (const username of CATEGORY_TOKENS) {
      setAllStatuses((prev) => ({ ...prev, [username]: { status: "building" } }));
      await handleFix(username, (s) =>
        setAllStatuses((prev) => ({ ...prev, [username]: s }))
      );
    }
    setFixAllRunning(false);
  };

  const statusLabel = (s: TokenStatus): string => {
    switch (s.status) {
      case "idle": return "";
      case "building": return "Building tx...";
      case "signing": return "Signing...";
      case "submitting": return "Submitting...";
      case "done": return `✓ Done${s.txHash ? ` · ${s.txHash.slice(0, 12)}...` : ""}`;
      case "error": return `✗ ${s.error}`;
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 font-display text-2xl font-bold text-text-primary">Fix Founder Rewards</h1>
      <p className="mb-8 text-sm text-text-muted">
        Paste the token owner&apos;s seed phrase and public key to sign an update-profile transaction
        setting founder reward to 0%. The seed phrase is used only for this request and never stored.
      </p>

      {/* Credentials */}
      <div className="mb-6 space-y-4">
        <div>
          <label className="mb-2 block text-xs font-medium text-text-muted">
            Public Key (BC1YL...)
          </label>
          <input
            type="text"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="BC1YL..."
            className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none focus:ring-1 focus:ring-caldera"
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-text-muted">
            Seed Phrase (12 or 24 words)
          </label>
          <textarea
            value={seedPhrase}
            onChange={(e) => setSeedPhrase(e.target.value)}
            placeholder="word1 word2 word3 ..."
            rows={3}
            className="w-full rounded-xl border border-border-subtle bg-surface p-3 font-mono text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none focus:ring-1 focus:ring-caldera resize-none"
          />
          <p className="mt-1 text-[10px] text-text-faint">
            Never stored. Used only for this request, then discarded.
          </p>
        </div>
      </div>

      {/* Single token fix */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">Fix Single Token</h2>
        <div className="mb-4 flex gap-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text-primary focus:border-caldera focus:outline-none"
          >
            {CATEGORY_TOKENS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Button
            onClick={handleFixOne}
            disabled={isLoading || !canSubmit}
            className="bg-caldera text-background font-semibold hover:bg-caldera/90 disabled:opacity-50"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? "Processing..." : "Fix Founder Reward"}
          </Button>
        </div>

        {result.status !== "idle" && (
          <div className={`rounded-lg p-3 text-sm ${
            result.status === "done" ? "bg-yes/10 text-yes" :
            result.status === "error" ? "bg-no/10 text-no" :
            "bg-surface-2 text-text-muted"
          }`}>
            {result.status === "done" && <Check className="mb-1 h-4 w-4" />}
            <p>{statusLabel(result)}</p>
            {result.status === "done" && result.txHash && (
              <a
                href={`https://explorer.deso.org/?transaction-id=${result.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs underline"
              >
                View on DeSo Explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Fix all tokens */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
        <h2 className="mb-1 text-sm font-semibold text-orange-400">Fix All 6 Tokens</h2>
        <p className="mb-4 text-xs text-text-muted">
          Processes all tokens sequentially using the same credentials above.
        </p>
        <Button
          onClick={handleFixAll}
          disabled={fixAllRunning || !canSubmit}
          className="bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 font-semibold disabled:opacity-50"
        >
          {fixAllRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {fixAllRunning ? "Processing..." : "Fix All (Set to 0%)"}
        </Button>

        {Object.keys(allStatuses).length > 0 && (
          <ul className="mt-4 space-y-2">
            {CATEGORY_TOKENS.map((username) => {
              const s = allStatuses[username];
              if (!s) return null;
              return (
                <li key={username} className="flex items-start gap-3 text-xs">
                  <span className="w-48 font-mono text-text-muted shrink-0">{username}</span>
                  <span className={
                    s.status === "done" ? "text-yes" :
                    s.status === "error" ? "text-no" :
                    "text-text-muted"
                  }>
                    {statusLabel(s)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
