import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DESO_PRICE_USD = 4.69;

interface DesoProfile {
  PublicKeyBase58Check: string;
  Username: string;
  Description?: string;
  IsReserved: boolean;
  CoinEntry?: { CoinPriceDeSoNanos: number; NumberOfHolders: number };
}

async function fetchProfiles(lastKey: string, orderBy: string): Promise<DesoProfile[]> {
  const body: Record<string, unknown> = { NumToFetch: 100, OrderBy: orderBy, NoErrorOnMissing: true };
  if (lastKey) body.LastPublicKeyBase58Check = lastKey;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://node.deso.org/api/v0/get-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(tid);
    const data = await res.json();
    return data.ProfilesFound || [];
  } catch {
    clearTimeout(tid);
    return [];
  }
}

async function upsertReserved(profiles: DesoProfile[]): Promise<number> {
  const rows = profiles.map(p => ({
    slug: p.Username.toLowerCase(),
    name: p.Username,
    deso_username: p.Username,
    deso_public_key: p.PublicKeyBase58Check,
    deso_is_reserved: true,
    token_status: p.Description?.trim() ? 'active_unverified' : 'shadow',
    is_caldera_verified: false,
    creator_coin_price: ((p.CoinEntry?.CoinPriceDeSoNanos || 0) / 1e9) * DESO_PRICE_USD,
    creator_coin_holders: p.CoinEntry?.NumberOfHolders || 0,
    entity_type: 'person',
    markets_count: 0,
  }));
  const { error } = await sb.from('creators').upsert(rows, {
    onConflict: 'slug',
    ignoreDuplicates: true, // preserve manually-curated records
  });
  if (error) { console.error('upsert error:', error.message); return 0; }
  return rows.length;
}

async function sweep(orderBy: string, maxStuck: number): Promise<{ seen: Set<string>; reserved: number; upserted: number }> {
  const seenKeys = new Set<string>();
  let lastKey = '';
  let prevLastKey = '';
  let stuckCount = 0;
  let noNewCount = 0;       // pages with zero new unique profiles
  let page = 0;
  let totalReserved = 0;
  let totalUpserted = 0;

  console.log(`\n── Sweep: ${orderBy} ──`);
  while (true) {
    page++;
    const profiles = await fetchProfiles(lastKey, orderBy);
    if (!profiles.length) { console.log(`  Empty at page ${page}`); break; }

    const newLastKey = profiles[profiles.length - 1].PublicKeyBase58Check;
    const isStuck = newLastKey === prevLastKey;
    if (isStuck) { stuckCount++; } else { stuckCount = 0; }
    if (stuckCount >= maxStuck) {
      console.log(`  Cursor stuck after ${page} pages — stopping.`);
      break;
    }

    const newProfiles = profiles.filter(p => !seenKeys.has(p.PublicKeyBase58Check));
    const newReserved = newProfiles.filter(p => p.IsReserved && p.Username);
    profiles.forEach(p => seenKeys.add(p.PublicKeyBase58Check));

    // Stop if no new unique profiles for 5 consecutive pages (pool exhausted)
    if (newProfiles.length === 0) { noNewCount++; } else { noNewCount = 0; }
    if (noNewCount >= 5) {
      console.log(`  No new profiles for 5 pages — pool exhausted at ${seenKeys.size} unique. Stopping.`);
      break;
    }

    prevLastKey = lastKey;
    lastKey = newLastKey;

    if (newReserved.length > 0) {
      const n = await upsertReserved(newReserved);
      totalReserved += newReserved.length;
      totalUpserted += n;
    }

    if (page % 10 === 0) {
      console.log(`  Page ${page}: seen=${seenKeys.size} reserved_found=${totalReserved} upserted=${totalUpserted}`);
    }

    await new Promise(r => setTimeout(r, 350));
    if (profiles.length < 100) { console.log(`  Last page (${profiles.length} profiles).`); break; }
  }

  console.log(`  Done: ${page} pages, ${seenKeys.size} unique profiles, ${totalReserved} reserved, ${totalUpserted} upserted`);
  return { seen: seenKeys, reserved: totalReserved, upserted: totalUpserted };
}

async function main() {
  console.log('DeSo bulk reserved profile import');
  console.log('NOTE: DeSo API pagination is limited — this fetches what is accessible.\n');

  // Strategy 1: newest_last_post — yields ~800-1000 unique profiles before looping
  const s1 = await sweep('newest_last_post', 3);

  // Strategy 2: influencer_coin_price — top 100 by coin price (1 page before stuck)
  const s2 = await sweep('influencer_coin_price', 1);

  // Final count
  const { count: total } = await sb.from('creators').select('*', { count: 'exact', head: true });
  const { count: reserved } = await sb.from('creators').select('*', { count: 'exact', head: true }).eq('deso_is_reserved', true);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Strategy 1 (newest_last_post): ${s1.reserved} reserved found, ${s1.upserted} upserted`);
  console.log(`Strategy 2 (coin_price top):   ${s2.reserved} reserved found, ${s2.upserted} upserted`);
  console.log(`\nDB after import: ${total} total creators, ${reserved} reserved`);
  console.log('\nNote: DeSo API limits enumeration to ~1000 profiles per sort order.');
  console.log('The ~15k reserved handles include dormant squatter accounts not fetchable via public API.');
}

main().catch(console.error);
