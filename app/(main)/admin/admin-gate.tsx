"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { desoPublicKey } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Avoid hydration mismatch — store is not available during SSR
  if (!mounted) return null;

  if (!desoPublicKey || !ADMIN_KEYS.includes(desoPublicKey)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface p-8 text-center">
          <h1 className="mb-2 font-display text-xl font-bold text-text-primary">Access Denied</h1>
          <p className="text-sm text-text-muted">
            {desoPublicKey
              ? "Your DeSo account does not have admin access."
              : "Connect your DeSo wallet to access the admin panel."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
