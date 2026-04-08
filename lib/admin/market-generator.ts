export const ADMIN_KEYS = [
  "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7",
  "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ",
];

export const SYSTEM_PROMPT = `You are the world's best Prediction Market Architect for a high-volume autonomous prediction marketplace built on the DeSo blockchain. Markets cover influencers, streamers, athletes, sports teams, politicians, musicians, artists, tech executives, and any other public entities or cultural moments.

Your markets drive massive on-chain engagement and liquidity using DeSo-native features like creator coins, DAOs, NFTs, and on-chain resolution via posts/transactions.

Core Rules (never break these):
- Urgency is mandatory. Use short punchy timeframes: by end of this week, by April 30, in the next 14 days, next game, before May 15, etc.
- High-conversion formula: spicy, personal, chaotic, rivalries, scandals, self-destruction, token pumps/dumps, will their coin moon or rug, public meltdowns, immediate next moves.
- Binary and resolvable. Every market is Yes/No with crystal clear resolution criteria preferably on-chain or verifiable via DeSo.
- Generate exactly 5 markets per entity.
- At least 3 out of 5 markets MUST resolve within 30 days of April 7 2026 (before May 7 2026).
- At least 1 must resolve within 14 days (before April 21 2026).
- NEVER use December 31 2026 or end of year as a resolve date unless it is a specific scheduled event.
- Every title must feel like it could trend on Twitter today.

Return ONLY a valid JSON array. No markdown, no explanation, no preamble. Start immediately with [ and end with ]:
[
  {
    "title": "short catchy 4-8 word title",
    "description": "1-2 sentences including why this is hot right now and any DeSo angle",
    "category": "one of: creators, sports, music, politics, tech, entertainment, commentary, Commentary, Streamers, Viral",
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

  const doFetch = () =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

  let res = await doFetch();

  // Retry on 429 (rate limit) or 5xx (transient error) after a short wait
  if (!res.ok && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, res.status === 429 ? 5000 : 3000));
    res = await doFetch();
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

function parseMarkets(text: string): GeneratedMarket[] {
  // Reject Anthropic error messages before attempting JSON parse
  if (!text.startsWith("[") && text.toLowerCase().includes("error occurred")) {
    throw new Error("Claude returned an error message instead of JSON");
  }
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`Failed to parse Claude response: ${text.slice(0, 120)}`);
    return JSON.parse(match[0]);
  }
}

export function classifyEntityType(name: string): "pundit" | "journalist" | "athlete" | "streamer" | "musician" | "politician" | "brand" | "general" {
  const n = name.toLowerCase();
  if (/tucker|shapiro|rogan|bari weiss|chamath|zeihan|bremmer|friedman|hannity|maddow|coulter|maher|limbaugh|podcast|show host/.test(n)) return "pundit";
  if (/journalist|reporter|correspondent|times|post|reuters|ap |nyt|wsj|clarissa|arwa|woodward|bernstein/.test(n)) return "journalist";
  if (/senator|rep\.|governor|president|mayor|congressman|congress|parliament|white house|secretary of/.test(n)) return "politician";
  if (/nfl|nba|mlb|nhl|ufc|f1|mls|fc |united| city$| fc$|warriors|lakers|chiefs|yankees|patriots|athletic/.test(n)) return "athlete";
  if (/xqc|ninja|pokimane|ac7ionman|ishowspeed|twitch|kick\.com|streamer|livestream/.test(n)) return "streamer";
  if (/records|music|rapper|singer|band|artist|tour|album/.test(n)) return "musician";
  if (/inc\.|llc|corp|brand|official|association|league|organization/.test(n)) return "brand";
  return "general";
}

function buildMarketSystemPrompt(entityName: string, entityType: string, today: string): string {
  const base = `Today is ${today}. You generate prediction markets for Caldera, a creator-focused prediction market platform. All markets must resolve via publicly verifiable events. Return ONLY a valid JSON array — no markdown, no explanation.`;

  const schema = `Each item: { "title": string, "description": string, "category": string, "resolution_criteria": string, "resolve_at": ISO date string within 60 days }`;

  if (entityType === "pundit") {
    return `${base}

You are generating markets about ${entityName}, a media commentator or pundit.

Generate 4 markets about what ${entityName} will SAY, PUBLISH, or ARGUE about current world events in the next 30-60 days.

Rules:
- Every title starts with "Will ${entityName}..."
- Markets resolve based on public statements: tweets, podcast episodes, articles, on-air segments
- Reference real ongoing news events (conflicts, elections, economic news, culture wars)
- category must be "Commentary"
- resolution_criteria must cite a specific verifiable source (e.g. "Verified if ${entityName} tweets or publishes...")
- NO markets about their personal life, career moves, or salary

${schema}`;
  }

  if (entityType === "journalist") {
    return `${base}

You are generating markets about ${entityName}, a journalist or reporter.

Generate 4 markets about what ${entityName} will REPORT, PUBLISH, or BREAK as news in the next 30-60 days.

Rules:
- Every title starts with "Will ${entityName}..."
- Markets resolve based on published articles, on-air reports, or official social posts
- Focus on their beat (conflict zone, politics, tech, finance — infer from their name/outlet)
- category must be "Commentary"
- resolution_criteria must cite their byline, Twitter/X post, or outlet publication

${schema}`;
  }

  if (entityType === "politician") {
    return `${base}

You are generating markets about ${entityName}, a political figure.

Generate 4 markets about what ${entityName} will DO, SAY, or VOTE ON in the next 30-60 days.

Rules:
- Every title starts with "Will ${entityName}..."
- Markets resolve via official public record: Congressional record, press releases, C-SPAN, official social accounts
- Focus on current legislative battles, political controversies, upcoming votes
- category must be "Politics"
- NO speculation about personal life or health

${schema}`;
  }

  if (entityType === "streamer") {
    return `${base}

Generate 4 prediction markets about ${entityName}, a live streamer or content creator.
Focus on: bans, drama, viral moments, subscriber milestones, beef with other creators.
category must be "Streamers".
${schema}`;
  }

  if (entityType === "athlete" || entityType === "brand") {
    return `${base}

Generate 4 prediction markets about ${entityName}.
Focus on: game outcomes, trades, signings, performance milestones, championship odds.
category must be "Sports".
${schema}`;
  }

  return `${base}

Generate 4 prediction markets about ${entityName}.
Focus on the most interesting, timely, and resolvable questions about their public life.
Pick the most appropriate category from: Sports, Music, Tech, Politics, Commentary, Streamers, Entertainment, Viral.
${schema}`;
}

export async function generateMarketsForTopic(
  topic: string,
  apiKey: string
): Promise<GeneratedMarket[]> {
  const entityType = classifyEntityType(topic);
  const today = new Date().toISOString().split("T")[0];
  const systemPrompt = buildMarketSystemPrompt(topic, entityType, today);
  console.log(`[generateMarkets] ${topic} → type: ${entityType}`);

  const marketsText = await callClaude(
    apiKey,
    [
      {
        role: "user",
        content: `Generate prediction markets for: ${topic}`,
      },
    ],
    systemPrompt,
    1024
  );

  let markets: GeneratedMarket[];
  try {
    markets = parseMarkets(marketsText);
  } catch {
    // One retry after 3s if parse fails (e.g. transient Anthropic error response)
    await new Promise((r) => setTimeout(r, 3000));
    const retryText = await callClaude(
      apiKey,
      [{ role: "user", content: `Generate prediction markets for: ${topic}` }],
      systemPrompt,
      1024
    );
    markets = parseMarkets(retryText);
  }

  return markets;
}
