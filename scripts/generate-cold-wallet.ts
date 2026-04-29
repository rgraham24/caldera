/**
 * Stream 3.1 — Generate a cold treasury wallet.
 *
 * One-shot script. Generates a fresh BIP39 12-word mnemonic + derives the
 * DeSo public key. Prints both to stdout ONLY. Never writes to disk.
 * Never reads from env. Never makes any network call.
 *
 * Usage:
 *   1. Find a private spot. No shoulder-surfers, no screen recording, no
 *      video calls.
 *   2. Have a piece of paper + pen ready BEFORE running.
 *   3. Run: npx tsx scripts/generate-cold-wallet.ts
 *   4. Write all 12 words on paper, in order, exactly as printed.
 *   5. Read them back to yourself once to verify.
 *   6. Note the public key for use in env vars (it's safe to share).
 *   7. CLOSE THE TERMINAL WINDOW. The mnemonic is gone forever from
 *      this machine after that.
 *
 * If you make a typo on the paper, you've lost access to the wallet
 * forever. Verify carefully.
 *
 * Memory derivation path: m/44'/0'/0'/0/0 (DeSo standard, matches
 * lib/deso/server-sign.ts).
 *
 * NOT committed to git (added to scripts/ pattern; verify .gitignore).
 */

import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";
import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";

// DeSo mainnet pubkey prefix [0xCD, 0x14, 0x00] — same as in verifyTx.ts
const DESO_MAINNET_PREFIX = new Uint8Array([0xcd, 0x14, 0x00]);

/**
 * Encode a 33-byte compressed secp256k1 pubkey to DeSo Base58Check format.
 * Mirrors the algorithm in lib/deso/verifyTx.ts hexTxHashToDesoBase58Check
 * but operates on a 33-byte pubkey instead of a 32-byte tx hash.
 */
function compressedPubkeyToDesoBase58Check(pubkey33: Uint8Array): string {
  if (pubkey33.length !== 33) {
    throw new Error(
      `Expected 33-byte compressed pubkey, got ${pubkey33.length}`
    );
  }
  const payload = new Uint8Array(DESO_MAINNET_PREFIX.length + pubkey33.length);
  payload.set(DESO_MAINNET_PREFIX, 0);
  payload.set(pubkey33, DESO_MAINNET_PREFIX.length);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(payload.length + checksum.length);
  full.set(payload, 0);
  full.set(checksum, payload.length);
  return bs58.encode(full);
}

async function main() {
  // Show safety warning + pause to give operator a chance to bail
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  COLD WALLET GENERATOR — STOP if anyone can see your screen.");
  console.log("");
  console.log("  This will print a 12-word seed phrase that controls the new");
  console.log("  cold treasury wallet. ANYONE WHO SEES IT CONTROLS THE FUNDS.");
  console.log("");
  console.log("  Have paper + pen ready. The seed will appear in 5 seconds.");
  console.log("  Press Ctrl-C now to abort.");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  await new Promise((r) => setTimeout(r, 5000));

  // Generate fresh 128-bit (12-word) mnemonic
  const mnemonic = bip39.generateMnemonic(128);
  const seed = await bip39.mnemonicToSeed(mnemonic);

  // Derive at DeSo standard path m/44'/0'/0'/0/0
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive("m/44'/0'/0'/0/0");
  if (!child.privateKey) {
    throw new Error("Failed to derive private key — should never happen");
  }

  // Compressed secp256k1 pubkey (33 bytes)
  const pubkeyCompressed = secp.getPublicKey(child.privateKey, true);
  const desoAddress = compressedPubkeyToDesoBase58Check(pubkeyCompressed);

  // Print
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  COLD WALLET GENERATED");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("  PUBLIC KEY (safe to share, copy into env vars):");
  console.log("");
  console.log("    " + desoAddress);
  console.log("");
  console.log("───────────────────────────────────────────────────────────────");
  console.log("");
  console.log("  SEED PHRASE — WRITE ON PAPER NOW (one word per line):");
  console.log("");
  const words = mnemonic.split(" ");
  words.forEach((w, i) => {
    const idx = String(i + 1).padStart(2, " ");
    console.log(`    ${idx}. ${w}`);
  });
  console.log("");
  console.log("───────────────────────────────────────────────────────────────");
  console.log("");
  console.log("  CHECKLIST before continuing:");
  console.log("    [ ] All 12 words written on paper, IN ORDER");
  console.log("    [ ] Read words back to yourself to verify");
  console.log("    [ ] Public key noted somewhere (env var or doc)");
  console.log("    [ ] Paper stored somewhere safe (lockbox, safe, etc.)");
  console.log("");
  console.log("  When done: CLOSE THIS TERMINAL WINDOW.");
  console.log("  The seed phrase will be gone from this machine forever.");
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
