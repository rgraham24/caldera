import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";
import { sha256 } from "@noble/hashes/sha256";
import * as secp from "@noble/secp256k1";

// Convert compact signature (64 bytes: r||s) to DER encoding
// This is the ASN.1 DER format that DeSo expects
function compactToDER(compact: Uint8Array): Buffer {
  const r = compact.slice(0, 32);
  const s = compact.slice(32, 64);

  // Pad with 0x00 if high bit set (to indicate positive integer in DER)
  const rPad = r[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), Buffer.from(r)]) : Buffer.from(r);
  const sPad = s[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), Buffer.from(s)]) : Buffer.from(s);

  // DER structure: 0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
  const inner = Buffer.concat([
    Buffer.from([0x02, rPad.length]),
    rPad,
    Buffer.from([0x02, sPad.length]),
    sPad,
  ]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
}

export async function signTransactionWithSeed(
  transactionHex: string,
  mnemonic: string
): Promise<string> {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive("m/44'/0'/0'/0/0");
  if (!child.privateKey) throw new Error("Could not derive private key");

  const txBytes = Buffer.from(transactionHex, "hex");

  // DeSo uses double SHA256 of the raw transaction bytes
  const hash1 = sha256(txBytes);
  const hash2 = sha256(hash1);

  // Sign — v3 returns compact Uint8Array by default, prehash: false since we've already hashed
  const compactSig = await secp.signAsync(hash2, child.privateKey, { prehash: false, lowS: true });
  const derSig = compactToDER(compactSig as unknown as Uint8Array);

  // Append DER signature with 1-byte length prefix
  const sigLenBuf = Buffer.alloc(1);
  sigLenBuf.writeUInt8(derSig.length);
  return Buffer.concat([txBytes, sigLenBuf, derSig]).toString("hex");
}
