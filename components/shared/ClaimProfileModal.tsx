"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, Check, Copy } from "lucide-react";

type ClaimProfileModalProps = {
  creatorName: string;
  creatorSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onClaimed?: () => void;
};

export function ClaimProfileModal({
  creatorName,
  creatorSlug,
  isOpen,
  onClose,
  onClaimed,
}: ClaimProfileModalProps) {
  const [step, setStep] = useState<"generate" | "verify" | "success">("generate");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [verifyUrl, setVerifyUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creators/${creatorSlug}/generate-claim-code`, { method: "POST" });
      const { data, error: err } = await res.json();
      if (err) throw new Error(err);
      setCode(data.code);
      setExpiresAt(data.expiresAt);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyUrl.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creators/${creatorSlug}/verify-claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: verifyUrl.trim() }),
      });
      const { error: err } = await res.json();
      if (err) throw new Error(err);
      setStep("success");
      onClaimed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border-subtle bg-surface-2 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-text-primary">
            Claim your Caldera profile
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "generate" && (
          <>
            <p className="mb-4 text-sm text-text-muted">
              To verify you are {creatorName}, we&apos;ll generate a unique code for you to post publicly.
            </p>
            {error && <p className="mb-3 text-xs text-no">{error}</p>}
            <Button onClick={handleGenerate} disabled={isLoading} className="w-full bg-caldera text-background font-semibold">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate Verification Code
            </Button>
          </>
        )}

        {step === "verify" && (
          <>
            <p className="mb-4 text-sm text-text-muted">
              Post this code anywhere public to verify you are {creatorName}:
            </p>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-background p-4">
              <span className="font-mono text-lg font-bold tracking-wider text-caldera">{code}</span>
              <button onClick={copyCode} className="rounded-lg p-1.5 text-text-muted hover:text-text-primary">
                {copied ? <Check className="h-4 w-4 text-yes" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="mb-4 text-xs text-text-muted">
              Post it in your Instagram bio, a tweet, YouTube post, DeSo profile — anywhere publicly accessible.
            </p>
            <p className="mb-4 text-[10px] text-text-faint">
              Expires {new Date(expiresAt).toLocaleDateString()}
            </p>

            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-text-muted">URL where you posted it</label>
              <input
                value={verifyUrl}
                onChange={(e) => setVerifyUrl(e.target.value)}
                placeholder="https://x.com/..."
                className="w-full rounded-xl border border-border-subtle bg-background py-3 px-4 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
              />
            </div>
            {error && <p className="mb-3 text-xs text-no">{error}</p>}
            <Button onClick={handleVerify} disabled={!verifyUrl.trim() || isLoading} className="w-full bg-caldera text-background font-semibold">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isLoading ? "Checking..." : "Verify & Claim"}
            </Button>
          </>
        )}

        {step === "success" && (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yes/10">
              <Check className="h-6 w-6 text-yes" />
            </div>
            <p className="text-lg font-semibold text-text-primary">Welcome to Caldera, {creatorName}!</p>
            <p className="mt-1 text-sm text-text-muted">
              You&apos;ll now earn from every prediction about you.
            </p>
            <Button onClick={onClose} className="mt-6 w-full bg-caldera text-background font-semibold">Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}
