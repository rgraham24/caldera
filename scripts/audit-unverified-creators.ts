/**
 * Audit creators with deso_is_reserved=false AND is_caldera_verified=false who have markets.
 * Classifies each as: REMAPPABLE | NEEDS_PLATFORM_TOKEN | SQUATTER_FLAGGED
 *
 * Run with: npx tsx scripts/audit-unverified-creators.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Classification = "REMAPPABLE" | "NEEDS_PLATFORM_TOKEN" | "SQUATTER_FLAGGED";

interface AuditRow {
  slug: string;
  name: string;
  deso_username: string | null;
  markets_count: number;
  token_status: string;
  classification: Classification;
  remapTo: string | null;
  remapUsername: string | null;
  note: string;
}

async function checkDeSo(username: string): Promise<{
  exists: boolean;
  isReserved: boolean;
  username: string | null;
  publicKey: string | null;
}> {
  try {
    const res = await fetch("https://api.deso.org/api/v0/get-single-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Username: username }),
    });
    if (!res.ok) return { exists: false, isReserved: false, username: null, publicKey: null };
    const data = await res.json();
    if (!data?.Profile?.Username) return { exists: false, isReserved: false, username: null, publicKey: null };
    return {
      exists: true,
      isReserved: data.Profile.IsReserved === true,
      username: data.Profile.Username,
      publicKey: data.Profile.PublicKeyBase58Check,
    };
  } catch {
    return { exists: false, isReserved: false, username: null, publicKey: null };
  }
}

/** Brave search for the real social handle */
async function lookupViaSearch(name: string, braveApiKey: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${name} site:twitter.com OR site:x.com OR site:instagram.com`);
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${q}&count=5`, {
      headers: { "Accept": "application/json", "X-Subscription-Token": braveApiKey },
    });
    if (!res.ok) return null;
    const data = await res.json();
    for (const result of data?.web?.results ?? []) {
      const url: string = result.url ?? "";
      const match = url.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{2,20})(?:\/|$)/);
      if (match?.[1] && !["intent", "search", "hashtag", "i"].includes(match[1].toLowerCase())) {
        return match[1].toLowerCase();
      }
    }
  } catch { /* skip */ }
  return null;
}

/** Generate candidate reserved handles from name */
function candidateSlugs(slug: string, name: string): string[] {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const words = name.toLowerCase().split(/\s+/);
  const candidates = new Set<string>([
    base,
    slug.replace(/-/g, ""),
    words.length >= 2 ? `${words[0]}${words[words.length - 1]}` : "",
    words[0] ?? "",
    `${base}official`,
    `${base}real`,
    `${base}music`,
    `${base}tv`,
    `${base}yt`,
    `${base}ytofficial`,
  ].filter((c) => c.length >= 3));
  return [...candidates];
}

