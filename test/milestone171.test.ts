import assert from "node:assert/strict";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import { analyzeRange } from "../src/range-analyze.js";
import { acquireRange } from "../src/range-input.js";
import { rangeHtmlReport } from "../src/range-report.js";
import { htmlReport } from "../src/report.js";
import type { CounterfactualModelResult, RpcBlock, RpcInstruction, RpcParsedAccount, RpcTransactionEntry } from "../src/types.js";

const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
const system = "11111111111111111111111111111111";
const account = (pubkey: string, writable: boolean, signer = false): RpcParsedAccount => ({ pubkey, writable, signer, source: "transaction" });
const payer = (pubkey: string): RpcParsedAccount => account(pubkey, true, true);
const model = (models: CounterfactualModelResult[], id: CounterfactualModelResult["model"]): CounterfactualModelResult => models.find((item) => item.model === id)!;

function block(transactions: RpcTransactionEntry[]): RpcBlock {
  return { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions };
}

function transaction(index: number, payerAddress: string, accounts: RpcParsedAccount[], instructions: RpcInstruction[], options: { failed?: boolean; compute?: number } = {}): RpcTransactionEntry {
  return {
    transaction: { signatures: [`sig-${index}`], message: { accountKeys: [payer(payerAddress), ...accounts], instructions } },
    meta: { err: options.failed ? { custom: 1 } : null, fee: 5000, computeUnitsConsumed: options.compute ?? 100 + index },
  };
}

function loaderWrite(index: number, offset: number, options: { payer?: string; failed?: boolean; extra?: RpcInstruction[]; buffer?: string; authority?: string } = {}): RpcTransactionEntry {
  const buffer = options.buffer ?? "Buffer", authority = options.authority ?? "Authority";
  return transaction(index, options.payer ?? `P${index}`, [account(buffer, true), account(authority, false, true), account(loader, false), account("UnknownProgram", false)], [
    { programId: loader, program: "bpf-upgradeable-loader", accounts: [buffer, authority], parsed: { type: "write", info: { account: buffer, authority, offset, bytes: Buffer.alloc(4, index + 1).toString("base64") } } },
    ...(options.extra ?? []),
  ], { ...(options.failed === undefined ? {} : { failed: options.failed }) });
}

test("payer ablation removes only synthetic fee access and reports applicability", () => {
  const feeOnly = analyzeBlock(block([
    transaction(0, "SharedPayer", [], []), transaction(1, "SharedPayer", [], []),
  ]), 1, "fixture", { dataKind: "synthetic" });
  const feeModel = model(feeOnly.counterfactualModels, "fee-payer-decoupled");
  assert.equal(feeModel.waveBounds.generatedWaveUpperBound, 1);
  assert.deepEqual(feeModel.payerAblation, {
    status: "fully-applicable", targetedTransactionCount: 2, removedSyntheticPayerAccessCount: 2,
    preservedInstructionAccessCount: 0, evidence: feeModel.payerAblation.evidence,
  });

  const transferSource = analyzeBlock(block([0, 1].map((index) => transaction(index, "SharedPayer", [
    account(`Destination${index}`, true), account(system, false),
  ], [{ programId: system, program: "system", parsed: { type: "transfer", info: { source: "SharedPayer", destination: `Destination${index}`, lamports: 1 } } }]))), 1, "fixture", { dataKind: "synthetic" });
  const transferModel = model(transferSource.counterfactualModels, "fee-payer-decoupled");
  assert.equal(transferModel.waveBounds.generatedWaveUpperBound, 2);
  assert.equal(transferSource.summary.feePayerExcludedAnalyticalWaveCount, 2);
  assert.equal(transferSource.feePayerExcludedWaveBounds.generatedWaveUpperBound, 2);
  assert.equal(transferModel.payerAblation.status, "blocked-by-instruction-use");
  assert.equal(transferModel.payerAblation.preservedInstructionAccessCount, 2);
});

