"use client";
import { useEffect } from "react";

export function DesoProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    import("deso-protocol").then(({ configure }) => {
      configure({
        spendingLimitOptions: {
          GlobalDESOLimit: 10 * 1e9,
          CreatorCoinOperationLimitMap: {
            "": { buy: 1e9, sell: 1e9 },
          },
        },
        appName: "Caldera",
        nodeURI: "https://node.deso.org",
        identityURI: "https://identity.deso.org",
      });
    });
  }, []);
  return <>{children}</>;
}
