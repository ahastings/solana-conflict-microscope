import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { classifyCandidateAccountRelation, buildAccountPositionMatrix, buildPayloadLayout, chooseDossierDecision, isExactCandidateIdentity, loadCandidateResearchPlan, runCandidateResearch } from "../src/candidate-research.js";
import { ED25519_SELF_REFERENCE, parseEd25519Instruction } from "../src/ed25519.js";
import { candidateDossierHtml, serializeCandidateDossier, serializeCandidateEvidence } from "../src/research-report.js";
import type { AccountSnapshotArtifact, CandidateOccurrence, CandidateResearchPlan, PayloadRecord } from "../src/research-types.js";
import { MILESTONE_19_HEADER, MILESTONE_19_STOP, validateMilestone19Handoff } from "../src/handoff.js";

const PLAN_PATH = "research-plans/candidate-ff30780de8479976.json";
const OUTPUT = "output/research/candidate-ff30780de8479976";
const IDENTITY = ["2ZU4QHdSZVMfzWyyzDJUs6ca5PKQigPMAcnWLcRT6EX2", "4SnAS3mQcB5AwHL4u5fnZeciLZ8J7deALb4YdXfjr9uN"];
const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const fileHash = async (path: string): Promise<string> => sha256(await readFile(path));

function offsetRecord(values: [number, number, number, number, number, number, number]): Buffer {
  const result = Buffer.alloc(14);
  values.forEach((value, index) => result.writeUInt16LE(value, index * 2));
  return result;
}

function keyMaterial(message: Buffer): { publicKey: Buffer; signature: Buffer } {
  const pair = generateKeyPairSync("ed25519");
  const publicKey = Buffer.from(pair.publicKey.export({ format: "der", type: "spki" })).subarray(-32);
  return { publicKey, signature: sign(null, message, pair.privateKey) };
}

function oneSignatureInstruction(message: Buffer): Buffer {
  const value = keyMaterial(message), publicKeyOffset = 16, signatureOffset = 48, messageOffset = 112;
  return Buffer.concat([
    Buffer.from([1, 0]),
    offsetRecord([signatureOffset, ED25519_SELF_REFERENCE, publicKeyOffset, ED25519_SELF_REFERENCE, messageOffset, message.length, ED25519_SELF_REFERENCE]),
    value.publicKey,
    value.signature,
    message,
  ]);
}

function twoSignatureInstruction(message: Buffer): Buffer {
  const first = keyMaterial(message), second = keyMaterial(message);
  return Buffer.concat([
    Buffer.from([2, 0]),
    offsetRecord([30, ED25519_SELF_REFERENCE, 94, ED25519_SELF_REFERENCE, 222, message.length, ED25519_SELF_REFERENCE]),
    offsetRecord([126, ED25519_SELF_REFERENCE, 190, ED25519_SELF_REFERENCE, 222, message.length, ED25519_SELF_REFERENCE]),
    first.signature,
    first.publicKey,
    second.signature,
    second.publicKey,
    message,
  ]);
}

function crossInstructionReference(message: Buffer): { container: Buffer; instruction: Buffer } {
  const value = keyMaterial(message), container = Buffer.concat([value.signature, value.publicKey, message]);
  return { container, instruction: Buffer.concat([Buffer.from([1, 0]), offsetRecord([0, 0, 64, 0, 96, message.length, 0])]) };
}

function payload(slot: number, rawHex: string, field0: number): PayloadRecord {
  return {
    slot, transactionIndex: 0, signature: `signature-${slot}`, instructionIndex: 1,
    byteLength: rawHex.length / 2, discriminatorHex: rawHex.slice(0, 16), rawHex, rawSha256: sha256(Buffer.from(rawHex, "hex")),
    fields: { field_0: field0, optional_value_a_marker: 1, value_a: "10", optional_value_b_marker: 1, value_b: "20", candidate_timestamp: String(slot), candidate_timestamp_matches_block_time: true },
  };
}

