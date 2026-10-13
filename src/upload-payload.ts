import { Buffer } from "node:buffer";

/** Decode standard Base64 payloads without Node's silent character/padding repair. */
export function decodeUploadPayload(bytes: string): Buffer | null {
  if (!bytes || !/^[A-Za-z0-9+/]+={0,2}$/.test(bytes)) return null;
  const payload = Buffer.from(bytes, "base64");
  const canonical = payload.toString("base64");
  // Accept canonical standard Base64 with or without its trailing padding.
  // The round trip also rejects incomplete groups and nonzero unused pad bits.
  return bytes === canonical || bytes === canonical.replace(/=+$/, "") ? payload : null;
}

export type UploadWriteEvidence =
  | { valid: true; account: string; authority: string; offset: number; payload: Buffer; byteLength: number; finalCoveredByte: number }
  | { valid: false; reason: string };

export function inspectUploadWrite(info: unknown): UploadWriteEvidence {
  if (!info || typeof info !== "object" || Array.isArray(info)) return { valid: false, reason: "Decoded write fields are unavailable." };
  const { account, authority, offset, bytes } = info as Record<string, unknown>;
  if (typeof account !== "string" || typeof authority !== "string") return { valid: false, reason: "Buffer or authority identifier is unavailable." };
  if (!account.trim() || !authority.trim()) return { valid: false, reason: "Buffer or authority identifier is blank." };
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) return { valid: false, reason: "Write offset is not a non-negative safe integer." };
  if (typeof bytes !== "string") return { valid: false, reason: "Payload is not a Base64 string." };
  if (!bytes) return { valid: false, reason: "Empty payload has no byte range." };
  const payload = decodeUploadPayload(bytes);
  if (!payload) return { valid: false, reason: "Payload is not canonical standard Base64." };
  const byteLength = payload.length, finalCoveredByte = offset + (byteLength - 1);
  if (!Number.isSafeInteger(finalCoveredByte)) return { valid: false, reason: "Write end exceeds the safe-integer range." };
  return { valid: true, account, authority, offset, payload, byteLength, finalCoveredByte };
}
