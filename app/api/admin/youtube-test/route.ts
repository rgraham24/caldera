import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin/auth";
import { getChannelStatsByHandle } from "@/lib/youtube";

/**
 * GET /api/admin/youtube-test?handle=mrbeast&adminPassword=...
 *
 * Smoke-test the YouTube Data API integration before wiring it into
 * the wizard preview and the auto-resolver cron. Accepts any input
 * the helper accepts: @handle, bare handle, channel ID, or URL.
 *
 * Auth: same admin password / DeSo pubkey model as other admin
 * endpoints (lib/admin/auth#isAdminAuthorized).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const adminPassword = url.searchParams.get("adminPassword") ?? undefined;
  const desoPublicKey = url.searchParams.get("desoPublicKey") ?? undefined;

  if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "unauthorized" },
      { status: 401 }
    );
  }

  const handle = url.searchParams.get("handle");
  if (!handle) {
    return NextResponse.json(
      { error: "Missing handle query param" },
      { status: 400 }
    );
  }

  try {
    const stats = await getChannelStatsByHandle(handle);
    if (!stats) {
      return NextResponse.json(
        { error: "Channel not found", input: handle },
        { status: 404 }
      );
    }
    return NextResponse.json({ input: handle, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[youtube-test]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
