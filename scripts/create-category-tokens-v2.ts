/**
 * scripts/create-category-tokens-v2.ts
 * Each category token needs its own DeSo wallet + profile.
 * This script generates a fresh keypair per token, funds it from
 * the platform wallet, then creates its profile signed by that new key.
 * Run with: npx tsx scripts/create-category-tokens-v2.ts
 */

import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { ethers } from "ethers";
// @ts-ignore
import { signTx, publicKeyToBase58Check } from "deso-protocol";
// @ts-ignore
import { getPublicKey } from "@noble/secp256k1";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PLATFORM_PUBLIC_KEY = process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY ?? process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
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

function mnemonicToDesoPublicKey(mnemonic: string): string {
  const root = ethers.utils.HDNode.fromMnemonic(mnemonic);
  const node = root.derivePath("m/44'/0'/0'/0/0");
  const privKeyBytes = Buffer.from(node.privateKey.slice(2), "hex");
  const pubKeyBytes = getPublicKey(privKeyBytes, true);
  return publicKeyToBase58Check(pubKeyBytes);
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

async function sendDesoFromPlatform(recipientPublicKey: string, nanosToSend: number): Promise<string> {
  const res = await fetch("https://api.deso.org/api/v0/send-deso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      SenderPublicKeyBase58Check: PLATFORM_PUBLIC_KEY,
      RecipientPublicKeyOrUsername: recipientPublicKey,
      AmountNanos: nanosToSend,
      MinFeeRateNanosPerKB: 1000,
    }),
  });
  if (!res.ok) throw new Error(`send-deso HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.TransactionHex) throw new Error("send-deso: no TransactionHex");
  const signed = await signTx(data.TransactionHex, PLATFORM_PRIVATE_KEY_HEX);
  const submitRes = await fetch("https://api.deso.org/api/v0/submit-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: signed }),
  });
  if (!submitRes.ok) throw new Error(`submit send-deso failed`);
  const submitData = await submitRes.json();
  return submitData.TxnHashHex;
}

async function createProfile(walletPublicKey: string, walletPrivKeyHex: string, username: string, description: string): Promise<void> {
  const res = await fetch("https://api.deso.org/api/v0/update-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UpdaterPublicKeyBase58Check: walletPublicKey,
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
  if (!res.ok) throw new Error(`update-profile HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.TransactionHex) throw new Error("update-profile: no TransactionHex");
  const signed = await signTx(data.TransactionHex, walletPrivKeyHex);
  const submitRes = await fetch("https://api.deso.org/api/v0/submit-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: signed }),
  });
  if (!submitRes.ok) throw new Error(`submit update-profile failed`);
  const submitData = await submitRes.json();
  console.log(`    📝 Profile tx: ${submitData.TxnHashHex}`);
}

async function updateDB(slug: string, publicKey: string, username: string): Promise<void> {
  const { error } = await supabase
    .from("creators")
    .update({ deso_public_key: publicKey, deso_username: username, token_status: "active_verified", tier: "platform" })
    .eq("slug", slug);
  if (error) throw new Error(`DB update failed for ${slug}: ${error.message}`);
}

async function main() {
  console.log(`\n🔥 Caldera Category Token Creator v2`);
  console.log(`Platform key: ${PLATFORM_PUBLIC_KEY.slice(0, 20)}...\n`);
  console.log(`⚠️  SAVE EVERY MNEMONIC PRINTED BELOW — they control the category token wallets!\n`);

  let created = 0, existed = 0, failed = 0;

  for (const token of CATEGORY_TOKENS) {
    console.log(`\n[${token.emoji} ${token.name}]`);
    try {
      // Check if already on DeSo
      const existing = await getProfile(token.username);
      if (existing) {
        console.log(`  ⚠️  Already exists — pk: ${existing.publicKey.slice(0, 24)}...`);
        await updateDB(token.slug, existing.publicKey, token.username);
        console.log(`  ✅ DB updated`);
        existed++;
        continue;
      }

      // Generate fresh keypair for this token
      const mnemonic = ethers.utils.entropyToMnemonic(ethers.utils.randomBytes(16));
      const privKeyHex = derivePrivateKeyHex(mnemonic);
      const newPublicKey = mnemonicToDesoPublicKey(mnemonic);
      console.log(`  🔑 New wallet: ${newPublicKey.slice(0, 24)}...`);
      console.log(`  📋 MNEMONIC: ${mnemonic}`);

      // Fund new wallet from platform (0.015 DESO = 15_000_000 nanos — enough for profile creation fee)
      const fundTx = await sendDesoFromPlatform(newPublicKey, 15_000_000);
      console.log(`  💰 Funded — tx: ${fundTx}`);

      // Wait for funding to be indexed
      await new Promise(r => setTimeout(r, 4000));

      // Create profile signed by the new wallet's key
      const description = `${token.emoji} Official ${token.name} category token on Caldera. Every ${token.name.toLowerCase()} prediction market trade automatically buys and burns this token — permanently reducing supply. caldera.market`;
      await createProfile(newPublicKey, privKeyHex, token.username, description);
      console.log(`  ✅ Profile created`);

      // Wait for profile to be indexed
      await new Promise(r => setTimeout(r, 4000));

      // Verify on DeSo and get confirmed public key
      const verified = await getProfile(token.username);
      if (!verified) {
        console.log(`  ⚠️  Not indexed yet. Re-run script to finish. Mnemonic saved above.`);
        failed++;
        continue;
      }

      await updateDB(token.slug, verified.publicKey, token.username);
      console.log(`  ✅ DB updated — pk: ${verified.publicKey.slice(0, 24)}...`);
      created++;

    } catch (err: any) {
      console.error(`  ❌ Error: ${err.message}`);
      failed++;
    }

    // Pause between tokens
    if (token !== CATEGORY_TOKENS[CATEGORY_TOKENS.length - 1]) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`
── Summary ──────────────────────────
Total: ${CATEGORY_TOKENS.length} | ✅ Created: ${created} | ⚠️ Existed: ${existed} | ❌ Failed: ${failed}

⚠️  CRITICAL: The 🔑 mnemonics printed above are the only way to control
    the category token wallets. Save them in your password manager now.
  `);
}

main().catch((err) => { console.error(err); process.exit(1); });
