"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/store";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setConnected } = useAppStore();

  useEffect(() => {
    const handleCallback = async () => {
      const publicKey =
        searchParams.get("public_key") ||
        searchParams.get("publicKey") ||
        (() => {
          try {
            const payload = searchParams.get("payload");
            if (!payload) return null;
            // DeSo double-encodes the payload
            const decoded = JSON.parse(decodeURIComponent(decodeURIComponent(payload)));
            return (
              decoded.publicKeyAdded ||
              decoded.PublicKeyBase58Check ||
              (decoded.users ? Object.keys(decoded.users)[0] : null)
            );
          } catch {
            try {
              // Single decode as fallback
              const payload = searchParams.get("payload");
              const decoded = JSON.parse(decodeURIComponent(payload!));
              return (
                decoded.publicKeyAdded ||
                decoded.PublicKeyBase58Check ||
                (decoded.users ? Object.keys(decoded.users)[0] : null)
              );
            } catch { return null; }
          }
        })();

      if (!publicKey) {
        const returnTo = localStorage.getItem("caldera_auth_return") || "/";
        localStorage.removeItem("caldera_auth_return");
        router.push(returnTo);
        return;
      }

      // Reset welcome banner if this is a different public key
      const prevKey = localStorage.getItem("caldera_auth_prev_key");
      if (prevKey !== publicKey) {
        localStorage.removeItem("caldera_welcomed");
        localStorage.setItem("caldera_auth_prev_key", publicKey);
      }

      try {
        const profileRes = await fetch(
          "https://api.deso.org/api/v0/get-single-profile",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ PublicKeyBase58Check: publicKey }),
          }
        ).then((r) => r.json());

        const balanceNanos: number =
          profileRes.Profile?.DESOBalanceNanos || 0;
        const desoPrice = 5.25;
        const balanceUSD = (balanceNanos / 1e9) * desoPrice;
        const balanceDeso = balanceNanos / 1e9;

        localStorage.removeItem("caldera_welcomed");
        setConnected({
          publicKey,
          username: profileRes.Profile?.Username || publicKey.substring(0, 8),
          profilePicUrl: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`,
          balanceUSD,
          balanceDeso,
        });
      } catch (e) {
        console.error("[auth/callback] profile fetch failed:", e);
        // Proceed with minimal data so login still succeeds
        localStorage.removeItem("caldera_welcomed");
        setConnected({
          publicKey,
          username: publicKey.substring(0, 8),
          profilePicUrl: "",
          balanceUSD: 0,
          balanceDeso: 0,
        });
      }

      const returnTo = localStorage.getItem("caldera_auth_return") || "/";
      localStorage.removeItem("caldera_auth_return");

      // Small delay to let Zustand persist flush to localStorage before navigation
      await new Promise((r) => setTimeout(r, 200));
      router.push(returnTo);
    };

    handleCallback();
  }, [searchParams, router, setConnected]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
      <div className="text-center">
        <div className="text-white text-lg font-medium mb-2">
          Connecting your wallet...
        </div>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Just a moment
        </div>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
          <div className="text-center">
            <div className="text-white text-lg font-medium mb-2">
              Connecting your wallet...
            </div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Just a moment
            </div>
          </div>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
