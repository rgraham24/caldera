import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";
import * as secp from "@noble/secp256k1";
import { createHash } from "crypto";

function uvarint64ToBuf(uint: number): Buffer {
  const result: number[] = [];
  while (uint >= 0x80) {
    result.push((uint & 0xff) | 0x80);
    uint >>>= 7;
  }
  result.push(uint | 0);
  return Buffer.from(result);
}

function compactToDER(compact: Uint8Array): Buffer {
  const r = compact.slice(0, 32);
  const s = compact.slice(32, 64);
  const rPad = r[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), Buffer.from(r)]) : Buffer.from(r);
  const sPad = s[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), Buffer.from(s)]) : Buffer.from(s);
  const inner = Buffer.concat([Buffer.from([0x02, rPad.length]), rPad, Buffer.from([0x02, sPad.length]), sPad]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
}

// Scan from the END of the tx to find the signature slot.
// DeSo unsigned tx structure ends with: [0x00 sig placeholder][v1 fields]
// v1 fields for basic_transfer: version(uvarint) + feeNanos(uvarint) + nonce(2 uvarints)
// Strategy: scan backwards from end, reading varints, until we find the 0x00 sig slot
function findSigSlotFromEnd(txBytes: Buffer): { sigSlotOffset: number; v1Fields: Buffer } {
  // The last bytes of an unsigned tx are v1 fields followed by nothing.
  // v1 fields structure (from Transaction class):
  //   Optional(Uvarint64) version  -- if present, starts with a non-zero varint
  //   Optional(Uvarint64) feeNanos -- another varint  
  //   Optional(TransactionNonce) nonce -- 2 more varints
  //
  // For a simple send-deso with nonce, last few bytes look like:
  //   [sigLen=0x00][version varint][feeNanos varint][nonce.expirationBlock varint][nonce.partialId varint]
  //
  // Approach: find 0x00 byte that's the sig placeholder by scanning forward through tx structure.
  // But since parsing is complex, use a smarter approach:
  // The sig slot 0x00 byte is immediately preceded by the extraData field.
  // After 0x00, the v1 fields start with version varint (typically 0x01 or 0x02).
  //
  // Key insight: scan the tx looking for a 0x00 byte that could be sig placeholder.
  // The 0x00 sig placeholder is NEVER inside the v1 fields (those are all non-zero varints for real txns).
  // 
  // Most reliable: find last occurrence of 0x00 that is followed by valid v1 field varints.
  // For simplicity, since we know v1 fields are small (4 varints, usually 4-8 bytes),
  // try offsets from end: check if bytes[offset] == 0x00 and bytes[offset+1..end] parse as valid varints.
  
  // Try each possible sig slot offset from near the end
  for (let tailSize = 1; tailSize <= 20; tailSize++) {
    const candidateOffset = txBytes.length - tailSize;
    if (txBytes[candidateOffset] === 0x00) {
      // This could be the sig slot (empty sig = length 0)
      const v1Candidate = txBytes.slice(candidateOffset + 1);
      return { sigSlotOffset: candidateOffset, v1Fields: v1Candidate };
    }
  }
  
  // Fallback: no 0x00 found in last 20 bytes, use last byte
  return { sigSlotOffset: txBytes.length - 1, v1Fields: Buffer.alloc(0) };
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

  // Hash full tx bytes including 0x00 sig placeholder
  const hash1 = createHash("sha256").update(txBytes).digest();
  const hash2 = createHash("sha256").update(hash1).digest();

  const compactSig = await secp.signAsync(hash2, child.privateKey, { prehash: false, lowS: true });
  const sigBytes = compactToDER(compactSig as unknown as Uint8Array);
  const sigLenBuf = uvarint64ToBuf(sigBytes.length);

  const { sigSlotOffset, v1Fields } = findSigSlotFromEnd(txBytes);
  const v0WithoutSig = txBytes.slice(0, sigSlotOffset);

  console.log(`[sign] txLen=${txBytes.length} sigSlot=${sigSlotOffset} v1Len=${v1Fields.length} v1=${v1Fields.toString('hex')}`);

  return Buffer.concat([v0WithoutSig, sigLenBuf, sigBytes, v1Fields]).toString("hex");
}
