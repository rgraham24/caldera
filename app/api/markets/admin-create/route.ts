import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { creatorIsVerifiedForMarkets } from "@/lib/creators/validity";

// All optional fields here are additive vs the original admin-create schema
// — Phase 5d-1 extension to support migrating the two callers of the
// to-be-deleted `/api/markets` POST handler. Names match the column-style
// camelCase the markets POST handler used so caller payloads stay 1:1.
const adminCreateSchema = z.object({
  // Required
  title: z.string().min(10).max(120),
  category: z.string().min(1),
  creatorSlug: z.string().min(1),
  resolveAt: z.string().min(1),
  adminPassword: z.string().min(1),

  // Optional — original admin-create
  yesPrice: z.number().min(0.1).max(0.9).optional(),
  isBreaking: z.boolean().optional(),
  isFeatured: z.boolean().optional(),

  // Optional — added in Phase 5d-1 from markets POST
  description: z.string().max(1000).optional(),
  subcategory: z.string().max(80).optional(),
  rulesText: z.string().max(2000).optional(),
  resolutionSourceUrl: z.string().url().optional(),
  closeAt: z.string().optional(),
  initialLiquidity: z.number().positive().default(1000),
  featured: z.boolean().default(false),
});

export async function POST(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = adminCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;

  if (body.adminPassword !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yes = typeof body.yesPrice === "number" ? body.yesPrice : 0.5;
  const no = 1 - yes;

  const baseSlug = slugify(body.title).slice(0, 80);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const supabase = await createClient();

  // Fail-closed: creator must be verified for markets (BitClout-original,
  // admin-approved, or claimed). See lib/creators/validity.ts.
  const validation = await creatorIsVerifiedForMarkets(body.creatorSlug, supabase);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: `Invalid creator: ${body.creatorSlug} — ${validation.reason}${
          validation.detail ? ` (${validation.detail})` : ""
        }`,
      },
      { status: 400 }
    );
  }
  const creatorId = validation.creator.id;

  // AMM pool split: half of liquidity per side keeps the AMM balanced
  // (yes_pool * no_pool = k = (liquidity/2)^2). The /api/markets POST
  // handler set both pools = full liquidity, which doubled real liquidity
  // — that path is being deleted in 5d-3 so we standardize on the split here.
  const liquidity = body.initialLiquidity;
  const sidePool = liquidity / 2;

  // featured_score: Phase 5d-1 accepts both the legacy `isFeatured` boolean
  // (score 1) and the new `featured` boolean from the markets POST contract
  // (score 5). If both are passed, `featured` wins. featured_score > 0 is
  // what gates display in any case.
  const featuredScore = body.featured ? 5 : body.isFeatured ? 1 : 0;

  const { data: market, error } = await supabase
    .from("markets")
    .insert({
      title: body.title.trim(),
      slug,
      description: body.description ?? null,
      category: body.category,
      subcategory: body.subcategory ?? null,
      creator_id: creatorId,
      creator_slug: body.creatorSlug,
      status: "open",
      market_type: "binary",
      rules_text: body.rulesText ?? null,
      resolution_source_url: body.resolutionSourceUrl ?? null,
      close_at: body.closeAt ?? null,
      resolve_at: body.resolveAt,
      yes_price: yes,
      no_price: no,
      yes_pool: sidePool,
      no_pool: sidePool,
      liquidity,
      total_volume: 0,
      trending_score: body.isBreaking ? 1000 : 0,
      featured_score: featuredScore,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: market });
}
