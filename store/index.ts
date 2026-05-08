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
  /**
   * Set of DeSo public keys that the connected user follows. Source of
   * truth is DeSo's blockchain follow graph (api.deso.org); this set
   * is hydrated on connect from /api/following and updated optimistically
   * by FollowButton after a successful follow/unfollow tx.
   */
  followedDesoKeys: Set<string>;
  /**
   * Flips to true after Zustand's persist middleware finishes reading
   * localStorage. Components that depend on persisted auth state must
   * gate their effects on this flag — otherwise they'll fire once with
   * the SSR/initial-render defaults (isConnected=false, desoPublicKey=null)
   * and another time after persist hydrates, with potentially-broken
   * intermediate states (e.g. /following showing the empty state because
   * the early-bail effect ran with desoPublicKey=null and never re-fired
   * cleanly when persist completed).
   *
   * NOT in partialize() — must always start false on every page load.
   */
  _hasHydrated: boolean;
  isDepositModalOpen: boolean;
  openDepositModal: () => void;
  closeDepositModal: () => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setDesoPublicKey: (key: string | null) => void;
  setDesoBalance: (nanos: number, usd: number) => void;
  setConnected: (userData: ConnectedUser) => void;
  setDisconnected: () => void;
  setFollowedDesoKeys: (keys: Set<string>) => void;
  addFollowedDesoKey: (key: string) => void;
  removeFollowedDesoKey: (key: string) => void;
  setHasHydrated: (state: boolean) => void;
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
      followedDesoKeys: new Set<string>(),
      _hasHydrated: false,
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
          followedDesoKeys: new Set<string>(),
        }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setFollowedDesoKeys: (keys) => set({ followedDesoKeys: new Set(keys) }),
      addFollowedDesoKey: (key) =>
        set((state) => {
          const next = new Set(state.followedDesoKeys);
          next.add(key);
          return { followedDesoKeys: next };
        }),
      removeFollowedDesoKey: (key) =>
        set((state) => {
          const next = new Set(state.followedDesoKeys);
          next.delete(key);
          return { followedDesoKeys: next };
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
          followedDesoKeys: new Set<string>(),
        }),
    }),
    {
      name: "caldera-auth",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : sessionStorage
      ),
      onRehydrateStorage: () => (state) => {
        console.log("[Store] onRehydrateStorage fired", {
          stateExists: !!state,
          isConnected: state?.isConnected,
          desoPublicKey: state?.desoPublicKey
            ? state.desoPublicKey.slice(0, 12) + "..."
            : null,
        });
        if (state) {
          useAppStore.setState({ isConnected: state.isConnected });
        }
        // Fire even when state is undefined (no localStorage entry yet) —
        // we still want components to know hydration is done so they
        // stop showing skeletons and render the unauthenticated branch.
        state?.setHasHydrated(true);
        // For the no-localStorage-entry case, set the flag directly:
        if (!state) {
          useAppStore.setState({ _hasHydrated: true });
        }
        console.log("[Store] _hasHydrated flipped to true");
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
