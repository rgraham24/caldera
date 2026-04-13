import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789_';

async function fetchWithPrefix(prefix: string, seenKeys: Set<string>) {
  let lastKey = '';
  let added = 0;

  while (true) {
    try {
      const res = await fetch('https://api.deso.org/api/v0/get-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ReaderPublicKeyBase58Check: '',
          NumToFetch: 100,
          UsernamePrefix: prefix,
          OrderBy: 'newest_last_post',
          LastPublicKeyBase58Check: lastKey,
        }),
      });

      const data = await res.json();
      const profiles = (data.ProfilesFound || []) as any[];
      if (!profiles.length) break;

      const newOnes = profiles.filter(p => !seenKeys.has(p.PublicKeyBase58Check) && p.IsReserved && p.Username);
      newOnes.forEach(p => seenKeys.add(p.PublicKeyBase58Check));

      if (newOnes.length > 0) {
        const rows = newOnes.map((p: any) => ({
          slug: p.Username.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
          name: p.Username,
          deso_username: p.Username,
          deso_public_key: p.PublicKeyBase58Check,
          token_status: (p.PostCount > 0 || p.CoinEntry?.NumberOfHolders > 0) ? 'active_unverified' : 'shadow',
          deso_is_reserved: true,
          is_caldera_verified: false,
          creator_coin_price: ((p.CoinEntry?.CoinPriceDeSoNanos || 0) / 1e9) * 4.69,
          creator_coin_holders: p.CoinEntry?.NumberOfHolders || 0,
          entity_type: 'person',
          markets_count: 0,
        })).filter(r => r.slug.length > 0);

        if (rows.length > 0) {
          const { error } = await sb.from('creators').upsert(rows, {
            onConflict: 'slug',
            ignoreDuplicates: false,
          });
          if (error) console.error(`  Error upserting: ${error.message}`);
          else added += rows.length;
        }
      }

      lastKey = profiles[profiles.length - 1]?.PublicKeyBase58Check || '';
      if (profiles.length < 100) break;
      await new Promise(r => setTimeout(r, 200));
    } catch (e: any) {
      console.error(`  fetch error for prefix "${prefix}":`, e.message);
      break;
    }
  }
  return added;
}

async function main() {
  // Load existing public keys to skip re-processing
  const seenKeys = new Set<string>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('creators')
      .select('deso_public_key')
      .not('deso_public_key', 'is', null)
      .range(offset, offset + 999);
    if (!data?.length) break;
    data.forEach(r => { if (r.deso_public_key) seenKeys.add(r.deso_public_key); });
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Starting with ${seenKeys.size} existing profiles in DB`);

  let totalAdded = 0;

  // Single char sweep first
  console.log('\n── Single-char sweep ──');
  for (const c of CHARS.split('')) {
    const added = await fetchWithPrefix(c, seenKeys);
    if (added > 0) {
      totalAdded += added;
      console.log(`"${c}": +${added} (running total: ${totalAdded})`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`Single-char done. Added: ${totalAdded}`);

  // 2-char sweep — common name start letters
  const common = 'abcdefghijklmnoprstw';
  console.log(`\n── 2-char sweep (${common.length} × ${CHARS.length} = ${common.length * CHARS.length} prefixes) ──`);
  let prefixCount = 0;
  for (const c1 of common.split('')) {
    for (const c2 of CHARS.split('')) {
      const prefix = c1 + c2;
      prefixCount++;
      const added = await fetchWithPrefix(prefix, seenKeys);
      if (added > 0) {
        totalAdded += added;
        console.log(`"${prefix}": +${added} (running total: ${totalAdded}) [${prefixCount}/${common.length * CHARS.length}]`);
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // Final DB count
  const { count: finalTotal } = await sb.from('creators').select('*', { count: 'exact', head: true });
  const { count: finalReserved } = await sb.from('creators').select('*', { count: 'exact', head: true }).eq('deso_is_reserved', true);

  console.log('\n=== FINAL RESULTS ===');
  console.log(`Total creators in DB: ${finalTotal}`);
  console.log(`Reserved (gold check): ${finalReserved}`);
  console.log(`New profiles added this run: ${totalAdded}`);
}

main().catch(console.error);
