import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getDesoPrice(): Promise<number> {
  const res = await fetch("https://api.deso.org/api/v0/get-exchange-rate");
  const data = await res.json();
  const cents = data.USDCentsPerDeSoExchangeRate as number;
  return cents / 100;
}

async function fetchProfile(username: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("https://api.deso.org/api/v0/get-single-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Username: username, NoErrorOnMissing: true }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.Profile as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const desoPrice = await getDesoPrice();
  console.log(`DESO price: $${desoPrice.toFixed(4)}`);

  let processed = 0;
  let updated = 0;
  let errors = 0;
  let page = 0;
  const PAGE_SIZE = 50;
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 300;

  while (true) {
    const { data: creators, error } = await supabase
      .from("creators")
      .select("id, slug, deso_username, deso_public_key, image_url")
      .not("deso_username", "is", null)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order("id");

    if (error) {
      console.error("Supabase fetch error:", error.message);
      break;
    }
    if (!creators || creators.length === 0) break;

    console.log(`\nPage ${page + 1}: ${creators.length} creators`);

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < creators.length; i += BATCH_SIZE) {
      const batch = creators.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (creator) => {
          const profile = await fetchProfile(creator.deso_username as string);
          if (!profile) return { creator, skipped: true };

          const pubKey = profile.PublicKeyBase58Check as string;
          const coinEntry = profile.CoinEntry as Record<string, unknown>;
          const coinPriceDesoNanos = (profile.CoinPriceDeSoNanos as number) ?? 0;

          const coinPriceUSD = (coinPriceDesoNanos / 1e9) * desoPrice;
          const coinsInCirculation = ((coinEntry?.CoinsInCirculationNanos as number) ?? 0) / 1e9;
          const marketCap = coinPriceUSD * coinsInCirculation;
          const holders = (coinEntry?.NumberOfHolders as number) ?? 0;

          const needsUpdate =
            !creator.deso_public_key ||
            creator.deso_public_key !== pubKey ||
            marketCap > 0;

          if (!needsUpdate) return { creator, skipped: true };

          const updates: Record<string, unknown> = {
            deso_public_key: pubKey,
            creator_coin_price: coinPriceUSD,
            creator_coin_market_cap: marketCap,
            creator_coin_holders: holders,
          };

          // Only set image_url if currently null/empty
          if (!creator.image_url) {
            updates.image_url = `https://node.deso.org/api/v0/get-single-profile-picture/${pubKey}`;
          }

          const { error: updateError } = await supabase
            .from("creators")
            .update(updates)
            .eq("id", creator.id);

          if (updateError) throw new Error(updateError.message);
          return { creator, updated: true, pubKey, coinPriceUSD, marketCap, holders };
        })
      );

      for (const result of results) {
        processed++;
        if (result.status === "rejected") {
          errors++;
          console.error(`  ✗ error:`, result.reason);
        } else if (result.value?.updated) {
          updated++;
          const v = result.value;
          console.log(
            `  ✓ ${v.creator.deso_username} → key: ${(v.pubKey as string).slice(0, 16)}... | price: $${(v.coinPriceUSD as number).toFixed(4)} | mcap: $${(v.marketCap as number).toFixed(2)} | holders: ${v.holders}`
          );
        } else {
          console.log(`  · ${result.value?.creator?.deso_username ?? "?"} (no change)`);
        }
      }

      if (i + BATCH_SIZE < creators.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    if (creators.length < PAGE_SIZE) break;
    page++;
    await sleep(500);
  }

  console.log(`\n── Summary ──────────────────────`);
  console.log(`  Processed : ${processed}`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Errors    : ${errors}`);
  console.log(`  Skipped   : ${processed - updated - errors}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
