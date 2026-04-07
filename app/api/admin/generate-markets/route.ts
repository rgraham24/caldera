import { NextRequest, NextResponse } from "next/server";

const ADMIN_KEYS = [
  "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7",
  "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ",
];

const SYSTEM_PROMPT = `You are the world's best Prediction Market Architect for a high-volume autonomous prediction marketplace. You generate extremely high-converting, urgent markets on any public entity (influencers, streamers, athletes, sports teams, politicians, musicians, artists, tech executives, movies, etc.).

Core Rules (never break these):
- Urgency is mandatory. Use short timeframes: by end of this week, by April 30, in the next 14 days, next game, before May 15, etc.
- Current-moment obsessed. Base EVERYTHING on the Latest Research Summary provided.
- High-conversion formula: spicy, personal, chaotic, rivalries, scandals, immediate next moves.
- Binary and resolvable with clear sources.
- Generate exactly 10 markets per entity.

Return ONLY a valid JSON array. No markdown, no explanation, no preamble. Start immediately with [ and end with ]:
[
  {
    "title": "short catchy 4-8 word title",
    "description": "1-2 sentences including why this is hot right now",
    "category": "one of: creators, sports, music, politics, tech, entertainment",
    "resolution_criteria": "exact resolution source and criteria",
    "resolve_at": "ISO date string — use near-term dates within 30-90 days from today April 7 2026"
  }
]`;

async function callClaude(
  apiKey: string,
  messages: { role: string; content: string }[],
  system?: string,
  maxTokens = 1024
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    messages,
  };
  if (system) body.system = system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[generate-markets] Anthropic error:", res.status, err);
    throw new Error(`Claude API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const { topic, desoPublicKey, adminPassword } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    // First call: research summary
    const summary = await callClaude(
      apiKey,
      [
        {
          role: "user",
          content: `In 200 words or less, summarize what is happening RIGHT NOW with: "${topic}". Focus on the most recent news, controversies, upcoming events, rivalries, and anything time-sensitive as of early April 2026. Be specific with names, dates, and facts.`,
        },
      ],
      undefined,
      512
    );

    // Second call: market generation using summary
    const marketsText = await callClaude(
      apiKey,
      [
        {
          role: "user",
          content: `Generate markets for: ${topic}\n\nLatest Research Summary:\n${summary}`,
        },
      ],
      SYSTEM_PROMPT,
      2048
    );

    let markets: unknown[];
    try {
      markets = JSON.parse(marketsText);
    } catch {
      const match = marketsText.match(/\[[\s\S]*\]/);
      if (!match) {
        return NextResponse.json(
          { error: "Failed to parse Claude response", raw: marketsText },
          { status: 500 }
        );
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
