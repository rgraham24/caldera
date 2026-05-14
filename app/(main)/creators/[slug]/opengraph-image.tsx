import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/server";
import { getCreatorEarnings } from "@/lib/creators/earnings";
import { getCreatorDisplayName } from "@/lib/creators/displayName";

export const runtime = "nodejs";
export const alt = "Caldera — Creator earnings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function Image({ params }: Props) {
  const { slug } = await params;

  let creator: {
    name: string;
    slug: string;
    deso_username: string | null;
    twitter_handle: string | null;
    creator_coin_symbol: string | null;
    creator_coin_price: number | null;
    claim_status: string | null;
  } | null = null;

  let accruedUsd = 0;
  let accruedTradeCount = 0;
  let isPreLaunch = true;

  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase as any)
      .from("creators")
      .select(
        "name, slug, deso_username, twitter_handle, creator_coin_symbol, creator_coin_price, claim_status"
      )
      .eq("slug", slug)
      .maybeSingle();
    creator = result.data ?? null;
    if (result.error) {
      console.error("[creator-og] supabase error:", result.error);
    }

    if (creator) {
      const earnings = await getCreatorEarnings(supabase, slug);
      accruedUsd = earnings.accruedUsd;
      accruedTradeCount = earnings.accruedTradeCount;
      isPreLaunch = earnings.isPreLaunch;
    }
  } catch (err) {
    console.error("[creator-og] fetch failed:", err);
  }

  // Generic fallback if the slug doesn't resolve
  if (!creator) {
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
            background: "#0a0a0f",
            color: "white",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 80, fontWeight: 700, letterSpacing: -2 }}>
            CALDERA
          </div>
          <div style={{ fontSize: 28, color: "#8A8A95", marginTop: 16 }}>
            Prediction markets where the assets are people
          </div>
        </div>
      ),
      size
    );
  }

  const displayName = getCreatorDisplayName(creator);
  const handle = creator.deso_username || creator.twitter_handle || null;
  const coinSymbol =
    (creator.creator_coin_symbol || creator.deso_username || displayName)
      .toUpperCase();
  const coinPrice = Number(creator.creator_coin_price ?? 0);

  // Shared chrome — same dimensions / colors / fonts as the claim OG.
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #0a0a0f 0%, #13131a 60%, #1a1230 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          padding: 80,
        }}
      >
        {/* Top: Caldera wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              border: "1.5px solid rgba(255,255,255,0.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: "#7C5CFC",
              }}
            />
          </div>
          <span style={{ fontSize: 28, color: "#F5F5F7", fontWeight: 400 }}>
            Caldera
          </span>
        </div>

        {/* Body */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            marginTop: 24,
          }}
        >
          {!isPreLaunch ? (
            <>
              <div
                style={{
                  fontSize: 36,
                  color: "#F5F5F7",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 16,
                }}
              >
                <span>{displayName}</span>
                {handle && (
                  <span
                    style={{
                      fontSize: 24,
                      color: "#8A8A95",
                      fontWeight: 400,
                    }}
                  >
                    @{handle}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 140,
                  fontWeight: 700,
                  color: "#7C5CFC",
                  lineHeight: 1,
                  marginTop: 24,
                  letterSpacing: -3,
                }}
              >
                ${accruedUsd.toFixed(2)}
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: "#F5F5F7",
                  marginTop: 16,
                  fontWeight: 500,
                }}
              >
                accumulated on Caldera
              </div>
              <div
                style={{
                  fontSize: 22,
                  color: "#8A8A95",
                  marginTop: 20,
                }}
              >
                From {accruedTradeCount}{" "}
                {accruedTradeCount === 1 ? "trade" : "trades"}
                {creator.claim_status !== "claimed" && (
                  <span> · Claim to inherit →</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 36,
                  color: "#F5F5F7",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 16,
                }}
              >
                <span>{displayName}</span>
                {handle && (
                  <span
                    style={{
                      fontSize: 24,
                      color: "#8A8A95",
                      fontWeight: 400,
                    }}
                  >
                    @{handle}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 80,
                  color: "#F5F5F7",
                  fontWeight: 700,
                  lineHeight: 1.05,
                  marginTop: 28,
                  letterSpacing: -2,
                  maxWidth: 980,
                }}
              >
                Earns 1% of every trade on Caldera
              </div>
              <div
                style={{
                  fontSize: 24,
                  color: "#8A8A95",
                  marginTop: 22,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: "#22c55e",
                  }}
                />
                Live now
                {coinPrice > 0 && (
                  <span>
                    · ${coinSymbol} at ${coinPrice.toFixed(2)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer URL */}
        <div
          style={{
            fontSize: 18,
            color: "rgba(255,255,255,0.32)",
            letterSpacing: "0.06em",
            alignSelf: "flex-end",
          }}
        >
          www.caldera.market/creators/{slug}
        </div>
      </div>
    ),
    size
  );
}
