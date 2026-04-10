const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DESO_PRICE = 4.63;
let total = 0, skipped = 0, page = 0, cursor = null;

async function run() {
  console.log('Starting reserved-only DeSo profile import...');
  console.log('Using ModerationType: reserved — only officially reserved profiles will be fetched.\n');

  while (page < 200) {
    const body = {
      NumToFetch: 100,
      ModerationType: 'reserved',
      NoErrorOnMissing: true,
    };
    if (cursor) body.LastPublicKeyBase58Check = cursor;

    let profiles = [];
    try {
      const res = await fetch('https://node.deso.org/api/v0/get-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      profiles = data.ProfilesFound || [];
    } catch (e) {
      console.log('Fetch error, retry in 5s...', e.message);
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    if (profiles.length === 0) {
      console.log('No more profiles found — done.');
      break;
    }

    for (const p of profiles) {
      // STRICT: only reserved profiles — fan accounts are rejected
      if (p.IsReserved !== true) {
        skipped++;
        continue;
      }

      const desoUsername = p.Username;
      if (!desoUsername) { skipped++; continue; }

      // Slug: lowercase, alphanumeric only — matches DeSo canonical form
      const slug = desoUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!slug || slug.length < 2) { skipped++; continue; }

      const publicKey = p.PublicKeyBase58Check;
      const holders = (p.CoinEntry && p.CoinEntry.NumberOfHolders) || 0;
      const price = ((p.CoinPriceDeSoNanos || 0) / 1e9) * DESO_PRICE;
      const founderReward = (p.CoinEntry && p.CoinEntry.CreatorBasisPoints) || 0;

      const { error } = await supabase.from('creators').upsert({
        name: desoUsername,
        slug,
        deso_username: desoUsername,
        deso_public_key: publicKey,
        image_url: 'https://node.deso.org/api/v0/get-single-profile-picture/' + publicKey,
        creator_coin_price: price,
        creator_coin_holders: holders,
        token_status: 'active_unverified',
        is_reserved: true,
        founder_reward_basis_points: founderReward,
      }, { onConflict: 'slug' });

      if (error) {
        console.log('  Error upserting', desoUsername, '—', error.message);
        skipped++;
      } else {
        total++;
      }
    }

    cursor = profiles[profiles.length - 1]?.PublicKeyBase58Check || null;
    page++;

    if (page % 10 === 0) {
      console.log(`Page ${page}: ${total} reserved profiles imported, ${skipped} skipped`);
    }

    if (!cursor) {
      console.log('No cursor returned — end of results.');
      break;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDONE: ${total} reserved profiles imported, ${skipped} skipped across ${page} pages`);
}

run().catch(console.error);
