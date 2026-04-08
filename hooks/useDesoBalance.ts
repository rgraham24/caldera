import { useEffect, useCallback, useRef } from "react";

// Adaptive polling — fast when trading, slow when browsing
const ACTIVE_POLL_MS = 10_000; // 10s on market/trade pages
const IDLE_POLL_MS = 30_000;   // 30s everywhere else

async function fetchDesoBalance(
  publicKey: string
): Promise<{ nanos: number; usd: number } | null> {
  try {
    const [userRes, priceRes] = await Promise.all([
      fetch("https://api.deso.org/api/v0/get-users-stateless", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          PublicKeysBase58Check: [publicKey],
          SkipForLeaderboard: false,
        }),
      }),
      fetch("https://api.deso.org/api/v0/get-exchange-rate"),
    ]);

    if (!userRes.ok || !priceRes.ok) return null;

    const [userData, priceData] = await Promise.all([
      userRes.json(),
      priceRes.json(),
    ]);

    const nanos: number = userData?.UserList?.[0]?.BalanceNanos ?? 0;
    const cents: number = priceData?.USDCentsPerDeSoExchangeRate ?? 500;
    const usd = (nanos / 1e9) * (cents / 100);

    return { nanos, usd };
  } catch {
    return null;
  }
}

export function useDesoBalance(
  publicKey: string | null,
  onUpdate: (nanos: number, usd: number) => void,
  isActivePage = false // true on market detail / trade pages
) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const poll = useCallback(async () => {
    if (!publicKey) return;
    const result = await fetchDesoBalance(publicKey);
    if (result) onUpdateRef.current(result.nanos, result.usd);
  }, [publicKey]);

  const refresh = useCallback(() => {
    poll();
  }, [poll]);

  useEffect(() => {
    if (!publicKey) return;

    // Fetch immediately on mount
    poll();

    const interval = isActivePage ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    intervalRef.current = setInterval(poll, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [publicKey, isActivePage, poll]);

  return { refresh };
}

// Standalone fetch for one-off refreshes
export { fetchDesoBalance };
