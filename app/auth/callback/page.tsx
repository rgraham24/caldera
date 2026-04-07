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
      // DEBUG: log full URL and all search params
      console.log("[auth/callback] href:", window.location.href);
      console.log("[auth/callback] hash:", window.location.hash);
      const allParams: Record<string, string> = {};
      searchParams.forEach((v, k) => { allParams[k] = v; });
      console.log("[auth/callback] searchParams:", allParams);

      const publicKey =
        searchParams.get("public_key") || searchParams.get("publicKey");

      console.log("[auth/callback] publicKey:", publicKey);

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

        console.log("[auth/callback] profileRes:", profileRes);

        const balanceNanos: number =
          profileRes.Profile?.DESOBalanceNanos || 0;
        const desoPrice = 5.25;
        const balanceUSD = (balanceNanos / 1e9) * desoPrice;
        const balanceDeso = balanceNanos / 1e9;

        const userData = {
          publicKey,
          username:
            profileRes.Profile?.Username || publicKey.substring(0, 8),
          profilePicUrl: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`,
          balanceUSD,
          balanceDeso,
        };
        console.log("[auth/callback] calling setConnected with:", userData);
        localStorage.removeItem("caldera_welcomed");
        setConnected(userData);
      } catch (e) {
        // Proceed with minimal data on error
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
      console.log("[auth/callback] caldera-auth in localStorage:", localStorage.getItem("caldera-auth"));
      console.log("[auth/callback] redirecting to:", returnTo);
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
