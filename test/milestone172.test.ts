import assert from "node:assert/strict";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import { analyzeRange } from "../src/range-analyze.js";
import { acquireRange, type AcquiredRange } from "../src/range-input.js";
import { rangeHtmlReport } from "../src/range-report.js";
import { htmlReport } from "../src/report.js";
import type {
  CounterfactualModelResult, RpcBlock, RpcInstruction, RpcParsedAccount,
  RpcTransactionEntry,
} from "../src/types.js";
import type { RangeSlotRecord } from "../src/range-types.js";

const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
const account = (pubkey: string, writable: boolean, signer = false): RpcParsedAccount =>
  ({ pubkey, writable, signer, source: "transaction" });
const payer = (pubkey: string): RpcParsedAccount => account(pubkey, true, true);
const model = (models: CounterfactualModelResult[], id: CounterfactualModelResult["model"]): CounterfactualModelResult =>
  models.find((item) => item.model === id)!;

function block(transactions: RpcTransactionEntry[]): RpcBlock {
  return { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions };
}

function transaction(index: number, payerAddress: string, accounts: RpcParsedAccount[], instructions: RpcInstruction[], compute = 100 + index): RpcTransactionEntry {
  return {
    transaction: { signatures: [`sig-${index}`], message: { accountKeys: [payer(payerAddress), ...accounts], instructions } },
    meta: { err: null, fee: 5000, computeUnitsConsumed: compute },
  };
}

function write(index: number, offset: number, options: { payer?: string; length?: number; extra?: RpcInstruction[] } = {}): RpcTransactionEntry {
  return transaction(index, options.payer ?? `P${index}`, [
    account("Buffer", true), account("Authority", false, true), account(loader, false), account("UnknownProgram", false),
  ], [
    { programId: loader, program: "bpf-upgradeable-loader", accounts: ["Buffer", "Authority"], parsed: { type: "write", info: {
      account: "Buffer", authority: "Authority", offset,
      bytes: Buffer.alloc(options.length ?? 4, index + 1).toString("base64"),
    } } },
    ...(options.extra ?? []),
  ]);
}

function acquired(slot: number, value: RpcBlock): AcquiredRange {
  const analysis = analyzeBlock(value, slot, "fixture", {
    cluster: "test", endpoint: null, retrievedAt: "2026-01-01T00:00:00.000Z",
    sourceMode: "fixture", dataKind: "synthetic",
  });
  const record: RangeSlotRecord = {
    slot, status: "observed", source: "cache", attempts: 0, cachePath: "fixture.json", error: null, analysis,
  };
  return {
    slots: [record],
    provenance: {
      endpoint: null, cluster: "test", requestedStartSlot: slot, requestedEndSlot: slot,
      observedSlots: [slot], missingSlots: [], unavailableSlots: [], failedSlots: [], skippedSlots: [],
      retrievalTime: "2026-01-01T00:00:00.000Z", sourceMode: "offline-cache",
      sourceProvenance: [analysis.provenance],
    },
  };
}

