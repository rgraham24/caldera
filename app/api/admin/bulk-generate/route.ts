import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS, generateMarketsForTopic, GeneratedMarket } from "@/lib/admin/market-generator";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

function uniqueSlug(base: string): string {
  return `${base}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function insertMarkets(
  markets: GeneratedMarket[],
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<number> {
  let created = 0;
  for (const market of markets) {
    const slug = uniqueSlug(slugify(market.title));
    const { error } = await supabase.from("markets").insert({
      title: market.title,
      slug,
      description: market.description,
      category: market.category,
      rules_text: market.resolution_criteria,
      resolve_at: market.resolve_at,
      status: "open",
      yes_pool: 380,
      no_pool: 620,
      yes_price: 0.62,
      no_price: 0.38,
      liquidity: 1000,
      total_volume: 0,
    });
    if (!error) created++;
  }
  return created;
}

export async function POST(req: NextRequest) {
  try {
    const { topics, desoPublicKey, adminPassword } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json({ error: "topics must be a non-empty array" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const supabase = await createClient();

    // Generate markets for all topics in parallel
    const results = await Promise.allSettled(
      topics.map((topic: string) => generateMarketsForTopic(topic, apiKey))
    );

    let created = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        created += await insertMarkets(result.value, supabase);
      }
    }

    return NextResponse.json({ data: { created, topics: topics.length } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
