import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const [
    { data: markets },
    { data: fees },
    { count: openCount },
  ] = await Promise.all([
    supabase.from("markets").select("total_volume, status"),
    supabase.from("fee_earnings").select("amount").eq("recipient_type", "platform"),
    supabase.from("markets").select("*", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const totalVolume = markets?.reduce((sum, m) => sum + (m.total_volume || 0), 0) ?? 0;
  const totalFees = fees?.reduce((sum, f) => sum + (f.amount || 0), 0) ?? 0;
  const resolvingThisWeek = markets?.filter((m) => m.status === "resolving").length ?? 0;

  return NextResponse.json({
    data: {
      totalVolume,
      totalFeesCollected: totalFees,
      openMarkets: openCount ?? 0,
      resolvingThisWeek,
    },
  });
}
