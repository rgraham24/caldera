import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";

export async function signTransactionWithSeed(
  transactionHex: string,
  mnemonic: string
): Promise<string> {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive("m/44'/0'/0'/0/0");
  if (!child.privateKey) throw new Error("Could not derive private key");

  const txBytes = Buffer.from(transactionHex, "hex");
  const hash1 = sha256(txBytes);
  const hash2 = sha256(hash1);

  const sig = secp256k1.sign(hash2, child.privateKey, { lowS: true });
  const derSig = Buffer.from(sig.toDERRawBytes());

  const sigLenBuf = Buffer.alloc(1);
  sigLenBuf.writeUInt8(derSig.length);
  return Buffer.concat([txBytes, sigLenBuf, derSig]).toString("hex");
}
