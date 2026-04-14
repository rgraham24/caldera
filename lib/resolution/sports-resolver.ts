/**
 * ESPN-based sports market resolution.
 * Uses the free ESPN scoreboard API — no auth required.
 *
 * Endpoint pattern:
 *   https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard?dates=YYYYMMDD
 *
 * Supported leagues: NFL, NBA, MLB, NHL
 */

export interface SportsResolutionResult {
  resolved: boolean;
  outcome: "yes" | "no" | "unknown";
  confidence: number;
  reasoning: string;
  source: string;
}

type Sport = "nfl" | "nba" | "mlb" | "nhl";

interface ESPNCompetitor {
  team: { displayName: string; shortDisplayName: string; abbreviation: string };
  score?: string;
  winner?: boolean;
  homeAway: "home" | "away";
}

interface ESPNEvent {
  id: string;
  name: string;
  shortName: string;
  date: string;
  status: {
    type: {
      completed: boolean;
      description: string;
      state: "pre" | "in" | "post";
    };
  };
  competitions: Array<{
    competitors: ESPNCompetitor[];
    status: { type: { completed: boolean } };
  }>;
}

interface ESPNScoreboard {
  events?: ESPNEvent[];
}

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

const SPORT_PATHS: Record<Sport, string> = {
  nfl: "football/nfl",
  nba: "basketball/nba",
  mlb: "baseball/mlb",
  nhl: "hockey/nhl",
};

// Keywords that suggest each sport in a market title
const SPORT_KEYWORDS: Record<Sport, RegExp> = {
  nfl: /\bnfl\b|chiefs|eagles|patriots|cowboys|packers|steelers|ravens|49ers|bills|broncos|bears|vikings|falcons|saints|rams|chargers|raiders|dolphins|jets|giants|commanders|lions|browns|jaguars|colts|titans|texans|seahawks|cardinals|buccaneers|panthers\b/i,
  nba: /\bnba\b|lakers|celtics|warriors|nets|knicks|bucks|suns|nuggets|heat|76ers|sixers|clippers|mavericks|mavs|raptors|bulls|spurs|pelicans|grizzlies|thunder|jazz|wizards|kings|rockets|magic|pistons|cavaliers|hawks|blazers|trail blazers|timberwolves|hornets\b/i,
  mlb: /\bmlb\b|yankees|red sox|dodgers|giants|cubs|cardinals|braves|mets|astros|padres|phillies|blue jays|brewers|tigers|twins|white sox|athletics|mariners|angels|rangers|orioles|royals|rockies|diamondbacks|reds|nationals|marlins|pirates\b/i,
  nhl: /\bnhl\b|oilers|maple leafs|bruins|penguins|rangers|golden knights|lightning|avalanche|hurricanes|stars|capitals|kings|canucks|blues|flames|predators|ducks|senators|canadiens|sabres|islanders|red wings|sharks|coyotes|blue jackets|jets|panthers|wild\b/i,
};

/** Detect which sport a market title is about. Returns null if unknown. */
export function detectSport(title: string): Sport | null {
  for (const [sport, regex] of Object.entries(SPORT_KEYWORDS) as [Sport, RegExp][]) {
    if (regex.test(title)) return sport;
  }
  // Generic fallback keywords
  if (/\bsuper bowl\b/i.test(title)) return "nfl";
  if (/\bnba finals\b|\bchampionship\b.*\bbasketball\b/i.test(title)) return "nba";
  if (/\bworld series\b/i.test(title)) return "mlb";
  if (/\bstanley cup\b/i.test(title)) return "nhl";
  return null;
}

/**
 * Extract team name from a market title.
 * Handles patterns like:
 *   "Will the Chiefs beat the Eagles?"
 *   "Will the Lakers win tonight?"
 *   "Will [Team] win the championship?"
 */
