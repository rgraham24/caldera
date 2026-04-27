/**
 * CC-5 — Server-side metadata for /claim/[code].
 *
 * Renders Open Graph + Twitter card metadata when the link is
 * scraped by social platforms. The opengraph-image.tsx sibling
 * file generates the dynamic image automatically (Next.js
 * convention).
 *
 * Layout intentionally does nothing visually — page.tsx
 * (client component) renders inside.
 */

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const supabase = await createClient();

  // Direct DB query — no HTTP self-fetch round trip.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creator } = await (supabase as any)
    .from("creators")
    .select(
      "name, slug, claim_status, twitter_handle, unclaimed_earnings_escrow"
    )
    .eq("claim_code", code)
    .maybeSingle() as {
    data: {
      name: string;
      slug: string;
      claim_status: string | null;
      twitter_handle: string | null;
      unclaimed_earnings_escrow: string | null;
    } | null;
  };

  // Generic fallback for invalid or already-claimed codes.
  // Don't drive social traffic to a dead-end page.
  if (!creator || creator.claim_status === "claimed") {
    return {
      metadataBase: new URL("https://www.caldera.market"),
      title: "Caldera — Prediction Markets",
      description:
        "DeSo-native prediction markets where the assets are people. Trade on creators, streamers, athletes, and cultural figures.",
      openGraph: {
        title: "Caldera — Prediction Markets",
        description:
          "DeSo-native prediction markets where the assets are people.",
        url: "https://www.caldera.market",
        siteName: "Caldera",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        site: "@CalderaMarket",
        title: "Caldera — Prediction Markets",
        description: "DeSo-native prediction markets.",
      },
    };
  }

  const escrowUsd = Number(creator.unclaimed_earnings_escrow ?? "0");
  const handle = creator.twitter_handle
    ? `@${creator.twitter_handle.replace(/^@/, "")}`
    : creator.name;
  const escrowStr =
    escrowUsd > 0
      ? `$${escrowUsd.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : null;

  const title = escrowStr
    ? `${handle} has ${escrowStr} waiting on Caldera`
    : `${handle} hasn't claimed their Caldera profile yet`;
  const description = escrowStr
    ? `Trades on ${handle} have generated ${escrowStr} in fees. They get paid the moment they claim their profile. Share this link to help them get paid.`
    : `Markets are live for ${handle} on Caldera. They earn 0.5% of every trade once they claim their profile. Share this link to nudge them.`;
  const url = `https://www.caldera.market/claim/${code}`;

  return {
    metadataBase: new URL("https://www.caldera.market"),
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Caldera",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      site: "@CalderaMarket",
      title,
      description,
    },
  };
}

export default function ClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
