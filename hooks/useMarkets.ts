"use client";

import { useState, useEffect } from "react";
import type { Market } from "@/types";

export function useMarkets(filters?: {
  category?: string;
  status?: string;
  sort?: string;
}) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters?.category) params.set("category", filters.category);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.sort) params.set("sort", filters.sort);

    fetch(`/api/markets?${params}`)
      .then((res) => res.json())
      .then(({ data }) => setMarkets(data ?? []))
      .finally(() => setLoading(false));
  }, [filters?.category, filters?.status, filters?.sort]);

  return { markets, loading };
}
