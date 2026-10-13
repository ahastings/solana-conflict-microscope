import { packRangePerBlocks, rangeReportHydrationScript } from '../src/range-report-data.js';
import { runInNewContext } from 'node:vm';
import { countOffsetInversions } from '../src/offset-order.js';
import { verifyRangeAnalysis } from '../src/verify-range.js';
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import { analyzeRange } from "../src/range-analyze.js";
import { acquireRange, type AcquiredRange } from "../src/range-input.js";
import { rangeOverviewCsv, rangeHtmlReport, rangeTerminalReport } from "../src/range-report.js";
import { htmlReport } from "../src/report.js";
import type { RangeSlotRecord } from "../src/range-types.js";
import type { RpcBlock, RpcParsedAccount } from "../src/types.js";

const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
const account = (pubkey: string, writable: boolean, signer = false): RpcParsedAccount => ({ pubkey, signer, writable, source: "transaction" });
const payer = (pubkey: string): RpcParsedAccount => account(pubkey, true, true);
type Write = { offset: number; length: number; buffer?: string; authority?: string; fill?: number };

function loaderBlock(writes: Write[], lifecycleType?: string): RpcBlock {
  const transactions: RpcBlock["transactions"] = writes.map((write, index) => ({
    transaction: { signatures: [`sig-${index}`], message: { accountKeys: [payer(`Payer-${index}`), account(write.buffer ?? "BufferA", true), account(write.authority ?? "AuthorityA", false), account(loader, false)], instructions: [{ programId: loader, program: "bpf-upgradeable-loader", parsed: { type: "write", info: { account: write.buffer ?? "BufferA", authority: write.authority ?? "AuthorityA", offset: write.offset, bytes: Buffer.alloc(write.length, write.fill ?? index + 1).toString("base64") } } }] } },
    meta: { err: null, fee: 5000, computeUnitsConsumed: 100 + index },
  }));
  if (lifecycleType) transactions.push({ transaction: { signatures: ["lifecycle"], message: { accountKeys: [payer("LifecyclePayer"), account("BufferA", true), account(loader, false)], instructions: [{ programId: loader, program: "bpf-upgradeable-loader", parsed: { type: lifecycleType, info: { account: "BufferA" } } }] } }, meta: { err: null, fee: 5000, computeUnitsConsumed: 50 } });
  return { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions };
}

function acquired(entries: Array<{ slot: number; writes?: Write[]; lifecycleType?: string; status?: RangeSlotRecord["status"] }>): AcquiredRange {
  const slots: RangeSlotRecord[] = entries.map((entry) => entry.status && entry.status !== "observed"
    ? { slot: entry.slot, status: entry.status, source: "none", attempts: 0, cachePath: null, error: null, analysis: null }
    : { slot: entry.slot, status: "observed", source: "cache", attempts: 0, cachePath: `slot-${entry.slot}.json`, error: null, analysis: analyzeBlock(loaderBlock(entry.writes ?? [], entry.lifecycleType), entry.slot, "fixture", { cluster: "test", endpoint: null, retrievedAt: "2026-01-01T00:00:00.000Z", sourceMode: "fixture", dataKind: "synthetic" }) });
  const values = (status: RangeSlotRecord["status"]): number[] => slots.filter((slot) => slot.status === status).map((slot) => slot.slot);
  return { slots, provenance: { endpoint: null, cluster: "test", requestedStartSlot: entries[0]!.slot, requestedEndSlot: entries.at(-1)!.slot, observedSlots: values("observed"), missingSlots: values("missing"), unavailableSlots: values("unavailable"), failedSlots: values("failed"), skippedSlots: values("skipped"), retrievalTime: "2026-01-01T00:00:00.000Z", sourceMode: "offline-cache", sourceProvenance: [] } };
}

test("cross-block writes stitch into one exact contiguous observed sequence", () => {
  const analysis = analyzeRange(acquired([{ slot: 10, writes: [{ offset: 0, length: 4 }, { offset: 4, length: 4 }] }, { slot: 11, writes: [{ offset: 8, length: 4 }] }]));
  const sequence = analysis.crossBlockSequences[0]!;
  assert.equal(sequence.status, "fully-observed-contiguous"); assert.equal(sequence.observedChunkCount, 3); assert.equal(sequence.observedByteCount, 12);
  assert.deepEqual(sequence.observedCoveredByteRanges, [{ firstByte: 0, lastByte: 11, byteCount: 12 }]); assert.deepEqual(sequence.missingByteRanges, []);
  assert.equal(sequence.perBlock.length, 2); assert.equal(sequence.perBlock[0]?.findingTitle, "2-transaction program-buffer upload"); assert.equal("percentage" in sequence.aggregateTotals, false);
});

test("whole-chunk gaps remain inferred and partial gaps do not invent a chunk count", () => {
  const whole = analyzeRange(acquired([{ slot: 10, writes: [{ offset: 0, length: 4 }] }, { slot: 11, writes: [{ offset: 12, length: 4 }] }])).crossBlockSequences[0]!;
  assert.deepEqual(whole.missingByteRanges, [{ firstByte: 4, lastByte: 11, byteCount: 8 }]); assert.equal(whole.hypotheses[0]?.suggestedChunkCount, 2); assert.equal(whole.hypotheses[0]?.confidence, "high"); assert.equal(whole.observedChunkCount, 2);
  const partial = analyzeRange(acquired([{ slot: 10, writes: [{ offset: 0, length: 4 }] }, { slot: 11, writes: [{ offset: 7, length: 4 }] }])).crossBlockSequences[0]!;
  assert.equal(partial.missingByteRanges[0]?.byteCount, 3); assert.equal(partial.hypotheses[0]?.suggestedChunkCount, null); assert.equal(partial.hypotheses[0]?.confidence, "low");
});

