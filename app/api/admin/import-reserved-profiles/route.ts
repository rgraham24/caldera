import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_KEYS } from '@/lib/admin/market-generator';

const DESO_PRICE_USD = 4.63;
const PASS_KEY = 'reserved_import_pass';
const TOTAL_PASSES = 28; // Pass 1: price, Pass 2: newest, Passes 3-28: a-z

// Pass 1: top profiles by coin price
// Pass 2: newest profiles
// Passes 3-28: username prefix a through z
function buildRequestBody(pass: number): Record<string, unknown> {
  if (pass === 1) {
    return { NumToFetch: 100, OrderBy: 'influencer_coin_price', NoErrorOnMissing: true };
  }
  if (pass === 2) {
    return { NumToFetch: 100, OrderBy: 'newest', NoErrorOnMissing: true };
  }
  const letter = String.fromCharCode('a'.charCodeAt(0) + (pass - 3)); // pass 3='a'…pass 28='z'
  return { NumToFetch: 100, UsernamePrefix: letter, NoErrorOnMissing: true };
}

function passLabel(pass: number): string {
  if (pass === 1) return 'price-sort';
  if (pass === 2) return 'newest-sort';
  const letter = String.fromCharCode('a'.charCodeAt(0) + (pass - 3));
  return `prefix-${letter}`;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function importProfiles(
  supabase: SupabaseClient,
  profiles: Record<string, unknown>[]
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

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

  return { imported, skipped };
}

export async function POST(req: NextRequest) {
  try {
    const {
      adminPassword,
      desoPublicKey,
      resetPass = false,
    } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || '') ||
      !!(process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createClient();

    // Load current pass (1-28). Default to 1 if not set.
    const { data: passRow } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', PASS_KEY)
      .maybeSingle();

    let currentPass = parseInt(passRow?.value || '1', 10);
    if (isNaN(currentPass) || currentPass < 1 || currentPass > TOTAL_PASSES) currentPass = 1;
    if (resetPass) currentPass = 1;

    const label = passLabel(currentPass);
    const body = buildRequestBody(currentPass);

    // Fetch profiles for this pass
    const res = await fetch('https://node.deso.org/api/v0/get-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `DeSo API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const profiles: Record<string, unknown>[] = data.ProfilesFound ?? [];

    const { imported, skipped } = await importProfiles(supabase, profiles);

    // Advance to next pass (wraps back to 1 after all 28 complete)
    const nextPass = currentPass >= TOTAL_PASSES ? 1 : currentPass + 1;

    await supabase.from('platform_config').upsert(
      { key: PASS_KEY, value: String(nextPass), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

    const allPassesComplete = currentPass === TOTAL_PASSES;

    return NextResponse.json({
      imported,
      skipped,
      profilesFetched: profiles.length,
      pass: currentPass,
      passLabel: label,
      totalPasses: TOTAL_PASSES,
      nextPass,
      message: allPassesComplete
        ? `All ${TOTAL_PASSES} passes complete — next run restarts from pass 1`
        : `Pass ${currentPass}/${TOTAL_PASSES} done (${label}). Run again for pass ${nextPass} (${passLabel(nextPass)}).`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
