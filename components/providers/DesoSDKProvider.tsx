"use client";

import { useEffect } from "react";
import { NOTIFICATION_EVENTS } from "deso-protocol";
import type { SubscriberNotification } from "deso-protocol";
import { getDesoIdentity } from "@/lib/deso/identity";
import { useAppStore } from "@/store";

export function DesoSDKProvider({ children }: { children: React.ReactNode }) {
  const setConnected = useAppStore((s) => s.setConnected);
  const setDisconnected = useAppStore((s) => s.setDisconnected);

  useEffect(() => {
    const id = getDesoIdentity();

    const subscriber = async (notification: SubscriberNotification) => {
      if (notification.event === NOTIFICATION_EVENTS.LOGIN_END) {
        const publicKey = notification.currentUser?.publicKey;
        if (!publicKey) return;

        try {
          const [profileRes, priceRes] = await Promise.all([
            fetch("https://api.deso.org/api/v0/get-single-profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ PublicKeyBase58Check: publicKey }),
            }).then((r) => r.json()),
            fetch("https://api.deso.org/api/v0/get-exchange-rate").then((r) => r.json()),
          ]);

          const balanceNanos: number = profileRes.Profile?.DESOBalanceNanos ?? 0;
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
            console.error("[DesoSDK] identity.jwt() failed:", jwtErr);
            return;
          }

          const loginRes = await fetch("/api/auth/deso-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicKey, desoJwt, username, avatarUrl }),
          });

          if (!loginRes.ok) {
            console.error("[DesoSDK] login failed:", loginRes.status);
            return;
          }

          const derivedKey = notification.currentUser?.primaryDerivedKey;
          setConnected({
            publicKey,
            username,
            profilePicUrl: avatarUrl,
            balanceUSD,
            balanceDeso,
            derivedPublicKey: derivedKey?.derivedPublicKeyBase58Check,
            accessSignature: derivedKey?.accessSignature,
            expirationBlock: derivedKey?.expirationBlock,
          });
        } catch (e) {
          console.error("[DesoSDK] LOGIN_END handler failed:", e);
        }
      }

      if (notification.event === NOTIFICATION_EVENTS.LOGOUT_END) {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch (e) {
          console.warn("[DesoSDK] logout endpoint failed (proceeding anyway):", e);
        }
        setDisconnected();
      }
    };

    id.subscribe(subscriber);
    return () => {
      id.unsubscribe(subscriber);
    };
  }, [setConnected, setDisconnected]);

  return <>{children}</>;
}
