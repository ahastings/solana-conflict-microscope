import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { MILESTONE_20_HEADER, MILESTONE_20_STOP, validateMilestone20Handoff } from "../src/handoff.js";
import {
  anchorInstructionDiscriminator,
  buildSourceabilityArtifacts,
  chooseVelocityDecision,
  classifyVelocityInstructionBytes,
  groupCandidateByProgramFamily,
  isExactMilestone20Identity,
  loadSourceabilityPlan,
  loadVelocityResearchPlan,
  runMilestone20,
} from "../src/milestone20.js";
import type { SourceabilityFamilyPlan } from "../src/milestone20-types.js";

const SOURCEABILITY_PLAN = "research-plans/sourceability-milestone-2.0.json";
const CANDIDATE_PLAN = "research-plans/candidate-043c938568ad5e15.json";
const SOURCEABILITY_OUTPUT = "output/research/sourceability";
const CANDIDATE_OUTPUT = "output/research/candidate-043c938568ad5e15";
const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const fileHash = async (path: string): Promise<string> => sha256(await readFile(path));

test("Milestone 2.0 handoff validator rejects stale identifiers and mismatched snapshots", () => {
  const valid = `${MILESTONE_20_HEADER}\n\nSourceability Triage and Velocity Semantic Dossier\n\nBase afec9ae. Research candidate-043c938568ad5e15. Decision identity-found-semantics-incomplete.\n\n${MILESTONE_20_STOP}\n`;
  assert.deepEqual(validateMilestone20Handoff(valid, valid), []);
  assert.ok(validateMilestone20Handoff(valid, `${valid}changed`).some((error) => /byte-identical/.test(error)));
  assert.ok(validateMilestone20Handoff(valid.replace(MILESTONE_20_HEADER, "# Milestone 1.9 handoff"), valid).some((error) => /begin exactly|stale/.test(error)));
  assert.ok(validateMilestone20Handoff(valid.replace(MILESTONE_20_STOP, "Stop after Milestone 1.9."), valid).some((error) => /end with|stale/.test(error)));
});

test("program-family grouping is meaningful, deterministic, and independent of candidate ID", async () => {
  const plan = await loadSourceabilityPlan(SOURCEABILITY_PLAN);
  const velocity = groupCandidateByProgramFamily({
    candidateId: "arbitrary-candidate",
    invokedProgramIds: [
      "ComputeBudget111111111111111111111111111111",
      "Ed25519SigVerify111111111111111111111111111",
      "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P",
    ],
  }, plan.families);
  assert.equal(velocity.familyId, "family-velocity-v2");
  const ambiguous: SourceabilityFamilyPlan[] = [velocity, { ...velocity, familyId: "duplicate-family" }];
  assert.throws(() => groupCandidateByProgramFamily({ candidateId: "x", invokedProgramIds: ["vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P"] }, ambiguous), /matched 2/);
});

test("sourceability priority is a separate evidence-ladder view and never replaces discovery rank", async () => {
  const plan = await loadSourceabilityPlan(SOURCEABILITY_PLAN);
  const { index, familyMap } = await buildSourceabilityArtifacts(plan);
  assert.equal(index.discoveryRankPreserved, true);
  assert.equal(index.candidates.length, 19);
  assert.equal(familyMap.families.length, 6);
  assert.deepEqual(index.candidates.map((candidate) => candidate.discoveryRank), Array.from({ length: 19 }, (_, index) => index + 1));
  const primary = index.candidates.find((candidate) => candidate.disposition === "primary-bounded-dossier")!;
  assert.equal(primary.discoveryRank, 3);
  assert.equal(primary.researchPriority, 1);
});

test("authoritative exact-ID classification requires the official Velocity match and preserves deployment uncertainty", async () => {
  const plan = await loadSourceabilityPlan(SOURCEABILITY_PLAN);
  const { index } = await buildSourceabilityArtifacts(plan);
  const candidate = index.candidates.find((item) => item.candidateId === "candidate-043c938568ad5e15")!;
  assert.equal(candidate.authoritativeExactProgramIdMatch, true);
  assert.equal(candidate.maintainedSdkOrIdlAvailability, true);
  assert.equal(candidate.publicSourceRepositoryAvailability, true);
  assert.equal(candidate.sourceabilityOutcome, "authoritative-source-and-interface");
  assert.equal(candidate.versionDeploymentCorrespondence, "source-family-only");
});

