import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { normalizeBlock } from "../src/normalize.js";
import { BlockUnavailableError, fetchParsedBlock, MAX_SUPPORTED_TRANSACTION_VERSION } from "../src/rpc.js";
import type { RpcBlock } from "../src/types.js";

const program = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
function pair(versioned = false) {
  const identity = { blockhash: "same-block", previousBlockhash: "previous-block", parentSlot: 1 };
  const parsed = { ...identity, transactions: [0, 1].map((index) => ({
    transaction: { signatures: ["signature-" + index], message: {
      accountKeys: [{ pubkey: "P" + index, signer: true, writable: true, source: "transaction" }, { pubkey: program, signer: false, writable: false, source: "transaction" }, ...(versioned ? [{ pubkey: "Loaded", signer: false, writable: true, source: "lookupTable" }] : [])],
      instructions: [{ programId: program, accounts: [versioned ? "Loaded" : "P" + index], data: "123" }],
    } }, meta: { err: null, fee: 5000 }, version: versioned ? 0 : "legacy",
  })) };
  const raw = { ...identity, transactions: [0, 1].map((index) => ({
    transaction: { signatures: ["signature-" + index], message: {
      accountKeys: ["P" + index, program],
      instructions: [{ programIdIndex: 1, accounts: [versioned ? 2 : 0], data: "123" }],
    } }, meta: { err: null, fee: 5000, ...(versioned ? { loadedAddresses: { writable: ["Loaded"], readonly: [] } } : {}) }, version: versioned ? 0 : "legacy",
  })) };
  return { parsed, raw };
}

async function fetchPair(parsed: unknown, raw: unknown): Promise<RpcBlock> {
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    const rpc = JSON.parse(body) as { id: unknown; params: [number, { encoding: string; maxSupportedTransactionVersion: number }] };
    assert.equal(rpc.params[0], 2);
    assert.equal(rpc.params[1].maxSupportedTransactionVersion, MAX_SUPPORTED_TRANSACTION_VERSION);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: rpc.params[1].encoding === "jsonParsed" ? parsed : raw }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try { return await fetchParsedBlock(2, "http://127.0.0.1:" + address.port) as RpcBlock; }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("matching legacy responses attach raw instructions to the matching transaction", async () => {
  const { parsed, raw } = pair();
  const merged = await fetchPair(parsed, raw);
  assert.equal(merged.blockhash, "same-block");
  assert.deepEqual(merged.transactions.map((entry) => entry.transaction.signatures), [["signature-0"], ["signature-1"]]);
  assert.deepEqual(merged.transactions[0]!.rawTransaction!.message.instructions, raw.transactions[0]!.transaction.message.instructions);
  assert.deepEqual(normalizeBlock(merged, 2).map((entry) => entry.instructions[0]!.accountAddresses), [["P0"], ["P1"]]);
});

test("matching v0 responses resolve loaded instruction accounts from parsed expanded keys", async () => {
  const { parsed, raw } = pair(true);
  const merged = await fetchPair(parsed, raw);
  assert.equal(merged.transactions[0]!.rawTransaction!.message.accountKeys!.length, 2);
  const [transaction] = normalizeBlock(merged, 2);
  assert.deepEqual(transaction!.loadedAccountKeys, ["Loaded"]);
  assert.deepEqual(transaction!.instructions[0]!.accountAddresses, ["Loaded"]);
});

test("different block identity fields fail closed before combining encodings", async () => {
  for (const field of ["blockhash", "previousBlockhash", "parentSlot"] as const) {
    const { parsed, raw } = pair();
    if (field === "parentSlot") raw.parentSlot = 0; else raw[field] = "fork-value";
    await assert.rejects(fetchPair(parsed, raw), /refer to different blocks/);
  }
});

test("reordered or dropped transactions and changed ordered signatures fail closed", async () => {
  const reordered = pair(); reordered.raw.transactions.reverse();
  await assert.rejects(fetchPair(reordered.parsed, reordered.raw), /transaction signatures differ at index 0/);
  const dropped = pair(); dropped.raw.transactions.pop();
  await assert.rejects(fetchPair(dropped.parsed, dropped.raw), /different transaction counts/);
  const multi = pair(); multi.parsed.transactions[0]!.transaction.signatures.push("cosigner"); multi.raw.transactions[0]!.transaction.signatures.unshift("cosigner");
  await assert.rejects(fetchPair(multi.parsed, multi.raw), /transaction signatures differ at index 0/);
});

test("missing, empty, or malformed signature lists cannot be paired", async () => {
  for (const side of ["parsed", "raw"] as const) for (const signatures of [undefined, [], [null], [""]]) {
    const input = pair();
    const transaction = input[side].transactions[0]!.transaction as { signatures?: unknown };
    if (signatures === undefined) delete transaction.signatures; else transaction.signatures = signatures;
    await assert.rejects(fetchPair(input.parsed, input.raw), /requires a nonempty signature list/);
  }
});

