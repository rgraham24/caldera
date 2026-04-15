import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";
import * as secp from "@noble/secp256k1";
import { createHash } from "crypto";

// Read a uvarint64 from buffer at offset, returns [value, bytesRead]
function readUvarint(buf: Buffer, offset: number): [number, number] {
  let x = 0, shift = 0, i = offset;
  while (i < buf.length) {
    const b = buf[i++];
    x |= (b & 0x7f) << shift;
    shift += 7;
    if (!(b & 0x80)) break;
  }
  return [x, i - offset];
}

// Read a var-length buffer (uvarint length prefix + bytes)
function readVarBuffer(buf: Buffer, offset: number): [Buffer, number] {
  const [len, lenBytes] = readUvarint(buf, offset);
  const start = offset + lenBytes;
  return [buf.slice(start, start + len), lenBytes + len];
}

// Skip N bytes
function skip(n: number): number { return n; }

// Parse a DeSo TransactionV0 and return how many bytes it consumed.
// Structure: inputs[] + outputs[] + txnType(uvarint) + metadata(varies) + publicKey(varbuf) + extraData(varbuf array) + signature(varbuf)
// After V0 ends, remaining bytes are v1 fields: version(uvarint) + feeNanos(uvarint) + nonce(2 uvarints)
function findV1FieldsOffset(txBytes: Buffer): number {
  let pos = 0;

  // Read inputs array: uvarint count, then each input = 32 bytes (txid) + uvarint (index)
  const [inputCount, icBytes] = readUvarint(txBytes, pos);
  pos += icBytes;
  for (let i = 0; i < inputCount; i++) {
    pos += 32; // txid fixed 32 bytes
    const [, idxBytes] = readUvarint(txBytes, pos);
    pos += idxBytes;
  }

  // Read outputs array: uvarint count, then each output = 33 bytes (pubkey) + uvarint (amountNanos)
  const [outputCount, ocBytes] = readUvarint(txBytes, pos);
  pos += ocBytes;
  for (let i = 0; i < outputCount; i++) {
    pos += 33; // pubkey fixed 33 bytes
    const [, amtBytes] = readUvarint(txBytes, pos);
    pos += amtBytes;
  }

  // Read txnType (uvarint)
  const [txnType, ttBytes] = readUvarint(txBytes, pos);
  pos += ttBytes;

  // Skip transaction metadata based on txnType
  // For BasicTransfer (type 2) = empty metadata
  // For send-deso it's also BasicTransfer
  // We handle the common case: metadata is a VarBuffer for most types
  // BasicTransfer (2) has empty metadata = just a 0x00 length prefix
  if (txnType === 2) {
    // BasicTransfer = empty metadata, just skip the 0x00
    // Actually it has no fields, so metadata bytes = 0
    // But it's still encoded as Enum which reads the type already
    // No additional bytes to skip for BasicTransfer metadata
  } else {
    // For other types, skip the metadata as a var buffer
    const [, mbBytes] = readVarBuffer(txBytes, pos);
    pos += mbBytes;
  }

  // Read publicKey (VarBuffer: 33 bytes usually)
  const [, pkBytes] = readVarBuffer(txBytes, pos);
  pos += pkBytes;

  // Read extraData (ArrayOf KVs): uvarint count, then each KV = VarBuffer key + VarBuffer value
  const [kvCount, kvCountBytes] = readUvarint(txBytes, pos);
  pos += kvCountBytes;
  for (let i = 0; i < kvCount; i++) {
    const [, kBytes] = readVarBuffer(txBytes, pos);
    pos += kBytes;
    const [, vBytes] = readVarBuffer(txBytes, pos);
    pos += vBytes;
  }

  // Now at signature position: VarBuffer (length 0 for unsigned tx = 0x00)
  // Read and skip the signature length (should be 0x00)
  const [sigLen, slBytes] = readUvarint(txBytes, pos);
  pos += slBytes + sigLen; // skip sig length varint + sig bytes (0 for unsigned)

  // pos now points to start of v1 fields
  return pos;
}

// Encode integer as DeSo uvarint
function uvarint64ToBuf(uint: number): Buffer {
  const result: number[] = [];
  while (uint >= 0x80) {
    result.push((uint & 0xff) | 0x80);
    uint >>>= 7;
  }
  result.push(uint | 0);
  return Buffer.from(result);
}

// Convert compact sig (r||s) to DER
function compactToDER(compact: Uint8Array): Buffer {
  const r = compact.slice(0, 32);
  const s = compact.slice(32, 64);
  const rPad = r[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), Buffer.from(r)]) : Buffer.from(r);
  const sPad = s[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), Buffer.from(s)]) : Buffer.from(s);
  const inner = Buffer.concat([Buffer.from([0x02, rPad.length]), rPad, Buffer.from([0x02, sPad.length]), sPad]);
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

  // Hash the FULL transaction bytes (including empty sig placeholder)
  const hash1 = createHash("sha256").update(txBytes).digest();
  const hash2 = createHash("sha256").update(hash1).digest();

  const compactSig = await secp.signAsync(hash2, child.privateKey, { prehash: false, lowS: true });
  const sigBytes = compactToDER(compactSig as unknown as Uint8Array);
  const sigLenBuf = uvarint64ToBuf(sigBytes.length);

  // Find where v0 ends (signature slot) and v1 fields begin
  let v1Offset: number;
  try {
    v1Offset = findV1FieldsOffset(txBytes);
  } catch {
    // Fallback: assume no v1 fields (old-style tx)
    v1Offset = txBytes.length;
  }

  // v0FieldsWithoutSignature = everything before the signature uvarint
  // We need to re-find the position just before the sig length varint
  // findV1FieldsOffset advances PAST the sig, so we need the position BEFORE reading sig
  // Let's compute: re-run but stop before signature read
  // Actually: signatureSlotOffset = v1Offset - (sigLen varint bytes + sigLen bytes)
  // For unsigned tx sigLen=0, so varint is 1 byte (0x00), sig bytes = 0
  // So signature slot starts at v1Offset - 1
  const sigSlotOffset = v1Offset - 1; // position of the 0x00 sig length byte

  const v0WithoutSig = txBytes.slice(0, sigSlotOffset);
  const v1Fields = txBytes.slice(v1Offset);

  return Buffer.concat([v0WithoutSig, sigLenBuf, sigBytes, v1Fields]).toString("hex");
}