test("Candidate #2 is deferred, never rejected or demoted", async () => {
  const plan = await loadSourceabilityPlan(SOURCEABILITY_PLAN);
  const { index } = await buildSourceabilityArtifacts(plan);
  const candidate = index.candidates.find((item) => item.candidateId === "candidate-e5d929864077a76b")!;
  assert.equal(candidate.discoveryRank, 2);
  assert.equal(candidate.disposition, "deferred-not-rejected");
  assert.equal(index.candidateTwoFinding.authoritativeMutationSourceFound, false);
  assert.equal(candidate.recurrenceCount, 6);
  assert.equal(candidate.payerCount, 2);
  assert.deepEqual(candidate.depth, { lowerBound: 2, upperBound: 2, provenMinimum: 2 });
  assert.equal(candidate.knownComputeContext.qualifiedShare, 0.551766);
  assert.deepEqual(candidate.existingCauseRoleEvidence.decodedRoles, ["destination"]);
  assert.equal(candidate.sharedWritableAccountCount, 1);
  assert.equal(candidate.materializationPath.status, "materialized");
  assert.doesNotMatch(JSON.stringify(index.candidateTwoFinding), /unimportant|exhausted|"disposition":"rejected"/i);
});

test("Candidate #3 manifest pins exact identity, six signatures sets, sources, snapshots, and every input hash", async () => {
  const plan = await loadVelocityResearchPlan(CANDIDATE_PLAN);
  assert.equal(plan.candidateId, "candidate-043c938568ad5e15");
  assert.equal(plan.identity.accounts.length, 6);
  assert.equal(plan.expectedOccurrences.length, 6);
  assert.equal(plan.expectedOccurrences.every((occurrence) => occurrence.transactionSignatures.length === 4), true);
  assert.equal(plan.sources.length, 11);
  assert.equal(plan.snapshotRequest.sharedWritableAddresses.length, 6);
  assert.equal(plan.snapshotRequest.representativeInstructionSpecificAddresses.length, 10);
  assert.ok(plan.inputEvidence.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)));
  assert.equal(plan.offlineReplay.networkRequestsWhenOffline, 0);
});

test("partial account-set overlap is rejected", () => {
  const identity = ["a", "b", "c"];
  assert.equal(isExactMilestone20Identity(["c", "a", "b"], identity), true);
  assert.equal(isExactMilestone20Identity(["a", "b"], identity), false);
  assert.equal(isExactMilestone20Identity(["a", "b", "c", "d"], identity), false);
});

test("Velocity discriminators distinguish two Anchor paths from the native prefix", () => {
  assert.equal(anchorInstructionDiscriminator("post_pyth_lazer_oracle_update"), "daedaaf5278fa621");
  assert.equal(anchorInstructionDiscriminator("update_perp_bid_ask_twap"), "f717ff41d45addc2");
  const post = classifyVelocityInstructionBytes(Buffer.from("daedaaf5278fa62100", "hex"));
  const twap = classifyVelocityInstructionBytes(Buffer.from("f717ff41d45addc2", "hex"));
  const native = classifyVelocityInstructionBytes(Buffer.from("ffffffff020301000000", "hex"));
  assert.equal(post.observedVariant, "post-pyth-lazer-oracle-update");
  assert.equal(twap.observedVariant, "update-perp-bid-ask-twap");
  assert.equal(native.observedVariant, "native-prefix-discriminator-2");
  assert.equal(native.encoding, "native-prefix");
});

test("all three Candidate #3 decision outcomes remain explicit", () => {
  assert.equal(chooseVelocityDecision(true, "exact verified deployment", true, true), "source-confirmed-semantics");
  assert.equal(chooseVelocityDecision(true, "strongly version-correlated", true, true), "source-confirmed-semantics");
  assert.equal(chooseVelocityDecision(true, "source-family-only", true, true), "identity-found-semantics-incomplete");
  assert.equal(chooseVelocityDecision(true, "unresolved", false, false), "identity-found-semantics-incomplete");
  assert.equal(chooseVelocityDecision(false, "exact verified deployment", true, true), "black-box-structure-only");
});