test("missing required block and transaction envelope fields fail clearly", async () => {
  for (const side of ["parsed", "raw"] as const) {
    const missingTransactions = pair(); delete (missingTransactions[side] as { transactions?: unknown }).transactions;
    await assert.rejects(fetchPair(missingTransactions.parsed, missingTransactions.raw), /transactions array is required/);
    const missingInstructions = pair(); delete (missingInstructions[side].transactions[0]!.transaction.message as { instructions?: unknown }).instructions;
    await assert.rejects(fetchPair(missingInstructions.parsed, missingInstructions.raw), /requires accountKeys and instructions arrays/);
    const missingMeta = pair(); delete (missingMeta[side].transactions[0] as { meta?: unknown }).meta;
    await assert.rejects(fetchPair(missingMeta.parsed, missingMeta.raw), /requires null metadata or an err/);
    const invalidParent = pair(); (invalidParent[side] as { parentSlot: unknown }).parentSlot = -1;
    await assert.rejects(fetchPair(invalidParent.parsed, invalidParent.raw), /valid block identity fields are required/);
  }
  const input = pair();
  await assert.rejects(fetchPair([], input.raw), /valid block identity fields are required/);
  await assert.rejects(fetchPair(input.parsed, {}), /valid block identity fields are required/);
});

test("truncated raw instruction lists cannot silently leave parsed instructions unpaired", async () => {
  const { parsed, raw } = pair(); raw.transactions[0]!.transaction.message.instructions.pop();
  await assert.rejects(fetchPair(parsed, raw), /instruction counts differ at transaction #0/);
});

test("null blocks remain unavailable and valid matching empty blocks remain empty", async () => {
  const input = pair();
  for (const [parsed, raw] of [[null, input.raw], [input.parsed, null], [null, null]]) await assert.rejects(fetchPair(parsed, raw), (error: unknown) => error instanceof BlockUnavailableError && error.slot === 2);
  input.parsed.transactions.length = 0; input.raw.transactions.length = 0;
  assert.deepEqual((await fetchPair(input.parsed, input.raw)).transactions, []);
});

function versionOnePair() {
  const input = pair();
  for (const block of [input.parsed, input.raw]) for (const entry of block.transactions) {
    entry.version = 1;
    Object.assign(entry.transaction.message, { transactionConfig: { computeUnitLimit: 30000, heapSize: null, loadedAccountsDataSizeLimit: 200000, priorityFee: 500 } });
    Object.assign(entry.meta, { computeUnitsConsumed: 123 });
  }
  return input;
}

test("v1 keeps declared accounts and recorded CU semantics with inline transaction configuration", async () => {
  const input = versionOnePair();
  const merged = await fetchPair(input.parsed, input.raw);
  assert.equal(merged.transactions[0]!.version, 1);
  const normalized = normalizeBlock(merged, 2);
  assert.deepEqual(normalized.map((tx) => tx.writeSet), [["P0"], ["P1"]]);
  assert.deepEqual(normalized.map((tx) => tx.readSet), [[program], [program]]);
  assert.deepEqual(normalized.map((tx) => tx.computeUnitsConsumed), [123, 123]);
  assert.deepEqual(normalized.map((tx) => tx.feeLamports), [5000, 5000]);
  assert.equal("transactionConfig" in normalized[0]!, false);
});

test("mixed legacy, v0, and v1 blocks retain each matched transaction", async () => {
  const input = pair(); const zero = pair(true); const one = versionOnePair();
  input.parsed.transactions.push(zero.parsed.transactions[0]!, one.parsed.transactions[0]!);
  input.raw.transactions.push(zero.raw.transactions[0]!, one.raw.transactions[0]!);
  const merged = await fetchPair(input.parsed, input.raw);
  assert.deepEqual(merged.transactions.map((entry) => entry.version), ["legacy", "legacy", 0, 1]);
  const normalized = normalizeBlock(merged, 2);
  assert.deepEqual(normalized[2]!.loadedAccountKeys, ["Loaded"]);
  assert.deepEqual(normalized[3]!.loadedAccountKeys, []);
});

test("RPC requires supported transaction versions and matching versions before merging", async () => {
  for (const side of ["parsed", "raw"] as const) for (const version of [undefined, null, -1, 2, 1.5, "1"]) {
    const input = pair();
    const entry = input[side].transactions[0] as { version?: unknown };
    if (version === undefined) delete entry.version; else entry.version = version;
    await assert.rejects(fetchPair(input.parsed, input.raw), /requires a supported version/);
  }
  const mismatched = pair(); mismatched.raw.transactions[0]!.version = 1;
  await assert.rejects(fetchPair(mismatched.parsed, mismatched.raw), /transaction versions differ at index 0/);
});

test("offline normalization permits absent historical versions and rejects explicitly unsupported versions", () => {
  const input = pair().parsed;
  input.transactions.forEach((entry) => { delete (entry as { version?: unknown }).version; });
  assert.equal(normalizeBlock(input, 2).length, 2);
  for (const version of [null, -1, 2, 1.5, "1"]) {
    (input.transactions[0] as { version?: unknown }).version = version;
    assert.throws(() => normalizeBlock(input, 2), /unsupported transaction version/);
  }
});
