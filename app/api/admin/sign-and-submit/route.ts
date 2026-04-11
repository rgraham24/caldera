import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin/auth";

export async function POST(req: NextRequest) {
  const { adminPassword, desoPublicKey, transactionHex, seedPhrase } = await req.json();

  if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!transactionHex || !seedPhrase) {
    return NextResponse.json({ error: "transactionHex and seedPhrase required" }, { status: 400 });
  }

  // Sign via DeSo Identity server-side
  const signRes = await fetch("https://identity.deso.org/api/v0/sign-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: transactionHex, Seed: seedPhrase }),
  });

  let signedHex = transactionHex;
  if (signRes.ok) {
    const signData = await signRes.json();
    if (signData.SignedTransactionHex) {
      signedHex = signData.SignedTransactionHex;
    }
  } else {
    const errText = await signRes.text();
    return NextResponse.json({ error: `Sign failed: ${errText.substring(0, 200)}` }, { status: 500 });
  }

  // Submit signed transaction
  const submitRes = await fetch("https://api.deso.org/api/v0/submit-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: signedHex }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    return NextResponse.json({ error: `Submit failed: ${err.substring(0, 200)}` }, { status: 500 });
  }

  const data = await submitRes.json();
  return NextResponse.json({ success: true, txHash: data.TxnHashHex });
}
