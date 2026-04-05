"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, Check } from "lucide-react";

type AddCreatorModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const CATEGORIES = [
  "streamers",
  "music",
  "sports",
  "politics",
  "viral",
];

export function AddCreatorModal({ isOpen, onClose }: AddCreatorModalProps) {
  const [username, setUsername] = useState("");
  const [category, setCategory] = useState("streamers");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/creators/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desoUsername: username.trim(), category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add creator");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border-subtle bg-surface-2 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-text-primary">Add a Creator</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yes/10">
              <Check className="h-6 w-6 text-yes" />
            </div>
            <p className="text-lg font-semibold text-text-primary">Creator added!</p>
            <p className="mt-1 text-sm text-text-muted">Markets can now be created about them.</p>
            <Button onClick={onClose} className="mt-6 w-full bg-caldera text-background font-semibold">Done</Button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-text-muted">DeSo Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. mrbeast"
                className="w-full rounded-xl border border-border-subtle bg-background py-3 px-4 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none"
              />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-text-muted">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-border-subtle bg-background py-3 px-4 text-sm text-text-muted"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {error && <p className="mb-3 text-xs text-no">{error}</p>}
            <Button
              onClick={handleSubmit}
              disabled={!username.trim() || isLoading}
              className="w-full bg-caldera text-background font-semibold hover:bg-caldera/90"
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isLoading ? "Verifying..." : "Add Creator"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
