import assert from "node:assert/strict";
import { mkdtemp, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import { compactCandidatesForAnalysis, deterministicCandidateId, rankCandidates } from "../src/discovery-index.js";
import { resolveDiscoveryPlan } from "../src/discovery-plan.js";
import { discoveryHtmlReport, enforceDiscoveryBudgets, serializeDiscoveryIndex } from "../src/discovery-report.js";
import { materializeTopCandidates, runDiscovery } from "../src/discovery.js";
import type { DiscoveryCandidate, DiscoveryIndex, DiscoveryPlan, InfrastructureClassification } from "../src/discovery-types.js";
import { htmlReport } from "../src/report.js";
import { validateMilestone18Handoff } from "../src/handoff.js";
import type { RpcBlock, RpcParsedAccount, RpcTransactionEntry } from "../src/types.js";

const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
const appProgram = "AppProgram11111111111111111111111111111111";
const account = (pubkey: string, writable: boolean, signer = false): RpcParsedAccount => ({ pubkey, writable, signer, source: "transaction" });
const payer = (pubkey: string): RpcParsedAccount => account(pubkey, true, true);

function write(index: number, buffer: string, offset: number, payerAddress: string, extraWritable?: string): RpcTransactionEntry {
  return {
    transaction: { signatures: [`sig-${index}`], message: { accountKeys: [payer(payerAddress), account(buffer, true), account("Authority", false, true), account(loader, false), ...(extraWritable ? [account(extraWritable, true)] : [])], instructions: [{ programId: loader, program: "bpf-upgradeable-loader", accounts: [buffer, "Authority"], parsed: { type: "write", info: { account: buffer, authority: "Authority", offset, bytes: Buffer.alloc(4, index + 1).toString("base64") } } }] } },
    meta: { err: null, fee: 5000, computeUnitsConsumed: 100 + index },
  };
}

function stateTouch(index: number, state: string, payerAddress: string, computeUnits: number | null = 1000): RpcTransactionEntry {
  return {
    transaction: { signatures: [`app-${index}`], message: { accountKeys: [payer(payerAddress), account(state, true), account(appProgram, false)], instructions: [{ programId: appProgram, program: "example-app", parsed: { type: "touch", info: { state } } }] } },
    meta: { err: null, fee: 5000, ...(computeUnits === null ? {} : { computeUnitsConsumed: computeUnits }) },
  };
}

function block(transactions: RpcTransactionEntry[], slot = 1): RpcBlock { return { blockhash: `block-${slot}`, previousBlockhash: `previous-${slot}`, parentSlot: slot - 1, transactions }; }
function analysis(transactions: RpcTransactionEntry[], slot = 10) { return analyzeBlock(block(transactions, slot), slot, "fixture", { cluster: "test", endpoint: null, retrievedAt: "2026-01-01T00:00:00.000Z", sourceMode: "fixture", dataKind: "synthetic" }); }

test("Milestone 1.8 handoff validator rejects stale identifiers and mismatched snapshots", () => {
  const current = "# Milestone 1.8 handoff\nCandidate Hunt and Two-Stage Materialization\nBase 1fd30e5\nStop after Milestone 1.8.\n";
  assert.deepEqual(validateMilestone18Handoff(current, current), []);
  assert.match(validateMilestone18Handoff(current.replace("1.8 handoff", "1.7.3 handoff"), current).join(" "), /byte-identical|begin exactly|stale/);
});

test("mixed taxonomy: same-pair overlap with payer-only help and further Joint help", () => {
  const interaction = analysis([write(0, "A", 0, "P"), write(1, "A", 4, "P"), write(2, "B", 0, "P")]).dominantComponent!.causalAblation.interaction;
  assert.equal(interaction.samePairCauseOverlapPresent, true);
  assert.ok(interaction.payerOnlyDepthReduction > 0);
  assert.ok(interaction.jointDepthReduction > interaction.payerOnlyDepthReduction);
  assert.equal(interaction.presentationTitle, "No joint-only depth interaction");
  assert.notEqual(interaction.classification, "no-supported-interaction");
});

test("mixed taxonomy: same-pair overlap with range-only help and further Joint help", () => {
  const interaction = analysis([write(0, "A", 0, "P"), write(1, "A", 4, "P"), write(2, "A", 8, "Q")]).dominantComponent!.causalAblation.interaction;
  assert.equal(interaction.samePairCauseOverlapPresent, true);
  assert.ok(interaction.rangeOnlyDepthReduction > 0);
  assert.ok(interaction.jointDepthReduction > interaction.rangeOnlyDepthReduction);
  assert.notEqual(interaction.classification, "no-supported-interaction");
  assert.match(htmlReport(analysis([write(0, "A", 0, "P"), write(1, "A", 4, "P"), write(2, "A", 8, "Q")])), /No joint-only depth interaction/);
});

test("tighter baseline removes first-fit artifacts from separate-cause reductions", () => {
  const interaction = analysis([write(0, "B1", 0, "P1"), write(1, "B2", 0, "P3"), write(2, "B1", 4, "P2"), write(3, "B2", 4, "P2")]).dominantComponent!.causalAblation.interaction;
  assert.equal(interaction.samePairCauseOverlapPresent, false);
  assert.deepEqual([interaction.payerOnlyDepthReduction, interaction.rangeOnlyDepthReduction, interaction.jointDepthReduction], [0, 0, 1]);
  assert.equal(interaction.classification, "separate-bottleneck-joint-only-depth-reduction");
});

test("mixed taxonomy: no overlap or depth effect remains a truthful negative", () => {
  const interaction = analysis([write(0, "A", 0, "P0"), write(1, "A", 2, "P1")]).dominantComponent!.causalAblation.interaction;
  assert.equal(interaction.samePairCauseOverlapPresent, false);
  assert.deepEqual([interaction.payerOnlyDepthReduction, interaction.rangeOnlyDepthReduction, interaction.jointDepthReduction], [0, 0, 0]);
  assert.equal(interaction.classification, "no-supported-interaction");
});

test("latest scan-plan resolution is deterministic, concrete, ordered, and bounded", () => {
  const options = { cluster: "devnet", rpcUrl: "https://api.devnet.solana.com", cacheDir: "cache/x", outputDir: "output/x", resolvedAt: "2026-01-01T00:00:00.000Z", latest: true, latestSlot: 100_000, windowCount: 5, windowSize: 100, windowStride: 10_000 } as const;
  const first = resolveDiscoveryPlan(options), second = resolveDiscoveryPlan(options);
  assert.deepEqual(first, second);
  assert.deepEqual(first.windows, [{ startSlot: 59_901, endSlot: 60_000 }, { startSlot: 69_901, endSlot: 70_000 }, { startSlot: 79_901, endSlot: 80_000 }, { startSlot: 89_901, endSlot: 90_000 }, { startSlot: 99_901, endSlot: 100_000 }]);
  assert.equal(first.requestedSlotCount, 500);
  assert.throws(() => resolveDiscoveryPlan({ ...options, windowCount: 6 }), /bounded to 500/);
});

async function tempPlan(startSlot: number, endSlot: number, overrides: Partial<DiscoveryPlan["options"]> = {}): Promise<DiscoveryPlan> {
  const root = await mkdtemp(join(tmpdir(), "microscope-discovery-"));
  const plan = resolveDiscoveryPlan({ cluster: "devnet", rpcUrl: "https://example.invalid", cacheDir: join(root, "cache"), outputDir: join(root, "output"), resolvedAt: "2026-01-01T00:00:00.000Z", startSlot, endSlot, delayMs: 0, top: 0 });
  return { ...plan, options: { ...plan.options, ...overrides } };
}

test("discovery is cache-first, resumable, and completes deterministic offline replay", async () => {
  const plan = await tempPlan(20, 21), calls: number[] = [];
  const fetchBlock = async (slot: number) => { calls.push(slot); return block([stateTouch(0, `State-${slot}`, "P0"), stateTouch(1, `State-${slot}`, "P1")], slot); };
  const online = await runDiscovery(plan, { offline: false, fetchBlock });
  assert.equal(online.index.coverage.observed, 2); assert.deepEqual(calls, [20, 21]);
  const offline = await runDiscovery(plan, { offline: true, fetchBlock: async () => { throw new Error("offline replay fetched"); } });
  assert.equal(offline.index.coverage.observed, 2); assert.deepEqual(calls, [20, 21]);
  assert.ok(offline.index.coverage.slots.every((record) => record.source === "cache"));
});

test("429 retries are adaptive, bounded, and recorded", async () => {
  const plan = await tempPlan(30, 30, { maxRetries: 2, backoffMs: 10 }), delays: number[] = [];
  let attempts = 0;
  const result = await runDiscovery(plan, { offline: false, fetchBlock: async (slot) => { attempts++; if (attempts < 3) throw new Error("HTTP 429 too many requests"); return block([], slot); }, delay: async (milliseconds) => { delays.push(milliseconds); } });
  assert.equal(attempts, 3); assert.deepEqual(delays, [10, 20]); assert.equal(result.index.coverage.retryAttempts, 2); assert.equal(result.index.coverage.observed, 1);
});

test("RPC BigInts are safely normalized at the cache boundary", async () => {
  const plan = await tempPlan(35, 35);
  const rpcBlock = { ...block([], 35), parentSlot: 34n, blockHeight: 123n, blockTime: 456n, ignoredBalance: 16_254_315_808_383_277n };
  const result = await runDiscovery(plan, { offline: false, fetchBlock: async () => rpcBlock });
  assert.equal(result.index.coverage.observed, 1);
  const cache = await readFile(join(plan.cacheDir, "slot-35.json"), "utf8");
  assert.match(cache, /"parentSlot": 34/); assert.match(cache, /"ignoredBalance": "16254315808383277"/); assert.doesNotMatch(cache, /34n/);
  const replay = await runDiscovery(plan, { offline: true }); assert.equal(replay.index.coverage.observed, 1);
  assert.deepEqual(replay.index.candidates, result.index.candidates);
});

test("offline missing and online failed states are explicit and failed state replays offline", async () => {
  const missingPlan = await tempPlan(40, 40), missing = await runDiscovery(missingPlan, { offline: true });
  assert.equal(missing.index.coverage.missing, 1);
  const failedPlan = await tempPlan(41, 41, { maxRetries: 0 }), failed = await runDiscovery(failedPlan, { offline: false, fetchBlock: async () => { throw new Error("provider down"); } });
  assert.equal(failed.index.coverage.failed, 1);
  const replay = await runDiscovery(failedPlan, { offline: true }); assert.equal(replay.index.coverage.failed, 1); assert.equal(replay.index.coverage.missing, 0);
});

test("a resumed successful block cache takes precedence over a stale failure sidecar", async () => {
  const plan = await tempPlan(42, 42, { maxRetries: 0 });
  await runDiscovery(plan, { offline: false, fetchBlock: async () => { throw new Error("temporary provider failure"); } });
  const resumed = await runDiscovery(plan, { offline: false, fetchBlock: async (slot) => block([], slot) }); assert.equal(resumed.index.coverage.observed, 1);
  const replay = await runDiscovery(plan, { offline: true }); assert.equal(replay.index.coverage.observed, 1); assert.equal(replay.index.coverage.failed, 0);
});

test("compact records are deterministic and omit complete transaction, edge, atom, wave, and model arrays", () => {
  const value = analysis([stateTouch(0, "State", "P0"), stateTouch(1, "State", "P1")], 50);
  const first = compactCandidatesForAnalysis(value, "devnet", "cache/slot-50.json"), second = compactCandidatesForAnalysis(value, "devnet", "cache/slot-50.json");
  assert.deepEqual(first, second); assert.equal(first[0]!.candidateId, deterministicCandidateId("devnet", "account-set:State"));
  const serialized = JSON.stringify(first);
  for (const prohibited of ["transactions", "instructions", "conflictEdges", "conflictAtoms", "waves", "counterfactualModels", "normalizedTransactions"]) assert.doesNotMatch(serialized, new RegExp(`"${prohibited}"`));
});

test("transparent reasons rank a smaller unfamiliar cross-payer candidate above a larger loader pattern", () => {
  const unfamiliar = compactCandidatesForAnalysis(analysis([stateTouch(0, "State", "P0"), stateTouch(1, "State", "P1")], 60), "devnet", "cache/slot-60.json");
  const infrastructure = compactCandidatesForAnalysis(analysis(Array.from({ length: 8 }, (_, index) => write(index, "LoaderBuffer", index * 4, "LoaderPayer")), 61), "devnet", "cache/slot-61.json");
  const ranked = rankCandidates([...infrastructure, ...unfamiliar]);
  assert.equal(ranked[0]!.infrastructureClassification, null); assert.equal(ranked[0]!.priorityTier, 1);
  assert.ok(ranked[0]!.selectionReasons.includes("cross-payer non-fee-payer shared writable contention"));
  assert.equal(ranked.at(-1)!.infrastructureClassification, "loader-deployment");
});

test("known-compute ranking is qualified by coverage and uses deterministic tie-breakers", () => {
  const candidates = compactCandidatesForAnalysis(analysis([stateTouch(0, "A", "P0"), stateTouch(1, "A", "P1")], 70), "devnet", "a");
  const lowCoverage = { ...structuredClone(candidates[0]!), candidateId: "candidate-low", knownComputeUnitShare: 0.9, knownComputeCoverage: 0.25, representativeSlot: 70 };
  const qualified = { ...structuredClone(candidates[0]!), candidateId: "candidate-qualified", knownComputeUnitShare: 0.4, knownComputeCoverage: 1, representativeSlot: 71 };
  const ranked = rankCandidates([lowCoverage, qualified]);
  assert.equal(ranked[0]!.candidateId, "candidate-qualified");
  assert.ok(ranked.find((candidate) => candidate.candidateId === "candidate-low")!.selectionReasons.some((reason) => /qualified by 25.0%/.test(reason)));
});

test("top-K materialization writes complete detail separately and handles a missing source", async () => {
  const plan = await tempPlan(80, 81, { top: 1 });
  const result = await runDiscovery(plan, { offline: false, fetchBlock: async (slot) => block([stateTouch(0, `State-${slot}`, "P0"), stateTouch(1, `State-${slot}`, "P1")], slot) });
  assert.equal(result.index.candidates.filter((candidate) => candidate.materialization?.status === "materialized").length, 1);
  const selected = result.index.candidates[0]!;
  assert.match(await readFile(join(plan.outputDir, selected.materialization!.analysisPath!), "utf8"), /"conflictEdges"/);
  assert.match(await readFile(join(plan.outputDir, selected.materialization!.reportPath!), "utf8"), /Solana Conflict Microscope/);
  await unlink(selected.sourceCachePaths[0]!); selected.materialization = null;
  await materializeTopCandidates(result.index, plan);
  assert.equal(selected.materialization!.status, "missing-source");
});

test("recurring candidate materialization uses its representative slot cache", async () => {
  const plan = await tempPlan(82, 83, { top: 1 });
  const result = await runDiscovery(plan, { offline: false, fetchBlock: async (slot) => block(slot === 82
    ? [stateTouch(0, "RecurringState", "P0"), stateTouch(1, "RecurringState", "P1")]
    : [stateTouch(0, "RecurringState", "P0"), stateTouch(1, "RecurringState", "P1"), stateTouch(2, "RecurringState", "P2")], slot) });
  const candidate = result.index.candidates[0]!;
  assert.equal(candidate.representativeSlot, 83); assert.deepEqual(candidate.observedSlots, [82, 83]);
  assert.equal(candidate.materialization?.status, "materialized");
  const detail = JSON.parse(await readFile(join(plan.outputDir, candidate.materialization!.analysisPath!), "utf8")) as { context: { slot: number } };
  assert.equal(detail.context.slot, 83);
});

function emptyIndex(): DiscoveryIndex {
  const infrastructureCandidateIds: Record<InfrastructureClassification, string[]> = { "vote-activity": [], "loader-deployment": [], "pure-same-payer-repetition": [], "system-funding": [], "known-program-or-sysvar": [], "fee-payer-only": [] };
  return { schemaVersion: "1.8", generatedAt: "2026-01-01T00:00:00.000Z", planPath: "discovery-plan.json", methodology: { stageA: "compact", stageB: "separate", conflictRule: "declared", scheduleDisclaimer: "not an exact private schedule", actionabilityDisclaimer: "insufficient evidence" }, coverage: { requested: 1, observed: 0, skipped: 0, missing: 1, unavailable: 0, failed: 0, retryAttempts: 0, slots: [{ slot: 1, status: "missing", source: "none", attempts: 0, cachePath: null, error: "missing" }] }, candidateCount: 0, highPriorityCandidateIds: [], infrastructureCandidateIds, candidates: [] };
}

test("empty report states a truthful negative and avoids actionability, schedule, runtime, and throughput overclaim", () => {
  const html = discoveryHtmlReport(emptyIndex());
  assert.match(html, /No high-priority unfamiliar candidate was found/);
  assert.doesNotMatch(html, /\uFFFD/); assert.match(html, /&middot;/);
  assert.doesNotMatch(html, /exact validator schedule|guaranteed throughput|runtime causality|is redesignable/i);
});

test("artifact budgets fail with a section-size report", () => {
  const index = emptyIndex(), json = serializeDiscoveryIndex(index), html = discoveryHtmlReport(index);
  assert.throws(() => enforceDiscoveryBudgets(json, html, index, { jsonBudgetBytes: 10, htmlBudgetBytes: 10 }), /section sizes:.*candidates=/);
  assert.doesNotThrow(() => enforceDiscoveryBudgets(json, html, index, { jsonBudgetBytes: Buffer.byteLength(json), htmlBudgetBytes: Buffer.byteLength(html) }));
});

test("discovery index emitted by the complete pipeline remains compact", async () => {
  const plan = await tempPlan(90, 90, { top: 0 });
  await runDiscovery(plan, { offline: false, fetchBlock: async (slot) => block([stateTouch(0, "State", "P0"), stateTouch(1, "State", "P1")], slot) });
  const serialized = await readFile(join(plan.outputDir, "discovery-index.json"), "utf8");
  for (const prohibited of ["transactions", "instructionPayloads", "conflictEdges", "conflictAtoms", "waves", "counterfactualModels"]) assert.doesNotMatch(serialized, new RegExp(`"${prohibited}"`));
});


test("separate causes each reduce a triangle even with a preserved third cause", () => {
  const result = analysis([write(0, 'A', 0, 'P', 'Third'), write(1, 'B', 0, 'P'), write(2, 'B', 4, 'Q', 'Third')]);
  const component = result.dominantComponent!, interaction = component.causalAblation.interaction;
  assert.deepEqual(component.counterfactualModels.map(model => model.waveBounds.provenMinimumWaveCount), [3, 2, 2, 2]);
  assert.equal(interaction.samePairCauseOverlapPresent, false);
  assert.deepEqual([interaction.payerOnlyDepthReduction, interaction.rangeOnlyDepthReduction, interaction.jointDepthReduction], [1, 1, 1]);
  assert.equal(interaction.classification, 'supported-overlap-or-depth-effect-without-joint-only-reduction');
});
