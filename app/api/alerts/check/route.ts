import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AlertRow = {
  id: string;
  alert_type: string;
  target_price_usd: number;
  deso_username: string;
  creator: { creator_coin_price: number } | null;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: [] });

  const { data: rawAlerts } = await supabase
    .from("user_alerts")
    .select("*, creator:creators(creator_coin_price)")
    .eq("user_id", user.id)
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
        user_id: user.id,
        type: "price_alert",
        title: `$${alert.deso_username} crossed $${alert.target_price_usd}`,
        body: `${alert.alert_type === "above" ? "Above" : "Below"} your target of $${alert.target_price_usd}`,
      });

      triggered.push(alert.id);
    }
  }

  return NextResponse.json({ data: { triggered, count: triggered.length } });
}