function occurrence(slot: number, payloadRecord: PayloadRecord, account1 = "Update-A", account4 = "Update-B"): CandidateOccurrence {
  return {
    evidenceId: `slot-${slot}#component-1`, slot, blockTime: slot, componentId: 1,
    transactionIndexes: [0], transactionSignatures: [`signature-${slot}`], statusCounts: { success: 1, failed: 0, unknown: 0 }, distinctFeePayers: [`payer-${slot}`],
    conflictEdges: [], conflictAtoms: [], waveLowerBound: 1, waveUpperBound: 1, provenMinimumWaveCount: 1, knownComputeUnits: 10, knownComputeCoverage: 1,
    invokedPrograms: ["BQsAJ"],
    transactions: [{
      index: 0, signature: `signature-${slot}`, status: "success", feePayer: `payer-${slot}`, computeUnitsConsumed: 10,
      instructionProgramOrder: ["Ed25519", "BQsAJ"], instructionCount: 2,
      accountPositions: [
        { position: 0, address: "Fixed", signer: false, writable: false },
        { position: 1, address: account1, signer: false, writable: true },
        { position: 2, address: IDENTITY[0]!, signer: false, writable: true },
        { position: 3, address: IDENTITY[1]!, signer: false, writable: true },
        { position: 4, address: account4, signer: false, writable: true },
        { position: 5, address: "Sysvar1nstructions1111111111111111111111111", signer: false, writable: false },
      ],
      ed25519: [], candidatePayloads: [payloadRecord], logPayloads: [], logShape: ["program-invoke", "program-success"],
    }],
    deviationsFromRepresentative: [], sourceCachePath: `slot-${slot}.json`, sourceCacheSha256: "0".repeat(64),
  };
}

test("exact account-set identity rejects partial overlaps and separates related-family evidence", () => {
  assert.equal(isExactCandidateIdentity([...IDENTITY].reverse(), IDENTITY), true);
  assert.equal(isExactCandidateIdentity([IDENTITY[0]!], IDENTITY), false);
  assert.equal(isExactCandidateIdentity([...IDENTITY, "Third"], IDENTITY), false);
  assert.equal(classifyCandidateAccountRelation([...IDENTITY].reverse(), IDENTITY), "exact");
  assert.equal(classifyCandidateAccountRelation([IDENTITY[0]!, "Other"], IDENTITY), "related-one-account");
  assert.equal(classifyCandidateAccountRelation([...IDENTITY, "Third"], IDENTITY), "separate");
});

test("Ed25519 one-signature parsing resolves exact same-instruction bytes and hashes", () => {
  const message = Buffer.from("one deterministic signed message");
  const instruction = oneSignatureInstruction(message), parsed = parseEd25519Instruction([instruction], 0);
  assert.equal(parsed.status, "decoded"); assert.equal(parsed.signatureCount, 1); assert.equal(parsed.signatures.length, 1);
  assert.equal(parsed.signatures[0]!.messageHex, message.toString("hex"));
  assert.equal(parsed.signatures[0]!.messageSha256, sha256(message));
  assert.equal(parsed.signatures[0]!.messageReference.sameInstruction, true);
  assert.equal(parsed.signatures[0]!.messageReference.byteEndExclusive - parsed.signatures[0]!.messageReference.byteStart, message.length);
  assert.equal(parsed.signatures[0]!.locallyVerified, true);
});

test("Ed25519 multi-signature parsing preserves both signers over the shared covered message", () => {
  const message = Buffer.alloc(32, 7), instruction = twoSignatureInstruction(message), parsed = parseEd25519Instruction([instruction], 0);
  assert.equal(parsed.status, "decoded"); assert.equal(parsed.signatureCount, 2); assert.equal(parsed.signatures.length, 2);
  assert.equal(new Set(parsed.signatures.map((item) => item.publicKey)).size, 2);
  assert.deepEqual(new Set(parsed.signatures.map((item) => item.messageSha256)), new Set([sha256(message)]));
  assert.ok(parsed.signatures.every((item) => item.locallyVerified));
});

