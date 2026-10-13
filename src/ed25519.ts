import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { getAddressDecoder, getBase58Encoder } from "@solana/kit";

export const ED25519_PROGRAM_ID = "Ed25519SigVerify111111111111111111111111111";
export const ED25519_SELF_REFERENCE = 0xffff;
export const ED25519_OFFSETS_START = 2;
export const ED25519_OFFSETS_SIZE = 14;
export const ED25519_PUBLIC_KEY_SIZE = 32;
export const ED25519_SIGNATURE_SIZE = 64;

export interface Ed25519Offsets {
  signatureOffset: number;
  signatureInstructionIndex: number;
  publicKeyOffset: number;
  publicKeyInstructionIndex: number;
  messageDataOffset: number;
  messageDataSize: number;
  messageInstructionIndex: number;
}

export interface Ed25519Reference {
  requestedInstructionIndex: number;
  resolvedInstructionIndex: number;
  sameInstruction: boolean;
  byteStart: number;
  byteEndExclusive: number;
}

export interface Ed25519SignatureEvidence {
  signatureIndex: number;
  offsets: Ed25519Offsets;
  signatureReference: Ed25519Reference;
  publicKeyReference: Ed25519Reference;
  messageReference: Ed25519Reference;
  publicKey: string;
  signatureHex: string;
  signatureSha256: string;
  messageHex: string;
  messageSha256: string;
  locallyVerified: boolean;
}

export interface Ed25519ParseResult {
  status: "decoded" | "malformed" | "unsupported-reference";
  instructionIndex: number;
  instructionDataLength: number;
  instructionDataSha256: string;
  signatureCount: number | null;
  paddingByte: number | null;
  signatures: Ed25519SignatureEvidence[];
  issues: string[];
}

const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

export function decodeBase58Bytes(value: string): Uint8Array {
  return new Uint8Array(getBase58Encoder().encode(value));
}

function readOffsets(data: Uint8Array, start: number): Ed25519Offsets {
  const view = new DataView(data.buffer, data.byteOffset + start, ED25519_OFFSETS_SIZE);
  return {
    signatureOffset: view.getUint16(0, true),
    signatureInstructionIndex: view.getUint16(2, true),
    publicKeyOffset: view.getUint16(4, true),
    publicKeyInstructionIndex: view.getUint16(6, true),
    messageDataOffset: view.getUint16(8, true),
    messageDataSize: view.getUint16(10, true),
    messageInstructionIndex: view.getUint16(12, true),
  };
}

function resolveReference(
  instructionDatas: Array<Uint8Array | null>,
  currentInstructionIndex: number,
  requestedInstructionIndex: number,
  byteStart: number,
  size: number,
): { reference: Ed25519Reference; bytes: Uint8Array } | string {
  const sameInstruction = requestedInstructionIndex === ED25519_SELF_REFERENCE;
  const resolvedInstructionIndex = sameInstruction ? currentInstructionIndex : requestedInstructionIndex;
  const source = instructionDatas[resolvedInstructionIndex];
  if (!source) return `Instruction ${resolvedInstructionIndex} has no decodable raw data for an Ed25519 offset reference.`;
  const byteEndExclusive = byteStart + size;
  if (!Number.isSafeInteger(byteEndExclusive) || byteEndExclusive < byteStart || byteEndExclusive > source.length) {
    return `Instruction ${resolvedInstructionIndex} byte range [${byteStart}, ${byteEndExclusive}) exceeds its ${source.length}-byte payload.`;
  }
  return {
    reference: { requestedInstructionIndex, resolvedInstructionIndex, sameInstruction, byteStart, byteEndExclusive },
    bytes: source.subarray(byteStart, byteEndExclusive),
  };
}

function verifyEd25519(message: Uint8Array, publicKey: Uint8Array, signature: Uint8Array): boolean {
  try {
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const key = createPublicKey({ key: Buffer.concat([spkiPrefix, Buffer.from(publicKey)]), format: "der", type: "spki" });
    return verifySignature(null, Buffer.from(message), key, Buffer.from(signature));
  } catch {
    return false;
  }
}

