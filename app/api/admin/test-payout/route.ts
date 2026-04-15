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

    // Step 3: Sign
    const signRes = await fetch('https://identity.deso.org/api/v0/sign-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TransactionHex: sendData.TransactionHex, Seed: platformSeed }),
    });
    const signText = await signRes.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let signData: any = null;
    try { signData = JSON.parse(signText); } catch {
      return NextResponse.json({ step: 'sign-parse-failed', signText: signText.slice(0, 300), desoUSD });
    }
    if (!signData?.SignedTransactionHex) {
      return NextResponse.json({ step: 'sign-failed', signData, signStatus: signRes.status, desoUSD });
    }

    // Step 4: Submit (actually broadcast — this sends real DESO so we skip in test)
    return NextResponse.json({
      step: 'all-steps-ok',
      hasSignedHex: !!signData.SignedTransactionHex,
      signedHexPreview: signData.SignedTransactionHex?.slice(0, 40),
      hasPlatformKey: !!platformPublicKey,
      hasSeed: !!platformSeed,
      desoUSD,
      note: 'Submit step skipped in test to avoid broadcasting real tx'
    });
  } catch (err) {
    return NextResponse.json({ step: 'exception', error: err instanceof Error ? err.message : String(err) });
  }
}
