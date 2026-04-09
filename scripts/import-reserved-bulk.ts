import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const DESO_PRICE_USD = 4.63;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  console.error('Get SUPABASE_SERVICE_ROLE_KEY from: Supabase dashboard > Settings > API > service_role key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchPage(cursor: string | null): Promise<{ profiles: any[]; nextCursor: string | null }> {
  const body: any = { NumToFetch: 100, OrderBy: 'influencer_coin_price', NoErrorOnMissing: true };
  if (cursor) body.LastPublicKeyBase58Check = cursor;

  const res = await fetch('https://node.deso.org/api/v0/get-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const profiles = data.ProfilesFound ?? [];
  const nextCursor = profiles.length > 0 ? profiles[profiles.length - 1].PublicKeyBase58Check : null;
  return { profiles, nextCursor };
}

async function main() {
  let cursor: string | null = null;
  let totalImported = 0;
  let totalSkipped = 0;
  let page = 0;

  // Fetch 200 pages = 20,000 profiles
  while (page < 200) {
    const { profiles, nextCursor } = await fetchPage(cursor);
    if (!profiles.length) break;

    for (const p of profiles) {
      const isReserved = p.IsReserved as boolean;
      const holders = p.CoinEntry?.NumberOfHolders ?? 0;
      if (!isReserved && holders < 50) {
        totalSkipped++;
        continue;
      }

      const username = p.Username as string;
      if (!username) {
        totalSkipped++;
        continue;
      }

      const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const publicKey = p.PublicKeyBase58Check as string;
      const coinPriceNanos = p.CoinPriceDeSoNanos ?? 0;
      const coinPriceUSD = (coinPriceNanos / 1e9) * DESO_PRICE_USD;

      const { error } = await supabase.from('creators').upsert(
        {
          name: username,
          slug,
          deso_username: username,
          deso_public_key: publicKey,
          image_url: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}?fallback=https://i.imgur.com/w1BEqJv.png`,
          creator_coin_price: coinPriceUSD,
          creator_coin_holders: holders,
          token_status: 'active_unverified',
          is_reserved: isReserved,
          founder_reward_basis_points: p.CoinEntry?.CreatorBasisPoints ?? 0,
        },
        { onConflict: 'slug', ignoreDuplicates: false }
      );

      if (error) {
        totalSkipped++;
      } else {
        totalImported++;
      }
    }

    page++;
    cursor = nextCursor;
    if (!cursor) break;
    console.log(`Page ${page}: ${totalImported} imported so far...`);
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`DONE: ${totalImported} imported, ${totalSkipped} skipped`);
}

main().catch(console.error);
