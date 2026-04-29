/**
 * HRV-9.1 — One-shot script: platform wallet buys $bitcoin.
 *
 * Spends ~0.6 DESO of platform's existing balance to buy
 * ~0.3 $bitcoin (target ~$3 worth at current price).
 *
 * Pattern mirrors lib/deso/transferDeso.ts — API construct
 * → seed sign → API submit. Reuses the platform seed from
 * .env.local.
 *
 * NOT committed (added to .gitignore via the scripts/ pattern
 * if not already; check before commit).
 *
 * Signing: uses signTransactionWithSeed from lib/deso/server-sign.ts
 * (BIP39 mnemonic → HD key m/44'/0'/0'/0/0 → secp256k1 DER sig).
 * This is the same path used by transferDeso.ts / buyback.ts.
 * NOT deso-protocol identity — that is browser-only.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { signTransactionWithSeed } from "../lib/deso/server-sign";

const DESO_NODE_URL = "https://node.deso.org";
const PLATFORM_PUBLIC_KEY = process.env.DESO_PLATFORM_PUBLIC_KEY!;
const PLATFORM_SEED = process.env.DESO_PLATFORM_SEED!;

const BITCOIN_CREATOR_PUBLIC_KEY =
  // $bitcoin profile pubkey — verified via get-single-profile
  // Username: "bitcoin"
  "BC1YLht6kTvCHS5gSzysSkjLTbVwq7D6DAEVzgBCTH58a7taQTwf3XN";

// Spend 0.6 DESO (= 600,000,000 nanos) on $bitcoin
const DESO_TO_SPEND_NANOS = 600_000_000;

async function main() {
  if (!PLATFORM_PUBLIC_KEY || !PLATFORM_SEED) {
    console.error("Missing DESO_PLATFORM_PUBLIC_KEY or DESO_PLATFORM_SEED in env");
    process.exit(1);
  }

  console.log("Platform pubkey:", PLATFORM_PUBLIC_KEY);
  console.log("Spending:", DESO_TO_SPEND_NANOS, "DESO nanos =", DESO_TO_SPEND_NANOS / 1e9, "DESO");
  console.log("Buying: $bitcoin");

  // 1. Construct unsigned tx via buy-or-sell-creator-coin
  console.log("\n[1/3] Constructing unsigned tx...");
  const constructRes = await fetch(`${DESO_NODE_URL}/api/v0/buy-or-sell-creator-coin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UpdaterPublicKeyBase58Check: PLATFORM_PUBLIC_KEY,
      CreatorPublicKeyBase58Check: BITCOIN_CREATOR_PUBLIC_KEY,
      OperationType: "buy",
      DeSoToSellNanos: DESO_TO_SPEND_NANOS,
      MinCreatorCoinExpectedNanos: 0, // no slippage protection — accept current price
      MinFeeRateNanosPerKB: 1000,
    }),
  });

  if (!constructRes.ok) {
    const text = await constructRes.text();
    console.error("Construct failed:", constructRes.status, text);
    process.exit(1);
  }

  const constructed = await constructRes.json();
  console.log("Got TransactionHex (truncated):", constructed.TransactionHex?.slice(0, 40), "...");
  console.log("Expected creator coins received:",
    constructed.ExpectedCreatorCoinReturnedNanos,
    "nanos =",
    Number(constructed.ExpectedCreatorCoinReturnedNanos) / 1e9,
    "$bitcoin"
  );

  // 2. Sign with platform seed (BIP39 mnemonic → secp256k1 DER — same as transferDeso.ts)
  console.log("\n[2/3] Signing transaction with platform seed...");
  let signedHex: string;
  try {
    signedHex = await signTransactionWithSeed(constructed.TransactionHex, PLATFORM_SEED);
  } catch (e) {
    console.error("Sign failed:", e);
    process.exit(1);
  }

  // 3. Submit
  console.log("\n[3/3] Submitting signed tx...");
  const submitRes = await fetch(`${DESO_NODE_URL}/api/v0/submit-transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: signedHex }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    console.error("Submit failed:", submitRes.status, text);
    process.exit(1);
  }

  const submitted = await submitRes.json();
  const txHash = submitted.TxnHashHex || submitted.Transaction?.TransactionIDBase58Check;
  console.log("\n✓ TX SUCCESS");
  console.log("  Tx hash:", txHash);
  console.log("  Explorer: https://explorer.deso.com/?query-node=https%3A%2F%2Fnode.deso.org&query=" + txHash);

  // Wait a few seconds for mempool propagation, then check balance
  console.log("\nWaiting 5s for mempool, then checking new $bitcoin balance...");
  await new Promise((r) => setTimeout(r, 5000));

  const balanceRes = await fetch(`${DESO_NODE_URL}/api/v0/get-hodlers-for-public-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      PublicKeyBase58Check: PLATFORM_PUBLIC_KEY,
      FetchAll: true,
    }),
  });
  const balanceData = await balanceRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bitcoinHolding = (balanceData.Hodlers ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h: any) => h?.ProfileEntryResponse?.Username?.toLowerCase() === "bitcoin"
  );
  if (bitcoinHolding) {
    console.log(
      `Platform now holds: ${bitcoinHolding.BalanceNanos} nanos = ${bitcoinHolding.BalanceNanos / 1e9} $bitcoin`
    );
  } else {
    console.log("Platform $bitcoin balance not yet propagated (try checking in 30s)");
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
