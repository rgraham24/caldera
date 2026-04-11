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
  localStorage.setItem("caldera_auth_return", window.location.pathname);
  const callbackUrl = `${window.location.origin}/auth/callback`;
  const identityUrl = "https://identity.deso.org/log-in?" + new URLSearchParams({
    accessLevelRequest: "4",
    redirect_uri: callbackUrl,
    derive: "false",
  }).toString();
  window.location.href = identityUrl;
}

export function disconnectDeSoWallet(): void {
  // Redirect-based auth — clearing the store is sufficient
}

// ─── DeSo transaction signing via Identity iframe ────────────────────────────

export async function signWithDesoIdentity(transactionHex: string): Promise<string | null> {
  const store = (await import("@/store")).useAppStore.getState();

  // Try silent iframe signing first
  if (store.encryptedSeedHex && store.accessLevelHmac && window.__DESO_IFRAME__) {
    return new Promise((resolve) => {
      const msgId = Math.random().toString(36).slice(2);
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve(null);
      }, 10000);

      function handler(event: MessageEvent) {
        if (!event.origin.includes("identity.deso.org")) return;
        if (event.data?.id !== msgId) return;
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
        if (event.data?.payload?.signedTransactionHex) {
          resolve(event.data.payload.signedTransactionHex);
        } else if (event.data?.payload?.approvalRequired) {
          // Fall through to popup
          resolve(null);
        } else {
          resolve(null);
        }
      }

      window.addEventListener("message", handler);

      window.__DESO_IFRAME__?.postMessage({
        id: msgId,
        service: "identity",
        method: "sign",
        payload: {
          accessLevel: store.accessLevel,
          accessLevelHmac: store.accessLevelHmac,
          encryptedSeedHex: store.encryptedSeedHex,
          transactionHex,
        },
      }, "https://identity.deso.org");
    });
  }

  // Fallback: approval popup for transactions outside access level
  return new Promise((resolve) => {
    const url = "https://identity.deso.org/approve?tx=" + transactionHex;
    const popup = window.open(url, "DeSo Identity", "width=800,height=600,scrollbars=yes");
    if (!popup) { resolve(null); return; }
    const timeout = setTimeout(() => { resolve(null); popup.close(); }, 60000);
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
