"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "@/store";

export function WelcomeBanner() {
  const { isConnected, desoUsername, desoBalanceDeso } = useAppStore();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    const welcomed = localStorage.getItem("caldera_welcomed");
    if (welcomed === "true") return;
    setShow(true);
    const timer = setTimeout(() => dismiss(), 6000);
    return () => clearTimeout(timer);
  }, [isConnected]);

  function dismiss() {
    setShow(false);
    localStorage.setItem("caldera_welcomed", "true");
  }

  if (!show) return null;

  const lowBalance = desoBalanceDeso < 0.5;

  return (
    <div
      className="relative z-40 flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
      style={{
        background: "linear-gradient(90deg, #f97316 0%, #ea580c 100%)",
        color: "#fff",
      }}
    >
      <span className="font-medium">
        🎉 Welcome{desoUsername ? `, @${desoUsername}` : ""}!
        {lowBalance
          ? " Add funds to start trading."
          : " You're connected. Start trading."}
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 hover:bg-white/20 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
