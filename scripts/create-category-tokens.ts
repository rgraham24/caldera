/**
 * scripts/create-category-tokens.ts
 * One-time script — creates 8 Caldera category tokens on DeSo blockchain.
 * Run ONCE from local machine only. Needs .env.local to be present.
 * Run with: npx tsx scripts/create-category-tokens.ts
 */

import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { ethers } from "ethers";
// @ts-ignore
import { signTx } from "deso-protocol";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PLATFORM_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY ??
  process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
const PLATFORM_MNEMONIC = process.env.DESO_PLATFORM_SEED ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY || !PLATFORM_PUBLIC_KEY || !PLATFORM_MNEMONIC) {
  console.error("❌ Missing required env vars. Check .env.local");
  process.exit(1);
}

function derivePrivateKeyHex(mnemonic: string): string {
  const root = ethers.utils.HDNode.fromMnemonic(mnemonic);
  const node = root.derivePath("m/44'/0'/0'/0/0");
  return node.privateKey.slice(2);
}

const PLATFORM_PRIVATE_KEY_HEX = derivePrivateKeyHex(PLATFORM_MNEMONIC);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CATEGORY_TOKENS = [
  { slug: "caldera-sports",        username: "CalderaSports",        name: "Sports",        emoji: "🏆" },
  { slug: "caldera-music",         username: "CalderaMusic",         name: "Music",         emoji: "🎵" },
  { slug: "caldera-entertainment", username: "CalderaEntertainment", name: "Entertainment", emoji: "🎬" },
  { slug: "caldera-politics",      username: "CalderaPolitics",      name: "Politics",      emoji: "👑" },
  { slug: "caldera-tech",          username: "CalderaTech",          name: "Tech",          emoji: "💻" },
  { slug: "caldera-companies",     username: "CalderaCompanies",     name: "Companies",     emoji: "🏢" },
  { slug: "caldera-climate",       username: "CalderaClimate",       name: "Climate",       emoji: "🌍" },
  { slug: "caldera-creators",      username: "CalderaCreators",      name: "Creators",      emoji: "✍️" },
];

async function getProfile(username: string): Promise<{ publicKey: string } | null> {
  try {
    const res = await fetch("https://api.deso.org/api/v0/get-single-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Username: username }),
    });
    const data = await res.json();
    const pk = data?.Profile?.PublicKeyBase58Check;
    return pk ? { publicKey: pk } : null;
  } catch { return null; }
}

async function buildUpdateProfileTx(username: string, description: string): Promise<string> {
  const res = await fetch("https://api.deso.org/api/v0/update-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UpdaterPublicKeyBase58Check: PLATFORM_PUBLIC_KEY,
      ProfilePublicKeyBase58Check: "",
      NewUsername: username,
      NewDescription: description,
      NewProfilePic: "",
      NewCreatorBasisPoints: 1000,
      NewStakeMultipleBasisPoints: 12500,
      IsHidden: false,
      MinFeeRateNanosPerKB: 1000,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`update-profile HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.TransactionHex) throw new Error(`No TransactionHex: ${JSON.stringify(data)}`);
  return data.TransactionHex as string;
}

async function signAndSubmit(txHex: string): Promise<string> {
  const signed = await signTx(txHex, PLATFORM_PRIVATE_KEY_HEX);
  const res = await fetch("https://api.deso.org/api/v0/submit-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: signed }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`submit-transaction HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.TxnHashHex;
}

async function updateDB(slug: string, publicKey: string, username: string) {
  const { error } = await supabase
    .from("creators")
    .update({ deso_public_key: publicKey, deso_username: username, token_status: "active_verified", tier: "platform" })
    .eq("slug", slug);
  if (error) throw new Error(`DB update failed for ${slug}: ${error.message}`);
}

async function main() {
  console.log(`\n🔥 Caldera Category Token Creator`);
  console.log(`Platform key: ${PLATFORM_PUBLIC_KEY.slice(0, 20)}...\n`);
  let created = 0, existed = 0, failed = 0;

  for (const token of CATEGORY_TOKENS) {
    console.log(`\n[${token.emoji} ${token.name}] @${token.username}`);
    try {
      const existing = await getProfile(token.username);
      if (existing) {
        console.log(`  ⚠️  Already on DeSo: ${existing.publicKey.slice(0, 24)}...`);
        await updateDB(token.slug, existing.publicKey, token.username);
        console.log(`  ✅ DB updated`);
        existed++;
        continue;
      }
      const description = `${token.emoji} Official ${token.name} category token on Caldera. Every ${token.name.toLowerCase()} prediction market trade automatically buys and burns this token — permanently reducing supply. caldera.market`;
      const txHex = await buildUpdateProfileTx(token.username, description);
      console.log(`  📝 Transaction built`);
      const txHash = await signAndSubmit(txHex);
      console.log(`  ✅ Submitted — tx: ${txHash}`);
      await new Promise((r) => setTimeout(r, 3000));
      const newProfile = await getProfile(token.username);
      if (!newProfile) {
        console.log(`  ⚠️  Submitted but not yet indexed. Re-run script to finish.`);
        failed++;
        continue;
      }
      await updateDB(token.slug, newProfile.publicKey, token.username);
      console.log(`  ✅ DB updated — pk: ${newProfile.publicKey.slice(0, 24)}...`);
      created++;
    } catch (err: any) {
      console.error(`  ❌ Error: ${err.message}`);
      failed++;
    }
    if (token !== CATEGORY_TOKENS[CATEGORY_TOKENS.length - 1]) {
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  console.log(`\n── Summary ──────────────────────────\nTotal: ${CATEGORY_TOKENS.length} | ✅ Created: ${created} | ⚠️ Existed: ${existed} | ❌ Failed: ${failed}\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
