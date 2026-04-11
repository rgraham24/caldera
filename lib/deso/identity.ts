"use client";

import { configure, identity } from "deso-protocol";

let configured = false;

export function getDesoIdentity() {
  if (!configured && typeof window !== "undefined") {
    configure({
      spendingLimitOptions: {
        GlobalDESOLimit: 10 * 1e9,
        TransactionCountLimitMap: {
          AUTHORIZE_DERIVED_KEY: 1,
          CREATOR_COIN: 1000,
          BASIC_TRANSFER: 100,
        } as Record<string, number>,
        CreatorCoinOperationLimitMap: {
          "": { buy: 1e9, sell: 1e9 },
        },
      },
      nodeURI: "https://node.deso.org",
      appName: "Caldera",
    });
    configured = true;
  }
  return identity;
}
