"use client";

/**
 * Error boundary for the (main) route segment. Catches any error
 * thrown by a page or component below it in the tree and renders a
 * Caldera-branded fallback instead of letting the user fall into a
 * blank screen or the browser's native "couldn't load" UI.
 *
 * Must be a Client Component (Next.js convention) so it can hold
 * the `reset` callback. Logs to console for now; future hook point
 * for Sentry / a structured error sink.
 */

import { useEffect } from "react";
import Link from "next/link";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[main route error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center">
      <h2 className="text-xl font-semibold text-text-primary">
        Something went wrong
      </h2>
      <p className="mt-2 max-w-sm text-sm text-text-muted">
        We hit an unexpected error loading this page. Try again, or
        head back home.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-caldera px-4 py-2 text-sm font-semibold text-white hover:bg-caldera-hover transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-border-subtle px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-2 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
