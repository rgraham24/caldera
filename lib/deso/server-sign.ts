import * as bip39 from "bip39";
import * as ecc from "tiny-secp256k1";
import { BIP32Factory } from "bip32";

const bip32 = BIP32Factory(ecc);

// DeSo uses Bitcoin's secp256k1 signing
// Derive private key from mnemonic, sign transaction hex server-side
export async function signTransactionWithSeed(
  transactionHex: string,
  mnemonic: string
): Promise<string> {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = bip32.fromSeed(seed);
  // DeSo derivation path: m/44'/0'/0'/0/0
  const child = root.derivePath("m/44'/0'/0'/0/0");

  if (!child.privateKey) throw new Error("Could not derive private key");

  // Parse the transaction hex
  const txBytes = Buffer.from(transactionHex, "hex");

  // DeSo signing: SHA256d of the tx bytes
  const crypto = await import("crypto");
  const hash1 = crypto.createHash("sha256").update(txBytes).digest();
  const hash2 = crypto.createHash("sha256").update(hash1).digest();

  // Sign with secp256k1
  const signature = ecc.sign(hash2, child.privateKey);

  // DeSo transaction format: append signature to tx
  // The signature is DER-encoded and appended with length prefix
  const derSig = Buffer.from(ecc.signatureExport(signature));

  // Rebuild tx with signature
  // DeSo tx structure: [tx_bytes][varint sig_len][sig_bytes]
  const sigLen = derSig.length;
  const sigLenBuf = Buffer.alloc(1);
  sigLenBuf.writeUInt8(sigLen);

  const signedTx = Buffer.concat([txBytes, sigLenBuf, derSig]);
  return signedTx.toString("hex");
}
