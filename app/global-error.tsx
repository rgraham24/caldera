"use client";

/**
 * Top-level error boundary. Catches any error that escapes a
 * segment-level error.tsx — including crashes inside a layout's own
 * JSX (siblings of {children}). When this fires, Next.js replaces
 * the entire tree, so we own our own <html> and <body> and avoid
 * any external CSS / bundle dependencies (use inline styles only).
 *
 * Without this file, layout-level crashes fall through to Next.js's
 * built-in __next_error__ shell, which mobile WebKit renders as the
 * iOS-native "Page couldn't load" screen.
 *
 * The (main) segment's error.tsx still catches everything inside
 * the (main) route group's pages; this file is the defense for
 * what that boundary can't reach.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#0A0A0F",
          color: "#F5F5F7",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 400, textAlign: "center" }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              margin: "0 0 8px",
              letterSpacing: "-0.01em",
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: "#8A8A95",
              margin: "0 auto 24px",
              maxWidth: 320,
            }}
          >
            We hit an unexpected error. Try again, or head back home.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                backgroundColor: "#7C5CFC",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 9999,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: "1px solid #2A2A3A",
                color: "#F5F5F7",
                borderRadius: 9999,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
