import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DESO_PRICE_USD = 4.63;
const CURSOR_KEY = 'reserved_import_cursor';

export async function POST(req: NextRequest) {
  try {
    const { adminPassword, pages = 50, resetCursor = false } = await req.json();
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createClient();
    let imported = 0;
    let skipped = 0;

    // Load saved cursor unless caller requests a fresh start
    let cursor: string | null = null;
    if (!resetCursor) {
      const { data: cursorData } = await supabase
        .from('platform_config')
        .select('value')
        .eq('key', CURSOR_KEY)
        .single();
      cursor = cursorData?.value || null;
    }

    const startCursor = cursor;

    for (let i = 0; i < Math.min(pages, 50); i++) {
      const body: Record<string, unknown> = {
        NumToFetch: 100,
        OrderBy: 'influencer_coin_price',
        NoErrorOnMissing: true,
      };
      if (cursor) body.LastPublicKeyBase58Check = cursor;

      const res = await fetch('https://node.deso.org/api/v0/get-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) break;
      const data = await res.json();
      const profiles: Record<string, unknown>[] = data.ProfilesFound ?? [];
      if (!profiles.length) {
        // Reached the end — reset cursor so next run starts over
        cursor = null;
        break;
      }

      for (const p of profiles) {
        const username = p.Username as string;
        if (!username) { skipped++; continue; }

        const isReserved = p.IsReserved as boolean;
        const coinEntry = p.CoinEntry as Record<string, unknown> | undefined;
        const holders = (coinEntry?.NumberOfHolders as number) || 0;
        const founderReward = (coinEntry?.CreatorBasisPoints as number) || 0;

        // Only import reserved profiles or high-holder profiles
        if (!isReserved && holders < 50) { skipped++; continue; }

        const slug = (username as string).toLowerCase().replace(/[^a-z0-9]+/g, '');
        const publicKey = p.PublicKeyBase58Check as string;
        const coinPriceNanos = (p.CoinPriceDeSoNanos as number) || 0;
        const coinPriceUSD = (coinPriceNanos / 1e9) * DESO_PRICE_USD;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('creators').upsert({
          name: username,
          slug,
          deso_username: username,
          deso_public_key: publicKey,
          image_url: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}?fallback=https://i.imgur.com/w1BEqJv.png`,
          creator_coin_price: coinPriceUSD,
          creator_coin_holders: holders,
          creator_coin_market_cap: coinPriceUSD * holders,
          token_status: isReserved ? 'active_unverified' : 'active_unverified',
          is_reserved: isReserved,
          founder_reward_basis_points: founderReward,
        }, { onConflict: 'slug', ignoreDuplicates: false });

        if (error) { skipped++; } else { imported++; }
      }

      const last = profiles[profiles.length - 1];
      cursor = last ? (last.PublicKeyBase58Check as string) : null;
      if (!cursor) break;
    }

    // Persist cursor for next run (empty string = start from beginning next time)
    await supabase.from('platform_config').upsert({
      key: CURSOR_KEY,
      value: cursor ?? '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    const reachedEnd = !cursor;

    return NextResponse.json({
      imported,
      skipped,
      pages,
      resumedFrom: startCursor ? `${startCursor.substring(0, 12)}...` : 'beginning',
      nextCursor: cursor ? `${cursor.substring(0, 12)}...` : null,
      message: reachedEnd
        ? 'Reached end of DeSo profiles — next run will start from beginning'
        : 'Run again to import the next batch',
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
