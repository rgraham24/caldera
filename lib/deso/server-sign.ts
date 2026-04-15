import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { ec as EC } from "elliptic";

const bip32 = BIP32Factory(ecc);
const ec = new EC("secp256k1");

export async function signTransactionWithSeed(
  transactionHex: string,
  mnemonic: string
): Promise<string> {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = bip32.fromSeed(seed);
  const child = root.derivePath("m/44'/0'/0'/0/0");
  if (!child.privateKey) throw new Error("Could not derive private key");

  const txBytes = Buffer.from(transactionHex, "hex");
  const crypto = await import("crypto");
  const hash1 = crypto.createHash("sha256").update(txBytes).digest();
  const hash2 = crypto.createHash("sha256").update(hash1).digest();

  const keyPair = ec.keyFromPrivate(child.privateKey);
  const sig = keyPair.sign(hash2, { canonical: true });
  const derSig = Buffer.from(sig.toDER());

  // Append signature to tx bytes with varint length prefix
  const sigLenBuf = Buffer.alloc(1);
  sigLenBuf.writeUInt8(derSig.length);
  return Buffer.concat([txBytes, sigLenBuf, derSig]).toString("hex");
}
