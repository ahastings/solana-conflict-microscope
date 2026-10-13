import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MILESTONE_23_HEADER, MILESTONE_23_STOP, validateMilestone23Handoff } from "../src/handoff.js";
import {
  EXPECTED_ELF_SHA256,
  NEXT_TIMESTAMP,
  ORACLES,
  TIMESTAMP_RANGE,
  chooseMilestone23Outcome,
  constructInstructionsSysvar,
  diffByteRanges,
  loadMilestone23Plan,
  mutateTimestamp,
  parseInstructionsSysvar,
  relationFor,
  runMilestone23,
} from "../src/milestone23.js";

const planPromise = loadMilestone23Plan("research-plans/velocity-equality-replay-milestone-2.3.json");
const resultPromise = planPromise.then((plan) => runMilestone23(plan, { offline: true }));
const fileHash = async (path: string): Promise<string> => createHash("sha256").update(await readFile(path)).digest("hex");

test("Milestone 2.3 handoff validator rejects stale identifiers and mismatched snapshots", () => {
  const valid = `${MILESTONE_23_HEADER}\nVelocity Exact-Binary Equality-Branch Replay and State-Diff Proof on base b5c832f.\nOutcome equality-branch-byte-identical-established; native-prefix-discriminator-2 remains unresolved.\n${MILESTONE_23_STOP}\n`;
  assert.deepEqual(validateMilestone23Handoff(valid, valid), []);
  assert.ok(validateMilestone23Handoff(valid, valid + "changed").some((error) => /byte-identical/.test(error)));
  assert.ok(validateMilestone23Handoff(valid.replace(MILESTONE_23_HEADER, "# Milestone 2.2 handoff"), valid).some((error) => /begin exactly|stale/.test(error)));
  assert.ok(validateMilestone23Handoff(valid.replace(MILESTONE_23_STOP, "Stop after Milestone 2.2."), valid).some((error) => /end with|stale/.test(error)));
});

test("guards the exact deployed ELF identity and materialized bytes", async () => {
  const [plan, result] = await Promise.all([planPromise, resultPromise]);
  assert.equal(plan.expectedExecutableSha256, EXPECTED_ELF_SHA256);
  assert.equal(plan.deployedElf.sha256, EXPECTED_ELF_SHA256);
  assert.equal(result.fixtureManifest.exactElf.sha256, EXPECTED_ELF_SHA256);
  assert.equal(await fileHash(plan.deployedElf.path), EXPECTED_ELF_SHA256);
});

test("pins the successful Linux runtime, dependencies, commit, and disposition", async () => {
  const result = await resultPromise;
  const probe = result.runtimeManifest.probe as { attempts: Array<{ tool: string; version: string; commit?: string; runtimeDependencies?: Record<string, string> }>; selectedDisposition: { exactElfExecuted: boolean; sourceMockUsed: boolean } };
  const mollusk = probe.attempts.find((item) => item.tool === "mollusk-svm");
  assert.equal(mollusk?.version, "0.13.1");
  assert.equal(mollusk?.commit, "f292187b800be56447ac6047cc27d19a922b37a7");
  assert.deepEqual(mollusk?.runtimeDependencies, { solanaAgaveCrates: "4.0.0", solanaInstructionsSysvar: "3.0.0", solanaSbpf: "0.14.4" });
  assert.deepEqual(probe.selectedDisposition, {
    tool: "mollusk-svm",
    exactElfExecuted: true,
    sourceMockUsed: false,
    outcome: "equality-branch-byte-identical-established",
    reason: "Baseline and all twelve frozen cases executed successfully; every equality-case oracle output was byte-identical to its exact input.",
  });
});

test("round-trips the exact five-instruction Instructions sysvar at current index three", async () => {
  const result = await resultPromise;
  const instructions = result.fixtureManifest.instructions;
  const bytes = constructInstructionsSysvar(instructions, 3);
  const parsed = parseInstructionsSysvar(bytes);
  assert.equal(parsed.currentInstructionIndex, 3);
  assert.equal(parsed.instructions.length, 5);
  assert.deepEqual(parsed.instructions.map((item) => item.programId), instructions.map((item) => item.programId));
  assert.deepEqual(parsed.instructions.map((item) => item.dataHex), instructions.map((item) => item.dataHex));
  assert.deepEqual(parsed.instructions.map((item) => item.accounts), instructions.map((item) => item.accounts.map(({ address, signer, writable }) => ({ address, signer, writable }))));
  assert.equal(result.instructionsProof.expectedAndParsedCanonicalMatch, true);
  assert.equal(result.instructionsProof.dataSha256, (await planPromise).instructionsSysvar.dataSha256);
});

