"use client";

/**
 * Global mount for CreateMarketModal — subscribes to store state so
 * the modal can be opened from anywhere (top-nav "+ Create" button
 * being the primary trigger). Mirrors the DepositModalRoot pattern.
 *
 * Dynamic-imports the modal so the wizard component + its deps only
 * arrive in the bundle when the user actually clicks Create.
 */

import dynamic from "next/dynamic";
import { useAppStore } from "@/store";

const CreateMarketModal = dynamic(
  () =>
    import("./CreateMarketModal").then((m) => ({ default: m.CreateMarketModal })),
  { ssr: false }
);

export function CreateMarketModalRoot() {
  const { isCreateMarketModalOpen, closeCreateMarketModal } = useAppStore();
  if (!isCreateMarketModalOpen) return null;
  return <CreateMarketModal isOpen onClose={closeCreateMarketModal} />;
}
