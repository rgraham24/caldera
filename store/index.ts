import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "@/types";
import type { ConnectedUser } from "@/lib/deso/auth";

type AppState = {
  user: User | null;
  isConnected: boolean;
  isLoading: boolean;
  desoPublicKey: string | null;
  desoUsername: string | null;
  desoProfilePicUrl: string | null;
  desoBalanceNanos: number;
  desoBalanceUSD: number;
  desoBalanceDeso: number;
  derivedPublicKey: string | null;
  derivedKeyEncrypted: string | null;
  accessSignature: string | null;
  expirationBlock: number | null;
  encryptedSeedHex: string | null;
  accessLevelHmac: string | null;
  accessLevel: number;
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
      derivedPublicKey: null,
      derivedKeyEncrypted: null,
      accessSignature: null,
      expirationBlock: null,
      encryptedSeedHex: null,
      accessLevelHmac: null,
      accessLevel: 2,
      isDepositModalOpen: false,
      openDepositModal: () => set({ isDepositModalOpen: true }),
      closeDepositModal: () => set({ isDepositModalOpen: false }),
      setUser: (user) => set({ user, isConnected: !!user, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
      setDesoPublicKey: (desoPublicKey) => set({ desoPublicKey }),
      // FIX: also update desoBalanceDeso so mobile nav shows correct value
      setDesoBalance: (desoBalanceNanos, desoBalanceUSD) =>
        set({ desoBalanceNanos, desoBalanceUSD, desoBalanceDeso: desoBalanceNanos / 1e9 }),
      setConnected: (userData: ConnectedUser) =>
        set({
          isConnected: true,
          desoPublicKey: userData.publicKey,
          desoUsername: userData.username,
          desoProfilePicUrl: userData.profilePicUrl,
          desoBalanceUSD: userData.balanceUSD,
          desoBalanceDeso: userData.balanceDeso,
          derivedPublicKey: userData.derivedPublicKey ?? null,
          derivedKeyEncrypted: userData.derivedKeyEncrypted ?? null,
          accessSignature: userData.accessSignature ?? null,
          expirationBlock: userData.expirationBlock ?? null,
          encryptedSeedHex: userData.encryptedSeedHex ?? null,
          accessLevelHmac: userData.accessLevelHmac ?? null,
          accessLevel: userData.accessLevel ?? 2,
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
          derivedPublicKey: null,
          derivedKeyEncrypted: null,
          accessSignature: null,
          expirationBlock: null,
          encryptedSeedHex: null,
          accessLevelHmac: null,
          accessLevel: 2,
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
          derivedPublicKey: null,
          derivedKeyEncrypted: null,
          accessSignature: null,
          expirationBlock: null,
          encryptedSeedHex: null,
          accessLevelHmac: null,
          accessLevel: 2,
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
        derivedPublicKey: state.derivedPublicKey,
        derivedKeyEncrypted: state.derivedKeyEncrypted,
        accessSignature: state.accessSignature,
        expirationBlock: state.expirationBlock,
        encryptedSeedHex: state.encryptedSeedHex,
        accessLevelHmac: state.accessLevelHmac,
        accessLevel: state.accessLevel,
      }),
    }
  )
);