test("payer access is preserved for authority, unknown, inner, and repeated instruction uses", () => {
  const authority = analyzeBlock(block([
    loaderWrite(0, 0, { payer: "SharedPayer", authority: "SharedPayer", buffer: "Buffer0" }),
    loaderWrite(1, 4, { payer: "SharedPayer", authority: "SharedPayer", buffer: "Buffer1" }),
  ]), 1, "fixture", { dataKind: "synthetic" });
  assert.equal(model(authority.counterfactualModels, "fee-payer-decoupled").payerAblation.status, "blocked-by-instruction-use");
  assert.equal(model(authority.counterfactualModels, "fee-payer-decoupled").waveBounds.generatedWaveUpperBound, 2);

  const unknown = analyzeBlock(block([0, 1].map((index) => transaction(index, "SharedPayer", [account("UnknownProgram", false)], [
    { programId: "UnknownProgram", accounts: ["SharedPayer"], data: `raw-${index}` },
    { programId: "UnknownProgram", accounts: ["SharedPayer"], data: `again-${index}` },
  ]))), 1, "fixture", { dataKind: "synthetic" });
  const unknownModel = model(unknown.counterfactualModels, "fee-payer-decoupled");
  assert.equal(unknownModel.payerAblation.status, "blocked-by-instruction-use");
  assert.equal(unknownModel.waveBounds.generatedWaveUpperBound, 2);

  const innerEntries = [0, 1].map((index): RpcTransactionEntry => ({
    transaction: { signatures: [`inner-${index}`], message: { accountKeys: [payer("SharedPayer"), account("UnknownProgram", false)], instructions: [{ programId: "UnknownProgram", parsed: { type: "invoke" } }] } },
    meta: { err: null, fee: 5000, computeUnitsConsumed: 10, innerInstructions: [{ index: 0, instructions: [{ programId: "UnknownProgram", accounts: ["SharedPayer"], data: "inner" }] }] },
  }));
  const inner = analyzeBlock(block(innerEntries), 1, "fixture", { dataKind: "synthetic" });
  assert.equal(model(inner.counterfactualModels, "fee-payer-decoupled").payerAblation.status, "blocked-by-instruction-use");
});

test("payer ablation reports partial applicability across a mixed scope", () => {
  const analysis = analyzeBlock(block([
    transaction(0, "SharedPayer", [], []),
    transaction(1, "SharedPayer", [account("UnknownProgram", false)], [{ programId: "UnknownProgram", accounts: ["SharedPayer"], data: "raw" }]),
  ]), 1, "fixture", { dataKind: "synthetic" });
  const payerModel = model(analysis.counterfactualModels, "fee-payer-decoupled");
  assert.equal(payerModel.payerAblation.status, "partially-applicable");
  assert.equal(payerModel.payerAblation.removedSyntheticPayerAccessCount, 1);
  assert.equal(payerModel.payerAblation.preservedInstructionAccessCount, 1);
});

test("buffer refinement eligibility is scope-wide and records every blocker class", () => {
  const eligible = analyzeBlock(block([loaderWrite(0, 0), loaderWrite(1, 4)]), 1, "fixture", { dataKind: "synthetic" });
  const eligibleRecord = model(eligible.counterfactualModels, "semantic-range-refinement").semanticRefinementEligibility[0]!;
  assert.equal(eligibleRecord.eligible, true); assert.deepEqual(eligibleRecord.blockingEvidence, []);

  const cases: Array<{ name: string; entries: RpcTransactionEntry[]; pattern: RegExp }> = [
    { name: "unverified third transaction", entries: [loaderWrite(0, 0), loaderWrite(1, 4), transaction(2, "P2", [account("Buffer", true), account("UnknownProgram", false)], [{ programId: "UnknownProgram", accounts: ["Buffer"], data: "raw" }])], pattern: /without an exact verified footprint/ },
    { name: "failed write", entries: [loaderWrite(0, 0), loaderWrite(1, 4, { failed: true })], pattern: /must succeed/ },
    { name: "authority change", entries: [loaderWrite(0, 0), loaderWrite(1, 4), transaction(2, "P2", [account("Buffer", true), account("Authority", false), account(loader, false)], [{ programId: loader, program: "bpf-upgradeable-loader", parsed: { type: "setAuthority", info: { account: "Buffer", authority: "Authority" } } }])], pattern: /lifecycle or authority mutation/ },
    { name: "lifecycle mutation", entries: [loaderWrite(0, 0), loaderWrite(1, 4), transaction(2, "P2", [account("Buffer", true), account(loader, false)], [{ programId: loader, program: "bpf-upgradeable-loader", parsed: { type: "initializeBuffer", info: { account: "Buffer" } } }])], pattern: /lifecycle or authority mutation/ },
    { name: "mixed verified and raw-only", entries: [loaderWrite(0, 0, { extra: [{ programIdIndex: 4, accounts: [1], data: "raw" }] }), loaderWrite(1, 4)], pattern: /raw-only/ },
  ];
  for (const item of cases) {
    const analysis = analyzeBlock(block(item.entries), 1, "fixture", { dataKind: "synthetic" });
    const rangeModel = model(analysis.counterfactualModels, "semantic-range-refinement"), record = rangeModel.semanticRefinementEligibility[0]!;
    assert.equal(record.eligible, false, item.name);
    assert.match(record.blockingEvidence.join(" "), item.pattern, item.name);
    assert.equal(rangeModel.waveBounds.generatedWaveUpperBound, analysis.blockWaveBounds.generatedWaveUpperBound, item.name);
  }
});

