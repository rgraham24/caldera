import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const publicKey = req.nextUrl.searchParams.get("publicKey");
  if (!publicKey) return NextResponse.json({ error: "publicKey required" }, { status: 400 });

  try {
    // Fetch who this user follows on DeSo
    const res = await fetch("https://api.deso.org/api/v0/get-follows-stateless", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PublicKeyBase58Check: publicKey,
        GetEntriesFollowingUsername: false,
        NumToFetch: 500,
      }),
    });
    const data = await res.json();
    const followedKeys: string[] = Object.keys(data?.PublicKeyToProfileEntry ?? {});
    return NextResponse.json({ followedKeys });
  } catch {
    return NextResponse.json({ followedKeys: [] });
  }
}