test("preserves Ed25519 cross-instruction references and separate historical verification", async () => {
  const proof = (await resultPromise).instructionsProof.ed25519;
  assert.deepEqual(proof.signatureRange, [16, 80]);
  assert.deepEqual(proof.publicKeyRange, [80, 112]);
  assert.deepEqual(proof.messageRange, [114, 263]);
  assert.equal(proof.referencedInstructionIndex, 3);
  assert.equal(proof.historicalSignatureIndependentlyVerified, true);
  assert.match(proof.localHarnessVerificationClaim, /Agave Ed25519 precompile verified/);
  const planPin = (await planPromise).instructionFixture.ed25519;
  assert.equal(planPin.instructionRawHex, "01001000030050000300720095000300");
  assert.equal(planPin.signatureHex.length, 128);
  assert.equal(planPin.publicKeyHex.length, 64);
  assert.equal(planPin.messageHex.length, 298);
  assert.equal(planPin.messageSha256, proof.signedMessageSha256);
});

test("preserves authentic fixture account owner, lamports, executable flag, length, and data hashes", async () => {
  const [plan, result] = await Promise.all([planPromise, resultPromise]);
  assert.equal(result.fixtureManifest.fixtureLabel, "constructed-current-state-derived-fixture");
  assert.equal(result.fixtureManifest.historicalPrestate, false);
  assert.deepEqual(result.fixtureManifest.accounts, plan.fixtureAccountPins);
  assert.equal(result.fixtureManifest.accounts.length, 8);
  assert.equal(result.fixtureManifest.accounts.filter((item) => item.source === "authentic-cached-account").length, 7);
  assert.equal(result.fixtureManifest.accounts.filter((item) => item.source === "authoritative-serialization").length, 1);
});

test("validates the deployed timestamp byte range dynamically", async () => {
  const validation = (await resultPromise).timestampValidation;
  assert.deepEqual(validation.candidateByteRange, { start: 16, endExclusive: 24 });
  assert.equal(validation.candidateClassification, "deployed-branch-validated timestamp field");
  assert.equal(validation.authenticAccounts.length, 3);
  assert.equal(validation.allAuthenticCandidateValuesEqual, true);
  assert.deepEqual(validation.empiricalValidation, {
    exactElfExecuted: true,
    deployedPredicateReacted: true,
    predictedDirectionsObserved: true,
    classificationReached: true,
    evidence: "Equal and greater-than values are echoed by the deployed comparison branch; less-than values predictably pass that comparison and reach the separate future-message guard.",
  });
});

test("classifies less-than, equal, and greater timestamp inputs exactly", () => {
  assert.equal(relationFor(NEXT_TIMESTAMP - 1n), "less-than");
  assert.equal(relationFor(NEXT_TIMESTAMP), "equal");
  assert.equal(relationFor(NEXT_TIMESTAMP + 1n), "greater-than");
});

test("captures all twelve frozen three-way variants from exact execution", async () => {
  const cases = (await resultPromise).branchReplayResults.cases;
  assert.equal(cases.length, 12);
  assert.deepEqual(new Set(cases.map((item) => item.scope)).size, 4);
  for (const scope of new Set(cases.map((item) => item.scope))) {
    assert.deepEqual(cases.filter((item) => item.scope === scope).map((item) => item.targetRelation).sort(), ["equal", "greater-than", "less-than"]);
  }
  assert.ok(cases.every((item) => item.executionStatus === "executed-exact-elf" && item.programResult === "Success"));
});

