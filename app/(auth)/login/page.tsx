"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deso } from "@/lib/deso";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setUser } = useAppStore();

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await deso.login();
      const publicKey = response?.publicKeyBase58Check;

      if (!publicKey) {
        throw new Error("Login failed — no public key received");
      }

      // Get DeSo profile
      const profile = await deso.getProfile(publicKey);

      // Create or get user in our backend
      const res = await fetch("/api/auth/deso-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey,
          username: profile?.Username,
          avatarUrl: profile?.ExtraData?.LargeProfilePicURL,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create account");
      }

      const { data: user } = await res.json();
      setUser(user);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/">
            <span className="font-display text-3xl font-bold text-caldera">
              Caldera
            </span>
          </Link>
          <p className="mt-2 text-text-muted">
            Connect your DeSo identity to start trading
          </p>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface p-6">
          <Button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full bg-caldera text-white hover:bg-caldera/90 py-6 text-base font-semibold"
          >
            {isLoading ? "Connecting..." : "Connect with DeSo"}
          </Button>

          {error && (
            <p className="mt-4 text-center text-sm text-no">{error}</p>
          )}

          <p className="mt-4 text-center text-xs text-text-faint">
            By connecting, you agree to trade on the Caldera prediction market
            platform. Your DeSo identity is used for authentication only.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-text-faint">
          <Link href="/" className="text-caldera hover:underline">
            Continue as guest
          </Link>
        </p>
      </div>
    </div>
  );
}