test("Ed25519 cross-instruction offsets resolve against referenced instruction data", () => {
  const message = Buffer.from("referenced instruction message"), value = crossInstructionReference(message);
  const parsed = parseEd25519Instruction([value.container, value.instruction], 1);
  assert.equal(parsed.status, "decoded"); assert.equal(parsed.signatures[0]!.messageReference.sameInstruction, false);
  assert.equal(parsed.signatures[0]!.messageReference.resolvedInstructionIndex, 0);
  assert.equal(parsed.signatures[0]!.messageHex, message.toString("hex")); assert.equal(parsed.signatures[0]!.locallyVerified, true);
});

test("malformed and unsupported Ed25519 layouts fall back conservatively", () => {
  const malformed = parseEd25519Instruction([Buffer.from([1])], 0);
  assert.equal(malformed.status, "malformed"); assert.equal(malformed.signatures.length, 0); assert.ok(malformed.issues.length > 0);
  const unsupported = Buffer.concat([Buffer.from([1, 0]), offsetRecord([0, 9, 0, 9, 0, 1, 9])]);
  const parsed = parseEd25519Instruction([unsupported], 0);
  assert.equal(parsed.status, "unsupported-reference"); assert.equal(parsed.signatures.length, 0); assert.ok(parsed.issues.every((issue) => /Instruction 9/.test(issue)));
});

test("candidate payload grouping and neutral field names are deterministic", () => {
  const first = occurrence(1, payload(1, "780000000000000006010a000000000000000114000000000000000100000000000000", 6));
  const second = occurrence(2, payload(2, "780000000000000006010b000000000000000115000000000000000200000000000000", 6));
  const left = buildPayloadLayout([first, second]), right = buildPayloadLayout([first, second]);
  assert.deepEqual(left, right); assert.equal(left.instructionPayloads.count, 2); assert.equal(left.instructionPayloads.groups.length, 1);
  assert.equal(left.instructionPayloads.groups[0]!.count, 2); assert.ok(left.instructionPayloads.groups[0]!.stableByteRanges.some((range) => range.start === 0));
  const fieldNames = [...left.instructionPayloads.neutralLayout.map((field) => field.name), ...Object.keys(left.instructionPayloads.fieldDistributions)].join(" ");
  assert.doesNotMatch(fieldNames, /\b(?:sol|btc|eth|price|bid|ask|confidence|market[_ ]?id)\b/i);
});

test("account-position matrix separates stable candidate accounts from rotating update-specific accounts", () => {
  const plan = { identity: { accounts: IDENTITY } } as CandidateResearchPlan;
  const snapshots = { snapshots: [
    { address: IDENTITY[0], exists: true, owner: "Program", dataLength: 432 },
    { address: IDENTITY[1], exists: true, owner: "Program", dataLength: 440 },
    { address: "Update-A", exists: true, owner: "Program", dataLength: 10 },
    { address: "Update-C", exists: true, owner: "Program", dataLength: 10 },
  ] } as unknown as AccountSnapshotArtifact;
  const matrix = buildAccountPositionMatrix(plan, [occurrence(1, payload(1, "7800000000000000", 6)), occurrence(2, payload(2, "7800000000000000", 6), "Update-C", "Update-D")], snapshots);
  assert.equal(matrix.find((item) => item.position === 2)!.constantAcrossOccurrences, true);
  assert.equal(matrix.find((item) => item.position === 2)!.candidateConflictRelation, "first-exact-identity-account");
  assert.equal(matrix.find((item) => item.position === 1)!.constantAcrossOccurrences, false);
  assert.equal(matrix.find((item) => item.position === 1)!.recurrenceClass, "update-specific");
  assert.equal(matrix.find((item) => item.position === 5)!.sourceConfirmedRole?.includes("Instructions sysvar"), true);
  assert.ok(matrix.every((item) => item.actualMutation === "unknown" && item.declaredAccessOnly));
});

