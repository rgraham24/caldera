import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const platformSeed = process.env.DESO_PLATFORM_SEED;
  const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY;

  // Check exchange rate
  let desoUSD = 0;
  try {
    const r = await fetch('https://api.deso.org/api/v0/get-exchange-rate');
    const d = await r.json();
    desoUSD = (d?.USDCentsPerDeSoExchangeRate ?? 0) / 100;
  } catch (e) { return NextResponse.json({ step: 'exchange-rate', error: String(e) }); }

  // Try send-deso with 1 nano (dust amount just to test)
  const returnNanos = 1000; // tiny test
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendData: any = null;
  try {
    const r = await fetch('https://node.deso.org/api/v0/send-deso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SenderPublicKeyBase58Check: platformPublicKey,
        RecipientPublicKeyOrUsername: platformPublicKey, // send to self as test
        AmountNanos: returnNanos,
        MinFeeRateNanosPerKB: 1000,
      }),
    });
    const text = await r.text();
    try { sendData = JSON.parse(text); } catch { return NextResponse.json({ step: 'send-deso-parse', rawResponse: text.slice(0, 300), hasPlatformKey: !!platformPublicKey, hasSeed: !!platformSeed, desoUSD }); }
  } catch (e) { return NextResponse.json({ step: 'send-deso-fetch', error: String(e) }); }

  return NextResponse.json({
    step: 'send-deso-ok',
    hasTransactionHex: !!sendData?.TransactionHex,
    sendDataKeys: Object.keys(sendData ?? {}),
    hasPlatformKey: !!platformPublicKey,
    hasSeed: !!platformSeed,
    desoUSD,
    error: sendData?.error ?? null,
  });
}
