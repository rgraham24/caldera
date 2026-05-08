"use client";

import { configure, identity } from "deso-protocol";

let configured = false;

/**
 * Canonical DeSo social-app pattern: request unlimited spending scope
 * at first connect. The user sees ONE Identity popup, approves once,
 * then every transaction type (follow, post, like, creator coin buy,
 * profile update, NFT, future features we haven't built yet) signs
 * silently for the derived key's lifetime (~30 days).
 *
 * DeSo's docs explicitly recommend this pattern for production social
 * apps. From their landing page demo and used by Diamond, Focus, and
 * Openfund:
 *
 *     spendingLimitOptions: { IsUnlimited: true }
 *
 * Why we abandoned the enumerated TransactionCountLimitMap path:
 *
 *  - The SDK's guardTxPermission strictly checks the granted map. Any
 *    missing transaction type triggers a fresh permissions popup,
 *    which means each new feature we add (DMs, validator stake, DAO
 *    coin) becomes a forced re-authorization for every existing user.
 *  - Maintaining the list in lockstep with feature work is a constant
 *    drift hazard. We already shipped one bug where the wrong canonical
 *    name (UPDATE_FOLLOWING_STATUS vs FOLLOW) silently broke the
 *    permission gate.
 *  - Re-auth paths that requested a narrow per-feature subset stacked
 *    popups on each other for users with old derived keys.
 *
 * IsUnlimited: true is the docs-blessed way to avoid all of this. The
 * derived key is still bounded by its expiration window — the user
 * isn't granting forever access, just everything-for-30-days. Same UX
 * as Diamond / Focus / Openfund.
 *
 * Exported as BROAD_SPENDING_LIMIT_OPTIONS so api.ts and any future
 * re-authorization path can reference the same shape without
 * duplicating the literal.
 */
export const BROAD_SPENDING_LIMIT_OPTIONS = {
  IsUnlimited: true,
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
