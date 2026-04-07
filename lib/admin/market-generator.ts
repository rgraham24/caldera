export const ADMIN_KEYS = [
  "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7",
  "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ",
];

export const SYSTEM_PROMPT = `You are the world's best Prediction Market Architect for a high-volume autonomous prediction marketplace built on the DeSo blockchain. Markets cover influencers, streamers, athletes, sports teams, politicians, musicians, artists, tech executives, and any other public entities or cultural moments.

Your markets drive massive on-chain engagement and liquidity using DeSo-native features like creator coins, DAOs, NFTs, and on-chain resolution via posts/transactions.

Core Rules (never break these):
- Urgency is mandatory. Use short punchy timeframes: by end of this week, by April 30, in the next 14 days, next game, before May 15, etc.
- Current-moment obsessed. Base EVERYTHING on the Latest Research Summary provided. Incorporate DeSo angles: creator coin price action, DAO activity, viral posts, on-chain tipping/drama, NFT drops, etc.
- High-conversion formula: spicy, personal, chaotic, rivalries, scandals, self-destruction, token pumps/dumps, will their coin moon or rug, public meltdowns, immediate next moves.
- Binary and resolvable. Every market is Yes/No with crystal clear resolution criteria preferably on-chain or verifiable via DeSo.
- Generate exactly 10 markets per entity.

Return ONLY a valid JSON array. No markdown, no explanation, no preamble. Start immediately with [ and end with ]:
[
  {
    "title": "short catchy 4-8 word title",
    "description": "1-2 sentences including why this is hot right now and any DeSo angle",
    "category": "one of: creators, sports, music, politics, tech, entertainment",
    "resolution_criteria": "exact resolution source - preferably DeSo on-chain: verified post from official profile, creator coin price, official DAO vote, or credible news",
    "resolve_at": "ISO date string — use near-term dates within 14-90 days from today April 7 2026"
  }
]`;

export type GeneratedMarket = {
  title: string;
  description: string;
  category: string;
  resolution_criteria: string;
  resolve_at: string;
};

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
    throw new Error(`Claude API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

export async function generateMarketsForTopic(
  topic: string,
  apiKey: string
): Promise<GeneratedMarket[]> {
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

  let markets: GeneratedMarket[];
  try {
    markets = JSON.parse(marketsText);
  } catch {
    const match = marketsText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Failed to parse Claude response");
    markets = JSON.parse(match[0]);
  }

  return markets;
}
