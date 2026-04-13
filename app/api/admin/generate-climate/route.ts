import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CLIMATE_SYSTEM_PROMPT = `You are a prediction market architect for Caldera. Generate exactly 5 binary prediction markets about climate change, environmental policy, clean energy, or sustainability.

Rules:
- Binary Yes/No markets only, crystal-clear resolution criteria
- Topics: carbon targets, renewable energy milestones, climate legislation, extreme weather records, corporate ESG commitments
- Resolve within 30-90 days of today (April 13 2026)
- Titles must be punchy and 6-10 words
- category MUST be "Climate" (exactly, no other value)

Return ONLY a valid JSON array, no markdown:
[
  {
    "title": "short catchy title",
    "description": "1-2 sentences on why this is timely",
    "category": "Climate",
    "resolution_criteria": "specific verifiable source",
    "resolve_at": "ISO date string within 30-90 days of April 13 2026"
  }
]`;

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

export async function POST(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const { password } = await req.json().catch(() => ({}));
  if (adminPassword && password !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

  // Call Claude to generate climate markets
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: CLIMATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: "Generate 5 climate prediction markets for April 2026." }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 });
  }

  const aiData = await res.json();
  const text: string = aiData.content?.[0]?.text ?? "";

  let markets: Array<{
    title: string;
    description: string;
    category: string;
    resolution_criteria: string;
    resolve_at: string;
  }>;

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    markets = JSON.parse(cleaned.startsWith("[") ? cleaned : (cleaned.match(/\[[\s\S]*\]/)?.[0] ?? "[]"));
  } catch {
    return NextResponse.json({ error: "Failed to parse Claude response", raw: text }, { status: 500 });
  }

  const supabase = await createClient();
  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const market of markets.slice(0, 5)) {
    const slug = uniqueSlug(slugify(market.title));

    const { error } = await supabase.from("markets").insert({
      title: market.title,
      slug,
      description: market.description,
      category: "Climate",
      rules_text: market.resolution_criteria,
      resolve_at: market.resolve_at,
      status: "open",
      yes_pool: 1000,
      no_pool: 1000,
      yes_price: 0.5,
      no_price: 0.5,
      liquidity: 1000,
      total_volume: 0,
      category_token_slug: "caldera-climate",
      league_creator_slug: "caldera-climate",
    });

    if (error) {
      skipped.push(market.title);
    } else {
      inserted.push(market.title);
    }
  }

  return NextResponse.json({ success: true, inserted, skipped, total: inserted.length });
}
