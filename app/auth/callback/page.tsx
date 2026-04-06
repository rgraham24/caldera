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
        searchParams.get("public_key") || searchParams.get("publicKey");

      if (!publicKey) {
        const returnTo = localStorage.getItem("caldera_auth_return") || "/";
        localStorage.removeItem("caldera_auth_return");
        router.push(returnTo);
        return;
      }

      try {
        const [profileRes, balanceRes] = await Promise.all([
          fetch("https://api.deso.org/api/v0/get-single-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ PublicKeyBase58Check: publicKey }),
          }).then((r) => r.json()),
          fetch("https://api.deso.org/api/v0/get-users-stateless", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ PublicKeysBase58Check: [publicKey] }),
          }).then((r) => r.json()),
        ]);

        const balanceNanos: number =
          balanceRes.UserList?.[0]?.BalanceNanos || 0;
        const desoPrice = 5.25;

        setConnected({
          publicKey,
          username:
            profileRes.Profile?.Username || publicKey.substring(0, 8),
          profilePicUrl: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`,
          balanceUSD: (balanceNanos / 1e9) * desoPrice,
          balanceDeso: balanceNanos / 1e9,
        });
      } catch (e) {
        console.error("Auth callback error:", e);
      }

      const returnTo = localStorage.getItem("caldera_auth_return") || "/";
      localStorage.removeItem("caldera_auth_return");
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
