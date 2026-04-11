import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin/auth";

export const maxDuration = 60;

const DESO_API = "https://node.deso.org/api/v0";
const IDENTITY_API = "https://identity.deso.org/api/v0";

const CATEGORY_TOKENS = [
  "EntertainmentMarkets",
  "CryptoMarkets1",
  "ViralMarkets",
  "ConflictMarkets",
  "ElectionMarkets",
  "SportsMarkets",
];

export async function POST(req: NextRequest) {
  const { desoPublicKey, adminPassword } = await req.json();
  if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY;
  const platformSeed = process.env.DESO_PLATFORM_SEED;

  if (!platformPublicKey || !platformSeed) {
    return NextResponse.json({ error: "Missing platform credentials" }, { status: 500 });
  }

  const results = [];

  for (const username of CATEGORY_TOKENS) {
    try {
      // Step 1: Get existing profile
      const profileRes = await fetch(`${DESO_API}/get-single-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Username: username }),
      });
      const profileData = await profileRes.json();
      const profile = profileData?.Profile;

      if (!profile?.PublicKeyBase58Check) {
        results.push({ username, status: "not_found" });
        continue;
      }

      const currentFounderReward = profile.CoinEntry?.CreatorBasisPoints ?? 10000;
      if (currentFounderReward === 0) {
        results.push({ username, status: "already_zero" });
        continue;
      }

      // Step 2: Build update-profile tx
      const updateRes = await fetch(`${DESO_API}/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          UpdaterPublicKeyBase58Check: platformPublicKey,
          ProfilePublicKeyBase58Check: profile.PublicKeyBase58Check,
          NewUsername: profile.Username,
          NewDescription: profile.Description ?? "",
          NewProfilePic: "",
          NewCreatorBasisPoints: 0,
          NewStakeMultipleBasisPoints: 12500,
          IsHidden: false,
          MinFeeRateNanosPerKB: 1000,
        }),
      });

      if (!updateRes.ok) {
        results.push({ username, status: "build_failed" });
        continue;
      }

      const updateData = await updateRes.json();
      if (!updateData.TransactionHex) {
        results.push({ username, status: "no_tx_hex" });
        continue;
      }

      // Step 3: Sign via Identity
      const signRes = await fetch(`${IDENTITY_API}/sign-transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          TransactionHex: updateData.TransactionHex,
          Seed: platformSeed,
        }),
      });

      let signedHex = updateData.TransactionHex;
      if (signRes.ok) {
        const signData = await signRes.json();
        if (signData.SignedTransactionHex) {
          signedHex = signData.SignedTransactionHex;
        }
      }

      // Step 4: Submit
      const submitRes = await fetch(`${DESO_API}/submit-transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ TransactionHex: signedHex }),
      });

      if (submitRes.ok) {
        results.push({ username, status: "success", previousFounderReward: currentFounderReward });
      } else {
        results.push({ username, status: "submit_failed" });
      }

      // Small delay between transactions
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      results.push({ username, status: "error", error: String(err) });
    }
  }

  return NextResponse.json({ results });
}