test("payer causes are derived from removed conflict atoms, including blocked and partial policies", () => {
  const feeOnly = analyzeBlock(block([
    transaction(0, "SharedPayer", [], []),
    transaction(1, "SharedPayer", [], []),
  ]), 1, "fixture", { dataKind: "synthetic" });
  const current = model(feeOnly.counterfactualModels, "current-declared-locks");
  const payerOnly = model(feeOnly.counterfactualModels, "fee-payer-decoupled");
  assert.deepEqual(current.conflictAtoms, [{ source: 0, target: 1, account: "SharedPayer" }]);
  assert.equal(payerOnly.removedConflictAtoms.length, 1);
  assert.equal(payerOnly.edgesEliminated.length, 1);
  assert.equal(payerOnly.edgesSurvivingDueToOtherCauses.length, 0);
  assert.deepEqual(feeOnly.dominantComponent!.causalAblation.presentCauseIds, ["fee-payer-lock"]);

  const blocked = analyzeBlock(block([0, 1].map((index) =>
    transaction(index, "SharedPayer", [account("UnknownProgram", false)], [
      { programId: "UnknownProgram", accounts: ["SharedPayer"], data: "raw" },
    ]))), 2, "fixture", { dataKind: "synthetic" });
  const blockedPayer = model(blocked.counterfactualModels, "fee-payer-decoupled");
  assert.equal(blockedPayer.payerAblation.status, "blocked-by-instruction-use");
  assert.equal(blockedPayer.removedConflictAtoms.length, 0);
  assert.equal(blocked.dominantComponent!.causalAblation.supported, false);
  assert.deepEqual(blocked.dominantComponent!.causalAblation.presentCauseIds, []);

  const partial = analyzeBlock(block([
    transaction(0, "SharedPayer", [], []),
    transaction(1, "SharedPayer", [], []),
    transaction(2, "SharedPayer", [account("UnknownProgram", false)], [
      { programId: "UnknownProgram", accounts: ["SharedPayer"], data: "raw" },
    ]),
  ]), 3, "fixture", { dataKind: "synthetic" });
  const partialPayer = model(partial.counterfactualModels, "fee-payer-decoupled");
  assert.equal(partialPayer.payerAblation.status, "partially-applicable");
  assert.equal(partialPayer.removedConflictAtoms.length, 3);
  assert.equal(partial.dominantComponent!.causalAblation.causes[0]?.affectedPairCount, 3);
});
test("buffer causes require actual disjoint-range atom removal", () => {
  const disjoint = analyzeBlock(block([write(0, 0), write(1, 4)]), 1, "fixture", { dataKind: "synthetic" });
  const disjointRange = model(disjoint.counterfactualModels, "semantic-range-refinement");
  assert.equal(disjointRange.removedConflictAtoms.length, 1);
  assert.equal(disjointRange.edgesEliminated.length, 1);
  assert.deepEqual(disjoint.dominantComponent!.causalAblation.presentCauseIds, ["program-buffer-whole-account-lock"]);

  const overlap = analyzeBlock(block([write(0, 0), write(1, 2)]), 1, "fixture", { dataKind: "synthetic" });
  const overlapRange = model(overlap.counterfactualModels, "semantic-range-refinement");
  assert.equal(overlapRange.semanticRefinementEligibility[0]?.eligible, true);
  assert.equal(overlapRange.removedConflictAtoms.length, 0);
  assert.equal(overlap.dominantComponent!.causalAblation.supported, false);
  assert.deepEqual(overlap.dominantComponent!.causalAblation.presentCauseIds, []);
  assert.equal(overlap.dominantComponent!.causalAblation.transformations[1]?.applicable, true);

  const unverified = analyzeBlock(block([
    write(0, 0), write(1, 4),
    transaction(2, "P2", [account("Buffer", true), account("UnknownProgram", false)], [
      { programId: "UnknownProgram", accounts: ["Buffer"], data: "raw" },
    ]),
  ]), 1, "fixture", { dataKind: "synthetic" });
  const unverifiedRange = model(unverified.counterfactualModels, "semantic-range-refinement");
  assert.equal(unverifiedRange.semanticRefinementEligibility[0]?.eligible, false);
  assert.equal(unverifiedRange.removedConflictAtoms.length, 0);
  assert.equal(unverified.dominantComponent!.causalAblation.presentCauseIds.includes("program-buffer-whole-account-lock"), false);
});

test("edge survival and elimination distinguish atoms from unique transaction pairs", () => {
  const analysis = analyzeBlock(block([
    write(0, 0, { payer: "SharedPayer" }),
    write(1, 4, { payer: "SharedPayer" }),
  ]), 1, "fixture", { dataKind: "synthetic" });
  const current = model(analysis.counterfactualModels, "current-declared-locks");
  const payerOnly = model(analysis.counterfactualModels, "fee-payer-decoupled");
  const rangeOnly = model(analysis.counterfactualModels, "semantic-range-refinement");
  const joint = model(analysis.counterfactualModels, "joint-fee-payer-and-range");
  assert.equal(current.conflictEdgeCount, 1);
  assert.equal(current.conflictAtomCount, 2);
  assert.deepEqual(current.conflictEdges[0]?.accounts, ["Buffer", "SharedPayer"]);
  assert.deepEqual([payerOnly.removedConflictAtoms.length, payerOnly.edgesEliminated.length, payerOnly.edgesSurvivingDueToOtherCauses.length], [1, 0, 1]);
  assert.deepEqual([rangeOnly.removedConflictAtoms.length, rangeOnly.edgesEliminated.length, rangeOnly.edgesSurvivingDueToOtherCauses.length], [1, 0, 1]);
  assert.deepEqual([joint.removedConflictAtoms.length, joint.edgesEliminated.length, joint.edgesSurvivingDueToOtherCauses.length], [2, 1, 0]);
  assert.deepEqual(analysis.dominantComponent!.causalAblation.minimalSupportedCauseSets, [{
    causeIds: ["fee-payer-lock", "program-buffer-whole-account-lock"], generatedWaveDepthReduction: 1,
  }]);
});

test("offset-sorted byte coverage is independent of chronological offset monotonicity", () => {
  const monotonic = analyzeRange(acquired(10, block([write(0, 0), write(1, 4), write(2, 8)]))).crossBlockSequences[0]!;
  assert.equal(monotonic.byteCoverageContiguous, true);
  assert.equal(monotonic.chronologicalOffsetsMonotonic, true);
  assert.equal(monotonic.chronologicalOffsetInversionCount, 0);
  assert.deepEqual(monotonic.transactionOrderedChunkIndexes.map((item) => item.offset), [0, 4, 8]);

  const inverted = analyzeRange(acquired(10, block([write(0, 0), write(1, 8), write(2, 4)]))).crossBlockSequences[0]!;
  assert.equal(inverted.byteCoverageContiguous, true);
  assert.equal(inverted.chronologicalOffsetsMonotonic, false);
  assert.equal(inverted.chronologicalOffsetInversionCount, 1);
  assert.deepEqual(inverted.offsetSortedChunkIndexes.map((item) => item.offset), [0, 4, 8]);
  assert.deepEqual(inverted.transactionOrderedChunkIndexes.map((item) => item.offset), [0, 8, 4]);
  assert.match(inverted.plainLanguageFinding, /^Contiguous byte coverage after sorting by offset\./);
});

