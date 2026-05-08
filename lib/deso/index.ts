// All DeSo SDK interactions go here. Keep the rest of the app DeSo-agnostic.

import { getDesoIdentity } from "@/lib/deso/identity";

export const deso = {
  // Identity
  // Both connect entrypoints (this `deso.login()` from /login page +
  // `connectDeSoWallet()` in lib/deso/auth.ts from the TopNav button)
  // route through getDesoIdentity() so the IsUnlimited:true scope from
  // identity.ts is configured before the login() call. Previously this
  // file set up a SECOND, narrow `identity.configure({...})` via a
  // never-called `initialize()` helper — dead code that risked drift.
  login: async () => {
    const id = getDesoIdentity();
    return id.login({ getFreeDeso: true });
  },

  logout: async () => {
    const id = getDesoIdentity();
    await id.logout();
  },

  getCurrentUser: async (): Promise<string | null> => {
    const id = getDesoIdentity();
    const snapshot = await id.snapshot();
    return (snapshot as { currentUser?: { publicKey?: string } })?.currentUser?.publicKey ?? null;
  },

  // Profile
  getProfile: async (publicKey: string) => {
    try {
      const response = await fetch(
        `https://node.deso.org/api/v0/get-single-profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ PublicKeyBase58Check: publicKey }),
        }
      );
      const data = await response.json();
      return data?.Profile ?? null;
    } catch {
      return null;
    }
  },

  // Creator Coins (Phase 2 — stub for now)
  getCreatorCoinPrice: async (_publicKey: string): Promise<number | null> => {
    return null;
  },

  buyCreatorCoin: async (
    _publicKey: string,
    _amount: number
  ): Promise<never> => {
    throw new Error("Creator coin buy not implemented — Phase 2");
  },

  sellCreatorCoin: async (
    _publicKey: string,
    _amount: number
  ): Promise<never> => {
    throw new Error("Creator coin sell not implemented — Phase 2");
  },
};
