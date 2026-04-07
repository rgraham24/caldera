import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { topic } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Generate 5 prediction market ideas about: "${topic}".

Return ONLY a JSON array with no extra text, markdown, or explanation. Each item must have exactly these fields:
- title: string (the yes/no question, max 120 chars)
- description: string (1-2 sentences of context)
- category: one of "crypto", "sports", "politics", "entertainment", "creators", "trends"
- resolution_criteria: string (how this market resolves)
- resolve_at: ISO 8601 date string (3-12 months from now, i.e. between 2026-07-01 and 2027-04-01)

Example format:
[{"title":"Will X happen by Q3 2026?","description":"...","category":"crypto","resolution_criteria":"...","resolve_at":"2026-09-30T00:00:00Z"}]`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[generate-markets] Anthropic error:", res.status, err);
      return NextResponse.json({ error: `Claude API error (${res.status}): ${err}` }, { status: 500 });
    }

    const claudeData = await res.json();
    const text = claudeData.content?.[0]?.text ?? "";

    let markets: unknown[];
    try {
      markets = JSON.parse(text);
    } catch {
      // Try to extract JSON array from text if Claude added any wrapping text
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) {
        return NextResponse.json({ error: "Failed to parse Claude response", raw: text }, { status: 500 });
      }
      markets = JSON.parse(match[0]);
    }

    return NextResponse.json({ data: markets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
