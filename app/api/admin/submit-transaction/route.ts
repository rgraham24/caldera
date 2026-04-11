import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin/auth";

export async function POST(req: NextRequest) {
  const { adminPassword, desoPublicKey, transactionHex } = await req.json();

  if (!isAdminAuthorized(adminPassword, desoPublicKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const submitRes = await fetch("https://api.deso.org/api/v0/submit-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: transactionHex }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    return NextResponse.json({ error: err.substring(0, 200) }, { status: 500 });
  }

  const data = await submitRes.json();
  return NextResponse.json({ success: true, txHash: data.TxnHashHex });
}
