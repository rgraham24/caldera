/**
 * Audit creators with deso_is_reserved = false who have markets.
 * Classifies each as: OK | SQUATTER | REMAPPABLE
 *
 * Run with: npx tsx scripts/audit-squatters.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Classification = "OK" | "SQUATTER" | "REMAPPABLE";

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

/** Generate candidate reserved handles to search for the real person */
function candidateSlugs(slug: string, name: string): string[] {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const words = name.toLowerCase().split(/\s+/);
  const candidates = new Set<string>([
    base,
    slug.replace(/-/g, ""),
    // first + last
    words.length >= 2 ? `${words[0]}${words[words.length - 1]}` : "",
    // firstname only
    words[0] ?? "",
    // common suffixes
    `${base}official`,
    `${base}real`,
    `${base}music`,
    `${base}tv`,
    `${base}yt`,
    `${base}ytofficial`,
  ].filter((c) => c.length >= 3 && c !== slug.replace(/-/g, "")));
  return [...candidates];
}

async function main() {
  console.log("🔍 Fetching suspect creators (deso_is_reserved=false, markets_count>0)...\n");

  const { data: creators, error } = await (supabase as any)
    .from("creators")
    .select("slug, name, deso_username, markets_count, token_status, deso_is_reserved")
    .eq("deso_is_reserved", false)
    .gt("markets_count", 0)
    .in("token_status", ["active_unverified", "pending_deso_creation"])
    .order("markets_count", { ascending: false });

  if (error) {
    console.error("❌ Fetch error:", error.message);
    process.exit(1);
  }

  if (!creators?.length) {
    console.log("✅ No suspect creators found.");
    return;
  }

  console.log(`Found ${creators.length} creators to audit.\n`);

  const rows: AuditRow[] = [];

  for (const c of creators as any[]) {
    // Check stored deso_username first
    const primary = c.deso_username ?? c.slug;
    const primaryCheck = await checkDeSo(primary);

    if (primaryCheck.isReserved) {
      // Already reserved — just wasn't flagged in DB
      rows.push({
        slug: c.slug,
        name: c.name,
        deso_username: c.deso_username,
        markets_count: c.markets_count,
        token_status: c.token_status,
        classification: "OK",
        remapTo: null,
        remapUsername: null,
        note: `${primary} IS reserved — DB flag needs update`,
      });
      await new Promise((r) => setTimeout(r, 120));
      continue;
    }

    // Search for a reserved alternative
    const candidates = candidateSlugs(c.slug, c.name);
    let remapSlug: string | null = null;
    let remapUsername: string | null = null;

    for (const candidate of candidates) {
      if (candidate === primary) continue;
      const check = await checkDeSo(candidate);
      if (check.isReserved && check.username) {
        remapSlug = check.username.toLowerCase().replace(/[^a-z0-9]/g, "");
        remapUsername = check.username;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
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
        note: `Remap markets from ${c.slug} → ${remapSlug} (${remapUsername})`,
      });
    } else {
      rows.push({
        slug: c.slug,
        name: c.name,
        deso_username: c.deso_username,
        markets_count: c.markets_count,
        token_status: c.token_status,
        classification: "SQUATTER",
        remapTo: null,
        remapUsername: null,
        note: `No reserved DeSo profile found — markets should have creator_slug cleared`,
      });
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  // Sort: REMAPPABLE first, then SQUATTER, then OK; within each by markets_count desc
  const order: Classification[] = ["REMAPPABLE", "SQUATTER", "OK"];
  rows.sort((a, b) => {
    const oi = order.indexOf(a.classification) - order.indexOf(b.classification);
    if (oi !== 0) return oi;
    return b.markets_count - a.markets_count;
  });

  // Print report
  const remappable = rows.filter((r) => r.classification === "REMAPPABLE");
  const squatters = rows.filter((r) => r.classification === "SQUATTER");
  const ok = rows.filter((r) => r.classification === "OK");

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SQUATTER AUDIT REPORT");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (remappable.length > 0) {
    console.log(`🔄 REMAPPABLE (${remappable.length}) — reserved profile exists, remap markets:\n`);
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
    console.log(`🚨 SQUATTER (${squatters.length}) — no reserved profile, should be cleared:\n`);
    for (const r of squatters) {
      console.log(`  slug:        ${r.slug}`);
      console.log(`  name:        ${r.name}`);
      console.log(`  deso_user:   ${r.deso_username ?? "—"}`);
      console.log(`  markets:     ${r.markets_count}`);
      console.log(`  note:        ${r.note}`);
      console.log();
    }
  }

  if (ok.length > 0) {
    console.log(`✅ OK but DB flag stale (${ok.length}) — deso_is_reserved needs setting to true:\n`);
    for (const r of ok) {
      console.log(`  slug: ${r.slug}  markets: ${r.markets_count}  note: ${r.note}`);
    }
    console.log();
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Summary: ${remappable.length} remappable  |  ${squatters.length} squatters  |  ${ok.length} stale-flag`);
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
