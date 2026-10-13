import { createSolanaRpc } from "@solana/kit";
import { MAX_SUPPORTED_TRANSACTION_VERSION } from "./types.js";
export { MAX_SUPPORTED_TRANSACTION_VERSION } from "./types.js";
import type { RpcBlock, RpcInnerInstructions, RpcTransactionEntry } from "./types.js";

export class BlockUnavailableError extends Error {
  constructor(public readonly slot: number) { super(`RPC returned no block for slot ${slot}`); this.name = "BlockUnavailableError"; }
}

type BlockEnvelope = {
  blockhash: string; previousBlockhash: string; parentSlot: number | bigint;
  transactions: Array<{ version: "legacy" | number; transaction: { signatures: string[]; message: { accountKeys: unknown[]; instructions: unknown[] } }; meta: Record<string, unknown> | null }>;
};
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const nonemptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const nonnegativeInteger = (value: unknown): value is number | bigint => (typeof value === "number" || typeof value === "bigint") && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

function blockEnvelope(value: unknown, encoding: string): BlockEnvelope {
  const block = object(value);
  const fail = (detail: string): never => { throw new Error(`Malformed ${encoding} getBlock response: ${detail}`); };
  if (!block || !nonemptyString(block.blockhash) || !nonemptyString(block.previousBlockhash) || !nonnegativeInteger(block.parentSlot)) return fail("valid block identity fields are required");
  if (!Array.isArray(block.transactions)) return fail("transactions array is required");
  for (const [index, value] of block.transactions.entries()) {
    const entry = object(value), transaction = object(entry?.transaction), message = object(transaction?.message);
    const version = entry?.version;
    if (version !== "legacy" && (typeof version !== "number" || !Number.isInteger(version) || version < 0 || version > MAX_SUPPORTED_TRANSACTION_VERSION)) fail(`transaction #${index} requires a supported version (legacy through ${MAX_SUPPORTED_TRANSACTION_VERSION})`);
    if (!transaction || !Array.isArray(transaction.signatures) || transaction.signatures.length === 0 || !transaction.signatures.every(nonemptyString)) fail(`transaction #${index} requires a nonempty signature list`);
    if (!message || !Array.isArray(message.accountKeys) || message.accountKeys.length === 0 || !Array.isArray(message.instructions)) fail(`transaction #${index} requires accountKeys and instructions arrays`);
    if (entry!.meta !== null) {
      const meta = object(entry!.meta);
      if (!meta || !("err" in meta) || !nonnegativeInteger(meta.fee)) fail(`transaction #${index} requires null metadata or an err/fee metadata object`);
    }
  }
  return block as unknown as BlockEnvelope;
}

function requireMatchingBlocks(parsedValue: unknown, rawValue: unknown): void {
  const parsed = blockEnvelope(parsedValue, "jsonParsed"), raw = blockEnvelope(rawValue, "json");
  if (parsed.blockhash !== raw.blockhash || parsed.previousBlockhash !== raw.previousBlockhash || BigInt(parsed.parentSlot) !== BigInt(raw.parentSlot)) throw new Error("RPC getBlock encodings refer to different blocks; refusing to combine their evidence");
  if (parsed.transactions.length !== raw.transactions.length) throw new Error("RPC getBlock encodings have different transaction counts; refusing to combine their evidence");
  for (let index = 0; index < parsed.transactions.length; index++) {
    if (parsed.transactions[index]!.version !== raw.transactions[index]!.version) throw new Error(`RPC getBlock transaction versions differ at index ${index}; refusing to combine their evidence`);
    const left = parsed.transactions[index]!.transaction, right = raw.transactions[index]!.transaction;
    if (left.signatures.length !== right.signatures.length || left.signatures.some((signature, position) => signature !== right.signatures[position])) throw new Error(`RPC getBlock transaction signatures differ at index ${index}; refusing to combine their evidence`);
    if (left.message.instructions.length !== right.message.instructions.length) throw new Error(`RPC getBlock instruction counts differ at transaction #${index}; refusing to combine their evidence`);
  }
}

export async function fetchParsedBlock(slot: number, rpcUrl: string): Promise<unknown> {
  const rpc = createSolanaRpc(rpcUrl); const config = { commitment: "confirmed", maxSupportedTransactionVersion: MAX_SUPPORTED_TRANSACTION_VERSION, rewards: false, transactionDetails: "full" } as const;
  const [parsedResult, rawResult] = await Promise.all([
    rpc.getBlock(BigInt(slot), { ...config, encoding: "jsonParsed" }).send({ abortSignal: AbortSignal.timeout(30_000) }),
    rpc.getBlock(BigInt(slot), { ...config, encoding: "json" }).send({ abortSignal: AbortSignal.timeout(30_000) }),
  ]);
  if (parsedResult === null || rawResult === null) throw new BlockUnavailableError(slot);
  requireMatchingBlocks(parsedResult, rawResult);
  const parsed = parsedResult as unknown as RpcBlock;
  const raw = rawResult as unknown as { transactions: Array<{ transaction: RpcTransactionEntry["rawTransaction"]; meta?: { innerInstructions?: RpcInnerInstructions[] | null } | null }> };
  return { ...parsed, transactions: parsed.transactions.map((entry, index) => { const rawEntry = raw.transactions[index]; return { ...entry, ...(rawEntry?.transaction ? { rawTransaction: rawEntry.transaction } : {}), rawInnerInstructions: rawEntry?.meta?.innerInstructions ?? null }; }) } satisfies RpcBlock;
}

export async function fetchConfirmedSlot(rpcUrl: string): Promise<number> {
  const value = await createSolanaRpc(rpcUrl).getSlot({ commitment: "confirmed" }).send({ abortSignal: AbortSignal.timeout(30_000) });
  const slot = Number(value);
  if (!Number.isSafeInteger(slot) || slot < 0) throw new Error("RPC getSlot returned an invalid confirmed slot");
  return slot;
}
