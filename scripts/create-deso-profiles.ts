/**
 * PATH B — Create DeSo profiles for pending_deso_creation creators.
 *
 * For each creator:
 *   1. Check if profile already exists on DeSo (get-single-profile by username)
 *   2a. If exists → update DB with public key, set token_status = 'active_unverified'
 *   2b. If not    → build update-profile tx → sign → submit → wait 2s → fetch → update DB
 *
 * Uses the same sign+submit pattern as executeCreatorCoinBuyback() in app/api/trades/route.ts.
 *
 * DO NOT run without reviewing. Run with:
 *   npx tsx scripts/create-deso-profiles.ts
 */

import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { ethers } from "ethers";
// @ts-ignore — no types shipped with this version
import { signTx, publicKeyToBase58Check } from "deso-protocol";
// @ts-ignore
import { getPublicKey } from "@noble/secp256k1";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PLATFORM_PUBLIC_KEY = process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY ?? process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
const PLATFORM_MNEMONIC = process.env.DESO_PLATFORM_SEED ?? "";

// Derive private key from BIP39 mnemonic using DeSo's canonical path m/44'/0'/0'/0/0
function derivePrivateKeyHex(mnemonic: string): string {
  const root = ethers.utils.HDNode.fromMnemonic(mnemonic);
  const node = root.derivePath("m/44'/0'/0'/0/0");
  return node.privateKey.slice(2); // strip 0x prefix
}

const LIMIT = 10;
const BETWEEN_CREATORS_DELAY_MS = 3_000;
const AFTER_SUBMIT_WAIT_MS = 2_000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!PLATFORM_PUBLIC_KEY || !PLATFORM_MNEMONIC) {
  console.error("Missing DESO_PLATFORM_PUBLIC_KEY or DESO_PLATFORM_SEED");
  process.exit(1);
}

const PLATFORM_PRIVATE_KEY_HEX = derivePrivateKeyHex(PLATFORM_MNEMONIC);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DeSo helpers ─────────────────────────────────────────────────────────────

async function getProfile(
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

async function buildUpdateProfileTx(params: {
  updaterPublicKey: string;
  newUsername: string;
  profilePicBase64?: string;
  description?: string;
}): Promise<{ TransactionHex: string } | null> {
  try {
    const res = await fetch("https://api.deso.org/api/v0/update-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        UpdaterPublicKeyBase58Check: params.updaterPublicKey,
        // ProfilePublicKeyBase58Check empty = create new profile for updater
        ProfilePublicKeyBase58Check: "",
        NewUsername: params.newUsername,
        NewDescription: params.description ?? "",
        NewProfilePic: params.profilePicBase64 ?? "",
        NewCreatorBasisPoints: 1000, // 10% creator coin cut
        NewStakeMultipleBasisPoints: 12500,
        IsHidden: false,
        MinFeeRateNanosPerKB: 1000,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`  update-profile HTTP ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    if (!data.TransactionHex) {
      console.error("  update-profile: no TransactionHex in response", data);
      return null;
    }
    return { TransactionHex: data.TransactionHex };
  } catch (err) {
    console.error("  buildUpdateProfileTx error:", err);
    return null;
  }
}

async function signTransaction(transactionHex: string): Promise<string> {
  try {
    return await signTx(transactionHex, PLATFORM_PRIVATE_KEY_HEX);
  } catch (err) {
    console.error("  signTransaction error:", err);
    return transactionHex;
  }
}

async function submitTx(signedHex: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.deso.org/api/v0/submit-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ TransactionHex: signedHex }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`  submit-transaction HTTP ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return data.TxnHashHex ?? null;
  } catch (err) {
    console.error("  submitTx error:", err);
    return null;
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function markAsExists(slug: string, publicKey: string) {
  const { error } = await supabase
    .from("creators")
    .update({
      deso_public_key: publicKey,
      token_status: "active_unverified",
    })
    .eq("slug", slug);
  if (error) console.error(`  DB update error for ${slug}:`, error.message);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Platform key: ${PLATFORM_PUBLIC_KEY.slice(0, 16)}...`);
  console.log(`DB: ${SUPABASE_URL.slice(0, 30)}...\n`);

  const { data: creators, error } = await supabase
    .from("creators")
    .select("id, slug, name, deso_username, markets_count")
    .eq("token_status", "pending_deso_creation")
    .not("deso_username", "is", null)
    .is("deso_public_key", null)
    .gt("markets_count", 0)
    .order("markets_count", { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error("Supabase error:", error.message);
    process.exit(1);
  }

  if (!creators?.length) {
    console.log("No pending creators found.");
    return;
  }

  console.log(`Found ${creators.length} creator(s) to process.\n`);

  let created = 0;
  let existed = 0;
  let failed = 0;

  for (let i = 0; i < creators.length; i++) {
    const c = creators[i];
    const username = c.deso_username as string;
    console.log(`[${i + 1}/${creators.length}] ${c.slug} (@${username}, ${c.markets_count} mkts)`);

    // Step 1: Check if profile already exists
    const existing = await getProfile(username);
    if (existing) {
      console.log(`  ⚠️  Already on DeSo: ${existing.publicKey.slice(0, 20)}...`);
      await markAsExists(c.slug as string, existing.publicKey);
      existed++;
    } else {
      // Step 2: Build tx
      const tx = await buildUpdateProfileTx({
        updaterPublicKey: PLATFORM_PUBLIC_KEY,
        newUsername: username,
        description: `${c.name} — prediction markets on Caldera`,
      });

      if (!tx) {
        console.log(`  ❌ Failed to build update-profile tx`);
        failed++;
      } else {
        // Step 3: Sign
        const signedHex = await signTransaction(tx.TransactionHex);

        // Step 4: Submit
        const txHash = await submitTx(signedHex);
        if (!txHash) {
          console.log(`  ❌ Submit failed`);
          failed++;
        } else {
          console.log(`  ✅ Submitted — tx: ${txHash}`);

          // Step 5: Wait, then fetch public key
          await new Promise((r) => setTimeout(r, AFTER_SUBMIT_WAIT_MS));
          const newProfile = await getProfile(username);
          if (newProfile) {
            await markAsExists(c.slug as string, newProfile.publicKey);
            console.log(`  ✅ DB updated — pk: ${newProfile.publicKey.slice(0, 20)}...`);
            created++;
          } else {
            console.log(`  ⚠️  Tx submitted but profile not yet visible on DeSo. Update DB manually.`);
            failed++;
          }
        }
      }
    }

    if (i < creators.length - 1) {
      await new Promise((r) => setTimeout(r, BETWEEN_CREATORS_DELAY_MS));
    }
  }

  console.log(`
── Summary ──────────────────────
  Total processed : ${creators.length}
  ✅ Created       : ${created}
  ⚠️  Already existed: ${existed}
  ❌ Failed        : ${failed}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