test("the research manifest pins source provenance and every input hash", async () => {
  const plan = await loadCandidateResearchPlan(PLAN_PATH);
  assert.equal(plan.schemaVersion, "1.9"); assert.equal(plan.observedRecurrenceSlots.length, 25); assert.equal(plan.sourceCachePaths.length, 25);
  assert.equal(plan.discoveryEvidenceReferences.length, 25); assert.equal(plan.sources.length, 6);
  assert.ok(plan.sources.every((source) => source.organization && source.version && source.path && source.accessedAt && source.supports.length > 0));
  assert.ok(plan.sources.filter((source) => source.commit !== null).every((source) => /^[0-9a-f]{40}$/.test(source.commit!)));
  assert.ok(plan.inputEvidence.every((input) => /^[0-9a-f]{64}$/.test(input.sha256)));
  assert.equal(plan.sourceSearches.some((search) => search.authoritativeMatch), false);
});

test("all three dossier decision outcomes are explicit", () => {
  assert.equal(chooseDossierDecision(true, true), "source-confirmed-semantics");
  assert.equal(chooseDossierDecision(true, false), "identity-found-semantics-incomplete");
  assert.equal(chooseDossierDecision(false, true), "black-box-structure-only");
  assert.equal(chooseDossierDecision(false, false), "black-box-structure-only");
});

test("Milestone 1.9 handoff validator rejects stale identifiers and mismatched snapshots", () => {
  const valid = `${MILESTONE_19_HEADER}\n\nCandidate #1 Identity and Semantic Dossier\n\nBase commit be3fded. Candidate candidate-ff30780de8479976 has outcome black-box-structure-only.\n\n${MILESTONE_19_STOP}\n`;
  assert.deepEqual(validateMilestone19Handoff(valid, valid), []);
  assert.ok(validateMilestone19Handoff(valid, `${valid}changed`).some((error) => /byte-identical/.test(error)));
  assert.ok(validateMilestone19Handoff(valid.replace(MILESTONE_19_HEADER, "# Milestone 1.8 handoff"), valid).some((error) => /begin exactly|stale/.test(error)));
  assert.ok(validateMilestone19Handoff(valid.replace(MILESTONE_19_STOP, "Stop after Milestone 1.8."), valid).some((error) => /end with|stale/.test(error)));
});

