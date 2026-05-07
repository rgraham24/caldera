import { NextRequest, NextResponse } from "next/server";

const DESO_FETCH_TIMEOUT_MS = 5000;

export async function GET(req: NextRequest) {
  const publicKey = req.nextUrl.searchParams.get("publicKey");
  if (!publicKey) return NextResponse.json({ error: "publicKey required" }, { status: 400 });

  // Hard timeout on DeSo's public node so a slow upstream can't hang
  // the /following page forever (root cause of the prior infinite-
  // skeleton symptom). Falls through to the catch block and returns
  // an empty followedKeys list — page then shows its empty state.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DESO_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.deso.org/api/v0/get-follows-stateless", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        PublicKeyBase58Check: publicKey,
        GetEntriesFollowingUsername: false,
        NumToFetch: 500,
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    const followedKeys: string[] = Object.keys(data?.PublicKeyToProfileEntry ?? {});
    return NextResponse.json({ followedKeys });
  } catch {
    return NextResponse.json({ followedKeys: [] });
  } finally {
    clearTimeout(timer);
  }
}
