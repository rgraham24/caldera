"use client";

import { useAppStore } from "@/store";
import { DepositModal } from "./DepositModal";

export function DepositModalRoot() {
  const { isDepositModalOpen, closeDepositModal } = useAppStore();

  if (!isDepositModalOpen) return null;
  return <DepositModal onClose={closeDepositModal} />;
}
