import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const platformSeed = process.env.DESO_PLATFORM_SEED;
  const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY;
  const baseUrl = 'https://node.deso.org';

  try {
    // Step 1: Exchange rate
    const priceRes = await fetch('https://api.deso.org/api/v0/get-exchange-rate');
    const priceData = await priceRes.json();
    const desoUSD = (priceData?.USDCentsPerDeSoExchangeRate ?? 0) / 100;

    // Step 2: Build send-deso tx (send 1000 nanos to self as test)
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
      return NextResponse.json({ step: 'send-deso-failed', sendData, hasPlatformKey: !!platformPublicKey, hasSeed: !!platformSeed, desoUSD });
    }

    // Step 3: Sign server-side
    if (!platformSeed) {
      return NextResponse.json({ step: 'no-seed', hasPlatformKey: !!platformPublicKey, desoUSD });
    }
    const { signTransactionWithSeed } = await import('@/lib/deso/server-sign');
    const signedHex = await signTransactionWithSeed(sendData.TransactionHex, platformSeed);

    // Step 4: Submit (actually broadcasts — sends 1000 nanos to self)
    const submitRes = await fetch(`${baseUrl}/api/v0/submit-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TransactionHex: signedHex }),
    });
    const submitText = await submitRes.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let submitData: any = null;
    try { submitData = JSON.parse(submitText); } catch {
      return NextResponse.json({ step: 'submit-parse-failed', submitText: submitText.slice(0, 300), desoUSD });
    }

    if (!submitRes.ok || submitData?.error) {
      return NextResponse.json({ step: 'submit-failed', submitData, submitStatus: submitRes.status, desoUSD });
    }

    return NextResponse.json({
      step: 'all-steps-ok',
      txnHash: submitData?.TxnHashHex,
      hasPlatformKey: !!platformPublicKey,
      hasSeed: !!platformSeed,
      desoUSD,
      note: 'Sent 1000 nanos to self as end-to-end test'
    });
  } catch (err) {
    return NextResponse.json({ step: 'exception', error: err instanceof Error ? err.message : String(err) });
  }
}