test("duplicates, overlaps, and varying chunk sizes are reported separately", () => {
  const duplicate = analyzeRange(acquired([{ slot: 10, writes: [{ offset: 0, length: 4, fill: 7 }] }, { slot: 11, writes: [{ offset: 0, length: 4, fill: 7 }] }])).crossBlockSequences[0]!;
  assert.equal(duplicate.duplicates.length, 1); assert.equal(duplicate.overlaps.length, 0);
  const overlap = analyzeRange(acquired([{ slot: 10, writes: [{ offset: 0, length: 5 }] }, { slot: 11, writes: [{ offset: 3, length: 3 }] }])).crossBlockSequences[0]!;
  assert.equal(overlap.overlaps[0]?.overlap.byteCount, 2); assert.equal(overlap.changingChunkSizes, true); assert.deepEqual(overlap.chunkSizes, [3, 5]);
});

test("authority changes separate groups and decoded lifecycle boundaries split reused buffers", () => {
  const changed = analyzeRange(acquired([{ slot: 10, writes: [{ offset: 0, length: 4, authority: "A" }] }, { slot: 11, writes: [{ offset: 4, length: 4, authority: "B" }] }]));
  assert.equal(changed.crossBlockSequences.length, 2); assert.equal(changed.crossBlockSequences.every((sequence) => sequence.authorityChangesDetected), true);
  const lifecycle = analyzeRange(acquired([{ slot: 10, writes: [{ offset: 0, length: 4 }] }, { slot: 11, writes: [{ offset: 4, length: 4 }], lifecycleType: "close" }, { slot: 12, writes: [{ offset: 0, length: 4 }] }]));
  assert.equal(lifecycle.crossBlockSequences.length, 2); assert.equal(lifecycle.crossBlockSequences.some((sequence) => sequence.lifecycleEvents.some((event) => event.type === "close")), true);
});

test("missing and skipped slots remain explicit and do not become byte evidence", () => {
  const analysis = analyzeRange(acquired([{ slot: 10, writes: [{ offset: 0, length: 4 }] }, { slot: 11, status: "missing" }, { slot: 12, status: "skipped" }, { slot: 13, writes: [{ offset: 8, length: 4 }] }]));
  const sequence = analysis.crossBlockSequences[0]!;
  assert.deepEqual(sequence.missingSlotData, [{ slot: 11, status: "missing" }, { slot: 12, status: "skipped" }]); assert.equal(sequence.unavailableOrSkippedSlotCount, 1); assert.equal(sequence.observedChunkCount, 2);
});

async function tempDir(): Promise<string> { await mkdir("output", { recursive: true }); return mkdtemp(join("output", "range-test-")); }
async function cacheFixture(directory: string, slot: number, writes: Write[]): Promise<void> {
  const provenance = { cluster: "test", endpoint: "http://example.invalid", retrievedAt: "2026-01-01T00:00:00.000Z", sourceMode: "range-cache", dataKind: "real-network" };
  await writeFile(join(directory, `slot-${slot}.json`), JSON.stringify({ provenance, slot, block: loaderBlock(writes) }, null, 2) + "\n");
}

