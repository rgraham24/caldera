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
    const { sendDeso } = await import("deso-protocol");
    const result = await sendDeso({
      SenderPublicKeyBase58Check: senderPublicKey,
      RecipientPublicKeyOrUsername: recipientPublicKey,
      AmountNanos: Math.floor(amountNanos),
      MinFeeRateNanosPerKB: 1000,
    });
    return result?.submittedTransactionResponse?.TxnHashHex ?? null;
  } catch (err) {
    console.error("[sendDesoPayment]", err);
    return null;
  }
}
