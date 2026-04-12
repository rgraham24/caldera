/**
 * One-time cleanup: find markets whose creator_slug looks like a raw slugified
 * word (length < 10, no hyphens) that does NOT match a reserved DeSo profile,
 * then re-resolve using the new resolveCreatorSlug() 4-step logic and update
 * the DB row if a better slug is found.
 *
 * Run with:
 *   npx tsx scripts/fix-market-creator-slugs.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isValidDesoSlug(slug: string): boolean {
  return /^[a-z0-9]{3,25}$/.test(slug);
}

async function resolveCreatorSlug(
  entityName: string
): Promise<string | null> {
  if (!entityName || entityName.length < 2) return null;
  const slugified = entityName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Step 1 — exact slug match in recognised active/claimed tiers
  {
    const { data } = await (supabase as any)
      .from("creators")
      .select("slug")
      .eq("slug", slugified)
      .in("token_status", ["active_unverified", "active_verified", "claimed"])
      .maybeSingle();
    if (data?.slug && isValidDesoSlug(data.slug)) return data.slug;
  }

  // Step 2 — deso_username match
  {
    const { data } = await (supabase as any)
      .from("creators")
      .select("slug, deso_username")
      .ilike("deso_username", slugified)
      .in("token_status", ["active_unverified", "active_verified", "claimed"])
      .maybeSingle();
    if (data?.slug && isValidDesoSlug(data.slug)) return data.slug;
  }

  // Step 3 — fuzzy name match
  {
    const { data } = await (supabase as any)
      .from("creators")
      .select("slug, name")
      .ilike("name", `%${entityName}%`)
      .in("token_status", ["active_unverified", "active_verified", "claimed"])
      .order("creator_coin_holders", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.slug && isValidDesoSlug(data.slug)) return data.slug;
  }

  // Step 4 — DeSo API: only accept IsReserved profiles
  try {
    const res = await fetch("https://api.deso.org/api/v0/get-single-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Username: slugified }),
    });
    if (res.ok) {
      const desoData = await res.json();
      const profile = desoData?.Profile;
      if (profile?.Username && profile.IsReserved === true) {
        const desoUsername: string = profile.Username;
        const slug = desoUsername.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (isValidDesoSlug(slug)) {
          // Upsert so future lookups hit Step 1/2
          await (supabase as any).from("creators").upsert(
            {
              name: desoUsername,
              slug,
              deso_username: desoUsername,
              deso_public_key: profile.PublicKeyBase58Check,
              creator_coin_price:
                ((profile.CoinPriceDeSoNanos ?? 0) / 1e9) * 4.63,
              creator_coin_holders: profile.CoinEntry?.NumberOfHolders ?? 0,
              token_status: "active_unverified",
              is_reserved: true,
            },
            { onConflict: "slug" }
          );
          return slug;
        }
      }
    }
  } catch { /* network error — fall through */ }

  return null;
}

/** Extract the subject entity from a market title, same logic as backfillCreatorSlugs. */
function extractEntityName(title: string): string | null {
  const entity = title
    .replace(/^Will (the |a |an )?/i, "")
    .replace(/^Who will (win |be )?/i, "")
    .split(
      /\s+(win|lose|sign|trade|retire|announce|beat|defeat|score|hit|make|reach|complete|be|have|get|go|do|say|post|tweet|play|stream|release|drop|sell|buy|leave|join|quit|fire|hire|ban|suspend|break|set|claim|take|become|earn|host|appear|attend|face|fight|challenge|top|lead|finish|end|start|open|close|launch|reveal|confirm|deny|admit|file)\b/i
    )[0]
    .replace(/\?.*$/, "")
    .trim();

  return entity.length >= 2 ? entity : null;
}

async function main() {
  console.log("🔍 Fetching markets with suspicious short creator_slug…");

  // Target: markets with a creator_slug that is a single short word (< 10 chars, no hyphens)
  // These are likely raw slugified words, not proper reserved profile slugs.
  const { data: markets, error } = await (supabase as any)
    .from("markets")
    .select("id, title, creator_slug")
    .not("creator_slug", "is", null)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("❌ Fetch error:", error.message);
    process.exit(1);
  }

  // Filter to short single-word slugs (likely wrong)
  const suspects = (markets as any[]).filter((m) => {
    const s: string = m.creator_slug;
    return s.length < 10 && !s.includes("-");
  });

  console.log(`Found ${suspects.length} suspect markets (out of ${markets.length} with creator_slug).`);
  if (suspects.length === 0) {
    console.log("✅ Nothing to fix.");
    return;
  }

  let updated = 0;
  let cleared = 0;
  let unchanged = 0;

  for (const market of suspects) {
    const entityName = extractEntityName(market.title);
    if (!entityName) {
      console.log(`  [skip] No entity extracted from: "${market.title}"`);
      continue;
    }

    const resolved = await resolveCreatorSlug(entityName);

    if (!resolved) {
      // No reserved profile found — clear the bad slug so it doesn't link to random squatters
      await (supabase as any)
        .from("markets")
        .update({ creator_slug: null })
        .eq("id", market.id);
      cleared++;
      console.log(`  [cleared] "${market.title}" — removed bad slug "${market.creator_slug}"`);
    } else if (resolved !== market.creator_slug) {
      await (supabase as any)
        .from("markets")
        .update({ creator_slug: resolved })
        .eq("id", market.id);
      updated++;
      console.log(`  [updated] "${market.title}" — "${market.creator_slug}" → "${resolved}"`);
    } else {
      unchanged++;
    }

    // Avoid hammering DeSo API
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n✅ Done.`);
  console.log(`   Updated : ${updated}`);
  console.log(`   Cleared : ${cleared}`);
  console.log(`   Unchanged: ${unchanged}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