test("offline replay revalidates all six exact occurrences and regenerates byte-identical compact artifacts", async () => {
  const [sourceabilityPlan, candidatePlan] = await Promise.all([
    loadSourceabilityPlan(SOURCEABILITY_PLAN),
    loadVelocityResearchPlan(CANDIDATE_PLAN),
  ]);
  const artifacts = [
    `${SOURCEABILITY_OUTPUT}/sourceability-index.json`,
    `${SOURCEABILITY_OUTPUT}/sourceability-report.html`,
    `${SOURCEABILITY_OUTPUT}/program-family-map.json`,
    `${CANDIDATE_OUTPUT}/candidate-dossier.json`,
    `${CANDIDATE_OUTPUT}/candidate-dossier.html`,
    `${CANDIDATE_OUTPUT}/candidate-evidence.ndjson`,
    `${CANDIDATE_OUTPUT}/source-manifest.json`,
    `${CANDIDATE_OUTPUT}/account-snapshots.json`,
    `${CANDIDATE_OUTPUT}/instruction-layout.json`,
    `${CANDIDATE_OUTPUT}/signer-message-summary.json`,
    "docs/research/CANDIDATE-043C938568AD5E15.md",
  ];
  const before = await Promise.all(artifacts.map(fileHash));
  const result = await runMilestone20(sourceabilityPlan, candidatePlan, { offline: true });
  const after = await Promise.all(artifacts.map(fileHash));
  assert.deepEqual(after, before);
  assert.equal(result.occurrences.length, 6);
  assert.deepEqual(result.occurrences.map((occurrence) => occurrence.slot), [489572998, 489593012, 489602971, 489603031, 489612991, 489613051]);
  assert.ok(result.occurrences.every((occurrence) => occurrence.transactions.length === 4));
  assert.ok(result.occurrences.every((occurrence) => occurrence.statusCounts.success === 4));
  assert.ok(result.occurrences.every((occurrence) => occurrence.conflictEdges.length === 6 && occurrence.conflictAtoms.length === 15));
  assert.ok(result.occurrences.every((occurrence) => occurrence.distinctPayers.length === 2));
  assert.ok(result.occurrences.every((occurrence) => occurrence.waveLowerBound === 4 && occurrence.waveUpperBound === 4));
  assert.ok(result.occurrences.every((occurrence) => occurrence.knownComputeCoverage === 1));
  assert.equal(result.occurrences.reduce((sum, occurrence) => sum + occurrence.knownComputeUnits, 0), 1090314);
  assert.equal(result.dossier.decision, "identity-found-semantics-incomplete");
  assert.ok((await stat(`${CANDIDATE_OUTPUT}/candidate-dossier.json`)).size < 80_000);
  assert.ok((await stat(`${CANDIDATE_OUTPUT}/candidate-dossier.html`)).size < 180_000);
});

test("Ed25519 parsing resolves cross-instruction bytes and verifies every observed signature", async () => {
  const summary = JSON.parse(await readFile(`${CANDIDATE_OUTPUT}/signer-message-summary.json`, "utf8")) as {
    transactionCount: number; ed25519InstructionCount: number; signatureCount: number;
    malformedInstructionCount: number; unsupportedReferenceCount: number; localVerificationPassCount: number;
    sameInstructionReferenceCount: number; crossInstructionReferenceCount: number; distinctSignerCount: number; distinctMessageCount: number;
  };
  assert.deepEqual(summary, {
    ...summary,
    transactionCount: 24,
    ed25519InstructionCount: 18,
    signatureCount: 18,
    malformedInstructionCount: 0,
    unsupportedReferenceCount: 0,
    localVerificationPassCount: 18,
    sameInstructionReferenceCount: 0,
    crossInstructionReferenceCount: 54,
    distinctSignerCount: 1,
    distinctMessageCount: 6,
  });
});