test("Milestone 1.8 scan results and all eight legacy artifacts remain unchanged", async () => {
  const index = JSON.parse(await readFile("output/discovery-devnet/discovery-index.json", "utf8")) as { schemaVersion: string; coverage: { requested: number; observed: number }; candidateCount: number; highPriorityCandidateIds: string[]; candidates: Array<{ candidateId: string; representativeSlot: number; recurrenceBlockCount: number; materialization: null | { status: string } }> };
  assert.equal(index.schemaVersion, "1.8"); assert.equal(index.coverage.requested, 500); assert.equal(index.coverage.observed, 500); assert.equal(index.candidateCount, 70); assert.equal(index.highPriorityCandidateIds.length, 19);
  assert.equal(index.candidates.filter((candidate) => candidate.materialization?.status === "materialized").length, 20);
  assert.deepEqual(index.candidates[0] && { id: index.candidates[0].candidateId, slot: index.candidates[0].representativeSlot, recurrence: index.candidates[0].recurrenceBlockCount }, { id: "candidate-ff30780de8479976", slot: 489573044, recurrence: 25 });
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

test("real 25-block dossier replay is offline, exact, compact, and byte deterministic", async () => {
  const plan = await loadCandidateResearchPlan(PLAN_PATH);
  const paths = ["candidate-dossier.json", "candidate-dossier.html", "candidate-evidence.ndjson", "source-manifest.json", "account-snapshots.json", "payload-layout.json", "signer-message-summary.json"].map((name) => `${OUTPUT}/${name}`);
  const before = await Promise.all(paths.map(fileHash));
  const result = await runCandidateResearch(plan, { offline: true });
  const after = await Promise.all(paths.map(fileHash));
  assert.deepEqual(after, before);
  assert.equal(result.occurrences.length, 25); assert.equal(new Set(result.occurrences.map((item) => item.slot)).size, 25);
  assert.equal(result.dossier.exactIdentity.allReferencesRevalidated, true); assert.equal(result.dossier.exactIdentity.oneRepeatedExactPattern, true);
  assert.equal(result.dossier.variantShapes.length, 4); assert.deepEqual(result.dossier.variantShapes.map((shape) => shape.occurrenceCount).sort((a, b) => a - b), [4, 4, 5, 12]);
  assert.deepEqual(result.dossier.representative, { slot: 489573044, componentId: 15, transactionCount: 3, distinctFeePayerCount: 3, conflictEdgeCount: 3, conflictAtomCount: 6, waveLowerBound: 3, waveUpperBound: 3 });
  assert.equal(result.signerSummary.transactionCount, 59); assert.equal(result.signerSummary.signatureCount, 118); assert.equal(result.signerSummary.localVerificationPassCount, 118);
  assert.equal(result.signerSummary.distinctSignerCount, 4); assert.equal(result.signerSummary.distinctMessageCount, 59); assert.equal(result.signerSummary.crossInstructionReferenceCount, 0);
  assert.equal(result.payloadLayout.instructionPayloads.count, 59); assert.equal(result.payloadLayout.instructionPayloads.groups.length, 1); assert.equal(result.payloadLayout.programDataLogs.count, 59);
  assert.equal(result.dossier.decision, "black-box-structure-only"); assert.equal(result.dossier.actionabilityGate.passed, false); assert.equal(result.sourceManifest.authoritativeProgramIdentityFound, false); assert.equal(result.sourceManifest.authoritativeMutationSemanticsFound, false);
  assert.equal(result.dossier.relatedFamilyEvidence.length, 0);
  assert.equal(result.accountSnapshots.snapshots.length, 11); assert.ok(result.accountSnapshots.snapshots.every((snapshot) => snapshot.temporalScope === "current-snapshot-not-historical"));
  assert.match(result.accountSnapshots.limitation, /not historical account-state snapshots/);
  assert.equal(result.accountSnapshots.programDataInspection.securityTxtFound, false); assert.ok(result.accountSnapshots.programDataInspection.embeddedPathLeads.includes("programs/dex/src/lib.rs"));
  assert.equal(serializeCandidateDossier(result.dossier), await readFile(`${OUTPUT}/candidate-dossier.json`, "utf8"));
  assert.equal(serializeCandidateEvidence(result.occurrences), await readFile(`${OUTPUT}/candidate-evidence.ndjson`, "utf8"));
  assert.equal(candidateDossierHtml(result.dossier, result.payloadLayout, result.signerSummary, result.sourceManifest, result.accountSnapshots), await readFile(`${OUTPUT}/candidate-dossier.html`, "utf8"));
  assert.ok((await stat(`${OUTPUT}/candidate-dossier.json`)).size < 50_000); assert.ok((await stat(`${OUTPUT}/candidate-dossier.html`)).size < 100_000);
  const serialized = await readFile(`${OUTPUT}/candidate-dossier.json`, "utf8");
  for (const prohibited of ["completeBlockAnalyses", "normalizedTransactions", "semanticFootprint", "counterfactualModels"]) assert.doesNotMatch(serialized, new RegExp(`"${prohibited}"`));
  const report = await readFile(`${OUTPUT}/candidate-dossier.html`, "utf8");
  assert.doesNotMatch(report, /guaranteed throughput|reconstructs? (?:a |the )?validator(?:'s)? exact|is redesignable|runtime causality is proven/i);
  assert.match(report, /Declared account contention|declared account-lock relationships/);
});
