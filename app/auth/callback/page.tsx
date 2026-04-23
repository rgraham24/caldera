"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/store";
import { getDesoIdentity } from "@/lib/deso/identity";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setConnected } = useAppStore();

  useEffect(() => {
    const handleCallback = async () => {
      console.log('[AUTH_CALLBACK] All search params:', Object.fromEntries(searchParams.entries()));
      console.log('[AUTH_CALLBACK] Full URL:', window.location.href);

      // Try SDK snapshot first (set by popup-based login)
      const sdkSnapshot = await import("@/lib/deso/identity")
        .then(({ getDesoIdentity }) => getDesoIdentity().snapshot() as import("deso-protocol").IdentityState)
        .catch(() => null);
      const sdkPublicKey = sdkSnapshot?.currentUser?.publicKey ?? null;

      const publicKey =
        sdkPublicKey ||
        searchParams.get("public_key") ||
        searchParams.get("publicKey") ||
        (() => {
          try {
            const payload = searchParams.get("payload");
            if (!payload) return null;
            const decoded = JSON.parse(decodeURIComponent(decodeURIComponent(payload)));
            return (
              decoded.publicKeyAdded ||
              decoded.PublicKeyBase58Check ||
              (decoded.users ? Object.keys(decoded.users)[0] : null)
            );
          } catch {
            try {
              const payload = searchParams.get("payload");
              const decoded = JSON.parse(decodeURIComponent(payload!));
              return (
                decoded.publicKeyAdded ||
                decoded.PublicKeyBase58Check ||
                (decoded.users ? Object.keys(decoded.users)[0] : null)
              );
            } catch {
              return null;
            }
          }
        })();

      if (!publicKey) {
        const returnTo = localStorage.getItem("caldera_auth_return") || "/";
        localStorage.removeItem("caldera_auth_return");
        router.push(returnTo);
        return;
      }

      const prevKey = localStorage.getItem("caldera_auth_prev_key");
      if (prevKey !== publicKey) {
        localStorage.removeItem("caldera_welcomed");
        localStorage.setItem("caldera_auth_prev_key", publicKey);
      }

      try {
        const [profileRes, priceRes] = await Promise.all([
          fetch("https://api.deso.org/api/v0/get-single-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ PublicKeyBase58Check: publicKey }),
          }).then((r) => r.json()),
          fetch("https://api.deso.org/api/v0/get-exchange-rate").then((r) => r.json()),
        ]);

        const balanceNanos: number = profileRes.Profile?.DESOBalanceNanos || 0;
        const desoPrice = (priceRes?.USDCentsPerDeSoExchangeRate ?? 525) / 100;
        const balanceUSD = (balanceNanos / 1e9) * desoPrice;
        const balanceDeso = balanceNanos / 1e9;
        const username = profileRes.Profile?.Username || publicKey.substring(0, 8);
        const avatarUrl = `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`;

        const identity = getDesoIdentity();
        let desoJwt: string;
        try {
          desoJwt = await identity.jwt();
        } catch (jwtErr) {
          console.error("[auth/callback] identity.jwt() failed:", jwtErr);
          const returnTo = localStorage.getItem("caldera_auth_return") || "/";
          localStorage.removeItem("caldera_auth_return");
          router.push(returnTo);
          return;
        }

        const loginRes = await fetch("/api/auth/deso-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey, desoJwt, username, avatarUrl }),
        });

        if (!loginRes.ok) {
          console.error("[auth/callback] deso-login failed:", loginRes.status);
        }

        // Extract derived key params if present
        const derivedPublicKey = searchParams.get("derivedPublicKey") ?? undefined;
        const derivedKeyEncrypted = searchParams.get("derivedKeyEncrypted") ?? undefined;
        const accessSignature = searchParams.get("accessSignature") ?? undefined;
        const expirationBlockStr = searchParams.get("expirationBlock");
        const expirationBlock = expirationBlockStr ? parseInt(expirationBlockStr, 10) : undefined;

        // Extract encryptedSeedHex / accessLevelHmac / accessLevel from the users payload
        let encryptedSeedHex: string | undefined;
        let accessLevelHmac: string | undefined;
        let accessLevel: number | undefined;
        try {
          const rawPayload = searchParams.get("payload");
          if (rawPayload) {
            let decoded: Record<string, unknown>;
            try { decoded = JSON.parse(decodeURIComponent(decodeURIComponent(rawPayload))); }
            catch { decoded = JSON.parse(decodeURIComponent(rawPayload)); }
            const users = decoded.users as Record<string, { encryptedSeedHex?: string; accessLevelHmac?: string; accessLevel?: number }> | undefined;
            if (users && users[publicKey]) {
              encryptedSeedHex = users[publicKey].encryptedSeedHex;
              accessLevelHmac = users[publicKey].accessLevelHmac;
              accessLevel = users[publicKey].accessLevel;
            }
          }
        } catch { /* non-fatal */ }

        localStorage.removeItem("caldera_welcomed");
        setConnected({ publicKey, username, profilePicUrl: avatarUrl, balanceUSD, balanceDeso, derivedPublicKey, derivedKeyEncrypted, accessSignature, expirationBlock, encryptedSeedHex, accessLevelHmac, accessLevel });
      } catch (e) {
        console.error("[auth/callback] profile fetch failed:", e);
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
      await new Promise((r) => setTimeout(r, 200));
      router.push(returnTo);
    };

    handleCallback();
  }, [searchParams, router, setConnected]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
      <div className="text-center">
        <div className="text-white text-lg font-medium mb-2">Connecting your wallet...</div>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Just a moment</div>
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
            <div className="text-white text-lg font-medium mb-2">Connecting your wallet...</div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Just a moment</div>
          </div>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
