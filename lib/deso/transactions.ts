const DESO_NODE = "https://node.deso.org";
const PLATFORM_WALLET = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
const DESO_PRICE_USD = 5.25;

export function usdToNanos(usd: number): number {
  const deso = usd / DESO_PRICE_USD;
  return Math.floor(deso * 1e9);
}

export async function constructTransferTx(senderPublicKey: string, amountUSD: number): Promise<{ transactionHex: string }> {
  const amountNanos = usdToNanos(amountUSD);
  const res = await fetch(`${DESO_NODE}/api/v0/send-deso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      SenderPublicKeyBase58Check: senderPublicKey,
      RecipientPublicKeyOrUsername: PLATFORM_WALLET,
      AmountNanos: amountNanos,
      MinFeeRateNanosPerKB: 1000,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to construct transaction");
  }
  const data = await res.json();
  return { transactionHex: data.TransactionHex };
}

export async function signTransaction(transactionHex: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const identityUrl = "https://identity.deso.org";
    const popup = window.open(
      `${identityUrl}/sign-transaction?transactionHex=${transactionHex}`,
      "deso-identity",
      "width=800,height=1000,left=200,top=100"
    );
    if (!popup) {
      reject(new Error("Popup blocked. Please allow popups for this site."));
      return;
    }
    const handler = (event: MessageEvent) => {
      if (event.origin !== identityUrl) return;
      const { method, payload } = event.data;
      if (method === "sign") {
        window.removeEventListener("message", handler);
        if (payload?.signedTransactionHex) {
          resolve(payload.signedTransactionHex);
        } else {
          reject(new Error("Transaction signing cancelled or failed"));
        }
      }
    };
    window.addEventListener("message", handler);
    setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Signing timed out"));
    }, 120000);
  });
}

export async function submitTransaction(signedTransactionHex: string): Promise<string> {
  const res = await fetch(`${DESO_NODE}/api/v0/submit-transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: signedTransactionHex }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to submit transaction");
  }
  const data = await res.json();
  return data.TxnHashHex;
}

export async function executeDesoTransfer(senderPublicKey: string, amountUSD: number): Promise<{ txnHash: string }> {
  const { transactionHex } = await constructTransferTx(senderPublicKey, amountUSD);
  const signedHex = await signTransaction(transactionHex);
  const txnHash = await submitTransaction(signedHex);
  return { txnHash };
}