test("instruction layout and account-role matrix keep deployed mutation unknown", async () => {
  const layout = JSON.parse(await readFile(`${CANDIDATE_OUTPUT}/instruction-layout.json`, "utf8")) as {
    deploymentCorrespondence: string;
    groups: Array<{ observedVariant: string; count: number; exactDeployedVariantEstablished: boolean }>;
    accountRoleMatrix: Array<{ sourceConfirmedMutation: string; sourceConfirmedDeployedRole: unknown; declaredAccess: string; sourceFamilyMutation: string | null }>;
    nativeVariantMismatch: { observedAccountCount: number; sourceFamilyMinimumAccountCount: number };
  };
  assert.equal(layout.deploymentCorrespondence, "source-family-only");
  assert.deepEqual(layout.groups.map((group) => [group.observedVariant, group.count]), [
    ["native-prefix-discriminator-2", 6],
    ["post-pyth-lazer-oracle-update", 18],
    ["update-perp-bid-ask-twap", 18],
  ]);
  assert.ok(layout.groups.every((group) => group.exactDeployedVariantEstablished === false));
  assert.ok(layout.accountRoleMatrix.every((row) => row.sourceConfirmedMutation === "unknown" && row.sourceConfirmedDeployedRole === null));
  assert.ok(layout.accountRoleMatrix.some((row) => row.declaredAccess === "writable" && row.sourceFamilyMutation !== null));
  assert.deepEqual(layout.nativeVariantMismatch, { ...layout.nativeVariantMismatch, observedAccountCount: 5, sourceFamilyMinimumAccountCount: 6 });
});

test("current snapshots are labeled current, never historical, and pin deployed ProgramData metadata", async () => {
  const snapshots = JSON.parse(await readFile(`${CANDIDATE_OUTPUT}/account-snapshots.json`, "utf8")) as {
    snapshots: Array<{ temporalScope: string }>;
    deployedProgram: { lastDeploySlot: string; upgradeAuthority: string; executableBytesSha256: string; correspondenceSearchHashMatched: boolean };
    limitation: string;
  };
  assert.equal(snapshots.snapshots.length, 18);
  assert.ok(snapshots.snapshots.every((snapshot) => snapshot.temporalScope === "current-snapshot-not-historical"));
  assert.equal(snapshots.deployedProgram.lastDeploySlot, "488659528");
  assert.equal(snapshots.deployedProgram.upgradeAuthority, "8Z22ng8xW4AemtC9WdwxcZyWthnwVbQLbDfyuARCs122");
  assert.equal(snapshots.deployedProgram.executableBytesSha256, "89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c");
  assert.equal(snapshots.deployedProgram.correspondenceSearchHashMatched, false);
  assert.match(snapshots.limitation, /current read-only snapshots.*not historical/i);
});

test("source manifest separates exact Velocity identity from inherited Drift source-family evidence", async () => {
  const manifest = JSON.parse(await readFile(`${CANDIDATE_OUTPUT}/source-manifest.json`, "utf8")) as {
    authoritativeProgramIdentityFound: boolean;
    deployedSourceCorrespondence: string;
    verifiedBuildMatchFound: boolean;
    sources: Array<{ id: string; exactProgramIdMatch: boolean; contentSha256: string }>;
    inheritedDriftDistinction: string[];
    correspondenceReasons: string[];
  };
  assert.equal(manifest.authoritativeProgramIdentityFound, true);
  assert.equal(manifest.deployedSourceCorrespondence, "source-family-only");
  assert.equal(manifest.verifiedBuildMatchFound, false);
  assert.equal(manifest.sources.find((source) => source.id === "velocity-docs-program-id")?.exactProgramIdMatch, true);
  assert.ok(manifest.sources.every((source) => /^[0-9a-f]{64}$/.test(source.contentSha256)));
  assert.match(manifest.inheritedDriftDistinction.join(" "), /not automatic proof|not substituted/i);
  assert.match(manifest.correspondenceReasons.join(" "), /dRifty|five accounts|not verified/i);
});

test("compact artifacts exclude full analyses, semantic footprints, and counterfactual models", async () => {
  const dossier = await readFile(`${CANDIDATE_OUTPUT}/candidate-dossier.json`, "utf8");
  for (const prohibited of ["completeBlockAnalyses", "normalizedTransactions", "semanticFootprint", "counterfactualModels"]) {
    assert.doesNotMatch(dossier, new RegExp(`"${prohibited}"`));
  }
  const evidenceLines = (await readFile(`${CANDIDATE_OUTPUT}/candidate-evidence.ndjson`, "utf8")).trim().split(/\r?\n/);
  assert.equal(evidenceLines.length, 6);
  assert.ok(evidenceLines.every((line) => JSON.parse(line).evidenceId));
});

