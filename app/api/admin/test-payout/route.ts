import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export async function GET(req: NextRequest) {
  const platformSeed = process.env.DESO_PLATFORM_SEED;
  const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY;
  const baseUrl = 'https://api.deso.org';

  try {
    const priceRes = await fetch(`${baseUrl}/api/v0/get-exchange-rate`);
    const priceData = await priceRes.json();
    const desoUSD = (priceData?.USDCentsPerDeSoExchangeRate ?? 0) / 100;

    const sendRes = await fetch(`${baseUrl}/api/v0/send-deso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SenderPublicKeyBase58Check: platformPublicKey,
        RecipientPublicKeyOrUsername: platformPublicKey,
        AmountNanos: 1000,
        MinFeeRateNanosPerKB: 1000,
      }),
    });
    const sendData = await sendRes.json();
    if (!sendData?.TransactionHex) {
      return NextResponse.json({ step: 'send-deso-failed', sendData });
    }

    const txHex = sendData.TransactionHex;
    const txBytes = Buffer.from(txHex, 'hex');
    
    // Log raw bytes info
    const lastBytes = txBytes.slice(-10).toString('hex');
    const txLen = txBytes.length;
    
    // Try signing
    const { signTransactionWithSeed } = await import('@/lib/deso/server-sign');
    const signedHex = await signTransactionWithSeed(txHex, platformSeed!);
    const signedBytes = Buffer.from(signedHex, 'hex');
    
    // Submit
    const submitRes = await fetch(`${baseUrl}/api/v0/submit-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TransactionHex: signedHex }),
    });
    const submitData = await submitRes.json();

    return NextResponse.json({
      step: submitRes.ok ? 'all-steps-ok' : 'submit-failed',
      txLen,
      lastBytes,
      signedLen: signedBytes.length,
      signedLastBytes: signedBytes.slice(-10).toString('hex'),
      sizeDiff: signedBytes.length - txBytes.length,
      submitStatus: submitRes.status,
      submitData: submitRes.ok ? { txnHash: submitData.TxnHashHex } : submitData,
      desoUSD,
    });
  } catch (err) {
    return NextResponse.json({ step: 'exception', error: err instanceof Error ? err.message : String(err) });
  }
}
