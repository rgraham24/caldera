import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const watchlistSchema = z.object({
  entityType: z.enum(["market", "creator", "user"]),
  entityId: z.string().regex(UUID_REGEX),
});

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

type WatchlistRow = {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

type MarketRow = {
  id: string;
  title: string;
  slug: string;
  yes_price: number;
  total_volume: number;
  category: string;
};

type CreatorRow = {
  id: string;
  name: string;
  slug: string;
  creator_coin_price: number | null;
  deso_username: string | null;
};

export async function GET(req: NextRequest) {
  const userId = await authedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const entityIdParam = req.nextUrl.searchParams.get("entityId");
  if (entityIdParam && !UUID_REGEX.test(entityIdParam)) {
    return NextResponse.json({ data: [] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from("watchlists")
    .select("id, user_id, entity_type, entity_id, created_at")
    .eq("user_id", userId);
  if (entityIdParam) q = q.eq("entity_id", entityIdParam);
  const { data: rowsRaw, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows: WatchlistRow[] = (rowsRaw as WatchlistRow[] | null) ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const marketIds = rows
    .filter((r) => r.entity_type === "market")
    .map((r) => r.entity_id);
  const creatorIds = rows
    .filter((r) => r.entity_type === "creator")
    .map((r) => r.entity_id);

  const marketById = new Map<string, MarketRow>();
  if (marketIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: markets } = (await (supabase as any)
      .from("markets")
      .select("id, title, slug, yes_price, total_volume, category")
      .in("id", marketIds)) as { data: MarketRow[] | null };
    for (const m of markets ?? []) marketById.set(m.id, m);
  }

  const creatorById = new Map<string, CreatorRow>();
  if (creatorIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creators } = (await (supabase as any)
      .from("creators")
      .select("id, name, slug, creator_coin_price, deso_username")
      .in("id", creatorIds)) as { data: CreatorRow[] | null };
    for (const c of creators ?? []) creatorById.set(c.id, c);
  }

  const data = rows.map((r) => {
    const market = r.entity_type === "market" ? marketById.get(r.entity_id) ?? null : null;
    const creator = r.entity_type === "creator" ? creatorById.get(r.entity_id) ?? null : null;
    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      market: market
        ? {
            title: market.title,
            slug: market.slug,
            yes_price: Number(market.yes_price ?? 0),
            total_volume: Number(market.total_volume ?? 0),
            category: market.category,
          }
        : null,
      creator: creator
        ? {
            name: creator.name,
            slug: creator.slug,
            creator_coin_price: creator.creator_coin_price,
            deso_username: creator.deso_username,
          }
        : null,
    };
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await authedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = watchlistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("watchlists")
      .upsert(
        {
          user_id: userId,
          entity_type: parsed.data.entityType,
          entity_id: parsed.data.entityId,
        },
        {
          onConflict: "user_id,entity_type,entity_id",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
