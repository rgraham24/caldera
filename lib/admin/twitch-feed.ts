export async function getTopStreamers(): Promise<Array<{
  name: string;
  displayName: string;
  viewerCount: number;
  gameName: string;
}>> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('[twitch] No credentials configured, skipping');
    return [];
  }

  try {
    // Get access token
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    const accessToken = tokenData.access_token;
    if (!accessToken) return [];

    // Get top streams
    const streamsRes = await fetch(
      'https://api.twitch.tv/helix/streams?first=20',
      {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    const streamsData = await streamsRes.json() as { data?: Array<{ user_login: string; user_name: string; viewer_count: number; game_id: string; game_name?: string }> };
    const streams = streamsData.data ?? [];

    // Get game names for top streams
    const gameIds = [...new Set(streams.map((s) => s.game_id))].slice(0, 5);
    let gameMap: Record<string, string> = {};

    if (gameIds.length > 0) {
      const gamesRes = await fetch(
        `https://api.twitch.tv/helix/games?id=${gameIds.join('&id=')}`,
        {
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      const gamesData = await gamesRes.json() as { data?: Array<{ id: string; name: string }> };
      gameMap = Object.fromEntries(
        (gamesData.data ?? []).map((g) => [g.id, g.name])
      );
    }

    return streams.map((s) => ({
      name: s.user_login,
      displayName: s.user_name,
      viewerCount: s.viewer_count,
      gameName: gameMap[s.game_id] ?? s.game_name ?? 'Unknown',
    }));
  } catch (e) {
    console.error('[twitch] Error fetching streamers:', e);
    return [];
  }
}
