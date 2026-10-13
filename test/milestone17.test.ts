import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import { validateMilestone172Handoff } from "../src/handoff.js";
import { analyzeRange } from "../src/range-analyze.js";
import { acquireRange, type AcquiredRange } from "../src/range-input.js";
import { rangeHtmlReport } from "../src/range-report.js";
import { htmlReport } from "../src/report.js";
import type { RangeSlotRecord } from "../src/range-types.js";
import type { RpcBlock, RpcParsedAccount } from "../src/types.js";

const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
const account = (pubkey: string, writable: boolean, signer = false): RpcParsedAccount => ({ pubkey, writable, signer, source: "transaction" });
const payer = (pubkey: string): RpcParsedAccount => account(pubkey, true, true);

function writeBlock(writes: Array<{ offset: number; length: number; payer?: string; unknownTouch?: boolean }>): RpcBlock {
  return { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions: writes.map((write, index) => ({
    transaction: { signatures: [`sig-${index}`], message: { accountKeys: [payer(write.payer ?? `P${index}`), account("Buffer", true), account("Authority", false), account(loader, false), ...(write.unknownTouch ? [account("UnknownProgram", false)] : [])], instructions: [
      { programId: loader, program: "bpf-upgradeable-loader", accounts: ["Buffer", "Authority"], parsed: { type: "write", info: { account: "Buffer", authority: "Authority", offset: write.offset, bytes: Buffer.alloc(write.length, index + 1).toString("base64") } } },
      ...(write.unknownTouch ? [{ programId: "UnknownProgram", accounts: ["Buffer"], data: "abc" }] : []),
    ] } }, meta: { err: null, fee: 5000, computeUnitsConsumed: 100 + index },
  })) };
}

function lifecycleBlock(type: string): RpcBlock {
  return { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions: [{ transaction: { signatures: [type], message: { accountKeys: [payer("LifecyclePayer"), account("Buffer", true), account(loader, false)], instructions: [{ programId: loader, program: "bpf-upgradeable-loader", parsed: { type, info: { account: "Buffer" } } }] } }, meta: { err: null, fee: 5000, computeUnitsConsumed: 50 } }] };
}

function acquired(entries: Array<{ slot: number; block?: RpcBlock; status?: RangeSlotRecord["status"] }>): AcquiredRange {
  const slots: RangeSlotRecord[] = entries.map((entry) => entry.status && entry.status !== "observed" ? { slot: entry.slot, status: entry.status, source: "none", attempts: 0, cachePath: null, error: null, analysis: null } : { slot: entry.slot, status: "observed", source: "cache", attempts: 0, cachePath: `slot-${entry.slot}.json`, error: null, analysis: analyzeBlock(entry.block ?? writeBlock([]), entry.slot, "fixture", { cluster: "test", endpoint: null, retrievedAt: "2026-01-01T00:00:00.000Z", sourceMode: "fixture", dataKind: "synthetic" }) });
  const values = (status: RangeSlotRecord["status"]): number[] => slots.filter((slot) => slot.status === status).map((slot) => slot.slot);
  return { slots, provenance: { endpoint: null, cluster: "test", requestedStartSlot: entries[0]!.slot, requestedEndSlot: entries.at(-1)!.slot, observedSlots: values("observed"), missingSlots: values("missing"), unavailableSlots: values("unavailable"), failedSlots: values("failed"), skippedSlots: values("skipped"), retrievalTime: "2026-01-01T00:00:00.000Z", sourceMode: "offline-cache", sourceProvenance: [] } };
}

test("handoff validator rejects stale milestone identifiers and earlier stop boundaries", () => {
  const stale = "# Milestone 1.7.1 handoff\nConflict-Atom Attribution and Ordering Truth\nBase ef0b039\nStop after Milestone 1.7.1.\n";
  assert.match(validateMilestone172Handoff(stale, stale).join(" "), /begin exactly|stale|end with/);
  const current = "# Milestone 1.7.2 handoff\nConflict-Atom Attribution and Ordering Truth\nBase ef0b039\nStop after Milestone 1.7.2.\n";
  assert.deepEqual(validateMilestone172Handoff(current, current), []); assert.match(validateMilestone172Handoff(current, current + "x").join(" "), /byte-identical/);
});