test("cache-first acquisition is offline, resumable, and deterministic", async () => {
  const directory = await tempDir(); try {
    await cacheFixture(directory, 20, [{ offset: 0, length: 4 }]); let calls = 0;
    const options = { startSlot: 20, endSlot: 21, cacheDir: directory, rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false, skippedSlots: new Set([21]), fetchBlock: async () => { calls++; return null; }, now: () => "2026-02-02T00:00:00.000Z" };
    const first = await acquireRange(options), second = await acquireRange({ ...options, now: () => "2099-01-01T00:00:00.000Z" });
    assert.equal(calls, 0); assert.deepEqual(first, second); assert.equal(first.slots[0]?.source, "cache"); assert.equal(second.slots[1]?.source, "cache");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rate limiting uses bounded exponential backoff then caches success", async () => {
  const directory = await tempDir(); try {
    let calls = 0; const delays: number[] = [];
    const result = await acquireRange({ startSlot: 30, endSlot: 30, cacheDir: directory, rpcUrl: "http://rpc.test", offline: false, fetchMissing: true, maxRetries: 3, backoffMs: 10, delay: async (ms) => { delays.push(ms); }, now: () => "2026-01-01T00:00:00.000Z", fetchBlock: async () => { calls++; if (calls < 3) throw new Error("429 rate limit"); return loaderBlock([{ offset: 0, length: 4 }]); } });
    assert.equal(result.slots[0]?.status, "observed"); assert.equal(result.slots[0]?.attempts, 3); assert.deepEqual(delays, [10, 20]); assert.equal((await readFile(join(directory, "slot-30.json"), "utf8")).includes('"sourceMode": "range-cache"'), true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("reports are deterministic, semantic, accessible, and hide empty decoded sections", () => {
  const range = analyzeRange(acquired([{ slot: 10, writes: [{ offset: 0, length: 4 }] }, { slot: 11, writes: [{ offset: 4, length: 4 }] }]));
  const htmlA = rangeHtmlReport(range), htmlB = rangeHtmlReport(range); assert.equal(htmlA, htmlB); assert.match(htmlA, /observed/); assert.match(htmlA, /inferred alignment/); assert.match(htmlA, /skipped slot/); assert.doesNotMatch(htmlA, /component 0/);
  const empty = analyzeBlock(loaderBlock([]), 10, "fixture", { dataKind: "synthetic" }), single = htmlReport(empty);
  assert.doesNotMatch(single, /Decoded program-buffer write sequences/); assert.match(single, /Compute Units \(CU\) coverage/); assert.match(single, /Compute Units measure computational work consumed by Solana transactions\. They do not directly measure duration, throughput, waiting time, or validator utilization\./); assert.match(single, /tabindex="0"/);
});

test("cached devnet range resolves the 148 observed chunks without interpolation", async () => {
  const acquiredReal = await acquireRange({ startSlot: 488638500, endSlot: 488638508, cacheDir: "fixtures/loader-range", rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false });
  const analysis = analyzeRange(acquiredReal), sequence = analysis.crossBlockSequences.find((item) => item.observedChunkCount === 148)!;
  assert.ok(sequence); assert.equal(sequence.status, "fully-observed-contiguous"); assert.equal(sequence.firstOffset, 633872); assert.equal(sequence.lastCoveredByte, 769439); assert.equal(sequence.observedByteCount, 135568); assert.deepEqual(sequence.missingByteRanges, []); assert.deepEqual(sequence.hypotheses, []);
  assert.equal(sequence.perBlock.find((item) => item.slot === 488638500)?.chunkCount, 15); assert.equal(sequence.perBlock.find((item) => item.slot === 488638508)?.chunkCount, 17);
  assert.equal(sequence.chunks.filter((item) => item.slot > 488638500 && item.slot < 488638508).length, 116);
});

test("cross-block nested writes report every intersecting pair with exact lengths", () => {
  const sequence = analyzeRange(acquired([
    { slot: 10, writes: [{ offset: 0, length: 100 }, { offset: 10, length: 20 }] },
    { slot: 11, writes: [{ offset: 15, length: 30 }, { offset: 105, length: 5 }] },
  ])).crossBlockSequences[0]!;
  assert.deepEqual(sequence.overlaps.map(item => [item.earlier.offset, item.later.offset, item.overlap.byteCount]), [[0, 10, 20], [0, 15, 30], [10, 15, 15]]);
  assert.deepEqual(sequence.observedCoveredByteRanges, [{ firstByte: 0, lastByte: 99, byteCount: 100 }, { firstByte: 105, lastByte: 109, byteCount: 5 }]);
  assert.deepEqual(sequence.missingByteRanges, [{ firstByte: 100, lastByte: 104, byteCount: 5 }]);
});

test("cross-block coverage ignores empty, negative, and unsafe decoded ranges", () => {
  const sequence = analyzeRange(acquired([{ slot: 10, writes: [
    { offset: 0, length: 0 }, { offset: -4, length: 4 }, { offset: Number.MAX_SAFE_INTEGER, length: 3 }, { offset: 5, length: 2 },
  ] }])).crossBlockSequences[0]!;
  assert.equal(sequence.observedChunkCount, 1);
  assert.deepEqual(sequence.observedCoveredByteRanges, [{ firstByte: 5, lastByte: 6, byteCount: 2 }]);
});

test("corrupt cache is a preserved failure, never a missing slot or automatic refetch", async () => {
  await mkdir("output", { recursive: true });
  const directory = await mkdtemp(join("output", "range-corrupt-"));
  try {
    for (const bytes of ["not JSON", JSON.stringify({ slot: "7", block: loaderBlock([]) }), JSON.stringify({ slot: 8, block: loaderBlock([]) }), JSON.stringify({ slot: 7, block: {} })]) {
      const path = join(directory, "slot-7.json");
      await writeFile(path, bytes);
      for (const offline of [false, true]) {
        let calls = 0;
        const result = await acquireRange({ startSlot: 7, endSlot: 7, cacheDir: directory, rpcUrl: "http://127.0.0.1:1", offline, fetchMissing: !offline, fetchBlock: async () => { calls++; return loaderBlock([]); } });
        assert.equal(calls, 0);
        assert.deepEqual(result.provenance.failedSlots, [7]);
        assert.deepEqual(result.provenance.missingSlots, []);
        assert.equal(result.slots[0]!.source, "cache");
        assert.equal(result.slots[0]!.cachePath, "slot-7.json");
        assert.ok(result.slots[0]!.error);
        assert.equal(await readFile(path, "utf8"), bytes);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("invalid fetched blocks fail before cache creation and can be retried later", async () => {
  await mkdir("output", { recursive: true });
  const directory = await mkdtemp(join("output", "range-invalid-fetch-"));
  try {
    const options = { startSlot: 7, endSlot: 7, cacheDir: directory, rpcUrl: "http://127.0.0.1:1", offline: false, fetchMissing: true, maxRetries: 0 };
    const invalid = await acquireRange({ ...options, fetchBlock: async () => ({}) });
    assert.equal(invalid.slots[0]!.status, "failed");
    await assert.rejects(readFile(join(directory, "slot-7.json")), { code: "ENOENT" });
    const retry = await acquireRange({ ...options, fetchBlock: async () => loaderBlock([]) });
    assert.equal(retry.slots[0]!.status, "observed");
    assert.ok(await readFile(join(directory, "slot-7.json")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("invalid saved slot statuses are preserved as failures across fetch and skip modes", async () => {
  await mkdir("output", { recursive: true });
  const directory = await mkdtemp(join("output", "range-invalid-status-"));
  try {
    const path = join(directory, "slot-7.status.json");
    for (const bytes of ["broken JSON", JSON.stringify({ slot: "7", status: "unavailable", retrievedAt: "2026-01-01T00:00:00.000Z" }), JSON.stringify({ slot: 7, status: "observed", retrievedAt: "2026-01-01T00:00:00.000Z" }), JSON.stringify({ slot: 7, status: "skipped" })]) {
      await writeFile(path, bytes);
      for (const skip of [false, true]) for (const offline of [false, true]) {
        let calls = 0;
        const result = await acquireRange({ startSlot: 7, endSlot: 7, cacheDir: directory, rpcUrl: "http://127.0.0.1:1", offline, fetchMissing: !offline, skippedSlots: new Set(skip ? [7] : []), fetchBlock: async () => { calls++; return loaderBlock([]); } });
        assert.equal(calls, 0);
        assert.deepEqual(result.provenance.failedSlots, [7]);
        assert.deepEqual(result.provenance.missingSlots, []);
        assert.equal(result.slots[0]!.source, "cache");
        assert.equal(result.slots[0]!.cachePath, "slot-7.status.json");
        assert.ok(result.slots[0]!.error);
        assert.equal(await readFile(path, "utf8"), bytes);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("range reports expose requested-slot denominators and each non-observed state", () => {
  const analysis = analyzeRange(acquired([
    { slot: 10, writes: [{ offset: 0, length: 4 }] },
    { slot: 11, status: "missing" }, { slot: 12, status: "unavailable" },
    { slot: 13, status: "failed" }, { slot: 14, status: "skipped" },
    { slot: 15, writes: [{ offset: 4, length: 4 }] },
  ]));
  for (const report of [rangeHtmlReport(analysis), rangeTerminalReport(analysis)]) {
    assert.match(report, /Observed blocks: 2 of 6 requested slots/);
    assert.match(report, /observed: 2, missing: 1, unavailable: 1, failed: 1, skipped: 1/);
  }
  const html = rangeHtmlReport(analysis);
  assert.match(html, /not evidence of absent contention/);
  assert.match(html, /Per-block causal summary/);
  assert.doesNotMatch(html, /Nine-block causal summary/);
});

test("range payload coverage preserves successful, failed, and unknown transaction evidence", () => {
  const input = acquired([{ slot: 10, writes: [{ offset: 0, length: 4 }, { offset: 4, length: 4 }, { offset: 8, length: 4 }] }]);
  const block = loaderBlock([{ offset: 0, length: 4 }, { offset: 4, length: 4 }, { offset: 8, length: 4 }]);
  block.transactions[1]!.meta!.err = { InstructionError: [0, "InvalidArgument"] };
  block.transactions[2]!.meta = null;
  input.slots[0]!.analysis = analyzeBlock(block, 10, "fixture");
  const analysis = analyzeRange(input), sequence = analysis.crossBlockSequences[0]!;
  assert.deepEqual(sequence.chunks.map(chunk => chunk.transactionStatus), ["success", "failed", "unknown"]);
  assert.equal(sequence.observedChunkCount, 3);
  assert.equal(sequence.observedByteCount, 12);
  for (const report of [rangeTerminalReport(analysis), rangeHtmlReport(analysis)]) {
    assert.match(report, /1 successful, 1 failed, 1 unknown/);
    assert.match(report, /Byte coverage describes decoded payloads, not verified final buffer contents/);
  }
});

for (const status of ["success", "failed", "unknown"] as const) {
  test(`${status} lifecycle transactions retain status and only success establishes boundaries`, () => {
    const input = acquired([
      { slot: 10, lifecycleType: "initializeBuffer" },
      { slot: 11, writes: [{ offset: 0, length: 4 }] },
      { slot: 12, lifecycleType: "close" },
      { slot: 13, writes: [{ offset: 4, length: 4 }] },
    ]);
    for (const [index, type] of [[0, "initializeBuffer"], [2, "close"]] as const) {
      const block = loaderBlock([], type);
      if (status === "failed") block.transactions[0]!.meta!.err = { InstructionError: [0, "InvalidArgument"] };
      if (status === "unknown") block.transactions[0]!.meta = null;
      input.slots[index]!.analysis = analyzeBlock(block, input.slots[index]!.slot, "fixture");
    }
    const analysis = analyzeRange(input), first = analysis.crossBlockSequences[0]!;
    assert.equal(analysis.crossBlockSequences.length, status === "failed" ? 1 : 2);
    assert.equal(first.uploadStartBoundaryObserved, status === "success");
    assert.equal(first.uploadEndBoundaryObserved, status === "success");
    assert.equal(first.lifecycleCompleteness, status === "success" ? "complete" : "boundaries-unknown");
    assert.ok(first.lifecycleEvents.length >= 2);
    assert.ok(first.lifecycleEvents.every(event => event.transactionStatus === status));
    assert.match(rangeHtmlReport(analysis), new RegExp(`transaction 0 \\(${status}\\): RPC-decoded BPF Upgradeable Loader close`));
  });
}

test("range coverage rejects malformed payloads and hashes equivalent valid encodings identically", () => {
  const input = acquired([{ slot: 10, writes: [{ offset: 0, length: 1 }] }]);
  const analyzePayload = (bytes: string) => {
    const block = loaderBlock([{ offset: 0, length: 1 }]);
    const ix = block.transactions[0]!.transaction.message.instructions![0]!;
    assert.ok("parsed" in ix && ix.parsed && typeof ix.parsed === "object");
    (ix.parsed!.info as Record<string, unknown>).bytes = bytes;
    input.slots[0]!.analysis = analyzeBlock(block, 10, "fixture");
    return analyzeRange(input);
  };
  for (const bytes of ["AA!A", "A A", "AAAA\n", "A", "AAAA=", "AA=", "AA===", "AA==AAAA", "AB==", "AAB=", "____", "----"]) {
    const analysis = analyzePayload(bytes);
    assert.deepEqual(analysis.crossBlockSequences, [], bytes);
    for (const report of [rangeTerminalReport(analysis), rangeHtmlReport(analysis)]) {
      assert.match(report, /Slot 10, transaction #0, outer instruction 0: excluded from upload byte-range evidence/);
      assert.match(report, /not canonical standard Base64/);
    }
  }
  const padded = analyzePayload("AA==").crossBlockSequences[0]!;
  const unpadded = analyzePayload("AA").crossBlockSequences[0]!;
  assert.equal(padded.observedByteCount, 1);
  assert.deepEqual(padded.chunks, unpadded.chunks);
});

test("inner lifecycle events split uploads according to their outer parent position", () => {
  const block = loaderBlock([{ offset: 0, length: 4 }, { offset: 4, length: 4 }]);
  const first = block.transactions[0]!, secondWrite = block.transactions[1]!.transaction.message.instructions![0]!;
  const close = loaderBlock([], "close").transactions[0]!.transaction.message.instructions![0]!;
  first.transaction.message.instructions!.push({ programId: loader, accounts: [], data: "1" }, secondWrite);
  first.meta!.innerInstructions = [{ index: 1, instructions: [close] }];
  block.transactions = [first];
  const input = acquired([{ slot: 10 }]);
  input.slots[0]!.analysis = analyzeBlock(block, 10, "fixture");
  const analysis = analyzeRange(input);
  assert.equal(analysis.crossBlockSequences.length, 2);
  const [before, after] = analysis.crossBlockSequences;
  assert.equal(before!.uploadEndBoundaryObserved, true);
  assert.equal(before!.chunks[0]!.instructionIndex, 0);
  assert.equal(after!.chunks[0]!.instructionIndex, 2);
  assert.equal(before!.lifecycleEvents[0]!.location, "inner");
  assert.equal(before!.lifecycleEvents[0]!.parentInstructionIndex, 1);
  assert.match(rangeHtmlReport(analysis), /inner instruction 0 \(parent 1\)/);
});

test("inner upload order retains local indexes and parents before later outer instructions", () => {
  const block = loaderBlock([{ offset: 8, length: 4 }, { offset: 0, length: 4 }]);
  const first = block.transactions[0]!, innerWrite = first.transaction.message.instructions![0]!;
  first.transaction.message.instructions = [{ programId: loader, accounts: [], data: "1" }, block.transactions[1]!.transaction.message.instructions![0]!];
  first.meta!.innerInstructions = [{ index: 0, instructions: [innerWrite] }];
  block.transactions = [first];
  const input = acquired([{ slot: 10 }]);
  input.slots[0]!.analysis = analyzeBlock(block, 10, "fixture");
  const sequence = analyzeRange(input).crossBlockSequences[0]!;
  assert.equal(sequence.blockOrderOffsetInversionCount, 1);
  assert.deepEqual(sequence.transactionOrderedChunkIndexes.map(item => [item.location, item.parentInstructionIndex, item.instructionIndex, item.offset]), [["inner", 0, 0, 8], ["outer", null, 1, 0]]);
  assert.deepEqual(sequence.perBlock[0]!.transactionOrderedChunkIndexes.map(item => [item.location, item.parentInstructionIndex, item.instructionIndex]), [["inner", 0, 0], ["outer", null, 1]]);
});

test("equal inner indexes under different parents remain distinct and precede a later close", () => {
  const block = loaderBlock([{ offset: 0, length: 4 }, { offset: 4, length: 4 }]);
  const first = block.transactions[0]!, write0 = first.transaction.message.instructions![0]!, write1 = block.transactions[1]!.transaction.message.instructions![0]!;
  const close = loaderBlock([], "close").transactions[0]!.transaction.message.instructions![0]!;
  first.transaction.message.instructions = [{ programId: loader, accounts: [], data: "1" }, { programId: loader, accounts: [], data: "1" }, close];
  first.meta!.innerInstructions = [{ index: 1, instructions: [write1] }, { index: 0, instructions: [write0] }];
  block.transactions = [first];
  const input = acquired([{ slot: 10 }]);
  input.slots[0]!.analysis = analyzeBlock(block, 10, "fixture");
  const sequence = analyzeRange(input).crossBlockSequences[0]!;
  assert.equal(sequence.uploadEndBoundaryObserved, true);
  assert.equal(sequence.observedChunkCount, 2);
  assert.equal(sequence.blockOrderOffsetInversionCount, 0);
  assert.deepEqual(sequence.transactionOrderedChunkIndexes.map(item => [item.parentInstructionIndex, item.instructionIndex]), [[0, 0], [1, 0]]);
});

test("range chunk inspection retains the recorded transaction error with exact instruction evidence", () => {
  const input = acquired([{ slot: 10, writes: [{ offset: 0, length: 4 }] }]);
  const block = loaderBlock([{ offset: 0, length: 4 }]);
  const error = { InstructionError: [0, { Custom: 42 }] };
  block.transactions[0]!.meta!.err = error;
  input.slots[0]!.analysis = analyzeBlock(block, 10, "fixture");
  const report = rangeHtmlReport(analyzeRange(input));
  const view = JSON.parse(report.match(/const rangeData=(.+);const view=rangeData.view;/)![1]!).view;
  assert.deepEqual(view.sequences[0].chunks[0].executionError, error);
  assert.equal(view.sequences[0].chunks[0].instruction.parsedType, "write");
  assert.equal(view.sequences[0].chunks[0].transactionStatus, "failed");
});


test("cross-block compute totals reject overflow even when each block is exact", () => {
  const input = acquired([{ slot: 10, writes: [{ offset: 0, length: 4 }] }, { slot: 11, writes: [{ offset: 4, length: 4 }] }]);
  const first = loaderBlock([{ offset: 0, length: 4 }]);
  first.transactions[0]!.meta!.computeUnitsConsumed = Number.MAX_SAFE_INTEGER - 1;
  input.slots[0]!.analysis = analyzeBlock(first, 10, "fixture");
  const second = loaderBlock([{ offset: 4, length: 4 }]);
  second.transactions[0]!.meta!.computeUnitsConsumed = 1;
  input.slots[1]!.analysis = analyzeBlock(second, 11, "fixture");
  assert.equal(analyzeRange(input).crossBlockSequences[0]!.aggregateTotals.knownComputeUnits, Number.MAX_SAFE_INTEGER);
  second.transactions[0]!.meta!.computeUnitsConsumed = 3;
  input.slots[1]!.analysis = analyzeBlock(second, 11, "fixture");
  assert.throws(() => analyzeRange(input), /Compute Units total exceeds the safe-integer range/);
});


test("independent range verification preserves absent slots and rejects ledger corruption", () => {
  const observed = analyzeBlock(loaderBlock([{offset:0,length:4}]),10,'fixture');
  const original = {provenance:{requestedStartSlot:10,requestedEndSlot:14,observedSlots:[10],missingSlots:[11],skippedSlots:[12],unavailableSlots:[13],failedSlots:[14]},slots:[
    {slot:10,status:'observed',analysis:observed},
    ...['missing','skipped','unavailable','failed'].map((status,index)=>({slot:11+index,status,analysis:null})),
  ]};
  const verified = verifyRangeAnalysis(original);
  assert.equal(verified.observedBlocks,1);
  assert.deepEqual(verified.slotStates,{observed:1,missing:1,skipped:1,unavailable:1,failed:1});
  const changes: Array<(value: typeof original) => void> = [
    value=>{value.slots.pop()},
    value=>{value.provenance.observedSlots=[]},
    value=>{value.provenance.missingSlots=[11,11]},
    value=>{value.provenance.skippedSlots=[99]},
    value=>{value.provenance.unavailableSlots=[14]},
    value=>{value.provenance.failedSlots=[10]},
    value=>{value.slots[1]!.slot=10},
    value=>{value.slots.reverse()},
    value=>{value.slots[0]!.status='missing'},
    value=>{value.slots[1]!.status='observed'},
    value=>{value.slots[1]!.status='invented'},
    value=>{value.slots[0]!.analysis!.context.slot=11},
    value=>{value.slots[0]!.analysis!.summary.totalKnownComputeUnits++},
    value=>{value.provenance.requestedEndSlot=9},
    value=>{value.provenance.requestedStartSlot=-1},
    value=>{value.provenance.requestedEndSlot=14.5},
    value=>{value.provenance.requestedStartSlot=0;value.provenance.requestedEndSlot=Number.MAX_SAFE_INTEGER},
  ];
  for (const change of changes) {const copy=structuredClone(original);change(copy);assert.throws(()=>verifyRangeAnalysis(copy),/Range verification failed/)}
  const absent=structuredClone(original);absent.slots[0]!.status='unavailable';absent.slots[0]!.analysis=null;
  absent.provenance.observedSlots=[];absent.provenance.unavailableSlots=[10,13];
  assert.equal(verifyRangeAnalysis(absent).observedBlocks,0);
  const reversed=structuredClone(absent);reversed.provenance.unavailableSlots.reverse();
  assert.throws(()=>verifyRangeAnalysis(reversed),/unavailableSlots/);
  for (const field of ['observedSlots','missingSlots','skippedSlots','unavailableSlots','failedSlots']) {
    for (const value of [undefined,null,'10',[10.5],['10'],new Array(1)]) {
      const copy=structuredClone(original);Object.assign(copy.provenance,{[field]:value});
      assert.throws(()=>verifyRangeAnalysis(copy),/Range verification failed/);
    }
  }
  assert.equal(verifyRangeAnalysis(absent).requestedSlots,5);
  assert.throws(()=>verifyRangeAnalysis(null),/range must be an object/);
});

test("range verification CLI is read-only and identifies a corrupt embedded block", async (t) => {
  const {tmpdir}=await import('node:os'),{spawnSync}=await import('node:child_process'),{fileURLToPath}=await import('node:url');
  const root=await mkdtemp(join(tmpdir(),'range-certificate-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'range.json'),script=fileURLToPath(new URL('../scripts/verify-range.ts',import.meta.url));
  const value={provenance:{requestedStartSlot:10,requestedEndSlot:10,observedSlots:[10],missingSlots:[],skippedSlots:[],unavailableSlots:[],failedSlots:[]},slots:[{slot:10,status:'observed',analysis:analyzeBlock(loaderBlock([]),10,'fixture')}]};
  const bytes=JSON.stringify(value);await writeFile(path,bytes);
  const valid=spawnSync(process.execPath,['--import','tsx',script,'--analysis',path],{encoding:'utf8'});
  assert.equal(valid.status,0,valid.stderr);const result=JSON.parse(valid.stdout);
  assert.equal(result.observedBlocks,1);assert.match(result.analysisSha256,/^[a-f0-9]{64}$/);
  assert.equal(await readFile(path,'utf8'),bytes);
  const { createHash } = await import('node:crypto');
  const marked = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(bytes)]);
  await writeFile(path, marked);
  const bom = spawnSync(process.execPath,['--import','tsx',script,'--analysis',path],{encoding:'utf8'});
  assert.equal(bom.status,0,bom.stderr);
  assert.equal(JSON.parse(bom.stdout).analysisSha256,createHash('sha256').update(marked).digest('hex'));
  assert.notEqual(JSON.parse(bom.stdout).analysisSha256,JSON.parse(valid.stdout).analysisSha256);
  assert.deepEqual(await readFile(path),marked);
  const malformed = '{"padding":"' + 'x'.repeat(20000) + '",}';
  await writeFile(path,malformed);
  const syntax = spawnSync(process.execPath,['--import','tsx',script,'--analysis',path],{encoding:'utf8'});
  assert.notEqual(syntax.status,0);
  assert.equal(syntax.stdout,'');
  assert.ok(syntax.stderr.length < 1000,'Malformed JSON must not dump the entire input line');
  assert.doesNotMatch(syntax.stderr,/\n\s+at |Node\.js v/);
  assert.equal(await readFile(path,'utf8'),malformed);
  value.slots[0]!.analysis.summary.totalKnownComputeUnits=1;
  const corrupt=JSON.stringify(value);await writeFile(path,corrupt);
  const invalid=spawnSync(process.execPath,['--import','tsx',script,'--analysis',path],{encoding:'utf8'});
  assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/failed at slot 10/);
  assert.doesNotMatch(invalid.stderr,/\n\s+at |Node\.js v/);
  assert.equal(invalid.stdout,'');
  assert.equal(await readFile(path,'utf8'),corrupt);
  for (const args of [[],['--analysis',' '],['--analysis',path,'--analysis',path],['--unknown']]) {
    assert.notEqual(spawnSync(process.execPath,['--import','tsx',script,...args],{encoding:'utf8'}).status,0);
  }
});


test("blank decoded upload identities cannot create cross-block sequences", () => {
  for (const field of ['account','authority']) for (const blank of ['', ' \t\n']) {
    const input = acquired([{slot:10,writes:[]},{slot:11,writes:[]}]);
    for (const entry of input.slots) {
      const block = loaderBlock([{offset:0,length:4}]);
      const instruction = block.transactions[0]!.transaction.message.instructions![0]!;
      assert.ok('parsed' in instruction && instruction.parsed && typeof instruction.parsed === 'object');
      const info = instruction.parsed.info as Record<string,unknown>;info[field]=blank;
      entry.analysis = analyzeBlock(block,entry.slot,'fixture');
      assert.deepEqual(entry.analysis.transactions[0]!.instructions[0]!.parsedInfo,info);
    }
    const analysis = analyzeRange(input);
    assert.deepEqual(analysis.crossBlockSequences,[]);
    for (const report of [rangeTerminalReport(analysis),rangeHtmlReport(analysis)]) assert.match(report,/identifier is blank/);
  }
});


test("offset inversion count matches exhaustive pair counts with ties and retains input order", () => {
  let cases=0;
  for (let length=0;length<=7;length++) for (let code=0;code<3**length;code++) {
    let digits=code;
    const offsets=Array.from({length},()=>{const value=digits%3;digits=Math.floor(digits/3);return value});
    const original=[...offsets];let expected=0;
    for (let left=0;left<length;left++) for (let right=left+1;right<length;right++) if (offsets[left]!>offsets[right]!) expected++;
    assert.equal(countOffsetInversions(offsets),expected);assert.deepEqual(offsets,original);cases++;
  }
  assert.equal(cases,3280);
  const descending=Array.from({length:10000},(_,index)=>10000-index);
  assert.equal(countOffsetInversions(descending),10000*9999/2);
  assert.equal(countOffsetInversions([Number.MAX_SAFE_INTEGER,0,Number.MAX_SAFE_INTEGER]),1);
  for (const value of [-1,0.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>countOffsetInversions([value]),/Offsets must be/);
});


test("range block overview distinguishes recorded zero compute from an empty block", () => {
  const input=acquired([{slot:10,writes:[{offset:0,length:4}]},{slot:11,writes:[]}]);
  const zero=loaderBlock([{offset:0,length:4}]);zero.transactions[0]!.meta!.computeUnitsConsumed=0;
  input.slots[0]!.analysis=analyzeBlock(zero,10,'fixture');
  const html=rangeHtmlReport(analyzeRange(input));
  const first=html.split('<tr data-overview-slot="10">')[1]!.split('</tr>')[0]!;
  const empty=html.split('<tr data-overview-slot="11">')[1]!.split('</tr>')[0]!;
  assert.match(first, /data-field="transactions">1</);assert.match(first, /data-field="compute">0 known CU · 0 unknown</);
  assert.match(empty, /data-field="transactions">0</);assert.match(empty, /data-field="compute">0 known CU · 0 unknown</);
  assert.match(empty, /data-field="bounds">0-0 \(proven 0\)</);
});


test("range overview CSV preserves missing, unknown, zero, and unproven values", () => {
  const input=acquired([{slot:10,writes:[]},{slot:11,writes:[]},{slot:12,writes:[]},{slot:13,status:'missing'}]);
  const zero=loaderBlock([{offset:0,length:4}]);zero.transactions[0]!.meta!.computeUnitsConsumed=0;
  const unknown=structuredClone(zero);unknown.transactions[0]!.meta=null;
  input.slots[0]!.analysis=analyzeBlock(zero,10,'fixture');input.slots[1]!.analysis=analyzeBlock(unknown,11,'fixture');
  const analysis=analyzeRange(input),csv=rangeOverviewCsv(analysis),rows=csv.trimEnd().split('\r\n').map(row=>row.split(','));
  assert.equal(rows[0]!.length,14);
  assert.deepEqual(rows[1],['10','observed','1','1','0','0','0','1','0','0','1','1','1','1']);
  assert.deepEqual(rows[2],['11','observed','1','0','0','1','','0','1','0','1','1','1','1']);
  assert.deepEqual(rows[3],['12','observed','0','0','0','0','0','0','0','0','0','0','0','0']);
  assert.deepEqual(rows[4],['13','missing',...Array(12).fill('')]);
  analysis.slots[0]!.analysis!.blockWaveBounds.provenMinimumWaveCount=null;
  assert.equal(rangeOverviewCsv(analysis).split('\r\n')[1]!.split(',')[12],'');
  assert.ok(csv.endsWith('\r\n'));
});


test("range parent-link evidence distinguishes matches, absent parents, and contradictions", () => {
  const input=acquired([{slot:10,writes:[]},{slot:11,status:'skipped'},{slot:12,writes:[]},{slot:13,writes:[]},{slot:14,writes:[]},{slot:15,writes:[]}]);
  const at=(slot:number)=>input.slots.find(record=>record.slot===slot)!.analysis!.context;
  Object.assign(at(10),{parentSlot:9,blockhash:'parent-ten',previousBlockhash:'outside'});
  Object.assign(at(12),{parentSlot:10,blockhash:'parent-twelve',previousBlockhash:'parent-ten'});
  Object.assign(at(13),{parentSlot:12,blockhash:'parent-thirteen',previousBlockhash:'contradiction'});
  Object.assign(at(14),{parentSlot:14,blockhash:'self',previousBlockhash:'self'});
  Object.assign(at(15),{parentSlot:11,blockhash:'parent-fifteen',previousBlockhash:'missing'});
  const analysis=analyzeRange(input),links=analysis.parentLinks!;
  assert.deepEqual(links.links.map(link=>[link.slot,link.status]),[[10,'parent-unavailable'],[12,'matched'],[13,'hash-mismatch'],[14,'nonpreceding-parent'],[15,'parent-unavailable']]);
  assert.equal(links.matchedCount,1);assert.equal(links.mismatchCount,1);assert.equal(links.unavailableCount,2);assert.equal(links.nonprecedingCount,1);
  assert.equal(links.links[2]!.previousBlockhash,'contradiction');assert.equal(links.links[2]!.observedParentBlockhash,'parent-twelve');
  assert.match(rangeHtmlReport(analysis),/Inconsistent parent references were found/);
  assert.match(rangeTerminalReport(analysis),/1 hash mismatches, 2 parent unavailable/);
  // Older saved ranges without derived parentLinks still receive the comparison in reports.
  delete analysis.parentLinks;assert.match(rangeHtmlReport(analysis),/Inconsistent parent references were found/);
});


test("matching parent hashes do not hide bypassed observed blocks", () => {
  const input=acquired([{slot:10,writes:[]},{slot:11,writes:[]},{slot:12,writes:[]}]);
  for (const record of input.slots) Object.assign(record.analysis!.context,{blockhash:'hash-'+record.slot,parentSlot:10,previousBlockhash:'hash-10'});
  input.slots[0]!.analysis!.context.parentSlot=9;
  const analysis=analyzeRange(input),links=analysis.parentLinks!;
  assert.equal(links.matchedCount,2);assert.equal(links.mismatchCount,0);assert.equal(links.bypassingCount,1);
  assert.equal(links.links[2]!.bypassedObservedSlotCount,1);assert.equal(links.links[2]!.firstBypassedObservedSlot,11);
  assert.match(rangeHtmlReport(analysis),/Inconsistent parent references were found/);
  assert.match(rangeTerminalReport(analysis),/1 links bypass earlier observed slots/);
  // A skipped slot is not an observed block and must not create this warning.
  input.slots[1]!.status='skipped';input.slots[1]!.analysis=null;
  const gap=analyzeRange(input);assert.equal(gap.parentLinks!.bypassingCount,0);
  assert.doesNotMatch(rangeHtmlReport(gap),/Inconsistent parent references were found/);
  // A parent outside the range still identifies which observed blocks were bypassed.
  input.slots[2]!.analysis!.context.parentSlot=8;
  const outside=analyzeRange(input);assert.equal(outside.parentLinks!.links[1]!.status,'parent-unavailable');
  assert.equal(outside.parentLinks!.links[1]!.firstBypassedObservedSlot,10);
});


test("range HTML model packing is lossless and preserves differing evidence", () => {
  const analysis=analyzeRange(acquired([{slot:10,writes:[{offset:0,length:4},{offset:4,length:4}]},{slot:11,writes:[{offset:8,length:4}]}]));
  const original=analysis.crossBlockSequences.map(sequence=>sequence.perBlock);
  original.push(structuredClone(original[0]!));
  original[1]![0]!.componentCausalAblation!.models[0]!.interpretation+=' independently supplied </script> evidence';
  original[1]![0]!.counterfactualModels[0]!.retainedConflictAtoms=[];
  original[1]![1]!.componentCausalAblation=null;
  const before=JSON.stringify(original),packed=packRangePerBlocks(original);
  assert.equal(JSON.stringify(original),before,"Packing must not mutate source evidence");
  const rangeData={view:{sequences:packed.blocks.map(perBlock=>({perBlock}))},groups:packed.groups,retainedAtoms:packed.retainedAtoms,references:packed.references};
  const restored=runInNewContext(rangeReportHydrationScript+';JSON.stringify(view.sequences.map(sequence=>sequence.perBlock))',{rangeData:JSON.parse(JSON.stringify(rangeData))});
  assert.equal(restored,before);
  assert.ok(JSON.stringify(rangeData).length<before.length);
  const empty=packRangePerBlocks([]);assert.deepEqual(empty,{blocks:[],groups:[],retainedAtoms:[],references:[]});
});


test("cross-block sequence IDs distinguish delimiter-bearing identities", () => {
  const input=acquired([{slot:10,writes:[{buffer:'A:B',authority:'C',offset:0,length:4},{buffer:'A',authority:'B:C',offset:0,length:4},{buffer:'A%3AB',authority:'C',offset:0,length:4}]}]);
  const sequences=analyzeRange(input).crossBlockSequences;
  assert.equal(sequences.length,3);assert.equal(new Set(sequences.map(sequence=>sequence.id)).size,3);
});

test("range upload exclusion preserves exact residual depth across all four-node graphs", () => {
  const pairs: Array<[number, number]> = [];
  for (let left = 0; left < 4; left++) for (let right = left + 1; right < 4; right++) pairs.push([left, right]);
  for (let mask = 0; mask < 64; mask++) {
    const edges = pairs.filter((_, bit) => (mask & (1 << bit)) !== 0);
    // Independent exhaustive coloring oracle for the unrelated four-node graph.
    let minimum = 4;
    const colors: number[] = [];
    const visit = (node: number, used: number): void => {
      if (node === 4) { minimum = Math.min(minimum, used); return; }
      for (let color = 0; color <= used && color < minimum; color++) {
        if (edges.some(([left, right]) => right === node && colors[left] === color)) continue;
        colors[node] = color;
        visit(node + 1, Math.max(used, color + 1));
      }
    };
    visit(0, 0);
    const block = loaderBlock([{ offset: 0, length: 4 }, { offset: 4, length: 4 }]);
    for (let node = 0; node < 4; node++) {
      const accesses = [payer("IndependentPayer-" + node), ...edges.filter(pair => pair.includes(node)).map(([left, right]) => account("Edge-" + left + "-" + right, node === left))];
      block.transactions.push({ transaction: { signatures: ["independent-" + node], message: { accountKeys: accesses, instructions: [] } }, meta: { err: null, fee: 0, computeUnitsConsumed: 0 } });
    }
    const input = acquired([{ slot: 10, writes: [] }, { slot: 11, writes: [{ offset: 8, length: 4 }] }]);
    input.slots[0]!.analysis = analyzeBlock(block, 10, "fixture");
    const sequence = analyzeRange(input).crossBlockSequences[0]!;
    const first = sequence.perBlock.find(item => item.slot === 10)!;
    assert.equal(first.depthAfterExcludingUploadComponent, minimum, "graph " + mask);
    assert.equal(first.fullBlockDepthDifference, Math.max(2, minimum) - minimum, "graph " + mask);
    assert.equal(sequence.perBlock.find(item => item.slot === 11)!.depthAfterExcludingUploadComponent, 0);
  }
});