test("captures equality logs but establishes identity from output bytes", async () => {
  const replay = (await resultPromise).branchReplayResults;
  assert.equal(replay.historicalReferenceOnly.exactObservedEqualityLogPattern, "Program log: Skipping lazer price update. next_timestamp {} <= current_timestamp {}");
  assert.equal(replay.historicalReferenceOnly.replayEvidence, true);
  const equality = replay.cases.filter((item) => item.targetRelation === "equal");
  assert.equal(equality.length, 4);
  assert.ok(equality.every((item) => item.logs.length > 0 && item.equalityLogCapturedFromReplay === true && item.branchClassification === "equality-byte-identical"));
});

test("proves equality output hashes and byte diffs from post-state", async () => {
  const diffs = (await resultPromise).oracleStateDiffs;
  assert.equal(diffs.primaryEqualityQuestionAnswered, true);
  assert.equal(diffs.records.length, 36);
  assert.ok(diffs.records.every((item) => item.outputSha256 === item.inputSha256 && item.classification === "byte-identical" && item.changedByteRanges.length === 0));
  assert.deepEqual(diffByteRanges(Buffer.from("abcd", "hex"), Buffer.from("abcd", "hex")), []);
});

test("generates exact contiguous byte ranges for controlled input mutations", () => {
  const source = Buffer.alloc(48);
  const mutation = mutateTimestamp(source, 0x0807060504030201n);
  assert.deepEqual(mutation.ranges, [{ start: 16, endExclusive: 24, oldHex: "0000000000000000", newHex: "0102030405060708" }]);
  assert.equal(mutation.data.readBigUInt64LE(TIMESTAMP_RANGE.start), 0x0807060504030201n);
});

test("documents every changed fixture byte within the candidate range", async () => {
  const variants = (await resultPromise).timestampValidation.plannedInputVariants;
  for (const variant of variants) {
    for (const mutation of variant.mutations) {
      assert.deepEqual(mutation.byteRange, { start: 16, endExclusive: 24 });
      assert.notEqual(mutation.beforeSha256, mutation.afterInputSha256);
      assert.ok(mutation.changedRanges.length >= 1);
      assert.ok(mutation.changedRanges.every((range) => range.start >= 16 && range.endExclusive <= 24));
    }
  }
});

test("covers all three oracle PDAs independently and together", async () => {
  const validation = (await resultPromise).timestampValidation;
  assert.deepEqual(validation.authenticAccounts.map((item) => [item.feedId, item.address]), ORACLES.map((item) => [item.feedId, item.address]));
  for (const oracle of ORACLES) {
    const cases = validation.plannedInputVariants.filter((item) => item.scope === `feed-${oracle.feedId}-independent`);
    assert.equal(cases.length, 3);
    assert.ok(cases.every((item) => item.mutations.length === 1 && item.mutations[0]?.address === oracle.address));
  }
  assert.ok(validation.plannedInputVariants.filter((item) => item.scope === "complete-three-feed").every((item) => item.mutations.length === 3));
});

test("separates program mutation from transaction fee-payer semantics", async () => {
  assert.deepEqual((await resultPromise).oracleStateDiffs.feePayerBoundary, {
    directInstructionFeeDebitModeled: false,
    absenceOfFeeDebitInferenceAllowed: false,
    milestone22FeePayerCliqueCausePreserved: true,
    explanation: "Velocity-instruction mutation, Post signer/writable declarations, and transaction-level runtime fee debit remain separate.",
  });
});

test("selects all three milestone outcomes from exact gates", () => {
  assert.equal(chooseMilestone23Outcome({ exactElfExecuted: true, fixtureValidated: true, equalityEmpiricallyValidated: true, oracleOutputsKnown: true, anyOracleMutation: false }), "equality-branch-byte-identical-established");
  assert.equal(chooseMilestone23Outcome({ exactElfExecuted: true, fixtureValidated: true, equalityEmpiricallyValidated: true, oracleOutputsKnown: true, anyOracleMutation: true }), "equality-branch-mutation-established");
  assert.equal(chooseMilestone23Outcome({ exactElfExecuted: false, fixtureValidated: false, equalityEmpiricallyValidated: false, oracleOutputsKnown: false, anyOracleMutation: false }), "exact-binary-replay-inconclusive");
});

test("requires cache-only replay and returns the byte-identical outcome", async () => {
  const plan = await planPromise;
  await assert.rejects(() => runMilestone23(plan, { offline: false }), /cache-only/);
  assert.equal((await resultPromise).outcome, "equality-branch-byte-identical-established");
  assert.equal(plan.offlineReplay.networkRequestsWhenOffline, 0);
});

