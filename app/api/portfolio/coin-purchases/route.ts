import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";

async function authedUserId(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const signingKey = process.env.COOKIE_SIGNING_KEY ?? "";
  if (!cookie || !signingKey) return null;
  let session;
  try {
    session = await verifyCookie(cookie, signingKey);
  } catch {
    return null;
  }
  if (!session) return null;

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbUser } = await (supabase as any)
    .from("users")
    .select("id")
    .eq("deso_public_key", session.publicKey)
    .maybeSingle();
  return dbUser?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await authedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_coin_purchases")
    .select("*, creator:creators(name, slug, deso_username, creator_coin_price, creator_coin_holders, total_coins_in_circulation, deso_public_key)")
    .eq("user_id", userId)
    .order("purchased_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const userId = await authedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const supabase = createServiceClient();
  const { error } = await supabase.from("user_coin_purchases").insert({
    user_id: userId,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc("increment_coin_holding", {
      p_creator_slug: creatorSlug,
      p_deso_public_key: buyerPublicKey,
      p_deso_username: body.buyerUsername ?? null,
      p_coins_to_add: body.coinsPurchased ?? 0,
    });
    if (rpcError) console.error("[coin-purchases] holder upsert error:", rpcError.message);
  }

  return NextResponse.json({ data: { recorded: true } }, { status: 201 });
}
