"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store";
import { DepositModal } from "./DepositModal";

export function DepositModalRoot() {
  const {
    isConnected,
    desoBalanceDeso,
    isDepositModalOpen,
    openDepositModal,
    closeDepositModal,
  } = useAppStore();

  // First-time welcome: auto-open for new DeSo users with starter DESO
  useEffect(() => {
    if (!isConnected) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem("caldera_welcomed") === "true") return;
    if (desoBalanceDeso > 0 && desoBalanceDeso < 0.5) {
      openDepositModal();
    }
  }, [isConnected, desoBalanceDeso, openDepositModal]);

  if (!isDepositModalOpen) return null;
  return <DepositModal onClose={closeDepositModal} />;
}
