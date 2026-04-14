import { NextResponse } from "next/server";

/**
 * GET /api/cron/auto-resolve-markets
 * Daily 10am UTC cron — runs AI resolution on all overdue non-crypto markets.
 * Auth: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET ?? "caldera-cron-2026";
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://caldera.market";

  let result: Record<string, unknown> = {};
  try {
    const res = await fetch(`${appUrl}/api/admin/auto-resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminPassword }),
    });
    result = await res.json();
  } catch (err) {
    console.error("[cron/auto-resolve-markets] error:", err);
    return NextResponse.json({ error: "auto-resolve call failed" }, { status: 500 });
  }

  const { processed, autoResolved, flaggedForReview, skipped } = result as {
    processed?: number;
    autoResolved?: unknown[];
    flaggedForReview?: unknown[];
    skipped?: unknown[];
  };

  console.log(
    `[cron/auto-resolve-markets] processed=${processed ?? 0} autoResolved=${autoResolved?.length ?? 0} flagged=${flaggedForReview?.length ?? 0} skipped=${skipped?.length ?? 0}`
  );

  return NextResponse.json({
    success: true,
    processed: processed ?? 0,
    autoResolved: autoResolved?.length ?? 0,
    flaggedForReview: flaggedForReview?.length ?? 0,
    skipped: skipped?.length ?? 0,
  });
}
