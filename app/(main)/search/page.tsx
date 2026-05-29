/**
 * /search — creator-led browse hub. Pure browse — no input.
 *
 * Text search lives in a global overlay that the bottom tab bar's
 * Search tab opens directly (no navigation to /search just to
 * type). This page is the destination for users who tap a BROWSE
 * pill or TOPIC tile from inside the overlay, or who deep-link
 * here from elsewhere. The overlay is mounted at the layout level
 * in app/(main)/layout.tsx via <SearchOverlayRoot />.
 *
 * The browse UI (BROWSE pills + TOP CREATORS + TOPICS) lives in the
 * shared <SearchBrowseContent /> client component so this page and
 * the overlay's default state stay in lockstep and can't drift.
 */

import { SearchBrowseContent } from "@/components/search/SearchBrowseContent";

export const revalidate = 60;

export default function SearchPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-12 md:px-6 lg:px-8">
      <SearchBrowseContent />
    </main>
  );
}
