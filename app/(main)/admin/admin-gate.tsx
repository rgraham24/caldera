"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const ADMIN_PASSWORD = "caldera-admin-2026";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (sessionStorage.getItem("caldera_admin") === "true") {
      setUnlocked(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem("caldera_admin", "true");
      setUnlocked(true);
    } else {
      setError(true);
      setPassword("");
    }
  };

  // Avoid flash of password form on first render before sessionStorage is checked
  if (!mounted) return null;

  if (!unlocked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface p-8">
          <h1 className="mb-1 font-display text-xl font-bold text-text-primary">Admin Access</h1>
          <p className="mb-6 text-sm text-text-muted">Enter the admin password to continue.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="Password"
              autoFocus
              className="w-full rounded-lg border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none focus:ring-1 focus:ring-caldera"
            />
            {error && (
              <p className="text-xs text-no">Incorrect password.</p>
            )}
            <Button
              type="submit"
              className="w-full bg-caldera text-white font-semibold hover:bg-caldera/90"
            >
              Enter Admin
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
