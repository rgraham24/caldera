/**
 * Sync creator profile photos from the DeSo API.
 *
 * Run with:
 *   npx ts-node scripts/sync-creator-photos.ts
 *
 * Options (env vars or edit below):
 *   SYNC_LIMIT=100   — max creators to process (default 500)
 *   SYNC_DELAY=200   — ms delay between DeSo API calls (default 200)
 *   FORCE_UPDATE=1   — update even if image_url already set
 */

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

const SYNC_LIMIT = parseInt(process.env.SYNC_LIMIT ?? "500");
const SYNC_DELAY = parseInt(process.env.SYNC_DELAY ?? "200");
const FORCE_UPDATE = process.env.FORCE_UPDATE === "1";

async function getDesoProfile(publicKey: string): Promise<{
  imageUrl: string | null;
  username: string | null;
  displayName: string | null;
} | null> {
  try {
    const res = await fetch("https://node.deso.org/api/v0/get-single-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PublicKeyBase58Check: publicKey }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { Profile?: {
      Username?: string;
      ExtraData?: { LargeProfilePicURL?: string; DisplayName?: string };
    }};
    const profile = data?.Profile;
    if (!profile) return null;

    const imageUrl =
      profile.ExtraData?.LargeProfilePicURL ||
      `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`;

    return {
      imageUrl,
      username: profile.Username ?? null,
      displayName: profile.ExtraData?.DisplayName ?? profile.Username ?? null,
    };
  } catch {
    return null;
  }
}

async function syncPhotos() {
  console.log(`🔄 Syncing creator photos (limit=${SYNC_LIMIT}, delay=${SYNC_DELAY}ms, force=${FORCE_UPDATE})\n`);

  // Fetch creators that have a DeSo public key
  let query = supabase
    .from("creators")
    .select("id, slug, name, deso_public_key, deso_username, image_url")
    .not("deso_public_key", "is", null)
    .order("markets_count", { ascending: false })
    .limit(SYNC_LIMIT);

  // By default skip creators that already have a non-node image
  if (!FORCE_UPDATE) {
    query = query.or("image_url.is.null,image_url.ilike.%node.deso.org%get-single-profile-picture%");
  }

  const { data: creators, error } = await query;

  if (error) {
    console.error("Supabase error:", error.message);
    process.exit(1);
  }

  if (!creators?.length) {
    console.log("No creators need photo sync.");
    return;
  }

  console.log(`Found ${creators.length} creators to process.\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const creator of creators) {
    process.stdout.write(`  ${creator.slug.padEnd(30)} `);

    if (!creator.deso_public_key) {
      process.stdout.write(`⏭  no public key\n`);
      skipped++;
      continue;
    }

    const profile = await getDesoProfile(creator.deso_public_key);

    if (!profile) {
      process.stdout.write(`❌ DeSo API returned no profile\n`);
      failed++;
      // Still delay to avoid hammering the API
      await new Promise((r) => setTimeout(r, SYNC_DELAY));
      continue;
    }

    const updates: Record<string, string> = {};

    if (profile.imageUrl) updates.image_url = profile.imageUrl;
    if (profile.username && !creator.deso_username) updates.deso_username = profile.username;
    if (profile.displayName && profile.displayName !== creator.name) {
      // Only update name if we got a real display name (not just public key fallback)
      if (profile.username && profile.displayName !== creator.deso_public_key) {
        updates.name = profile.displayName;
      }
    }

    if (Object.keys(updates).length === 0) {
      process.stdout.write(`⏭  already up to date\n`);
      skipped++;
    } else {
      const { error: updateError } = await supabase
        .from("creators")
        .update(updates)
        .eq("id", creator.id);

      if (updateError) {
        process.stdout.write(`❌ DB error: ${updateError.message}\n`);
        failed++;
      } else {
        process.stdout.write(`✅ ${profile.username ?? "?"} → ${profile.imageUrl?.slice(0, 50) ?? "no img"}\n`);
        updated++;
      }
    }

    await new Promise((r) => setTimeout(r, SYNC_DELAY));
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ Updated : ${updated}`);
  console.log(`⏭  Skipped : ${skipped}`);
  console.log(`❌ Failed  : ${failed}`);
  console.log(`${"─".repeat(50)}\n`);
}

syncPhotos().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
