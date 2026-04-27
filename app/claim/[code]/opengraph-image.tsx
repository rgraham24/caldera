import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const alt = "Caldera — Creator claim";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = {
  params: Promise<{ code: string }>;
};

export default async function Image({ params }: Props) {
  const { code } = await params;

  // Fetch creator. Wrap so any error degrades to generic card
  // instead of 500-ing the OG endpoint.
  let creator: {
    name: string;
    slug: string;
    claim_status: string | null;
    twitter_handle: string | null;
    unclaimed_earnings_escrow: string | null;
  } | null = null;

  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase as any)
      .from("creators")
      .select(
        "name, slug, claim_status, twitter_handle, unclaimed_earnings_escrow"
      )
      .eq("claim_code", code)
      .maybeSingle();
    creator = result.data ?? null;
    if (result.error) {
      console.error("[og-image] supabase error:", result.error);
    }
  } catch (err) {
    console.error("[og-image] fetch failed:", err);
  }

  const isFallback = !creator || creator.claim_status === "claimed";

  if (isFallback) {
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
            background: "#0a0a0a",
            color: "white",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 80, fontWeight: 700, letterSpacing: -2 }}>
            CALDERA
          </div>
          <div style={{ fontSize: 28, color: "#a0a0a0", marginTop: 16 }}>
            Prediction markets where the assets are people
          </div>
        </div>
      ),
      size
    );
  }

  // Non-null after the fallback gate
  const c = creator as NonNullable<typeof creator>;
  const escrowUsd = Number(c.unclaimed_earnings_escrow ?? "0");
  const handle = c.twitter_handle
    ? "@" + c.twitter_handle.replace(/^@/, "")
    : c.name;
  const escrowStr =
    escrowUsd > 0
      ? "$" +
        escrowUsd.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
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
          background: "#0a0a0a",
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
          <div
            style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
          >
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
            <div style={{ fontSize: 32, color: "#a0a0a0" }}>
              waiting to be claimed
            </div>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
          >
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
                lineHeight: 1.3,
              }}
            >
              hasn&apos;t claimed their Caldera profile yet
            </div>
          </div>
        )}
      </div>
    ),
    size
  );
}
