"use client";

import { configure, identity } from "deso-protocol";

let configured = false;

/**
 * Mirror of focus.xyz's pattern: grant a broad derived key with all
 * transaction types Caldera uses today + future features (posts,
 * likes, profile edits, NFTs) on first connect, so users only see one
 * Identity popup per ~30-day session. When adding new features that
 * need a new TransactionType, add it here so existing users don't get
 * re-prompted.
 *
 * Keys MUST match the canonical TransactionType enum string values
 * from deso-protocol's backend-types/deso-types-custom (e.g. FOLLOW,
 * not UPDATE_FOLLOWING_STATUS — the SDK's guardTxPermission checks
 * the canonical names internally). Verify before adding new entries.
 *
 * GlobalDESOLimit is 10 DESO — generous safety bound; per-type counts
 * are 1000 each (vs 'UNLIMITED' to keep the permissions popup readable
 * at the price of some hypothetical future ceiling).
 *
 * SEND_DIAMONDS is NOT a separate type; the SDK's sendDiamonds() guards
 * on BASIC_TRANSFER. Diamonds are basic transfers with diamond level in
 * ExtraData.
 *
 * Exported so re-authorization paths in lib/deso/api.ts can request the
 * SAME broad scope when a specific permission is missing — never a
 * per-feature narrow subset, which would force a fresh popup for the
 * next feature touched.
 */
export const BROAD_SPENDING_LIMIT_OPTIONS = {
  GlobalDESOLimit: 10 * 1e9,
  TransactionCountLimitMap: {
    AUTHORIZE_DERIVED_KEY: 1,
    BASIC_TRANSFER: 1000,         // ordinary transfers + diamonds
    CREATOR_COIN: 1000,           // buy / sell creator coins
    CREATOR_COIN_TRANSFER: 1000,  // move creator coins between users
    FOLLOW: 1000,                 // follow / unfollow profiles
    SUBMIT_POST: 1000,            // posts, comments, replies
    LIKE: 1000,                   // engage with posts
    UPDATE_PROFILE: 1000,         // edit display name / bio / pic
    CREATE_NFT: 1000,             // future NFT features
    ACCEPT_NFT_BID: 1000,         // future NFT features
  } as Record<string, number>,
  CreatorCoinOperationLimitMap: {
    "": { buy: 1e9, sell: 1e9 },
  },
};

export function getDesoIdentity() {
  if (!configured && typeof window !== "undefined") {
    configure({
      spendingLimitOptions: BROAD_SPENDING_LIMIT_OPTIONS,
      nodeURI: "https://node.deso.org",
      appName: "Caldera",
    });
    configured = true;
  }
  return identity;
}