test("overlapping exact ranges remain eligible but conflicting", () => {
  const analysis = analyzeBlock(block([loaderWrite(0, 0), loaderWrite(1, 2)]), 1, "fixture", { dataKind: "synthetic" });
  const rangeModel = model(analysis.counterfactualModels, "semantic-range-refinement");
  assert.equal(rangeModel.semanticRefinementEligibility[0]?.eligible, true);
  assert.equal(rangeModel.waveBounds.generatedWaveUpperBound, 2);
});

test("one-wave evidence and supported cause-universe wording are truthful", () => {
  const analysis = analyzeBlock(block([
    transaction(0, "SharedPayer", [], []), transaction(1, "SharedPayer", [], []),
  ]), 1, "fixture", { dataKind: "synthetic" });
  const payerModel = model(analysis.counterfactualModels, "fee-payer-decoupled");
  assert.equal(payerModel.waveBounds.lowerBoundEvidence, "No conflict edges remain in this model; one wave is sufficient.");
  const universe = analysis.dominantComponent!.causalAblation.supportedCauseUniverse;
  assert.deepEqual(universe.causeIds, ["fee-payer-lock", "program-buffer-whole-account-lock"]);
  assert.match(universe.statement, /exhaustive supported cause universe is limited/);
  assert.match(universe.statement, /not arbitrary N-cause discovery/);
});

test("real nine-block role policy, interaction depths, and retained work remain unchanged", async () => {
  const range = analyzeRange(await acquireRange({ startSlot: 488638500, endSlot: 488638508, cacheDir: "fixtures/loader-range", rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false }));
  const sequence = range.crossBlockSequences[0]!;
  assert.equal(sequence.observedChunkCount, 148);
  assert.deepEqual(sequence.perBlock.map((item) => item.jointCounterfactualWaveBounds.generatedWaveUpperBound), [3, 4, 10, 2, 6, 3, 3, 1, 3]);
  for (const item of sequence.perBlock) {
    assert.equal(model(item.componentCounterfactualModels, "fee-payer-decoupled").payerAblation.status, "fully-applicable");
    const observed = range.slots.find((slot) => slot.slot === item.slot)!.analysis!;
    const joint = model(item.counterfactualModels, "joint-fee-payer-and-range");
    assert.equal(joint.transactionCountRetained, observed.transactions.length);
    assert.equal(joint.knownComputeUnitsRetained, observed.summary.totalKnownComputeUnits);
  }
  const slot = sequence.perBlock.find((item) => item.slot === 488638504)!;
  assert.deepEqual(slot.componentCounterfactualModels.map((item) => item.waveBounds.generatedWaveUpperBound), [26, 26, 26, 1]);
  assert.equal(model(slot.counterfactualModels, "current-declared-locks").waveBounds.generatedWaveUpperBound, 26);
  assert.equal(model(slot.counterfactualModels, "joint-fee-payer-and-range").waveBounds.generatedWaveUpperBound, 6);
  assert.equal(model(slot.counterfactualModels, "joint-fee-payer-and-range").transactionCountRetained, 71);
  assert.equal(model(slot.counterfactualModels, "joint-fee-payer-and-range").knownComputeUnitsRetained, 646522);
});

test("interaction reports initialize truthfully and remain deterministic", async () => {
  const range = analyzeRange(await acquireRange({ startSlot: 488638500, endSlot: 488638508, cacheDir: "fixtures/loader-range", rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false }));
  const html = rangeHtmlReport(range);
  assert.equal(html, rangeHtmlReport(range));
  assert.match(html, /No decoded upload finding selected/);
  assert.match(html, /Minimal supported cause set/);
  assert.match(html, /samePairCauseOverlapCount/);
  assert.match(html, /Atoms removed/);
  assert.match(html, /Technical: full 36-row causal matrix/);
  assert.match(html, /defaultSelection/);
  assert.doesNotMatch(html, /Minimal changing cause sets|arbitrary N-cause discovery\.<\/strong>|recoverable performance|exact validator schedule/);

  const single = range.slots.find((slot) => slot.slot === 488638504)!.analysis!;
  const singleHtml = htmlReport(single);
  assert.equal(singleHtml, htmlReport(single));
  assert.match(singleHtml, /Minimal supported cause set/);
  assert.match(singleHtml, /Technical: four-model causal matrix/);
  assert.match(singleHtml, /not arbitrary N-cause discovery/);
});
