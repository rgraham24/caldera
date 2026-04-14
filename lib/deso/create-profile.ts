export async function createDesoProfileForCreator(params: {
  username: string;
  description: string;
  profilePicUrl?: string;
}): Promise<{ success: boolean; publicKey?: string; username?: string; error?: string }> {
  try {
    const platformSeed = process.env.DESO_PLATFORM_SEED;
    const platformPublicKey = process.env.DESO_PLATFORM_PUBLIC_KEY;

    if (!platformSeed || !platformPublicKey) {
      return { success: false, error: 'Platform wallet not configured' };
    }

    // Clean username — DeSo usernames alphanumeric only
    const cleanUsername = params.username
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 25);

    if (cleanUsername.length < 3) {
      return { success: false, error: 'Username too short' };
    }

    // Check if profile already exists
    const checkRes = await fetch('https://api.deso.org/api/v0/get-single-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: cleanUsername }),
    });
    const checkData = await checkRes.json();

    if (checkData?.Profile?.Username) {
      // Already exists — zero out founder reward then return existing profile
      const existingKey = checkData.Profile.PublicKeyBase58Check as string;
      try {
        const frTxRes = await fetch('https://api.deso.org/api/v0/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            UpdaterPublicKeyBase58Check: platformPublicKey,
            ProfilePublicKeyBase58Check: existingKey,
            NewUsername: checkData.Profile.Username,
            NewDescription: checkData.Profile.Description ?? '',
            NewProfilePic: '',
            NewCreatorBasisPoints: 0,
            NewStakeMultipleBasisPoints: 12500,
            IsHidden: false,
            MinFeeRateNanosPerKB: 1000,
          }),
        });
        if (frTxRes.ok) {
          const frTxData = await frTxRes.json();
          if (frTxData.TransactionHex) {
            const frSignRes = await fetch('https://identity.deso.org/api/v0/sign-transaction', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ TransactionHex: frTxData.TransactionHex, Seed: platformSeed }),
            });
            if (frSignRes.ok) {
              const frSignData = await frSignRes.json();
              const frSignedHex: string | undefined = frSignData.SignedTransactionHex ?? frSignData.TransactionHex;
              if (frSignedHex) {
                await fetch('https://api.deso.org/api/v0/submit-transaction', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ TransactionHex: frSignedHex }),
                });
              }
            }
          }
        }
      } catch {
        // Non-fatal — profile still usable even if founder reward update fails
      }
      return {
        success: true,
        publicKey: existingKey,
        username: checkData.Profile.Username,
      };
    }

    // Build update-profile transaction
    const txRes = await fetch('https://api.deso.org/api/v0/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UpdaterPublicKeyBase58Check: platformPublicKey,
        ProfilePublicKeyBase58Check: '',
        NewUsername: cleanUsername,
        NewDescription: params.description,
        NewProfilePic: params.profilePicUrl ?? '',
        NewCreatorBasisPoints: 0,
        NewStakeMultipleBasisPoints: 12500,
        IsHidden: false,
        MinFeeRateNanosPerKB: 1000,
      }),
    });

    if (!txRes.ok) {
      const errText = await txRes.text();
      return { success: false, error: `DeSo API error: ${errText.substring(0, 100)}` };
    }

    const txData = await txRes.json();

    if (!txData.TransactionHex) {
      return { success: false, error: 'No transaction returned' };
    }

    // Sign the transaction via Identity API (server-side, seed-based)
    const identityRes = await fetch('https://identity.deso.org/api/v0/sign-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        TransactionHex: txData.TransactionHex,
        Seed: platformSeed,
      }),
    });

    if (!identityRes.ok) {
      const errText = await identityRes.text();
      return { success: false, error: `Failed to sign transaction: ${errText.substring(0, 120)}` };
    }

    const identityData = await identityRes.json();
    const signedHex: string | undefined = identityData.SignedTransactionHex ?? identityData.TransactionHex;

    if (!signedHex) {
      return { success: false, error: 'Sign succeeded but no signed transaction hex returned' };
    }

    // Submit the SIGNED transaction
    const submitRes = await fetch('https://api.deso.org/api/v0/submit-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TransactionHex: signedHex }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      return { success: false, error: `Failed to submit transaction: ${errText.substring(0, 120)}` };
    }

    // Wait for propagation then fetch the new profile
    await new Promise(r => setTimeout(r, 3000));

    const profileRes = await fetch('https://api.deso.org/api/v0/get-single-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: cleanUsername }),
    });
    const profileData = await profileRes.json();

    if (profileData?.Profile?.Username) {
      return {
        success: true,
        publicKey: profileData.Profile.PublicKeyBase58Check,
        username: profileData.Profile.Username,
      };
    }

    // Profile creation submitted but not yet propagated
    return {
      success: true,
      publicKey: platformPublicKey,
      username: cleanUsername,
    };

  } catch (err) {
    return { success: false, error: String(err) };
  }
}
