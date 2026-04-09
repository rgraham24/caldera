import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_KEYS } from '@/lib/admin/market-generator';

const DESO_PRICE_USD = 4.63;
const CURSOR_KEY = 'reserved_import_cursor';
const VERCEL_PAGE_CAP = 20;

async function saveCursor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cursor: string | null
): Promise<void> {
  await supabase.from('platform_config').upsert(
    { key: CURSOR_KEY, value: cursor ?? '', updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

export async function POST(req: NextRequest) {
  try {
    const {
      adminPassword,
      desoPublicKey,
      pages = VERCEL_PAGE_CAP,
      resetCursor = false,
      fullRun = false,
    } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || '') ||
      !!(process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createClient();
    let imported = 0;
    let skipped = 0;

    // Load saved cursor. maybeSingle() returns null (not an error) when no row exists.
    const { data: cursorRow } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', CURSOR_KEY)
      .maybeSingle();

    // Empty string in DB means "start from beginning" (end-of-list sentinel)
    let cursor: string | null = cursorRow?.value || null;

    // If caller requested a fresh start, ignore whatever was saved
    if (resetCursor) cursor = null;

    // Snapshot where THIS run started (shown in the response for debugging)
    const startCursor = cursor;

    const pageLimit = fullRun ? Math.min(pages, 150) : Math.min(pages, VERCEL_PAGE_CAP);

    for (let i = 0; i < pageLimit; i++) {
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
        // Reached the end of DeSo — clear cursor so next run restarts from beginning
        cursor = null;
        await saveCursor(supabase, null);
        break;
      }

      for (const p of profiles) {
        const username = p.Username as string;
        if (!username) { skipped++; continue; }

        const isReserved = p.IsReserved as boolean;
        const coinEntry = p.CoinEntry as Record<string, unknown> | undefined;
        const holders = (coinEntry?.NumberOfHolders as number) || 0;
        const founderReward = (coinEntry?.CreatorBasisPoints as number) || 0;

        if (!isReserved && holders < 50) { skipped++; continue; }

        const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, '');
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
          token_status: 'active_unverified',
          is_reserved: isReserved,
          founder_reward_basis_points: founderReward,
        }, { onConflict: 'slug', ignoreDuplicates: false });

        if (error) { skipped++; } else { imported++; }
      }

      // Advance cursor to the last profile on this page, then save immediately.
      // Saving per-page means a Vercel timeout won't lose all progress.
      const last = profiles[profiles.length - 1];
      cursor = last ? (last.PublicKeyBase58Check as string) : null;
      await saveCursor(supabase, cursor);

      if (!cursor) break;
    }

    const reachedEnd = !cursor;

    return NextResponse.json({
      imported,
      skipped,
      pagesRun: pageLimit,
      resumedFrom: startCursor ? `${startCursor.substring(0, 20)}...` : 'beginning',
      nextCursor: cursor ? `${cursor.substring(0, 20)}...` : null,
      message: reachedEnd
        ? 'Reached end of DeSo profiles — next run restarts from beginning'
        : `Run again to import the next batch`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