test("Milestone 1.8 discovery, Candidate #1 dossier, and all eight legacy artifacts remain byte-identical", async () => {
  const discovery = JSON.parse(await readFile("output/discovery-devnet/discovery-index.json", "utf8")) as {
    schemaVersion: string; coverage: { requested: number; observed: number }; candidateCount: number;
    highPriorityCandidateIds: string[]; candidates: Array<{ candidateId: string; materialization: null | { status: string } }>;
  };
  assert.equal(discovery.schemaVersion, "1.8");
  assert.equal(discovery.coverage.requested, 500);
  assert.equal(discovery.coverage.observed, 500);
  assert.equal(discovery.candidateCount, 70);
  assert.equal(discovery.highPriorityCandidateIds.length, 19);
  assert.equal(discovery.candidates.filter((candidate) => candidate.materialization?.status === "materialized").length, 20);
  const candidateOne = JSON.parse(await readFile("output/research/candidate-ff30780de8479976/candidate-dossier.json", "utf8")) as { decision: string; exactIdentity: { recurrenceBlockCount: number } };
  const signerOne = JSON.parse(await readFile("output/research/candidate-ff30780de8479976/signer-message-summary.json", "utf8")) as { transactionCount: number; signatureCount: number; localVerificationPassCount: number };
  assert.equal(candidateOne.decision, "black-box-structure-only");
  assert.equal(candidateOne.exactIdentity.recurrenceBlockCount, 25);
  assert.deepEqual(signerOne, { ...signerOne, transactionCount: 59, signatureCount: 118, localVerificationPassCount: 118 });
  const expected: Record<string, string> = {
    "output/analysis.json": "690784c9aa1454e53e4375ff1c600cdcc3389175f205e4db29a9743bab92c1f9",
    "output/report.html": "299a8e75061b1a81740e5aa3fa05786040a0010ff71d3f90149fe2d6d5ab0761",
    "output/cross-payer-real/analysis.json": "3d2dedf405f0dfda7f411bb3f240e8a05c58b56d7502ece8d7e1dd61914ab6b5",
    "output/cross-payer-real/report.html": "7854e16898bd6207681fdbfd2ce1724ae3165b365840b22683dfd105fdcc1041",
    "output/cross-payer-teaching/analysis.json": "9b57a0260429b16730c9cc0b0645c4d506a7c152e00fb22aacb80e61642e84ae",
    "output/cross-payer-teaching/report.html": "02985274705b2e03f34ba1b32e248a599cc3fbad85d28cba53b46efd79e5af7c",
    "output/range-488638500-488638508/range-analysis.json": "27bddc7cd8dc045a9a4b3a24f50fdb33a7a521de12598fdd501942f570e8f433",
    "output/range-488638500-488638508/range-report.html": "31f0190626429c70695d35514fa033507314d986f87ceccd9f25e263309bca3a",
  };
  for (const [path, hash] of Object.entries(expected)) assert.equal(await fileHash(path), hash, path);
});

test("reports contain required caution and no scheduling, throughput, or redesign overclaim", async () => {
  const reports = await Promise.all([
    readFile(`${SOURCEABILITY_OUTPUT}/sourceability-report.html`, "utf8"),
    readFile(`${CANDIDATE_OUTPUT}/candidate-dossier.html`, "utf8"),
    readFile("docs/research/CANDIDATE-043C938568AD5E15.md", "utf8"),
  ]);
  for (const report of reports) {
    assert.doesNotMatch(report, /guaranteed throughput|safe(?:ly)? parallel|is redesignable|deployed mutation is proven/i);
  }
  assert.match(reports[0]!, /Discovery rank remains unchanged|does not replace discovery rank/i);
  assert.match(reports[1]!, /Declared account contention|source-family-only/i);
  assert.match(reports[2]!, /No semantic footprint, decoder, counterfactual model, or redesign was implemented/);
});
