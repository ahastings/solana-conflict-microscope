import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MILESTONE_21_HEADER, MILESTONE_21_STOP, validateMilestone21Handoff } from "../src/handoff.js";
import {
  allSampleSlotsAfter,
  chooseOverallOutcome,
  classifyBuildAttempt,
  classifyComparisonFingerprint,
  classifyDeploymentContinuity,
  compareAccountStructure,
  decodeProgramData,
  evaluateVariantConfidence,
  isExactBinaryMatch,
  loadMilestone21Plan,
  parseElf64,
  runMilestone21,
} from "../src/milestone21.js";
import type { AccountContractEntry } from "../src/milestone21-types.js";

const PLAN = "research-plans/velocity-binary-milestone-2.1.json";
const OUTPUT = "output/research/velocity-binary";
const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const fileHash = async (path: string): Promise<string> => sha256(await readFile(path));

test("Milestone 2.1 handoff validator rejects stale identifiers and mismatched snapshots", () => {
  const valid = MILESTONE_21_HEADER + "\n\nVelocity Deployed-Binary Archaeology and Historical Source Correspondence\n\nBase 532f256. Continuity sample-binary-continuity-established. Outcome variant-level-strong-correspondence.\n\n" + MILESTONE_21_STOP + "\n";
  assert.deepEqual(validateMilestone21Handoff(valid, valid), []);
  assert.ok(validateMilestone21Handoff(valid, valid + "changed").some((error) => /byte-identical/.test(error)));
  assert.ok(validateMilestone21Handoff(valid.replace(MILESTONE_21_HEADER, "# Milestone 2.0 handoff"), valid).some((error) => /begin exactly|stale/.test(error)));
  assert.ok(validateMilestone21Handoff(valid.replace(MILESTONE_21_STOP, "Stop after Milestone 2.0."), valid).some((error) => /end with|stale/.test(error)));
});

test("ProgramData bincode header extraction isolates the exact remaining payload", () => {
  const payload = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 0]);
  const raw = Buffer.alloc(45 + payload.length);
  raw.writeUInt32LE(3, 0);
  raw.writeBigUInt64LE(488659528n, 4);
  raw.writeUInt8(1, 12);
  Buffer.alloc(32, 0xab).copy(raw, 13);
  payload.copy(raw, 45);
  const result = decodeProgramData(raw);
  assert.equal(result.stateTag, 3);
  assert.equal(result.slot, 488659528);
  assert.equal(result.headerLength, 45);
  assert.equal(result.executableLength, payload.length);
  assert.equal(result.executableSha256, sha256(payload));
  assert.deepEqual(result.executable, payload);
});

test("deployed executable payload hash and ELF structure are frozen", async () => {
  const metadata = JSON.parse(await readFile(`${OUTPUT}/deployed-programdata-metadata.json`, "utf8")) as { rawProgramDataSha256: string; executablePayloadSha256: string; executablePayloadLength: number; headerLength: number };
  const snapshot = JSON.parse(await readFile("cache/research/candidate-043c938568ad5e15/account-snapshots.raw.json", "utf8")) as { addresses: string[]; response: { result: { value: Array<{ data: [string, string] }> } } };
  const index = snapshot.addresses.indexOf("HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7");
  const raw = Buffer.from(snapshot.response.result.value[index]!.data[0], "base64");
  const decoded = decodeProgramData(raw);
  const elf = parseElf64(decoded.executable);
  assert.equal(metadata.rawProgramDataSha256, "618011650ffeed486053d25aa439634ab765c15af24741ef3c32bcd026db5222");
  assert.equal(metadata.executablePayloadSha256, "89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c");
  assert.equal(metadata.executablePayloadLength, 6050397);
  assert.equal(metadata.headerLength, 45);
  assert.equal(elf.valid, true);
  assert.equal(elf.header.machine, 263);
  assert.equal(elf.header.sectionHeaderCount, 9);
});

test("sample-slot ordering requires every sample strictly after the ProgramData slot", () => {
  assert.equal(allSampleSlotsAfter([489572998, 489613051], 488659528), true);
  assert.equal(allSampleSlotsAfter([488659528, 489613051], 488659528), false);
  assert.equal(allSampleSlotsAfter([], 488659528), false);
});

test("deployment-history evidence classification never relies on address equality alone", () => {
  const complete = { programPointsToProgramData: true, slotMatches: true, allSamplesAfter: true, upgradeTransactionDecoded: true, noLaterProgramDataMutation: true, snapshotAfterSamples: true };
  assert.equal(classifyDeploymentContinuity(complete), "sample-binary-continuity-established");
  assert.equal(classifyDeploymentContinuity({ ...complete, noLaterProgramDataMutation: false }), "sample-binary-continuity-probable");
  assert.equal(classifyDeploymentContinuity({ ...complete, slotMatches: false, allSamplesAfter: false, upgradeTransactionDecoded: false, noLaterProgramDataMutation: false }), "sample-binary-continuity-unresolved");
});