test("verified loader writes expose exact semantic ranges and read-only prerequisites", () => {
  const analysis = analyzeBlock(writeBlock([{ offset: 8, length: 4 }]), 10, "fixture", { dataKind: "synthetic" });
  const footprint = analysis.transactions[0]?.instructions[0]?.semanticFootprints?.[0];
  assert.deepEqual({ account: footprint?.account, start: footprint?.byteRangeStart, end: footprint?.byteRangeEnd, precision: footprint?.precision }, { account: "Buffer", start: 8, end: 11, precision: "exact" });
  assert.equal(footprint?.readOnlyPrerequisites.length, 2); assert.match(footprint?.sourceEvidence.join(" ") ?? "", /does not update buffer metadata or lamports/);
});

test("range completeness is distinct from lifecycle completeness and aligned indexes are arithmetic", () => {
  const analysis = analyzeRange(acquired([{ slot: 9, block: lifecycleBlock("initializeBuffer") }, { slot: 10, block: writeBlock([{ offset: 8, length: 4 }, { offset: 12, length: 4 }]) }, { slot: 11, block: lifecycleBlock("deployWithMaxDataLen") }]));
  const sequence = analysis.crossBlockSequences[0]!;
  assert.equal(sequence.rangeCoverageComplete, true); assert.equal(sequence.uploadStartBoundaryObserved, true); assert.equal(sequence.uploadEndBoundaryObserved, true); assert.equal(sequence.lifecycleCompleteness, "complete"); assert.equal(sequence.firstAlignedChunkIndex, 2); assert.equal(sequence.lastAlignedChunkIndex, 3);
  assert.match(analysis.methodology.alignmentRule, /arithmetic positions relative to byte zero/); assert.match(analysis.methodology.alignmentRule, /not protocol-level upload sequence numbers/);
  const incomplete = analyzeRange(acquired([{ slot: 9, status: "missing" }, { slot: 10, block: writeBlock([{ offset: 8, length: 4 }]) }]));
  assert.equal(incomplete.crossBlockSequences[0]?.rangeCoverageComplete, false); assert.equal(incomplete.crossBlockSequences[0]?.lifecycleCompleteness, "boundaries-unknown");
});

test("disjoint verified ranges refine only when no unknown buffer instruction forces whole-account fallback", () => {
  const disjoint = analyzeBlock(writeBlock([{ offset: 0, length: 4 }, { offset: 4, length: 4 }]), 10, "fixture", { dataKind: "synthetic" });
  assert.deepEqual(disjoint.counterfactualModels.map((model) => model.waveBounds.generatedWaveUpperBound), [2, 2, 1, 1]);
  const unknown = analyzeBlock(writeBlock([{ offset: 0, length: 4, unknownTouch: true }, { offset: 4, length: 4 }]), 10, "fixture", { dataKind: "synthetic" });
  assert.equal(unknown.counterfactualModels.find((model) => model.model === "semantic-range-refinement")?.waveBounds.generatedWaveUpperBound, 2);
});

test("overlapping semantic ranges remain conflicting", () => {
  const analysis = analyzeBlock(writeBlock([{ offset: 0, length: 5 }, { offset: 3, length: 4 }]), 10, "fixture", { dataKind: "synthetic" });
  assert.equal(analysis.counterfactualModels.find((model) => model.model === "semantic-range-refinement")?.waveBounds.generatedWaveUpperBound, 2);
  assert.equal(analysis.counterfactualModels.find((model) => model.model === "joint-fee-payer-and-range")?.waveBounds.generatedWaveUpperBound, 2);
});

test("payer and range ablations expose a minimal joint cause set and retain all work", () => {
  const analysis = analyzeBlock(writeBlock([{ offset: 0, length: 4, payer: "SharedPayer" }, { offset: 4, length: 4, payer: "SharedPayer" }]), 10, "fixture", { dataKind: "synthetic" }), component = analysis.dominantComponent!;
  assert.deepEqual(component.counterfactualModels.map((model) => model.waveBounds.generatedWaveUpperBound), [2, 2, 2, 1]);
  assert.equal(component.causalAblation.interaction.jointOnlyDepthReductionPresent, true); assert.deepEqual(component.causalAblation.minimalSupportedCauseSets[0]?.causeIds, ["fee-payer-lock", "program-buffer-whole-account-lock"]);
  for (const model of component.counterfactualModels) { assert.equal(model.transactionCountRetained, 2); assert.equal(model.knownComputeUnitsRetained, 201); assert.equal(model.availableUnderCurrentSolanaAccountLocking, model.model === "current-declared-locks"); }
});

