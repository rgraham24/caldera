import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";
import * as secp from "@noble/secp256k1";
import { createHash } from "crypto";

// Convert compact signature (64 bytes: r||s) to DER encoding
function compactToDER(compact: Uint8Array): Buffer {
  const r = compact.slice(0, 32);
  const s = compact.slice(32, 64);
  const rPad = r[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), Buffer.from(r)]) : Buffer.from(r);
  const sPad = s[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), Buffer.from(s)]) : Buffer.from(s);
  const inner = Buffer.concat([
    Buffer.from([0x02, rPad.length]), rPad,
    Buffer.from([0x02, sPad.length]), sPad,
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
  // Double SHA256 using Node's built-in crypto — no subpath imports needed
  const hash1 = createHash("sha256").update(txBytes).digest();
  const hash2 = createHash("sha256").update(hash1).digest();

  const compactSig = await secp.signAsync(hash2, child.privateKey, { prehash: false, lowS: true });
  const derSig = compactToDER(compactSig as unknown as Uint8Array);

  const sigLenBuf = Buffer.alloc(1);
  sigLenBuf.writeUInt8(derSig.length);
  return Buffer.concat([txBytes, sigLenBuf, derSig]).toString("hex");
}
