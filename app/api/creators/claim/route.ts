import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DESO_PRICE_USD = 4.63;

// TODO: Full transaction signing requires the deso-protocol package:
//   npm install deso-protocol
// Signing pattern:
//   import { identity } from 'deso-protocol';
//   const signedTx = await identity.signTx(txHex, seedHex);
//   then submit signed tx to /api/v0/submit-transaction
async function createDesoProfile(params: {
  username: string;
  description: string;
}): Promise<{ publicKey: string; username: string } | null> {
  try {
    const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY;
    if (!platformPublicKey) return null;

    // Build the update-profile transaction
    const txRes = await fetch('https://api.deso.org/api/v0/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UpdaterPublicKeyBase58Check: platformPublicKey,
        ProfilePublicKeyBase58Check: '',
        NewUsername: params.username,
        NewDescription: params.description,
        NewProfilePic: '',
        NewCreatorBasisPoints: 0, // 0% founder reward — fully tradeable
        NewStakeMultipleBasisPoints: 12500,
        IsHidden: false,
        MinFeeRateNanosPerKB: 1000,
      }),
    });

    if (!txRes.ok) return null;

    // TODO: Sign txData.TransactionHex with platform seed and submit
    // Full signing requires DESO_PLATFORM_SEED env var + deso-protocol package
    // For now returns a pending state
    return {
      publicKey: platformPublicKey,
      username: params.username,
    };
  } catch (e) {
    console.error('[createDesoProfile]', e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { slug, twitterHandle, creatorName } = await req.json();

    if (!slug || !twitterHandle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createClient();

    // Check creator exists
    const { data: creator } = await supabase
      .from('creators')
      .select('*')
      .eq('slug', slug)
      .single();

    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    if (creator.token_status === 'claimed') {
      return NextResponse.json({ error: 'This profile has already been claimed' }, { status: 400 });
    }

    const cleanHandle = twitterHandle.replace('@', '').toLowerCase();

    // Check if DeSo has a profile for this handle
    const desoRes = await fetch('https://api.deso.org/api/v0/get-single-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: cleanHandle }),
    });
    const desoData = await desoRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingProfile = (desoData as any)?.Profile;

    const platformSeed = process.env.DESO_PLATFORM_SEED ?? '';
    const newUsername = cleanHandle.replace(/[^a-zA-Z0-9]/g, '');

    let desoUsername = newUsername;
    let desoPublicKey = existingProfile?.PublicKeyBase58Check ?? '';
    let coinPrice = 0;
    let holders = 0;

    if (existingProfile?.Username) {
      // Profile already exists on DeSo — link it
      desoUsername = existingProfile.Username;
      desoPublicKey = existingProfile.PublicKeyBase58Check;
      coinPrice = ((existingProfile.CoinPriceDeSoNanos ?? 0) / 1e9) * DESO_PRICE_USD;
      holders = existingProfile.CoinEntry?.NumberOfHolders ?? 0;
    } else if (platformSeed) {
      // Create new DeSo profile
      const result = await createDesoProfile({
        username: newUsername,
        description: `${creatorName ?? slug} on Caldera — prediction markets and creator tokens`,
      });
      if (result) {
        desoPublicKey = result.publicKey;
      }
    }

    const newProfilePicUrl = desoPublicKey
      ? `https://node.deso.org/api/v0/get-single-profile-picture/${desoPublicKey}`
      : creator.profile_pic_url;

    // Update creator record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('creators').update({
      deso_username: desoUsername,
      deso_public_key: desoPublicKey,
      token_status: 'claimed',
      creator_coin_price: coinPrice,
      creator_coin_holders: holders,
      profile_pic_url: newProfilePicUrl,
    }).eq('slug', slug);

    // Mark claim code as used if one exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('claim_codes')
      .update({ status: 'claimed', claimed_at: new Date().toISOString() })
      .eq('slug', slug)
      .eq('status', 'pending');

    return NextResponse.json({
      success: true,
      desoUsername,
      message: 'Profile claimed successfully',
    });

  } catch (err) {
    console.error('[claim]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