export function extractSubjectTeam(title: string): string | null {
  // "Will the X beat/defeat/win/cover" → X is the subject team we're asking about winning
  const m = title.match(/will\s+(?:the\s+)?([A-Za-z\s]+?)\s+(?:beat|defeat|win|cover|make|reach|advance)/i);
  if (m) return m[1].trim();
  return null;
}

/** Normalize team name to lowercase for fuzzy matching */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

/** Check if a team name is a match for a competitor */
function teamMatches(query: string, competitor: ESPNCompetitor): boolean {
  const q = normalize(query);
  const fields = [
    competitor.team.displayName,
    competitor.team.shortDisplayName,
    competitor.team.abbreviation,
  ].map(normalize);

  return fields.some(
    (f) => f.includes(q) || q.includes(f) || f.split(" ").some((w) => w.length > 3 && q.includes(w))
  );
}

/** Format date as YYYYMMDD for ESPN API */
function toESPNDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Fetch ESPN scoreboard for a sport around a given date (±2 days window) */
async function fetchScoreboard(sport: Sport, aroundDate: Date): Promise<ESPNEvent[]> {
  const path = SPORT_PATHS[sport];
  const dates: string[] = [];

  for (let offset = -2; offset <= 2; offset++) {
    const d = new Date(aroundDate);
    d.setDate(d.getDate() + offset);
    dates.push(toESPNDate(d));
  }

  const events: ESPNEvent[] = [];
  // Fetch ±2 day window; ESPN accepts a single dates param per request
  // We'll fetch each day individually to maximize coverage
  await Promise.all(
    dates.map(async (dateStr) => {
      try {
        const url = `${ESPN_BASE}/${path}/scoreboard?dates=${dateStr}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return;
        const json = (await res.json()) as ESPNScoreboard;
        events.push(...(json.events ?? []));
      } catch {
        // ignore per-day failures
      }
    })
  );

  return events;
}

/**
 * Attempt to resolve a sports market using ESPN data.
 * Returns resolved=false if no matching game found or game not yet completed.
 */
export async function resolveSportsMarket(market: {
  title: string;
  resolve_at: string | null;
}): Promise<SportsResolutionResult> {
  const sport = detectSport(market.title);
  if (!sport) {
    return {
      resolved: false,
      outcome: "unknown",
      confidence: 0,
      reasoning: "Could not identify sport from market title",
      source: "",
    };
  }

  const subjectTeam = extractSubjectTeam(market.title);
  if (!subjectTeam) {
    return {
      resolved: false,
      outcome: "unknown",
      confidence: 0,
      reasoning: "Could not extract team name from market title",
      source: `${ESPN_BASE}/${SPORT_PATHS[sport]}/scoreboard`,
    };
  }

  const aroundDate = market.resolve_at ? new Date(market.resolve_at) : new Date();
  const sourceBase = `${ESPN_BASE}/${SPORT_PATHS[sport]}/scoreboard`;

  let events: ESPNEvent[];
  try {
    events = await fetchScoreboard(sport, aroundDate);
  } catch (err) {
    return {
      resolved: false,
      outcome: "unknown",
      confidence: 0,
      reasoning: `ESPN API error: ${err instanceof Error ? err.message : "unknown"}`,
      source: sourceBase,
    };
  }

  if (events.length === 0) {
    return {
      resolved: false,
      outcome: "unknown",
      confidence: 0,
      reasoning: "No ESPN events found in the date window",
      source: sourceBase,
    };
  }

  // Find a completed game involving the subject team
  const completedGames = events.filter(
    (e) => e.status.type.completed || e.status.type.state === "post"
  );

  for (const event of completedGames) {
    const competition = event.competitions[0];
    if (!competition) continue;

    const competitors = competition.competitors;
    const subjectComp = competitors.find((c) => teamMatches(subjectTeam, c));

    if (!subjectComp) continue;

    // Found the game — determine winner
    const opponent = competitors.find((c) => c !== subjectComp);
    const opponentName = opponent?.team.shortDisplayName ?? "opponent";

    const subjectScore = parseFloat(subjectComp.score ?? "0");
    const opponentScore = parseFloat(opponent?.score ?? "0");

    const won = subjectComp.winner === true || subjectScore > opponentScore;
    const lost = subjectComp.winner === false || (subjectScore < opponentScore && subjectScore !== opponentScore);

    if (!won && !lost) {
      // Tie or data unclear
      return {
        resolved: false,
        outcome: "unknown",
        confidence: 50,
        reasoning: `${subjectTeam} vs ${opponentName} ended with unclear result (${subjectScore}-${opponentScore})`,
        source: `${sourceBase}?dates=${toESPNDate(new Date(event.date))}`,
      };
    }

    const outcome = won ? "yes" : "no";
    const scoreStr = `${subjectScore}-${opponentScore}`;

    return {
      resolved: true,
      outcome,
      confidence: 97,
      reasoning: `${subjectTeam} ${won ? "beat" : "lost to"} ${opponentName} ${scoreStr} on ${new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      source: `${sourceBase}?dates=${toESPNDate(new Date(event.date))}`,
    };
  }

  // Check if the game is in-progress
  const liveGame = events.find((e) => {
    const comp = e.competitions[0];
    return (
      e.status.type.state === "in" &&
      comp?.competitors.some((c) => teamMatches(subjectTeam, c))
    );
  });

  if (liveGame) {
    return {
      resolved: false,
      outcome: "unknown",
      confidence: 0,
      reasoning: `Game is currently in progress`,
      source: sourceBase,
    };
  }

  // Game found in schedule but not yet played
  const scheduledGame = events.find((e) => {
    const comp = e.competitions[0];
    return (
      e.status.type.state === "pre" &&
      comp?.competitors.some((c) => teamMatches(subjectTeam, c))
    );
  });

  if (scheduledGame) {
    return {
      resolved: false,
      outcome: "unknown",
      confidence: 0,
      reasoning: `Game scheduled but not yet played`,
      source: sourceBase,
    };
  }

  return {
    resolved: false,
    outcome: "unknown",
    confidence: 0,
    reasoning: `No ${sport.toUpperCase()} game found for "${subjectTeam}" near the resolution date`,
    source: sourceBase,
  };
}

/**
 * Fetch upcoming games from ESPN for schedule-based market generation.
 * Returns games in the next `daysAhead` days.
 */
export interface UpcomingGame {
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  gameDate: Date;
  eventId: string;
}

export async function fetchUpcomingGames(
  sports: Sport[],
  daysAhead = 2
): Promise<UpcomingGame[]> {
  const games: UpcomingGame[] = [];
  const today = new Date();

  const dateStrings: string[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dateStrings.push(toESPNDate(d));
  }

  await Promise.all(
    sports.flatMap((sport) =>
      dateStrings.map(async (dateStr) => {
        try {
          const url = `${ESPN_BASE}/${SPORT_PATHS[sport]}/scoreboard?dates=${dateStr}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return;
          const json = (await res.json()) as ESPNScoreboard;

          for (const event of json.events ?? []) {
            // Only pre-game events
            if (event.status.type.state !== "pre") continue;
            const comp = event.competitions[0];
            if (!comp || comp.competitors.length < 2) continue;

            const home = comp.competitors.find((c) => c.homeAway === "home");
            const away = comp.competitors.find((c) => c.homeAway === "away");
            if (!home || !away) continue;

            games.push({
              sport,
              homeTeam: home.team.shortDisplayName,
              awayTeam: away.team.shortDisplayName,
              gameDate: new Date(event.date),
              eventId: event.id,
            });
          }
        } catch {
          // ignore per-request failures
        }
      })
    )
  );

  // Deduplicate by eventId
  const seen = new Set<string>();
  return games.filter((g) => {
    if (seen.has(g.eventId)) return false;
    seen.add(g.eventId);
    return true;
  });
}