test("real slot atom accounting, ordering evidence, depths, and retained work match the verified baseline", async () => {
  const range = analyzeRange(await acquireRange({
    startSlot: 488638500, endSlot: 488638508, cacheDir: "fixtures/loader-range",
    rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false,
  }));
  const sequence = range.crossBlockSequences[0]!;
  assert.equal(range.schemaVersion, "1.7.3");
  assert.equal(sequence.observedChunkCount, 148);
  assert.deepEqual(sequence.perBlock.map((item) => model(item.counterfactualModels, "current-declared-locks").waveBounds.generatedWaveUpperBound), [15, 15, 15, 16, 26, 15, 15, 14, 17]);
  assert.deepEqual(sequence.perBlock.map((item) => model(item.counterfactualModels, "fee-payer-decoupled").waveBounds.generatedWaveUpperBound), [15, 15, 15, 16, 26, 15, 15, 14, 17]);
  assert.deepEqual(sequence.perBlock.map((item) => model(item.counterfactualModels, "semantic-range-refinement").waveBounds.generatedWaveUpperBound), [15, 15, 15, 16, 26, 15, 15, 14, 17]);
  assert.deepEqual(sequence.perBlock.map((item) => model(item.counterfactualModels, "joint-fee-payer-and-range").waveBounds.generatedWaveUpperBound), [3, 4, 10, 2, 6, 3, 3, 1, 3]);

  const slot = sequence.perBlock.find((item) => item.slot === 488638504)!;
  const [current, payerOnly, rangeOnly, joint] = slot.componentCounterfactualModels;
  assert.equal(current!.transactionCountRetained, 26);
  assert.equal(current!.conflictEdgeCount, 325);
  assert.equal(current!.conflictAtomCount, 650);
  assert.deepEqual([payerOnly!.removedConflictAtoms.length, payerOnly!.edgesEliminated.length, payerOnly!.edgesSurvivingDueToOtherCauses.length], [325, 0, 325]);
  assert.deepEqual([rangeOnly!.removedConflictAtoms.length, rangeOnly!.edgesEliminated.length, rangeOnly!.edgesSurvivingDueToOtherCauses.length], [325, 0, 325]);
  assert.deepEqual([joint!.removedConflictAtoms.length, joint!.edgesEliminated.length], [650, 325]);
  assert.deepEqual(slot.componentCounterfactualModels.map((item) => item.waveBounds.generatedWaveUpperBound), [26, 26, 26, 1]);
  assert.equal(model(slot.counterfactualModels, "joint-fee-payer-and-range").waveBounds.generatedWaveUpperBound, 6);
  assert.equal(model(slot.counterfactualModels, "joint-fee-payer-and-range").transactionCountRetained, 71);
  assert.equal(model(slot.counterfactualModels, "joint-fee-payer-and-range").knownComputeUnitsRetained, 646522);
  assert.equal(slot.blockOrderOffsetsMonotonic, false);
  assert.equal(slot.blockOrderOffsetInversionCount, 31);
  assert.equal(slot.transactionOrderedChunkIndexes.find((item) => item.transactionIndex === 17)?.offset, 689748);
  assert.equal(slot.transactionOrderedChunkIndexes.find((item) => item.transactionIndex === 18)?.offset, 699824);
  assert.equal(slot.transactionOrderedChunkIndexes.find((item) => item.transactionIndex === 19)?.offset, 695244);
});

test("Milestone 1.7.3 JSON and HTML are deterministic and bounded", async () => {
  const range = analyzeRange(await acquireRange({
    startSlot: 488638500, endSlot: 488638508, cacheDir: "fixtures/loader-range",
    rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false,
  }));
  const json = JSON.stringify(range);
  const html = rangeHtmlReport(range);
  assert.equal(json, JSON.stringify(range));
  assert.equal(html, rangeHtmlReport(range));
  assert.match(json, /"conflictAtomCount":650/);
  assert.match(json, /"blockOrderOffsetInversionCount":31/);
  assert.match(html, /samePairCauseOverlapCount/);
  assert.match(html, /Buffer whole-account lock/);
  assert.match(html, /Contiguous byte coverage after sorting by offset/);
  assert.match(html, /Transaction order is descriptive block order only/);
  assert.doesNotMatch(html, /reconstructs? (a )?validator|guaranteed throughput|proves? arrival order|scheduler order is/);

  const standalone = htmlReport(range.slots.find((item) => item.slot === 488638504)!.analysis!);
  assert.equal(standalone, htmlReport(range.slots.find((item) => item.slot === 488638504)!.analysis!));
  assert.match(standalone, /Atoms removed/);
  assert.match(standalone, /Masked edges/);
});
