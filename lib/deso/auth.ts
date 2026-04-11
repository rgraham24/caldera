export type ConnectedUser = {
  publicKey: string;
  username: string;
  profilePicUrl: string;
  balanceUSD: number;
  balanceDeso: number;
  derivedPublicKey?: string;
  derivedKeyEncrypted?: string;
  accessSignature?: string;
  expirationBlock?: number;
};

export function connectDeSoWallet(): void {
  localStorage.setItem("caldera_auth_return", window.location.pathname);
  const callbackUrl = `${window.location.origin}/auth/callback`;
  const identityUrl = "https://identity.deso.org/log-in?" + new URLSearchParams({
    accessLevelRequest: "2",
    redirect_uri: callbackUrl,
    derive: "false",
  }).toString();
  window.location.href = identityUrl;
}

export function disconnectDeSoWallet(): void {
  // Redirect-based auth — clearing the store is sufficient
}

// ─── DeSo transaction signing via Identity popup ──────────────────────────────

export async function signWithDesoIdentity(
  transactionHex: string
): Promise<string | null> {
  // Try derived key signing first (no popup needed)
  const store = (await import('@/store')).useAppStore.getState();
  if (store.derivedKeyEncrypted && store.derivedPublicKey) {
    try {
      const signRes = await fetch('https://identity.deso.org/api/v0/sign-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          TransactionHex: transactionHex,
          DerivedPublicKeyBase58Check: store.derivedPublicKey,
          EncryptedDerivedPrivateKey: store.derivedKeyEncrypted,
          AccessSignature: store.accessSignature,
          ExpirationBlock: store.expirationBlock,
        }),
      });
      if (signRes.ok) {
        const data = await signRes.json();
        if (data.SignedTransactionHex) return data.SignedTransactionHex;
      }
    } catch { /* fall through to popup */ }
  }

  // Fallback: open Identity popup
  return new Promise((resolve) => {
    const identityUrl = 'https://identity.deso.org/sign-transaction';
    const popup = window.open(identityUrl, 'DeSo Identity', 'width=800,height=600,scrollbars=yes');
    if (!popup) { resolve(null); return; }
    const timeout = setTimeout(() => { resolve(null); popup.close(); }, 60000);
    function handler(event: MessageEvent) {
      if (!event.origin.includes('identity.deso.org')) return;
      if (event.data?.method === 'initialize' || event.data?.service === 'identity') {
        popup?.postMessage({
          id: '1', service: 'identity', method: 'sign',
          payload: { transactionHex },
        }, 'https://identity.deso.org');
        return;
      }
      if (event.data?.id === '1' && event.data?.payload?.signedTransactionHex) {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve(event.data.payload.signedTransactionHex);
        popup?.close();
      }
    }
    window.addEventListener('message', handler);
  });
}

// ─── Send DESO from user wallet to platform wallet ────────────────────────────

export async function sendDesoPayment(
  senderPublicKey: string,
  recipientPublicKey: string,
  amountNanos: number
): Promise<string | null> {
  try {
    // Build the transaction
    const txRes = await fetch('https://api.deso.org/api/v0/send-deso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SenderPublicKeyBase58Check: senderPublicKey,
        RecipientPublicKeyOrAddressBase58Check: recipientPublicKey,
        AmountNanos: Math.floor(amountNanos),
        MinFeeRateNanosPerKB: 1000,
      }),
    });

    if (!txRes.ok) return null;
    const txData = await txRes.json();
    if (!txData.TransactionHex) return null;

    // Sign via DeSo Identity popup
    const signedTx = await signWithDesoIdentity(txData.TransactionHex);
    if (!signedTx) return null;

    // Submit signed transaction
    const submitRes = await fetch('https://api.deso.org/api/v0/submit-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TransactionHex: signedTx }),
    });

    if (!submitRes.ok) return null;
    const submitData = await submitRes.json();
    return submitData.TxnHashHex ?? null;

  } catch {
    return null;
  }
}
