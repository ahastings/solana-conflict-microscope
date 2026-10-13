import assert from "node:assert/strict";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import { validateMilestone173Handoff } from "../src/handoff.js";
import { analyzeRange } from "../src/range-analyze.js";
import { acquireRange, type AcquiredRange } from "../src/range-input.js";
import { defaultRangeFinding, rangeHtmlReport, residualConflictStatement } from "../src/range-report.js";
import type { RangeSlotRecord } from "../src/range-types.js";
import type { RpcBlock, RpcParsedAccount, RpcTransactionEntry } from "../src/types.js";

const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
const account = (pubkey: string, writable: boolean, signer = false): RpcParsedAccount => ({ pubkey, writable, signer, source: "transaction" });
const payer = (pubkey: string): RpcParsedAccount => account(pubkey, true, true);

test("1.7.3 handoff validator rejects stale identifiers and mismatched snapshots", () => {
  const current = "# Milestone 1.7.3 handoff\nInteraction Taxonomy and Empty-State Truth\nBase 67141d1\nStop after Milestone 1.7.3.\n";
  assert.deepEqual(validateMilestone173Handoff(current, current), []);
  assert.match(validateMilestone173Handoff(current.replace("1.7.3 handoff", "1.7.2 handoff"), current).join(" "), /byte-identical|begin exactly|stale/);
});

function write(index: number, buffer: string, offset: number, payerAddress: string, extraWritable?: string): RpcTransactionEntry {
  return {
    transaction: {
      signatures: [`sig-${index}`],
      message: {
        accountKeys: [payer(payerAddress), account(buffer, true), account("Authority", false, true), account(loader, false), ...(extraWritable ? [account(extraWritable, true)] : [])],
        instructions: [{ programId: loader, program: "bpf-upgradeable-loader", accounts: [buffer, "Authority"], parsed: { type: "write", info: { account: buffer, authority: "Authority", offset, bytes: Buffer.alloc(4, index + 1).toString("base64") } } }],
      },
    },
    meta: { err: null, fee: 5000, computeUnitsConsumed: 100 + index },
  };
}
function block(transactions: RpcTransactionEntry[]): RpcBlock { return { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions }; }
function analysis(transactions: RpcTransactionEntry[]) { return analyzeBlock(block(transactions), 10, "fixture", { dataKind: "synthetic" }); }
function acquired(entries: Array<{ slot: number; transactions: RpcTransactionEntry[] }>): AcquiredRange {
  const slots: RangeSlotRecord[] = entries.map(({ slot, transactions }) => ({ slot, status: "observed", source: "cache", attempts: 0, cachePath: `slot-${slot}.json`, error: null, analysis: analyzeBlock(block(transactions), slot, "fixture", { cluster: "test", endpoint: null, retrievedAt: "2026-01-01T00:00:00.000Z", sourceMode: "fixture", dataKind: "synthetic" }) }));
  return { slots, provenance: { endpoint: null, cluster: "test", requestedStartSlot: entries[0]?.slot ?? 1, requestedEndSlot: entries.at(-1)?.slot ?? 1, observedSlots: slots.map((item) => item.slot), missingSlots: [], unavailableSlots: [], failedSlots: [], skippedSlots: [], retrievalTime: "2026-01-01T00:00:00.000Z", sourceMode: "offline-cache", sourceProvenance: [] } };
}

