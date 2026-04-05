// All DeSo SDK interactions go here. Keep the rest of the app DeSo-agnostic.

import { identity } from "deso-protocol";

const DESO_APP_NAME =
  process.env.NEXT_PUBLIC_DESO_APP_NAME || "Caldera";
const DESO_REDIRECT_URI =
  process.env.NEXT_PUBLIC_DESO_REDIRECT_URI || "http://localhost:3000/login";

export const deso = {
  // Identity
  login: async () => {
    const response = await identity.login({
      getFreeDeso: true,
    });
    return response;
  },

  logout: async () => {
    await identity.logout();
  },

  getCurrentUser: async (): Promise<string | null> => {
    const snapshot = await identity.snapshot();
    return (snapshot as { currentUser?: { publicKey?: string } })?.currentUser?.publicKey ?? null;
  },

  initialize: () => {
    identity.configure({
      spendingLimitOptions: {
        GlobalDESOLimit: 1000000000, // 1 DESO in nanos
        TransactionCountLimitMap: {
          BASIC_TRANSFER: 10,
          SUBMIT_POST: 10,
        },
      },
      appName: DESO_APP_NAME,
      redirectURI: DESO_REDIRECT_URI,
    });
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
