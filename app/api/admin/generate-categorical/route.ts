import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCategoricalMarket, insertCategoricalMarket } from "@/lib/admin/pipeline";

const CATEGORICAL_TOPICS: Array<{ topic: string; type: "sports" | "politics" | "entertainment" }> = [
  { topic: "2026 NBA MVP race", type: "sports" },
  { topic: "2026 NBA Championship winner", type: "sports" },
  { topic: "2028 US Presidential Election", type: "politics" },
  { topic: "2026 NFL MVP", type: "sports" },
  { topic: "Next UFC Heavyweight Champion", type: "sports" },
  { topic: "Billboard #1 Artist end of 2026", type: "entertainment" },
];

export async function POST(req: NextRequest) {
  try {
    const { adminPassword } = await req.json();
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    const results: string[] = [];

    for (const { topic, type } of CATEGORICAL_TOPICS) {
      const market = await generateCategoricalMarket(topic, type, apiKey);
      if (market) {
        await insertCategoricalMarket(market, supabase);
        results.push(market.title);
      }
    }

    return NextResponse.json({ generated: results.length, markets: results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
