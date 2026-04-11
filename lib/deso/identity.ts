"use client";

import { configure, identity } from "deso-protocol";

let configured = false;

export function getDesoIdentity() {
  if (!configured && typeof window !== "undefined") {
    configure({
      spendingLimitOptions: {
        IsUnlimited: false,
        GlobalDESOLimit: 10 * 1e9,
        CreatorCoinOperationLimitMap: { "": { buy: 1e9, sell: 1e9 } },
        TransactionCountLimitMap: {
          BASIC_TRANSFER: 100,
          CREATOR_COIN: 1000,
          AUTHORIZE_DERIVED_KEY: 1,
        },
      },
      nodeURI: "https://node.deso.org",
    });
    configured = true;
  }
  return identity;
}