async function main() {
  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY ?? process.env.BRAVE_API_KEY ?? "";

  console.log("🔍 Fetching unverified creators with markets...\n");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creators, error } = await (supabase as any)
    .from("creators")
    .select("slug, name, deso_username, markets_count, token_status, deso_is_reserved, is_caldera_verified")
    .eq("deso_is_reserved", false)
    .eq("is_caldera_verified", false)
    .gt("markets_count", 0)
    .order("markets_count", { ascending: false })
    .limit(200);

  if (error) {
    console.error("❌ Fetch error:", error.message);
    process.exit(1);
  }

  if (!creators?.length) {
    console.log("✅ No unverified creators with markets found.");
    return;
  }

  console.log(`Found ${creators.length} creators to audit.\n`);

  const rows: AuditRow[] = [];

  for (const c of creators as any[]) {
    const primary = c.deso_username ?? c.slug;

    // 1. Check if current handle is actually reserved (stale DB flag)
    const primaryCheck = await checkDeSo(primary);
    if (primaryCheck.isReserved) {
      rows.push({
        slug: c.slug,
        name: c.name,
        deso_username: c.deso_username,
        markets_count: c.markets_count,
        token_status: c.token_status,
        classification: "REMAPPABLE",
        remapTo: primaryCheck.username?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? null,
        remapUsername: primaryCheck.username,
        note: `${primary} IS reserved — just set deso_is_reserved=true`,
      });
      await new Promise((r) => setTimeout(r, 120));
      continue;
    }

    // 2. Search Brave for real handle
    let remapSlug: string | null = null;
    let remapUsername: string | null = null;

    if (braveApiKey) {
      const braveHandle = await lookupViaSearch(c.name, braveApiKey);
      if (braveHandle && braveHandle !== primary) {
        const braveCheck = await checkDeSo(braveHandle);
        if (braveCheck.isReserved && braveCheck.username) {
          remapSlug = braveCheck.username.toLowerCase().replace(/[^a-z0-9]/g, "");
          remapUsername = braveCheck.username;
        }
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    // 3. If no Brave hit, try candidate slugs
    if (!remapSlug) {
      for (const candidate of candidateSlugs(c.slug, c.name)) {
        if (candidate === primary) continue;
        const check = await checkDeSo(candidate);
        if (check.isReserved && check.username) {
          remapSlug = check.username.toLowerCase().replace(/[^a-z0-9]/g, "");
          remapUsername = check.username;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (remapSlug) {
      rows.push({
        slug: c.slug,
        name: c.name,
        deso_username: c.deso_username,
        markets_count: c.markets_count,
        token_status: c.token_status,
        classification: "REMAPPABLE",
        remapTo: remapSlug,
        remapUsername,
        note: `Found reserved @${remapUsername} — remap markets from ${c.slug} → ${remapSlug}`,
      });
    } else if (primaryCheck.exists && !primaryCheck.isReserved) {
      // Profile exists on DeSo but is a squatter
      rows.push({
        slug: c.slug,
        name: c.name,
        deso_username: c.deso_username,
        markets_count: c.markets_count,
        token_status: c.token_status,
        classification: "SQUATTER_FLAGGED",
        remapTo: null,
        remapUsername: null,
        note: `@${primary} exists on DeSo but IsReserved=false — likely a squatter account`,
      });
    } else {
      // No DeSo profile found — needs a platform-wallet token
      rows.push({
        slug: c.slug,
        name: c.name,
        deso_username: c.deso_username,
        markets_count: c.markets_count,
        token_status: c.token_status,
        classification: "NEEDS_PLATFORM_TOKEN",
        remapTo: null,
        remapUsername: null,
        note: `No reserved DeSo profile found — set token_status=pending_deso_creation`,
      });
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  // Sort: REMAPPABLE first, SQUATTER_FLAGGED, NEEDS_PLATFORM_TOKEN
  const order: Classification[] = ["REMAPPABLE", "SQUATTER_FLAGGED", "NEEDS_PLATFORM_TOKEN"];
  rows.sort((a, b) => {
    const oi = order.indexOf(a.classification) - order.indexOf(b.classification);
    if (oi !== 0) return oi;
    return b.markets_count - a.markets_count;
  });

  const remappable = rows.filter((r) => r.classification === "REMAPPABLE");
  const squatters = rows.filter((r) => r.classification === "SQUATTER_FLAGGED");
  const needsToken = rows.filter((r) => r.classification === "NEEDS_PLATFORM_TOKEN");

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  UNVERIFIED CREATORS AUDIT REPORT");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (remappable.length > 0) {
    console.log(`🔄 REMAPPABLE (${remappable.length}) — reserved profile found:\n`);
    for (const r of remappable) {
      console.log(`  slug:        ${r.slug}`);
      console.log(`  name:        ${r.name}`);
      console.log(`  deso_user:   ${r.deso_username ?? "—"}`);
      console.log(`  markets:     ${r.markets_count}`);
      console.log(`  remap to:    ${r.remapTo} (@${r.remapUsername})`);
      console.log(`  note:        ${r.note}`);
      console.log();
    }
  }

  if (squatters.length > 0) {
    console.log(`🚨 SQUATTER_FLAGGED (${squatters.length}) — DeSo profile exists but not reserved:\n`);
    for (const r of squatters) {
      console.log(`  slug:        ${r.slug}`);
      console.log(`  name:        ${r.name}`);
      console.log(`  deso_user:   ${r.deso_username ?? "—"}`);
      console.log(`  markets:     ${r.markets_count}`);
      console.log(`  note:        ${r.note}`);
      console.log();
    }
  }

  if (needsToken.length > 0) {
    console.log(`🔧 NEEDS_PLATFORM_TOKEN (${needsToken.length}) — no DeSo profile, create via platform wallet:\n`);
    for (const r of needsToken) {
      console.log(`  slug: ${r.slug}  name: ${r.name}  markets: ${r.markets_count}`);
      console.log(`  note: ${r.note}`);
      console.log();
    }
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Summary: ${remappable.length} remappable  |  ${squatters.length} squatter-flagged  |  ${needsToken.length} needs-platform-token`);
  console.log("═══════════════════════════════════════════════════════════════");

  if (remappable.length > 0) {
    console.log("\n📋 SQL to remap markets (review before running):\n");
    for (const r of remappable) {
      if (r.remapTo && r.remapTo !== r.slug) {
        console.log(`-- ${r.name}: ${r.slug} → ${r.remapTo}`);
        console.log(`UPDATE markets SET creator_slug = '${r.remapTo}' WHERE creator_slug = '${r.slug}';`);
        console.log(`UPDATE creators SET deso_is_reserved = true WHERE slug = '${r.remapTo}';`);
        console.log();
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
