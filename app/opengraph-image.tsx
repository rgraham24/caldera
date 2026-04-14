import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#0e0c18",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              border: "1.5px solid rgba(255,255,255,0.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                background: "#7C5CFC",
              }}
            />
          </div>
          <span style={{ fontSize: 42, color: "#fff", fontWeight: 400 }}>Caldera</span>
        </div>
        <div
          style={{
            fontSize: 22,
            color: "rgba(255,255,255,0.85)",
            fontWeight: 300,
            letterSpacing: "0.03em",
            marginBottom: 12,
          }}
        >
          Trade what you know. Own what you love.
        </div>
        <div
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.28)",
            letterSpacing: "0.08em",
          }}
        >
          caldera.market
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "#7C5CFC",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
