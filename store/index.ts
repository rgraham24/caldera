import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "@/types";
import type { ConnectedUser } from "@/lib/deso/auth";

type AppState = {
  user: User | null;
  isConnected: boolean;
  isLoading: boolean;

  // DeSo wallet
  desoPublicKey: string | null;
  desoUsername: string | null;
  desoProfilePicUrl: string | null;
  desoBalanceNanos: number;
  desoBalanceUSD: number;
  desoBalanceDeso: number;

  // Deposit modal
  isDepositModalOpen: boolean;
  openDepositModal: () => void;
  closeDepositModal: () => void;

  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setDesoPublicKey: (key: string | null) => void;
  setDesoBalance: (nanos: number, usd: number) => void;
  setConnected: (userData: ConnectedUser) => void;
  setDisconnected: () => void;
  logout: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
        user: null,
        isConnected: false,
        isLoading: false,
        desoPublicKey: null,
        desoUsername: null,
        desoProfilePicUrl: null,
        desoBalanceNanos: 0,
        desoBalanceUSD: 0,
        desoBalanceDeso: 0,
        isDepositModalOpen: false,
        openDepositModal: () => set({ isDepositModalOpen: true }),
        closeDepositModal: () => set({ isDepositModalOpen: false }),

        setUser: (user) =>
          set({ user, isConnected: !!user, isLoading: false }),

        setLoading: (isLoading) => set({ isLoading }),

        setDesoPublicKey: (desoPublicKey) => set({ desoPublicKey }),

        setDesoBalance: (desoBalanceNanos, desoBalanceUSD) =>
          set({ desoBalanceNanos, desoBalanceUSD }),

        setConnected: (userData: ConnectedUser) =>
          set({
            isConnected: true,
            desoPublicKey: userData.publicKey,
            desoUsername: userData.username,
            desoProfilePicUrl: userData.profilePicUrl,
            desoBalanceUSD: userData.balanceUSD,
            desoBalanceDeso: userData.balanceDeso,
          }),

        setDisconnected: () =>
          set({
            isConnected: false,
            user: null,
            desoPublicKey: null,
            desoUsername: null,
            desoProfilePicUrl: null,
            desoBalanceUSD: 0,
            desoBalanceDeso: 0,
            desoBalanceNanos: 0,
          }),

        logout: () =>
          set({
            user: null,
            isConnected: false,
            isLoading: false,
            desoPublicKey: null,
            desoUsername: null,
            desoProfilePicUrl: null,
            desoBalanceNanos: 0,
            desoBalanceUSD: 0,
            desoBalanceDeso: 0,
          }),
    }),
    {
      name: "caldera-auth",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : sessionStorage
      ),
      onRehydrateStorage: () => (state) => {
        if (state) {
          useAppStore.setState({ isConnected: state.isConnected });
        }
      },
      partialize: (state) => ({
        isConnected: state.isConnected,
        desoPublicKey: state.desoPublicKey,
        desoUsername: state.desoUsername,
        desoProfilePicUrl: state.desoProfilePicUrl,
        desoBalanceUSD: state.desoBalanceUSD,
        desoBalanceDeso: state.desoBalanceDeso,
      }),
    }
  )
);
