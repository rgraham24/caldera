"use client";

import { useAppStore } from "@/store";

export function useUser() {
  const { user, isAuthenticated, isLoading } = useAppStore();
  return { user, isAuthenticated, isLoading };
}