test("preserves every protected prior artifact including all Milestone 2.2 outputs", async () => {
  const plan = await planPromise;
  await resultPromise;
  for (const [path, expected] of Object.entries(plan.protectedArtifactHashes)) assert.equal(await fileHash(path), expected, path);
  assert.ok(plan.protectedArtifactHashes["output/research/velocity-anchor-bundle/anchor-conflict-attribution.json"]);
  assert.ok(plan.protectedArtifactHashes["output/research/velocity-anchor-bundle/anchor-bundle-dossier.json"]);
});

test("preserves graph attribution and unresolved native status", async () => {
  await resultPromise;
  const graph = JSON.parse(await readFile("output/research/velocity-anchor-bundle/anchor-conflict-attribution.json", "utf8")) as { blocks: Array<{ edgeCount: number; atomCount: number; waveLowerBound: number; waveUpperBound: number; feePayerIndependentlyPreservesClique: boolean; nativeContext: { semanticStatus: string } }> };
  assert.equal(graph.blocks.length, 6);
  assert.ok(graph.blocks.every((item) => item.edgeCount === 3 && item.atomCount === 12 && item.waveLowerBound === 3 && item.waveUpperBound === 3 && item.feePayerIndependentlyPreservesClique && item.nativeContext.semanticStatus === "unresolved-excluded"));
  const binary = JSON.parse(await readFile("output/research/velocity-binary/variant-correspondence.json", "utf8")) as { variants: Array<{ observedVariant: string; confidence: string }> };
  assert.equal(binary.variants.find((item) => item.observedVariant === "native-prefix-discriminator-2")?.confidence, "unresolved");
});

test("preserves discovery, sourceability, and Candidate #1/#2 dispositions", async () => {
  await resultPromise;
  const discovery = JSON.parse(await readFile("output/discovery-devnet/discovery-index.json", "utf8")) as { coverage: { requested: number; observed: number }; candidates: unknown[] };
  assert.equal(discovery.coverage.requested, 500);
  assert.equal(discovery.coverage.observed, 500);
  const sourceability = JSON.parse(await readFile("output/research/sourceability/sourceability-index.json", "utf8")) as { discoveryRankPreserved: boolean; candidates: Array<{ candidateId: string; disposition: string }> };
  assert.equal(sourceability.discoveryRankPreserved, true);
  assert.equal(sourceability.candidates.find((item) => item.candidateId === "candidate-ff30780de8479976")?.disposition, "preserved-prior-dossier");
  assert.equal(sourceability.candidates.find((item) => item.candidateId === "candidate-e5d929864077a76b")?.disposition, "deferred-not-rejected");
  const candidateOne = JSON.parse(await readFile("output/research/candidate-ff30780de8479976/candidate-dossier.json", "utf8")) as { decision: string };
  assert.equal(candidateOne.decision, "black-box-structure-only");
});

test("regenerates the exact Linux result deterministically", async () => {
  const plan = await planPromise;
  await resultPromise;
  const before = await Promise.all(["replay-fixture-manifest.json", "instructions-sysvar-proof.json", "timestamp-field-validation.json", "branch-replay-results.json", "oracle-state-diffs.json", "runtime-manifest.json", "equality-replay-report.html"].map((name) => fileHash(`${plan.outputDirectory}/${name}`)));
  await runMilestone23(plan, { offline: true });
  const after = await Promise.all(["replay-fixture-manifest.json", "instructions-sysvar-proof.json", "timestamp-field-validation.json", "branch-replay-results.json", "oracle-state-diffs.json", "runtime-manifest.json", "equality-replay-report.html"].map((name) => fileHash(`${plan.outputDirectory}/${name}`)));
  assert.deepEqual(after, before);
});

test("contains no scheduling, performance, decoder, or redesign overclaim", async () => {
  const text = JSON.stringify(await resultPromise).toLowerCase();
  for (const forbidden of ["safe to parallelize", "becomes one wave", "speedup", "throughput recovered", "semantic decoder authorized", "exact validator schedule", "source-confirmed-deployed-semantics established"]) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
});
