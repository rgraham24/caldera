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
  encryptedSeedHex?: string;
  accessLevelHmac?: string;
  accessLevel?: number;
};

export function connectDeSoWallet(): void {
  import("@/lib/deso/identity").then(({ getDesoIdentity }) => {
    getDesoIdentity().login().catch(() => {});
  });
}

export function disconnectDeSoWallet(): void {
  import("@/lib/deso/identity").then(({ getDesoIdentity }) => {
    getDesoIdentity().logout().catch(() => {});
  });
}

// ─── DeSo transaction signing via SDK (derived key) ─────────────────────────

export async function signWithDesoIdentity(transactionHex: string): Promise<string | null> {
  try {
    const { getDesoIdentity } = await import("@/lib/deso/identity");
    const id = getDesoIdentity();
    const signed = await id.signTx(transactionHex);
    if (signed) return signed;
  } catch {
    // fall through to approve popup
  }

  // Fallback: /approve popup for users without a valid derived key
  return new Promise((resolve) => {
    const approveUrl = "https://identity.deso.org/approve?tx=" + transactionHex;
    const popup = window.open(approveUrl, "DeSo Identity", "width=800,height=600,scrollbars=yes");
    if (!popup) { resolve(null); return; }

    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
      popup?.close();
    }, 120000);

    function handler(event: MessageEvent) {
      if (!event.origin.includes("identity.deso.org")) return;
      if (event.data?.payload?.signedTransactionHex) {
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
        resolve(event.data.payload.signedTransactionHex);
        popup?.close();
      }
    }
    window.addEventListener("message", handler);
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