test("unmatched counterfactual wave bounds remain estimated", () => {
  const keys = [
    [payer("P0"), account("E01", true), account("E40", true)], [payer("P1"), account("E01", true), account("E12", true)],
    [payer("P2"), account("E12", true), account("E23", true)], [payer("P3"), account("E23", true), account("E34", true)],
    [payer("P4"), account("E34", true), account("E40", true)],
  ];
  const block: RpcBlock = { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions: keys.map((accountKeys, index) => ({ transaction: { signatures: [`s${index}`], message: { accountKeys } }, meta: { err: null, fee: 5000, computeUnitsConsumed: 10 } })) };
  const current = analyzeBlock(block, 10, "fixture", { dataKind: "synthetic" }).counterfactualModels[0]!;
  assert.equal(current.waveBounds.cliqueLowerBound, 2); assert.equal(current.waveBounds.generatedWaveUpperBound, 3); assert.equal(current.waveBounds.boundsMatch, false); assert.equal(current.waveBounds.provenMinimumWaveCount, null); assert.match(current.waveBounds.upperBoundEvidence, /generated conflict-free grouping/);
});

test("real nine-block causal matrix matches generic expectations and retains every transaction", async () => {
  const range = analyzeRange(await acquireRange({ startSlot: 488638500, endSlot: 488638508, cacheDir: "fixtures/loader-range", rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false })), sequence = range.crossBlockSequences[0]!;
  assert.deepEqual(sequence.perBlock.map((block) => block.jointCounterfactualWaveBounds.generatedWaveUpperBound), [3, 4, 10, 2, 6, 3, 3, 1, 3]);
  assert.deepEqual(sequence.perBlock.map((block) => block.feePayerDecoupledWaveBounds.generatedWaveUpperBound), [15, 15, 15, 16, 26, 15, 15, 14, 17]);
  assert.deepEqual(sequence.perBlock.map((block) => block.rangeAwareBufferWaveBounds.generatedWaveUpperBound), [15, 15, 15, 16, 26, 15, 15, 14, 17]);
  for (const block of sequence.perBlock) { const observed = range.slots.find((slot) => slot.slot === block.slot)!.analysis!; for (const model of block.counterfactualModels) { assert.equal(model.transactionCountRetained, observed.transactions.length); assert.equal(model.knownComputeUnitsRetained, observed.summary.totalKnownComputeUnits); } }
  assert.equal(sequence.rangeCoverageComplete, true); assert.equal(sequence.firstAlignedChunkIndex, 692); assert.equal(sequence.lastAlignedChunkIndex, 839); assert.equal(sequence.lifecycleCompleteness, "boundaries-unknown");
  assert.match(sequence.plainLanguageFinding, /^Contiguous byte coverage after sorting by offset\. The complete upload lifecycle boundaries are not established\./);
});

test("Milestone 1.7 reports are deterministic and avoid current-capability overclaims", async () => {
  const fixture = JSON.parse(await readFile("fixtures/real-devnet-block.json", "utf8")) as { slot: number; block: unknown; provenance: Record<string, unknown> };
  const first = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance), second = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance), html = htmlReport(first);
  assert.equal(JSON.stringify(first), JSON.stringify(second)); assert.equal(html, htmlReport(second)); assert.match(html, /Semantic counterfactuals describe hypothetical finer-grained execution rules/); assert.match(html, /not supported by current Solana account locking/); assert.doesNotMatch(html, /false conflict|unnecessary conflict|avoidable conflict|recoverable performance/);
  const range = analyzeRange(acquired([{ slot: 10, block: writeBlock([{ offset: 0, length: 4, payer: "P" }, { offset: 4, length: 4, payer: "P" }]) }]));
  assert.equal(rangeHtmlReport(range), rangeHtmlReport(range)); assert.match(rangeHtmlReport(range), /Technical: full 4-row causal matrix/); assert.match(rangeHtmlReport(range), /Complete raw recurring-contention index/);
});
