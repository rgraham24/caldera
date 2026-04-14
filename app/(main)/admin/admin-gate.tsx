"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

const ADMIN_PW_KEY = "caldera_admin_pw";
const CORRECT_PW = "caldera-admin-2026";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { desoPublicKey } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Accept stored admin password (set by any admin page)
    if (localStorage.getItem(ADMIN_PW_KEY) === CORRECT_PW) {
      setAuthed(true);
      return;
    }

    // Accept DeSo admin key from Zustand store or its persisted localStorage state
    const storedAuth = localStorage.getItem("caldera-auth");
    let fallbackKey = "";
    try {
      const parsed = storedAuth ? JSON.parse(storedAuth) : null;
      fallbackKey =
        parsed?.state?.desoPublicKey ||
        parsed?.desoPublicKey ||
        parsed?.publicKey ||
        "";
    } catch {}

    if (ADMIN_KEYS.includes(desoPublicKey || fallbackKey)) {
      setAuthed(true);
    }
  }, [desoPublicKey]);

  // SSR / pre-mount: show spinner to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // Live Zustand state (wallet connected after initial mount)
  if (!authed && ADMIN_KEYS.includes(desoPublicKey || "")) {
    return <>{children}</>;
  }

  if (!authed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface p-8 text-center">
          <h1 className="mb-2 font-display text-xl font-bold text-text-primary">Admin Access</h1>
          <p className="mb-6 text-sm text-text-muted">Enter the admin password to continue.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pwInput === CORRECT_PW) {
                localStorage.setItem(ADMIN_PW_KEY, pwInput);
                setAuthed(true);
                setError(false);
              } else {
                setError(true);
              }
            }}
          >
            <input
              type="password"
              value={pwInput}
              onChange={(e) => {
                setPwInput(e.target.value);
                setError(false);
              }}
              placeholder="Admin password"
              autoFocus
              className="mb-3 w-full rounded-lg border border-border-subtle bg-surface-2 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            {error && (
              <p className="mb-3 text-xs text-red-400">Incorrect password.</p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
            >
              Access Admin
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
