import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("user_coin_purchases")
    .select("*, creator:creators(name, slug, deso_username, creator_coin_price, creator_coin_holders, total_coins_in_circulation, deso_public_key)")
    .eq("user_id", authUser.id)
    .order("purchased_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const { error } = await supabase.from("user_coin_purchases").insert({
    user_id: authUser.id,
    creator_id: body.creatorId,
    deso_username: body.desoUsername,
    coins_purchased: body.coinsPurchased,
    price_per_coin_usd: body.pricePerCoinUsd,
    deso_price_at_purchase: body.desoPriceAtPurchase,
    tx_hash: body.txHash,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update creator_coin_holders leaderboard — increment rather than overwrite
  const creatorSlug = body.creatorSlug ?? body.desoUsername;
  const buyerPublicKey = body.buyerPublicKey ?? "";
  if (creatorSlug && buyerPublicKey && (body.coinsPurchased ?? 0) > 0) {
    const supabaseAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabaseAdmin as any).rpc("increment_coin_holding", {
      p_creator_slug: creatorSlug,
      p_deso_public_key: buyerPublicKey,
      p_deso_username: body.buyerUsername ?? null,
      p_coins_to_add: body.coinsPurchased ?? 0,
    });
    if (rpcError) console.error("[coin-purchases] holder upsert error:", rpcError.message);
  }

  return NextResponse.json({ data: { recorded: true } }, { status: 201 });
}
