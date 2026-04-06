"use client";

import { useAppStore } from "@/store";

export function useUser() {
  const { user, isConnected, isLoading } = useAppStore();
  return { user, isConnected, isLoading };
}