const observedFive: AccountContractEntry[] = [
  { position: 0, role: "observed", signer: true, writable: true, address: "payer" },
  { position: 1, role: "observed", signer: false, writable: false, address: "state" },
  { position: 2, role: "observed", signer: false, writable: true, address: "cache0" },
  { position: 3, role: "observed", signer: false, writable: true, address: "cache1" },
  { position: 4, role: "observed", signer: false, writable: true, address: "velocityAccount", owner: "velocity" },
];
const sourceSix: AccountContractEntry[] = [
  { position: 0, role: "admin", signer: true, writable: true },
  { position: 1, role: "state", signer: false, writable: false },
  { position: 2, role: "cache0", signer: false, writable: true },
  { position: 3, role: "cache1", signer: false, writable: true },
  { position: 4, role: "system_program", signer: false, writable: false, address: "11111111111111111111111111111111" },
  { position: 5, role: "rent", signer: false, writable: false },
];

test("five-account structural comparison rejects a six-account minimum", () => {
  const comparison = compareAccountStructure("six-account-source", observedFive, sourceSix, 6);
  assert.equal(comparison.observedCount, 5);
  assert.equal(comparison.sourceMinimumCount, 6);
  assert.equal(comparison.cardinalityCompatible, false);
  assert.equal(comparison.structurallyCompatible, false);
});

test("System Program mismatch detection refuses to relabel a Velocity-owned account", () => {
  const comparison = compareAccountStructure("system-position", observedFive, sourceSix, 5);
  assert.equal(comparison.systemProgramMismatch, true);
  assert.equal(comparison.positionComparisons[4]!.compatible, false);
  assert.match(comparison.positionComparisons[4]!.reason, /System Program.*velocityAccount.*velocity/);
});

test("historical fingerprint classifier distinguishes less-than, equality, and legacy inverse forms", () => {
  assert.equal(classifyComparisonFingerprint("if next_timestamp.unwrap() < current_timestamp {"), "less-than");
  assert.equal(classifyComparisonFingerprint("if next_timestamp.unwrap() <= current_timestamp {"), "less-than-or-equal");
  assert.equal(classifyComparisonFingerprint("if current_timestamp >= next_timestamp.unwrap() {"), "greater-than-or-equal");
  assert.equal(classifyComparisonFingerprint("timestamps are compared elsewhere"), "other");
});

test("source-history manifest and velocity-v1 negative are deterministic", async () => {
  const source = JSON.parse(await readFile(`${OUTPUT}/source-history.json`, "utf8")) as {
    commits: Array<{ commit: string }>;
    repositoriesInspected: Array<{ repository: string; result?: { finding?: string; containsOnChainRustSource?: boolean; containsBuildArtifacts?: boolean } }>;
  };
  assert.deepEqual(source.commits.map((entry) => entry.commit), source.commits.map((entry) => entry.commit).sort());
  assert.ok(source.commits.some((entry) => entry.commit === "f7df335599c194bc759cebf682a11bcad6bd5ed2"));
  const v1 = source.repositoriesInspected.find((entry) => entry.repository === "velocity-exchange/velocity-v1")?.result;
  assert.equal(v1?.finding, "client-sdk-idl-only-no-on-chain-rust-or-build-metadata");
  assert.equal(v1?.containsOnChainRustSource, false);
  assert.equal(v1?.containsBuildArtifacts, false);
});

test("build-attempt classification and exact binary matching remain literal", () => {
  const deployed = "a".repeat(64);
  assert.equal(classifyBuildAttempt({ buildExecuted: false, reproducible: false, firstHash: null, repeatHash: null, deployedHash: deployed }), "build-unavailable");
  assert.equal(classifyBuildAttempt({ buildExecuted: true, reproducible: false, firstHash: "b", repeatHash: "c", deployedHash: deployed }), "non-reproducible-build");
  assert.equal(classifyBuildAttempt({ buildExecuted: true, reproducible: true, firstHash: "b", repeatHash: "b", deployedHash: deployed }), "reproducible-binary-mismatch");
  assert.equal(classifyBuildAttempt({ buildExecuted: true, reproducible: true, firstHash: deployed, repeatHash: deployed, deployedHash: deployed }), "exact-binary-match");
  assert.equal(isExactBinaryMatch(deployed, 10, deployed, 10), true);
  assert.equal(isExactBinaryMatch(deployed, 10, deployed, 11), false);
  assert.equal(isExactBinaryMatch(deployed, 10, "b".repeat(64), 10), false);
});

