import { GeneratedMarket } from './market-generator';

export async function getUpcomingGames(): Promise<Array<{
  sport: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  league: string;
}>> {
  const leagues = [
    { id: '4387', name: 'NBA' },
    { id: '4391', name: 'NFL' },
    { id: '4424', name: 'MLB' },
    { id: '4380', name: 'NHL' },
    { id: '4346', name: 'MLS' },
    { id: '4443', name: 'UFC' },
  ];

  const games: Array<{ sport: string; homeTeam: string; awayTeam: string; date: string; league: string }> = [];

  for (const league of leagues) {
    try {
      const res = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${league.id}`,
        { next: { revalidate: 3600 } }
      );
      const data = await res.json() as { events?: Array<{ strHomeTeam: string; strAwayTeam: string; dateEvent: string }> | null };
      const events = data.events ?? [];

      for (const event of events.slice(0, 3)) {
        games.push({
          sport: league.name,
          homeTeam: event.strHomeTeam,
          awayTeam: event.strAwayTeam,
          date: event.dateEvent,
          league: league.name,
        });
      }
    } catch {
      // skip failed league
    }
  }

  return games;
}

export async function generateSportsMarkets(
  games: Array<{ sport: string; homeTeam: string; awayTeam: string; date: string; league: string }>,
  apiKey: string
): Promise<GeneratedMarket[]> {
  if (games.length === 0) return [];

  const gamesText = games.map(g =>
    `${g.league}: ${g.homeTeam} vs ${g.awayTeam} on ${g.date}`
  ).join('\n');

  const prompt = `Here are upcoming sports games:
${gamesText}

Generate one prediction market per game. Markets should be:
- About game outcomes, player performances, or series results
- Resolved by the game result (publicly verifiable)
- Short punchy titles like "Lakers Win Game 5 Tonight?"

Return ONLY a valid JSON array:
[{
  "title": "string",
  "description": "string",
  "category": "Sports",
  "resolution_criteria": "string",
  "resolve_at": "ISO date string day after game"
}]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json() as { content?: Array<{ text?: string }> };
  const text: string = data.content?.[0]?.text ?? '';

  try {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) as GeneratedMarket[] : [];
  } catch {
    return [];
  }
}
