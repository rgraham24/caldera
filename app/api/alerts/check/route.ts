import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";

type AlertRow = {
  id: string;
  alert_type: string;
  target_price_usd: number;
  deso_username: string;
  creator: { creator_coin_price: number } | null;
};

export async function GET(req: NextRequest) {
  // ── Auth: cookie-direct verify (F-6 pattern) ─────────────
  // Note: returns empty data (not 401) when unauthenticated, since this
  // endpoint is polled from a global notification bell that should fail
  // silently for logged-out visitors.
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const signingKey = process.env.COOKIE_SIGNING_KEY ?? "";
  if (!cookie || !signingKey) return NextResponse.json({ data: [] });
  let session;
  try {
    session = await verifyCookie(cookie, signingKey);
  } catch {
    return NextResponse.json({ data: [] });
  }
  if (!session) return NextResponse.json({ data: [] });

  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbUser } = await (supabase as any)
    .from("users")
    .select("id")
    .eq("deso_public_key", session.publicKey)
    .maybeSingle();

  if (!dbUser?.id) return NextResponse.json({ data: [] });
  const userId = dbUser.id;

  const { data: rawAlerts } = await supabase
    .from("user_alerts")
    .select("*, creator:creators(creator_coin_price)")
    .eq("user_id", userId)
    .eq("is_triggered", false);

  const alerts = (rawAlerts as unknown as AlertRow[] | null) ?? [];
  if (alerts.length === 0) return NextResponse.json({ data: [] });

  const triggered: string[] = [];
  const now = new Date().toISOString();

  for (const alert of alerts) {
    const currentPrice = alert.creator?.creator_coin_price || 0;
    const shouldTrigger =
      (alert.alert_type === "above" && currentPrice >= alert.target_price_usd) ||
      (alert.alert_type === "below" && currentPrice <= alert.target_price_usd);

    if (shouldTrigger) {
      await supabase
        .from("user_alerts")
        .update({ is_triggered: true, triggered_at: now })
        .eq("id", alert.id);

      await supabase.from("notifications").insert({
        user_id: userId,
        type: "price_alert",
        title: `$${alert.deso_username} crossed $${alert.target_price_usd}`,
        body: `${alert.alert_type === "above" ? "Above" : "Below"} your target of $${alert.target_price_usd}`,
      });

      triggered.push(alert.id);
    }
  }

  return NextResponse.json({ data: { triggered, count: triggered.length } });
}
