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

console.log(`DB: ${SUPABASE_URL.slice(0, 30)}... key: ${SUPABASE_KEY.length} chars`);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY ?? process.env.BRAVE_API_KEY ?? "";
const CAP = 50;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 600;

// ── DeSo profile lookup ──────────────────────────────────────────────────────

async function desoLookup(
  username: string
): Promise<{ publicKey: string; username: string } | null> {
  try {
    const res = await fetch("https://api.deso.org/api/v0/get-single-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Username: username }),
    });
    const data = await res.json();
    const profile = data?.Profile;
    if (!profile?.PublicKeyBase58Check) return null;
    return {
      publicKey: profile.PublicKeyBase58Check,
      username: profile.Username ?? username,
    };
  } catch {
    return null;
  }
}

// ── Brave handle extraction ──────────────────────────────────────────────────

async function braveLookup(name: string): Promise<string | null> {
  if (!BRAVE_API_KEY || !BRAVE_ACTIVE) return null;
  try {
    const query = encodeURIComponent(
      `"${name}" twitter.com OR x.com OR instagram.com`
    );
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${query}&count=5`,
      {
        headers: {
          "X-Subscription-Token": BRAVE_API_KEY,
          Accept: "application/json",
        },
      }
    );
    const data = await res.json();
    const results: Array<{ url?: string; description?: string }> =
      data?.web?.results ?? [];

    const handleCounts = new Map<string, number>();

    for (const r of results) {
      const twitterMatch =
        r.url?.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,50})/)?.[1];
      if (
        twitterMatch &&
        !["search", "home", "hashtag", "i", "intent", "share"].includes(
          twitterMatch.toLowerCase()
        )
      ) {
        const h = twitterMatch.toLowerCase();
        handleCounts.set(h, (handleCounts.get(h) ?? 0) + 2); // URL match = weight 2
      }

      const instaMatch =
        r.url?.match(/instagram\.com\/([A-Za-z0-9_.]{1,50})/)?.[1];
      if (
        instaMatch &&
        !["p", "explore", "accounts", "reels", "stories"].includes(
          instaMatch.toLowerCase()
        )
      ) {
        const h = instaMatch.toLowerCase();
        handleCounts.set(h, (handleCounts.get(h) ?? 0) + 1);
      }

      const mentions = (r.description ?? "").match(/@([A-Za-z0-9_]{3,50})/g) ?? [];
      for (const m of mentions) {
        const h = m.replace("@", "").toLowerCase();
        handleCounts.set(h, (handleCounts.get(h) ?? 0) + 1);
      }
    }

    const top = [...handleCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  } catch {
    return null;
  }
}

// ── Result types ─────────────────────────────────────────────────────────────

type AuditStatus = "CORRECT" | "MISMATCH" | "NODESO" | "UNVERIFIED" | "DESO_OK";

interface AuditRow {
  slug: string;
  name: string;
  storedHandle: string;
  desoExists: boolean;
  braveHandle: string | null;
  status: AuditStatus;
  suggestedFix?: string;
  marketsCount: number;
}

// ── Main ─────────────────────────────────────────────────────────────────────

let BRAVE_ACTIVE = false;

async function main() {
  // Pre-flight: confirm Brave is actually working (not just key present)
  if (BRAVE_API_KEY) {
    try {
      const testRes = await fetch(
        "https://api.search.brave.com/res/v1/web/search?q=test&count=1",
        { headers: { "X-Subscription-Token": BRAVE_API_KEY, Accept: "application/json" } }
      );
      BRAVE_ACTIVE = testRes.status === 200;
    } catch { BRAVE_ACTIVE = false; }
  }
  console.log(BRAVE_ACTIVE ? "✓ Brave Search active\n" : "⚠ Brave unavailable (quota/key) — DeSo-only mode\n");

  console.log("Fetching creators from Supabase...");

  const { data: creators, error } = await supabase
    .from("creators")
    .select("id, slug, name, deso_username, markets_count, token_status")
    .in("token_status", ["pending_deso_creation", "active_unverified", "claimed"])
    .not("deso_username", "is", null)
    .gt("markets_count", 0)
    .order("markets_count", { ascending: false })
    .limit(CAP);

  if (error) {
    console.error("Supabase error:", error.message);
    process.exit(1);
  }

  if (!creators?.length) {
    console.log("No creators found matching criteria.");
    return;
  }

  console.log(`Found ${creators.length} creators to audit.\n`);

  const rows: AuditRow[] = [];

  // Process in batches
  for (let i = 0; i < creators.length; i += BATCH_SIZE) {
    const batch = creators.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (c) => {
        const storedHandle = c.deso_username as string;

        // Check 1: DeSo profile exists?
        const desoProfile = await desoLookup(storedHandle);
        const desoExists = desoProfile !== null;

        // Check 2: Brave search for real handle
        const braveHandle = await braveLookup(c.name as string);

        let status: AuditStatus;
        let suggestedFix: string | undefined;

        if (!desoExists) {
          status = "NODESO";
          // If Brave found a different handle, check if THAT exists on DeSo
          if (braveHandle && braveHandle !== storedHandle) {
            const altDeso = await desoLookup(braveHandle);
            if (altDeso) {
              suggestedFix = `@${braveHandle} (DeSo: ${altDeso.publicKey.slice(0, 16)}...)`;
            } else {
              suggestedFix = `@${braveHandle} (not on DeSo either)`;
            }
          }
        } else if (!braveHandle) {
          // DeSo confirmed but Brave unavailable — DESO_OK if Brave disabled, UNVERIFIED if it ran but found nothing
          status = BRAVE_ACTIVE ? "UNVERIFIED" : "DESO_OK";
        } else if (braveHandle === storedHandle.toLowerCase()) {
          status = "CORRECT";
        } else {
          status = "MISMATCH";
          suggestedFix = `@${braveHandle}`;
        }

        return {
          slug: c.slug as string,
          name: c.name as string,
          storedHandle,
          desoExists,
          braveHandle,
          status,
          suggestedFix,
          marketsCount: (c.markets_count as number) ?? 0,
        } satisfies AuditRow;
      })
    );

    rows.push(...batchResults);

    const processed = Math.min(i + BATCH_SIZE, creators.length);
    process.stdout.write(`  Processed ${processed}/${creators.length}...\r`);

    if (i + BATCH_SIZE < creators.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log("\n");

  // ── Print report ────────────────────────────────────────────────────────────

  const STATUS_ORDER: AuditStatus[] = ["NODESO", "MISMATCH", "UNVERIFIED", "DESO_OK", "CORRECT"];
  rows.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      b.marketsCount - a.marketsCount
  );

  const COL = { slug: 20, name: 22, stored: 20, brave: 20, status: 12, fix: 40 };
  const line = (s: string, w: number) => s.slice(0, w).padEnd(w);

  const header =
    line("SLUG", COL.slug) +
    line("NAME", COL.name) +
    line("STORED HANDLE", COL.stored) +
    line("BRAVE HANDLE", COL.brave) +
    line("STATUS", COL.status) +
    "SUGGESTED FIX / NOTES";

  const sep = "─".repeat(header.length);

  console.log(sep);
  console.log(header);
  console.log(sep);

  for (const r of rows) {
    const statusLabel =
      r.status === "CORRECT"    ? "✓ CORRECT"   :
      r.status === "MISMATCH"   ? "⚠ MISMATCH"  :
      r.status === "NODESO"     ? "✗ NODESO"    :
      r.status === "DESO_OK"    ? "~ DESO_OK"   :
                                  "? UNVERIFIED";

    console.log(
      line(r.slug, COL.slug) +
      line(r.name, COL.name) +
      line(`@${r.storedHandle}`, COL.stored) +
      line(r.braveHandle ? `@${r.braveHandle}` : "—", COL.brave) +
      line(statusLabel, COL.status) +
      (r.suggestedFix ? `→ ${r.suggestedFix}` : `${r.marketsCount} mkts`)
    );
  }

  console.log(sep);

  // ── Summary ────────────────────────────────────────────────────────────────

  const counts = {
    CORRECT:    rows.filter((r) => r.status === "CORRECT").length,
    MISMATCH:   rows.filter((r) => r.status === "MISMATCH").length,
    NODESO:     rows.filter((r) => r.status === "NODESO").length,
    DESO_OK:    rows.filter((r) => r.status === "DESO_OK").length,
    UNVERIFIED: rows.filter((r) => r.status === "UNVERIFIED").length,
  };

  const braveNote = !BRAVE_API_KEY
    ? "\n  Note: Brave key missing — DESO_OK = DeSo confirmed, Brave cross-check skipped"
    : counts.DESO_OK > 0
    ? "\n  Note: DESO_OK = DeSo confirmed but Brave quota exhausted"
    : "";

  console.log(`
── Summary ──────────────────────
  Total audited : ${rows.length}
  ✓ CORRECT     : ${counts.CORRECT}
  ⚠ MISMATCH    : ${counts.MISMATCH}
  ✗ NODESO      : ${counts.NODESO}
  ~ DESO_OK     : ${counts.DESO_OK}
  ? UNVERIFIED  : ${counts.UNVERIFIED}${braveNote}
`);

  // ── SQL for NODESO with known fixes ────────────────────────────────────────

  const fixable = rows.filter(
    (r) => r.status === "NODESO" && r.suggestedFix?.includes("DeSo:")
  );
  if (fixable.length > 0) {
    console.log("── Auto-fix SQL (NODESO with DeSo-verified alternative) ──────");
    for (const r of fixable) {
      const newHandle = r.braveHandle!;
      console.log(
        `UPDATE creators SET deso_username = '${newHandle}' WHERE slug = '${r.slug}'; -- was @${r.storedHandle}`
      );
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
