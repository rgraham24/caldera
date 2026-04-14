import { NextRequest, NextResponse } from "next/server";

const FALLBACK = "https://i.imgur.com/w1BEqJv.png";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ publicKey: string }> }
) {
  const { publicKey } = await params;

  if (!publicKey || publicKey.length < 10) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    // Fetch server-side; Next.js data cache revalidates after 24h
    const upstream = await fetch(
      `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}?fallback=${FALLBACK}`,
      { next: { revalidate: 86400 } }
    );

    if (!upstream.ok) {
      return new NextResponse(null, { status: 404 });
    }

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
