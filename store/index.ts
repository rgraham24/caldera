import { create } from "zustand";
import type { User } from "@/types";

type AppState = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  desoPublicKey: string | null;
  desoBalanceNanos: number;
  desoBalanceUSD: number;

  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setDesoPublicKey: (key: string | null) => void;
  setDesoBalance: (nanos: number, usd: number) => void;
  logout: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  desoPublicKey: null,
  desoBalanceNanos: 0,
  desoBalanceUSD: 0,

  setUser: (user) =>
    set({ user, isAuthenticated: !!user, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),

  setDesoPublicKey: (desoPublicKey) => set({ desoPublicKey }),

  setDesoBalance: (desoBalanceNanos, desoBalanceUSD) =>
    set({ desoBalanceNanos, desoBalanceUSD }),

  logout: () =>
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      desoPublicKey: null,
      desoBalanceNanos: 0,
      desoBalanceUSD: 0,
    }),
}));