export function parseEd25519Instruction(
  instructionDatas: Array<Uint8Array | null>,
  instructionIndex: number,
): Ed25519ParseResult {
  const data = instructionDatas[instructionIndex];
  const fallbackHash = data ? sha256(data) : sha256(new Uint8Array());
  const malformed = (issues: string[], signatureCount: number | null = null, paddingByte: number | null = null): Ed25519ParseResult => ({
    status: "malformed",
    instructionIndex,
    instructionDataLength: data?.length ?? 0,
    instructionDataSha256: fallbackHash,
    signatureCount,
    paddingByte,
    signatures: [],
    issues,
  });
  if (!data) return malformed([`Instruction ${instructionIndex} has no raw data.`]);
  if (data.length < ED25519_OFFSETS_START) return malformed(["Ed25519 instruction is shorter than the two-byte header."]);
  const signatureCount = data[0]!, paddingByte = data[1]!;
  if (signatureCount === 0 && data.length > ED25519_OFFSETS_START) {
    return malformed(["A zero-signature Ed25519 instruction may not contain trailing data."], signatureCount, paddingByte);
  }
  const expectedOffsetsEnd = ED25519_OFFSETS_START + signatureCount * ED25519_OFFSETS_SIZE;
  if (data.length < expectedOffsetsEnd) {
    return malformed([`Ed25519 instruction needs ${expectedOffsetsEnd} bytes for ${signatureCount} offset record(s), but has ${data.length}.`], signatureCount, paddingByte);
  }
  const signatures: Ed25519SignatureEvidence[] = [], issues: string[] = [];
  for (let signatureIndex = 0; signatureIndex < signatureCount; signatureIndex++) {
    const offsets = readOffsets(data, ED25519_OFFSETS_START + signatureIndex * ED25519_OFFSETS_SIZE);
    const signature = resolveReference(instructionDatas, instructionIndex, offsets.signatureInstructionIndex, offsets.signatureOffset, ED25519_SIGNATURE_SIZE);
    const publicKey = resolveReference(instructionDatas, instructionIndex, offsets.publicKeyInstructionIndex, offsets.publicKeyOffset, ED25519_PUBLIC_KEY_SIZE);
    const message = resolveReference(instructionDatas, instructionIndex, offsets.messageInstructionIndex, offsets.messageDataOffset, offsets.messageDataSize);
    const failures = [signature, publicKey, message].filter((value): value is string => typeof value === "string");
    if (failures.length) { issues.push(...failures.map((issue) => `Signature ${signatureIndex}: ${issue}`)); continue; }
    if (typeof signature === "string" || typeof publicKey === "string" || typeof message === "string") continue;
    let publicKeyAddress: string;
    try { publicKeyAddress = getAddressDecoder().decode(publicKey.bytes); }
    catch { issues.push(`Signature ${signatureIndex}: the referenced 32-byte public key is not a valid Solana address.`); continue; }
    signatures.push({
      signatureIndex,
      offsets,
      signatureReference: signature.reference,
      publicKeyReference: publicKey.reference,
      messageReference: message.reference,
      publicKey: publicKeyAddress,
      signatureHex: Buffer.from(signature.bytes).toString("hex"),
      signatureSha256: sha256(signature.bytes),
      messageHex: Buffer.from(message.bytes).toString("hex"),
      messageSha256: sha256(message.bytes),
      locallyVerified: verifyEd25519(message.bytes, publicKey.bytes, signature.bytes),
    });
  }
  return {
    status: issues.length ? "unsupported-reference" : "decoded",
    instructionIndex,
    instructionDataLength: data.length,
    instructionDataSha256: fallbackHash,
    signatureCount,
    paddingByte,
    signatures,
    issues,
  };
}
