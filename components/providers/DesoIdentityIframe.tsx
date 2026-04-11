"use client";
import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";

export function DesoIdentityIframe() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { isConnected } = useAppStore();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes("identity.deso.org")) return;
      // Store iframe reference globally for signing
      if (event.data?.service === "identity" && event.data?.method === "initialize") {
        window.__DESO_IFRAME__ = iframeRef.current?.contentWindow ?? null;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!isConnected) return null;

  return (
    <iframe
      ref={iframeRef}
      src="https://identity.deso.org/embed"
      style={{ display: "none", width: 0, height: 0 }}
      title="DeSo Identity"
      id="deso-identity-iframe"
    />
  );
}
