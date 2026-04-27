/**
 * CC-5 — Dynamic Open Graph image for /claim/[code].
 *
 * Next.js convention: opengraph-image.tsx in a route folder
 * automatically generates the OG image at /claim/[code]/opengraph-image.
 * The metadata layout file (layout.tsx) wires the URL into og:image.
 */

import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const alt = "Caldera — Creator claim";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: { code: string };
}) {
  const { code } = params;
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await (supabase as any)
    .from("creators")
    .select(
      "name, slug, claim_status, twitter_handle, unclaimed_earnings_escrow"
    )
    .eq("claim_code", code)
    .maybeSingle()) as {
    data: {
      name: string;
      slug: string;
      claim_status: string | null;
      twitter_handle: string | null;
      unclaimed_earnings_escrow: string | null;
    } | null;
    error: { message: string } | null;
  };

  console.log("[og-image] code:", code);
  console.log("[og-image] supabase result:", JSON.stringify({
    data: result.data,
    error: result.error,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  }));

  const creator = result.data;

  // Fallback: generic Caldera card.
  if (!creator || creator.claim_status === "claimed") {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
            color: "white",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 80, fontWeight: 700, letterSpacing: -2 }}>
            CALDERA
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#a0a0a0",
              marginTop: 16,
            }}
          >
            Prediction markets where the assets are people
          </div>
        </div>
      ),
      { ...size }
    );
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

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #2a1505 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          padding: 80,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            color: "#f59e0b",
            marginBottom: 32,
          }}
        >
          CALDERA · CREATOR CLAIM
        </div>

        {escrowStr ? (
          <>
            <div
              style={{
                fontSize: 48,
                fontWeight: 600,
                color: "white",
                marginBottom: 24,
              }}
            >
              {handle}
            </div>
            <div
              style={{
                fontSize: 110,
                fontWeight: 800,
                color: "#fbbf24",
                lineHeight: 1,
                marginBottom: 24,
              }}
            >
              {escrowStr}
            </div>
            <div
              style={{
                fontSize: 32,
                color: "#a0a0a0",
                maxWidth: 900,
              }}
            >
              waiting to be claimed
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: "white",
                marginBottom: 32,
                lineHeight: 1.1,
              }}
            >
              {handle}
            </div>
            <div
              style={{
                fontSize: 36,
                color: "#a0a0a0",
                maxWidth: 900,
                lineHeight: 1.3,
              }}
            >
              hasn&apos;t claimed their
              <br />
              Caldera profile yet
            </div>
          </>
        )}

        <div
          style={{
            position: "absolute",
            bottom: 60,
            fontSize: 22,
            color: "#666",
          }}
        >
          caldera.market
        </div>
      </div>
    ),
    { ...size }
  );
}
