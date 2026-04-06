"use client";

import { useState, useEffect } from "react";
import type { LeaderboardEntry, LeaderboardPeriod } from "@/types";

export function useLeaderboard(period: LeaderboardPeriod = "alltime") {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/leaderboard?period=${period}`)
      .then((res) => res.json())
      .then(({ data }) => setEntries(data ?? []))
      .finally(() => setLoading(false));
  }, [period]);

  return { entries, loading };
}
