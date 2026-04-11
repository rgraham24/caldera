import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin/auth";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { adminPassword, desoPublicKey, username, updaterPublicKey } = await req.json();

  if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!username || !updaterPublicKey) {
    return NextResponse.json({ error: "username and updaterPublicKey required" }, { status: 400 });
  }

  // Get profile
  const profileRes = await fetch("https://api.deso.org/api/v0/get-single-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Username: username }),
  });
  const profileData = await profileRes.json();
  const profile = profileData?.Profile;

  if (!profile?.PublicKeyBase58Check) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Build update-profile tx
  const txRes = await fetch("https://api.deso.org/api/v0/update-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UpdaterPublicKeyBase58Check: updaterPublicKey,
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

  if (!txRes.ok) {
    const err = await txRes.text();
    return NextResponse.json({ error: `DeSo API error: ${err.substring(0, 200)}` }, { status: 500 });
  }

  const txData = await txRes.json();

  return NextResponse.json({
    transactionHex: txData.TransactionHex,
    username: profile.Username,
    profilePublicKey: profile.PublicKeyBase58Check,
  });
}
