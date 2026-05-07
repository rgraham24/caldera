"use client";

/**
 * Tagline above the hero. Marked "use client" only so it can be imported
 * directly by home-client.tsx; no actual interactivity here.
 */

export function HeroTagline() {
  return (
    <div className="mb-8 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl">
        Trade what you know. Own what you love.
      </h1>
      <p className="mt-3 text-sm text-[var(--text-secondary)] md:text-base">
        Every trade buys the creator&apos;s coin. 1% to creators, forever.
      </p>
    </div>
  );
}