test("variant confidence keeps strong Anchor correspondence separate from unresolved native evidence", () => {
  assert.equal(evaluateVariantConfidence({ exactBinaryMatch: false, authoritativeSource: true, exactProgramId: true, exactInstructionIdentity: true, exactRuntimeStringOrPath: true, accountContractCompatible: true, materialContradiction: false }), "strong");
  assert.equal(evaluateVariantConfidence({ exactBinaryMatch: false, authoritativeSource: true, exactProgramId: false, exactInstructionIdentity: false, exactRuntimeStringOrPath: false, accountContractCompatible: false, materialContradiction: true }), "unresolved");
});

test("all three Milestone 2.1 final outcomes are explicit", () => {
  assert.equal(chooseOverallOutcome("sample-binary-continuity-established", [{ confidence: "exact" }], true, true), "exact-deployed-source-match");
  assert.equal(chooseOverallOutcome("sample-binary-continuity-established", [{ confidence: "strong" }, { confidence: "unresolved" }], false, false), "variant-level-strong-correspondence");
  assert.equal(chooseOverallOutcome("sample-binary-continuity-unresolved", [{ confidence: "source-family-only" }], false, false), "source-family-only-confirmed");
});

test("cache-only replay regenerates byte-identical Milestone 2.1 artifacts", async () => {
  const artifacts = [
    "deployed-programdata-metadata.json", "deployed-executable-metadata.json", "deployed-strings.txt",
    "deployed-section-manifest.json", "source-history.json", "build-attempts.json",
    "binary-fingerprint-matrix.json", "variant-correspondence.json", "deployment-history.json",
    "velocity-binary-report.html",
  ].map((name) => `${OUTPUT}/${name}`).concat("docs/research/VELOCITY-DEPLOYED-BINARY-CORRESPONDENCE.md");
  const before = await Promise.all(artifacts.map(fileHash));
  const plan = await loadMilestone21Plan(PLAN);
  const result = await runMilestone21(plan, { offline: true });
  const after = await Promise.all(artifacts.map(fileHash));
  assert.deepEqual(after, before);
  assert.equal(result.continuity, "sample-binary-continuity-established");
  assert.equal(result.overallOutcome, "variant-level-strong-correspondence");
});

test("Milestone 2.0 Candidate #3 dossier and six occurrences remain unchanged", async () => {
  assert.equal(await fileHash("output/research/candidate-043c938568ad5e15/candidate-dossier.json"), "ca6d32743c639563d749420a0e73e8902399ef6e2d213c2474ea1aa1069658af");
  assert.equal(await fileHash("output/research/candidate-043c938568ad5e15/candidate-evidence.ndjson"), "0ef770f1c878630d3cfc105a51410ae8f8ae24667fbd82b883d13ec377372792");
  const dossier = JSON.parse(await readFile("output/research/candidate-043c938568ad5e15/candidate-dossier.json", "utf8")) as { decision: string; exactIdentity: { recurrenceBlockCount: number } };
  assert.equal(dossier.decision, "identity-found-semantics-incomplete");
  assert.equal(dossier.exactIdentity.recurrenceBlockCount, 6);
});

test("Candidate #1, Candidate #2, discovery ranks, and all eight legacy hashes remain unchanged", async () => {
  const one = JSON.parse(await readFile("output/research/candidate-ff30780de8479976/candidate-dossier.json", "utf8")) as { decision: string };
  assert.equal(one.decision, "black-box-structure-only");
  const sourceability = JSON.parse(await readFile("output/research/sourceability/sourceability-index.json", "utf8")) as { candidates: Array<{ candidateId: string; discoveryRank: number; disposition: string }>; candidateTwoFinding: { disposition: string } };
  assert.equal(sourceability.candidateTwoFinding.disposition, "deferred-not-rejected");
  assert.equal(sourceability.candidates.find((candidate) => candidate.candidateId === "candidate-043c938568ad5e15")?.discoveryRank, 3);
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

test("reports contain no semantic, runtime, scheduling, throughput, or redesign overclaim", async () => {
  const reports = await Promise.all([readFile(`${OUTPUT}/velocity-binary-report.html`, "utf8"), readFile("docs/research/VELOCITY-DEPLOYED-BINARY-CORRESPONDENCE.md", "utf8")]);
  for (const report of reports) {
    assert.doesNotMatch(report, /guaranteed throughput|can safely run in parallel|exact validator schedule|deployed mutation is proven|general semantic decoder authorized/i);
    assert.match(report, /does not establish deployed mutation semantics|No exact deployed field mutation is promoted/i);
  }
  const variant = await readFile(`${OUTPUT}/variant-correspondence.json`, "utf8");
  for (const prohibited of ["semanticFootprint", "counterfactualModels", "runtimeSchedule", "throughputEstimate"]) assert.doesNotMatch(variant, new RegExp(`"${prohibited}"`));
});