test("taxonomy A separates same-pair masking from joint-only depth reduction", () => {
  const i = analysis([write(0, "Buffer", 0, "P"), write(1, "Buffer", 4, "P")]).dominantComponent!.causalAblation.interaction;
  assert.equal(i.classification, "same-pair-masking-plus-joint-only-depth-reduction"); assert.equal(i.samePairCauseOverlapPresent, true); assert.equal(i.samePairCauseOverlapCount, 1); assert.equal(i.jointOnlyDepthReductionPresent, true);
  assert.deepEqual([i.payerOnlyDepthReduction, i.rangeOnlyDepthReduction, i.jointDepthReduction], [0, 0, 1]);
});
test("taxonomy B reports separate-bottleneck joint-only reduction with zero pair overlap", () => {
  const i = analysis([write(0, "BufferA", 0, "P"), write(1, "BufferB", 0, "P"), write(2, "BufferB", 4, "Q")]).dominantComponent!.causalAblation.interaction;
  assert.equal(i.classification, "separate-bottleneck-joint-only-depth-reduction"); assert.equal(i.samePairCauseOverlapCount, 0); assert.equal(i.jointOnlyDepthReductionPresent, true);
  assert.deepEqual([i.payerOnlyDepthReduction, i.rangeOnlyDepthReduction, i.jointDepthReduction], [0, 0, 1]); assert.match(i.explanation, /separate transaction pairs/);
});
test("taxonomy C and the Joint row retain an unsupported third-account cause", () => {
  const component = analysis([write(0, "Buffer", 0, "P", "Third"), write(1, "Buffer", 4, "P", "Third")]).dominantComponent!, i = component.causalAblation.interaction;
  assert.equal(i.classification, "same-pair-cause-overlap-without-depth-reduction"); assert.equal(i.jointOnlyDepthReductionPresent, false);
  assert.deepEqual([i.jointRemovedAtomCount, i.jointEdgesEliminatedCount, i.jointMaskedSurvivingEdgeCount, i.jointResidualConflictEdgeCount], [2, 0, 1, 1]);
  assert.equal(component.counterfactualModels.find((model) => model.model === "joint-fee-payer-and-range")!.conflictAtoms[0]!.account, "Third");
});
test("taxonomy D covers a true negative while one-cause depth evidence remains supported", () => {
  const none = analysis([write(0, "Buffer", 0, "P0"), write(1, "Buffer", 2, "P1")]).dominantComponent!.causalAblation;
  assert.equal(none.interaction.classification, "no-supported-interaction"); assert.equal(none.supported, false);
  const payerOnly = analysis([write(0, "A", 0, "P"), write(1, "B", 0, "P")]).dominantComponent!.causalAblation;
  assert.deepEqual(payerOnly.presentCauseIds, ["fee-payer-lock"]); assert.equal(payerOnly.interaction.classification, "supported-overlap-or-depth-effect-without-joint-only-reduction");
  assert.equal(payerOnly.interaction.presentationTitle, "No joint-only depth interaction");
});
test("empty reports initialize neutrally and never embed a stale positive heading", () => {
  const range = analyzeRange(acquired([{ slot: 1, transactions: [] }])), html = rangeHtmlReport(range);
  assert.equal(range.crossBlockSequences.length, 0); assert.match(html, /<h2 id="interactionTitle">No decoded upload finding selected<\/h2>/); assert.doesNotMatch(html, />Joint-only interaction detected<\/h2>/); assert.equal(defaultRangeFinding(range), null);
});
test("default selection prioritizes a real interaction over a deeper non-interacting sequence", () => {
  const range = analyzeRange(acquired([{ slot: 5, transactions: [write(0, "InteractionBuffer", 0, "P"), write(1, "InteractionBuffer", 4, "P"), write(2, "DeepBuffer", 0, "Q0"), write(3, "DeepBuffer", 1, "Q1"), write(4, "DeepBuffer", 2, "Q2")] }]));
  assert.equal(range.crossBlockSequences.length, 2); const selected = defaultRangeFinding(range)!, sequence = range.crossBlockSequences[selected.sequenceIndex]!;
  assert.equal(sequence.buffer, "InteractionBuffer"); assert.equal(sequence.perBlock[0]!.componentCausalAblation!.interaction.jointOnlyDepthReductionPresent, true);
});
test("real residual wording follows the selected joint full-block edge count", async () => {
  const range = analyzeRange(await acquireRange({ startSlot: 488638500, endSlot: 488638508, cacheDir: "fixtures/loader-range", rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false })), sequence = range.crossBlockSequences[0]!;
  const jointEdges = (slot: number) => sequence.perBlock.find((item) => item.slot === slot)!.counterfactualModels.find((model) => model.model === "joint-fee-payer-and-range")!.conflictEdgeCount;
  assert.equal(residualConflictStatement(jointEdges(488638504)), "Other modeled full-block conflicts still remain."); assert.equal(residualConflictStatement(jointEdges(488638507)), "No other modeled full-block conflicts remain under this counterfactual.");
  assert.equal(sequence.observedChunkCount, 148); assert.equal(sequence.observedByteCount, 135568);
});
test("1.7.3 output uses block-order language while retaining serialized aliases", () => {
  const range = analyzeRange(acquired([{ slot: 1, transactions: [write(0, "Buffer", 4, "P0"), write(1, "Buffer", 0, "P1")] }])), sequence = range.crossBlockSequences[0]!, html = rangeHtmlReport(range);
  assert.equal(range.schemaVersion, "1.7.3"); assert.equal(sequence.blockOrderOffsetsMonotonic, false); assert.equal(sequence.chronologicalOffsetsMonotonic, sequence.blockOrderOffsetsMonotonic);
  assert.match(html, /Block-order offsets monotonic/); assert.match(html, /transaction order in the block|Transaction order is descriptive block order/); assert.doesNotMatch(html, />Chronological offsets monotonic/);
});
test("1.7.3 JSON and HTML remain byte deterministic and bounded", () => {
  const first = analyzeRange(acquired([{ slot: 1, transactions: [write(0, "Buffer", 0, "P"), write(1, "Buffer", 4, "P")] }])), second = analyzeRange(acquired([{ slot: 1, transactions: [write(0, "Buffer", 0, "P"), write(1, "Buffer", 4, "P")] }]));
  assert.equal(JSON.stringify(first), JSON.stringify(second)); assert.equal(rangeHtmlReport(first), rangeHtmlReport(second)); assert.doesNotMatch(rangeHtmlReport(first), /exact validator schedule|guaranteed throughput|runtime causality/);
});
