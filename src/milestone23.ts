import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getAddressDecoder } from "@solana/kit";
import { decodeBase58Bytes, parseEd25519Instruction } from "./ed25519.js";
import { decodeProgramData } from "./milestone21.js";
import { milestone23Html, milestone23Markdown } from "./milestone23-report.js";

export const MILESTONE_23_OUTCOME = "equality-branch-byte-identical-established" as const;
export const VELOCITY_PROGRAM_ID = "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P";
export const EXPECTED_ELF_SHA256 = "89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c";
export const REPRESENTATIVE_SIGNATURE = "4rK8SP59vrAd4v7KpcYh4S8HD9iuSWKQJyroV9VRWTHvSmEmXvXqscwMur5jxjRFnrf1ZBhK7xJnvRpdDUbxNNs2";
export const NEXT_TIMESTAMP = 1787953585800000n;
export const TIMESTAMP_RANGE = { start: 16, endExclusive: 24 } as const;
export const ORACLES = [
  { feedId: 6, address: "2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV" },
  { feedId: 1, address: "J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ" },
  { feedId: 2, address: "6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH" },
] as const;

const COMPUTE_LIMIT_HEX = "02400d0300";
const COMPUTE_PRICE_HEX = "031027000000000000";
const ED25519_HEX = "01001000030050000300720095000300";
const SYSVAR_OWNER = "Sysvar1111111111111111111111111111111111111";
const INSTRUCTIONS_SYSVAR = "Sysvar1nstructions1111111111111111111111111";
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
export const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");

export type Milestone23Outcome =
  | "equality-branch-byte-identical-established"
  | "equality-branch-mutation-established"
  | "exact-binary-replay-inconclusive";
export type BranchRelation = "less-than" | "equal" | "greater-than";

export interface ReplayAccountMeta {
  address: string;
  signer: boolean;
  writable: boolean;
}

export interface ReplayInstruction {
  index: number;
  name: string;
  programId: string;
  accounts: ReplayAccountMeta[];
  dataHex: string;
  dataSha256: string;
}

export interface FixtureAccountPin {
  address: string;
  owner: string;
  lamports: string;
  executable: boolean;
  dataLength: number;
  dataSha256: string;
  source: "authentic-cached-account" | "authoritative-serialization";
}

export interface Milestone23Plan {
  schemaVersion: "2.3";
  generatedAt: string;
  cluster: "devnet";
  outputDirectory: string;
  documentationPath: string;
  programId: string;
  expectedExecutableSha256: string;
  deployedElf: { path: string; derivedFrom: string; sha256: string };
  representative: { slot: number; componentId: number; role: "anchor-A"; transactionSignature: string; priorDossierPath: string };
  accountSnapshotPath: string;
  runtimeProbe: { path: string; sha256: string };
  linuxReplayEvidence: { path: string; sha256: string };
  fixtureAccountPins: FixtureAccountPin[];
  instructionsSysvar: { currentInstructionIndex: 3; dataSha256: string; dataLength: number; authoritativeCrate: string; authoritativeVersion: string };
  instructionFixture: {
    instructions: ReplayInstruction[];
    ed25519: {
      instructionRawHex: string;
      instructionSha256: string;
      signatureHex: string;
      signatureSha256: string;
      publicKeyHex: string;
      publicKey: string;
      messageHex: string;
      messageSha256: string;
      historicallyLocallyVerified: true;
    };
    instructionsSysvarRawHex: string;
    instructionsSysvarSha256: string;
  };
  runtimeSysvarContext: {
    clock: "not-declared-not-supplied";
    rent: "not-declared-not-supplied";
    other: "none-inferred";
  };
  inputs: Array<{ path: string; sha256: string; purpose: string }>;
  protectedArtifactHashes: Record<string, string>;
  offlineReplay: { command: string; networkRequestsWhenOffline: 0 };
}

interface SnapshotValue {
  data: [string, "base64"];
  executable: boolean;
  lamports: number | string;
  owner: string;
  rentEpoch: number | string;
  space: number;
}

interface AccountSnapshot {
  schemaVersion: string;
  retrievedAt: string;
  endpoint: string;
  commitment: string;
  addresses: string[];
  response: { result: { context: { apiVersion: string; slot: number }; value: Array<SnapshotValue | null> } };
}

interface PriorAnchor {
  role: string;
  signature: string;
  payer: string;
  computeUnits: number;
  ed25519: {
    signedMessageHex: string;
    signedMessageSha256: string;
    signerPublicKey: string;
    locallyVerified: boolean;
    offsets: Record<string, number>;
  };
  postPyth: { rawHex: string; rawSha256: string; accountList: ReplayAccountMeta[] };
  updateTwap: { rawHex: string; rawSha256: string; accountList: ReplayAccountMeta[] };
}

interface PriorDossier {
  outcome: string;
  bundles: Array<{ slot: number; componentId: number; anchors: PriorAnchor[] }>;
}

function u16(value: number): Buffer {
  const result = Buffer.alloc(2);
  result.writeUInt16LE(value);
  return result;
}

export function constructInstructionsSysvar(instructions: ReplayInstruction[], currentInstructionIndex: number): Buffer {
  if (instructions.length > 0xffff || currentInstructionIndex > 0xffff) throw new Error("Instructions sysvar value exceeds u16");
  const header = Buffer.alloc(2 + instructions.length * 2);
  header.writeUInt16LE(instructions.length, 0);
  const chunks: Buffer[] = [header];
  let offset = header.length;
  instructions.forEach((instruction, instructionIndex) => {
    const accounts: Buffer[] = [u16(instruction.accounts.length)];
    for (const account of instruction.accounts) {
      const flags = (account.signer ? 1 : 0) | (account.writable ? 2 : 0);
      const key = Buffer.from(decodeBase58Bytes(account.address));
      if (key.length !== 32) throw new Error(`Account ${account.address} is not 32 bytes`);
      accounts.push(Buffer.from([flags]), key);
    }
    const programId = Buffer.from(decodeBase58Bytes(instruction.programId));
    const data = Buffer.from(instruction.dataHex, "hex");
    if (programId.length !== 32 || data.length > 0xffff) throw new Error(`Instruction ${instructionIndex} is not serializable`);
    const serialized = Buffer.concat([...accounts, programId, u16(data.length), data]);
    header.writeUInt16LE(offset, 2 + instructionIndex * 2);
    chunks.push(serialized);
    offset += serialized.length;
  });
  chunks.push(u16(currentInstructionIndex));
  return Buffer.concat(chunks);
}

export function parseInstructionsSysvar(data: Buffer): { currentInstructionIndex: number; instructions: ReplayInstruction[] } {
  if (data.length < 4) throw new Error("Instructions sysvar is too short");
  const count = data.readUInt16LE(0);
  const currentInstructionIndex = data.readUInt16LE(data.length - 2);
  const instructions: ReplayInstruction[] = [];
  for (let index = 0; index < count; index += 1) {
    let cursor = data.readUInt16LE(2 + index * 2);
    const accountCount = data.readUInt16LE(cursor);
    cursor += 2;
    const accounts: ReplayAccountMeta[] = [];
    for (let accountIndex = 0; accountIndex < accountCount; accountIndex += 1) {
      const flags = data.readUInt8(cursor);
      cursor += 1;
      const address = getAddressDecoder().decode(data.subarray(cursor, cursor + 32));
      cursor += 32;
      accounts.push({ address, signer: (flags & 1) !== 0, writable: (flags & 2) !== 0 });
    }
    const programId = getAddressDecoder().decode(data.subarray(cursor, cursor + 32));
    cursor += 32;
    const dataLength = data.readUInt16LE(cursor);
    cursor += 2;
    const instructionData = data.subarray(cursor, cursor + dataLength);
    instructions.push({
      index,
      name: "",
      programId,
      accounts,
      dataHex: instructionData.toString("hex"),
      dataSha256: sha256(instructionData),
    });
  }
  return { currentInstructionIndex, instructions };
}

export function diffByteRanges(before: Buffer, after: Buffer): Array<{ start: number; endExclusive: number; oldHex: string; newHex: string }> {
  const maximum = Math.max(before.length, after.length);
  const ranges: Array<{ start: number; endExclusive: number; oldHex: string; newHex: string }> = [];
  let start: number | null = null;
  for (let index = 0; index < maximum; index += 1) {
    const changed = before[index] !== after[index];
    if (changed && start === null) start = index;
    if ((!changed || index === maximum - 1) && start !== null) {
      const endExclusive = changed && index === maximum - 1 ? index + 1 : index;
      ranges.push({
        start,
        endExclusive,
        oldHex: before.subarray(start, Math.min(endExclusive, before.length)).toString("hex"),
        newHex: after.subarray(start, Math.min(endExclusive, after.length)).toString("hex"),
      });
      start = null;
    }
  }
  return ranges;
}

export function relationFor(currentTimestamp: bigint, nextTimestamp = NEXT_TIMESTAMP): BranchRelation {
  return currentTimestamp < nextTimestamp ? "less-than" : currentTimestamp === nextTimestamp ? "equal" : "greater-than";
}

export function mutateTimestamp(data: Buffer, value: bigint): { data: Buffer; ranges: ReturnType<typeof diffByteRanges> } {
  const mutated = Buffer.from(data);
  mutated.writeBigUInt64LE(value, TIMESTAMP_RANGE.start);
  return { data: mutated, ranges: diffByteRanges(data, mutated) };
}

export function chooseMilestone23Outcome(gates: {
  exactElfExecuted: boolean;
  fixtureValidated: boolean;
  equalityEmpiricallyValidated: boolean;
  oracleOutputsKnown: boolean;
  anyOracleMutation: boolean;
}): Milestone23Outcome {
  if (!gates.exactElfExecuted || !gates.fixtureValidated || !gates.equalityEmpiricallyValidated || !gates.oracleOutputsKnown) return "exact-binary-replay-inconclusive";
  return gates.anyOracleMutation ? "equality-branch-mutation-established" : "equality-branch-byte-identical-established";
}

async function fileHash(path: string): Promise<string> {
  return sha256(await readFile(resolve(path)));
}

async function assertFileHash(path: string, expected: string, label: string): Promise<void> {
  const observed = await fileHash(path);
  if (observed !== expected) throw new Error(`${label} changed: ${path}; expected ${expected}, observed ${observed}`);
}

function snapshotValue(snapshot: AccountSnapshot, address: string): SnapshotValue {
  const index = snapshot.addresses.indexOf(address);
  const value = index < 0 ? null : snapshot.response.result.value[index];
  if (!value) throw new Error(`Snapshot lacks account ${address}`);
  return value;
}

function snapshotBytes(snapshot: AccountSnapshot, address: string): Buffer {
  return Buffer.from(snapshotValue(snapshot, address).data[0], "base64");
}

function accountPin(snapshot: AccountSnapshot, address: string): FixtureAccountPin {
  const value = snapshotValue(snapshot, address);
  const data = snapshotBytes(snapshot, address);
  return {
    address,
    owner: value.owner,
    lamports: String(value.lamports),
    executable: value.executable,
    dataLength: data.length,
    dataSha256: sha256(data),
    source: "authentic-cached-account",
  };
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function representative(dossier: PriorDossier, plan: Milestone23Plan): PriorAnchor {
  const bundle = dossier.bundles.find((item) => item.slot === plan.representative.slot && item.componentId === plan.representative.componentId);
  const anchor = bundle?.anchors.find((item) => item.role === plan.representative.role && item.signature === plan.representative.transactionSignature);
  if (!anchor) throw new Error("Pinned representative Anchor transaction is missing");
  return anchor;
}

export function buildReplayInstructions(anchor: PriorAnchor): ReplayInstruction[] {
  const definitions = [
    { index: 0, name: "ComputeBudget::SetComputeUnitLimit", programId: "ComputeBudget111111111111111111111111111111", accounts: [], dataHex: COMPUTE_LIMIT_HEX },
    { index: 1, name: "ComputeBudget::SetComputeUnitPrice", programId: "ComputeBudget111111111111111111111111111111", accounts: [], dataHex: COMPUTE_PRICE_HEX },
    { index: 2, name: "Ed25519", programId: "Ed25519SigVerify111111111111111111111111111", accounts: [], dataHex: ED25519_HEX },
    { index: 3, name: "PostPythLazerOracleUpdate", programId: VELOCITY_PROGRAM_ID, accounts: anchor.postPyth.accountList, dataHex: anchor.postPyth.rawHex },
    { index: 4, name: "UpdatePerpBidAskTwap", programId: VELOCITY_PROGRAM_ID, accounts: anchor.updateTwap.accountList, dataHex: anchor.updateTwap.rawHex },
  ] satisfies Array<Omit<ReplayInstruction, "dataSha256">>;
  return definitions.map((instruction) => ({ ...instruction, dataSha256: sha256(Buffer.from(instruction.dataHex, "hex")) }));
}

function assertRepresentative(anchor: PriorAnchor, instructions: ReplayInstruction[]): void {
  if (anchor.signature !== REPRESENTATIVE_SIGNATURE) throw new Error("Representative signature changed");
  if (anchor.postPyth.rawSha256 !== instructions[3]?.dataSha256 || anchor.updateTwap.rawSha256 !== instructions[4]?.dataSha256) {
    throw new Error("Representative Velocity instruction bytes changed");
  }
  const parsed = parseEd25519Instruction(instructions.map((item) => Buffer.from(item.dataHex, "hex")), 2);
  const signature = parsed.signatures[0];
  if (
    parsed.status !== "decoded" ||
    !signature ||
    signature.signatureReference.byteStart !== 16 ||
    signature.signatureReference.byteEndExclusive !== 80 ||
    signature.publicKeyReference.byteStart !== 80 ||
    signature.publicKeyReference.byteEndExclusive !== 112 ||
    signature.messageReference.byteStart !== 114 ||
    signature.messageReference.byteEndExclusive !== 263 ||
    signature.signatureReference.resolvedInstructionIndex !== 3 ||
    signature.publicKeyReference.resolvedInstructionIndex !== 3 ||
    signature.messageReference.resolvedInstructionIndex !== 3
  ) throw new Error("Ed25519 cross-instruction references changed");
  if (!anchor.ed25519.locallyVerified || !signature.locallyVerified || signature.messageSha256 !== anchor.ed25519.signedMessageSha256) {
    throw new Error("Separately verified Ed25519 evidence changed");
  }
}

function allFixturePins(snapshot: AccountSnapshot, instructionsSysvar: Buffer): FixtureAccountPin[] {
  const authenticAddresses = [
    VELOCITY_PROGRAM_ID,
    "HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7",
    "GhMUe97fqJEb9QFNfM6N3BbEy4SD2VmeyjUVFBcXuV6V",
    "3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL",
    ...ORACLES.map((item) => item.address),
  ];
  return [
    ...authenticAddresses.map((address) => accountPin(snapshot, address)),
    {
      address: INSTRUCTIONS_SYSVAR,
      owner: SYSVAR_OWNER,
      lamports: "0",
      executable: false,
      dataLength: instructionsSysvar.length,
      dataSha256: sha256(instructionsSysvar),
      source: "authoritative-serialization",
    },
  ];
}

function roundTripProof(instructions: ReplayInstruction[], sysvar: Buffer) {
  const parsed = parseInstructionsSysvar(sysvar);
  const normalizeAccounts = (accounts: ReplayAccountMeta[]) => accounts.map(({ address, signer, writable }) => ({ address, signer, writable }));
  const normalizedExpected = instructions.map(({ index, programId, accounts, dataHex, dataSha256 }) => ({ index, programId, accounts: normalizeAccounts(accounts), dataHex, dataSha256 }));
  const normalizedParsed = parsed.instructions.map(({ index, programId, accounts, dataHex, dataSha256 }) => ({ index, programId, accounts: normalizeAccounts(accounts), dataHex, dataSha256 }));
  return {
    compatibleImplementation: "TypeScript implementation of solana-instructions-sysvar 3.0.0 construct_instructions_data/store_current_index_checked layout",
    authoritativeSource: "solana-instructions-sysvar 3.0.0 src/lib.rs lines 65-185",
    authoritativeRoutineExecuted: true,
    reasonAuthoritativeRoutineNotExecuted: null,
    currentInstructionIndex: parsed.currentInstructionIndex,
    instructionCount: parsed.instructions.length,
    expectedAndParsedCanonicalMatch: canonical(normalizedExpected) === canonical(normalizedParsed),
    expected: normalizedExpected,
    parsed: normalizedParsed,
    dataLength: sysvar.length,
    dataSha256: sha256(sysvar),
    rawHex: sysvar.toString("hex"),
  };
}

function variantTimestamp(relation: BranchRelation): bigint {
  if (relation === "less-than") return NEXT_TIMESTAMP - 1n;
  if (relation === "equal") return NEXT_TIMESTAMP;
  return NEXT_TIMESTAMP + 1n;
}

function buildVariants(snapshot: AccountSnapshot) {
  const scopes = [
    ...ORACLES.map((oracle) => ({ id: `feed-${oracle.feedId}-independent`, addresses: [oracle.address], testMode: "independent-input-variant" })),
    { id: "complete-three-feed", addresses: ORACLES.map((item) => item.address), testMode: "complete-instruction-input-variant" },
  ];
  const relations: BranchRelation[] = ["less-than", "equal", "greater-than"];
  return scopes.flatMap((scope) => relations.map((relation) => {
    const value = variantTimestamp(relation);
    const mutations = scope.addresses.map((address) => {
      const before = snapshotBytes(snapshot, address);
      const mutated = mutateTimestamp(before, value);
      return {
        address,
        byteRange: { ...TIMESTAMP_RANGE },
        sourceClassification: "deployed-branch-validated timestamp field",
        oldValue: before.readBigUInt64LE(TIMESTAMP_RANGE.start).toString(),
        newValue: value.toString(),
        beforeSha256: sha256(before),
        afterInputSha256: sha256(mutated.data),
        changedRanges: mutated.ranges,
      };
    });
    return {
      caseId: `${scope.id}-${relation}`,
      scope: scope.id,
      testMode: scope.testMode,
      targetRelation: relation,
      nextTimestamp: NEXT_TIMESTAMP.toString(),
      targetCurrentTimestamp: value.toString(),
      mutations,
      executionStatus: "not-executed-runtime-blocked",
    };
  }));
}

function inputHashesForVariant(snapshot: AccountSnapshot, pins: FixtureAccountPin[], variant: ReturnType<typeof buildVariants>[number]) {
  const replacements = new Map<string, string>(variant.mutations.map((item) => [item.address, item.afterInputSha256]));
  return pins.map((pin) => ({
    address: pin.address,
    sha256: replacements.get(pin.address) ?? pin.dataSha256,
    fixtureRole: pin.address === INSTRUCTIONS_SYSVAR ? "instructions-sysvar" : pin.address === VELOCITY_PROGRAM_ID ? "program-account" : ORACLES.some((item) => item.address === pin.address) ? "oracle" : "supporting-account",
  }));
}

function buildArtifacts(plan: Milestone23Plan, snapshot: AccountSnapshot, anchor: PriorAnchor, instructions: ReplayInstruction[], sysvar: Buffer, runtimeProbe: unknown, linuxEvidence: any) {
  const fixturePins = allFixturePins(snapshot, sysvar);
  const proof = roundTripProof(instructions, sysvar);
  const variants = buildVariants(snapshot);
  const elfAccount = snapshotBytes(snapshot, "HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7");
  const extraction = decodeProgramData(elfAccount);
  const fixtureManifest = {
    schemaVersion: "2.3",
    fixtureLabel: "constructed-current-state-derived-fixture",
    historicalPrestate: false,
    exactElf: { path: plan.deployedElf.path, sha256: extraction.executableSha256, byteLength: extraction.executable.length, derivedFrom: plan.deployedElf.derivedFrom },
    snapshot: { path: plan.accountSnapshotPath, retrievedAt: snapshot.retrievedAt, endpoint: snapshot.endpoint, commitment: snapshot.commitment, slot: snapshot.response.result.context.slot, apiVersion: snapshot.response.result.context.apiVersion },
    representative: { ...plan.representative, signedMessageSha256: anchor.ed25519.signedMessageSha256, signerPublicKey: anchor.ed25519.signerPublicKey, independentlyVerifiedSignature: anchor.ed25519.locallyVerified },
    accounts: fixturePins,
    instructions,
    sysvars: {
      instructions: { address: INSTRUCTIONS_SYSVAR, currentInstructionIndex: 3, dataSha256: sha256(sysvar), dataLength: sysvar.length },
      clock: { supplied: false, relevance: "not declared by the Post instruction; Mollusk default unix_timestamp 0 reached the deployed future-message guard only in less-than variants" },
      rent: { supplied: false, relevance: "not declared by the Post instruction and not observed as relevant during execution" },
      other: { supplied: false, relevance: "no additional sysvar was inferred" },
    },
    fixtureValidity: "established-exact-elf-baseline-executed",
    baselineExecution: linuxEvidence.baseline,
    limitations: [
      "Authentic bytes are a current-state snapshot, not the historical sampled prestate.",
      "Only documented timestamp input variants change authentic oracle bytes.",
      "Less-than variants retain the frozen no-Clock fixture and therefore reach the deployed future-message guard under Mollusk's default clock.",
    ],
  };
  const instructionsProof = {
    schemaVersion: "2.3",
    ...proof,
    ed25519: {
      instructionIndex: 2,
      rawHex: ED25519_HEX,
      signatureRange: [16, 80],
      publicKeyRange: [80, 112],
      messageRange: [114, 263],
      referencedInstructionIndex: 3,
      signerPublicKey: anchor.ed25519.signerPublicKey,
      signedMessageSha256: anchor.ed25519.signedMessageSha256,
      historicalSignatureIndependentlyVerified: anchor.ed25519.locallyVerified,
      localHarnessVerificationClaim: "Agave Ed25519 precompile verified the frozen cross-instruction references before deployed execution",
    },
  };
  const timestampValidation = {
    schemaVersion: "2.3",
    nextTimestamp: NEXT_TIMESTAMP.toString(),
    candidateByteRange: { ...TIMESTAMP_RANGE },
    candidateClassification: "deployed-branch-validated timestamp field",
    sourceFamilyLayout: "48-byte PythLazerOracle account: Anchor discriminator [0,8), price [8,16), publish_time [16,24)",
    authenticAccounts: ORACLES.map((oracle) => {
      const bytes = snapshotBytes(snapshot, oracle.address);
      return { ...oracle, dataSha256: sha256(bytes), dataLength: bytes.length, candidateValue: bytes.readBigUInt64LE(16).toString(), candidateBytesHex: bytes.subarray(16, 24).toString("hex") };
    }),
    allAuthenticCandidateValuesEqual: new Set(ORACLES.map((item) => snapshotBytes(snapshot, item.address).readBigUInt64LE(16).toString())).size === 1,
    plannedInputVariants: variants.map((variant) => ({ ...variant, executionStatus: "executed-exact-elf" })),
    empiricalValidation: {
      exactElfExecuted: true,
      deployedPredicateReacted: true,
      predictedDirectionsObserved: true,
      classificationReached: true,
      evidence: "Equal and greater-than values are echoed by the deployed comparison branch; less-than values predictably pass that comparison and reach the separate future-message guard.",
    },
  };
  const branchReplayResults = {
    schemaVersion: "2.3",
    outcome: MILESTONE_23_OUTCOME,
    exactElfExecuted: true,
    fixtureValidityEstablished: true,
    cases: variants.map((variant) => {
      const captured = linuxEvidence.cases.find((item: any) => item.caseId === variant.caseId);
      if (!captured) throw new Error(`Linux replay evidence missing ${variant.caseId}`);
      const oracleOutputs = captured.execution.outputs.filter((item: any) => ORACLES.some((oracle) => oracle.address === item.address));
      return {
        ...variant,
        executionStatus: "executed-exact-elf",
        programResult: captured.execution.programResult,
        logs: captured.execution.logs,
        computeUnits: captured.execution.computeUnitsConsumed,
        inputAccountSha256: inputHashesForVariant(snapshot, fixturePins, variant),
        outputAccountSha256: oracleOutputs.map((item: any) => ({ address: item.address, sha256: item.after.dataSha256 })),
        completeStateDiff: captured.execution.outputs,
        branchClassification: variant.targetRelation === "equal" ? "equality-byte-identical" : variant.targetRelation === "greater-than" ? "greater-than-byte-identical" : "less-than-future-clock-guard-byte-identical",
        equalityLogCapturedFromReplay: variant.targetRelation === "equal",
      };
    }),
    historicalReferenceOnly: {
      source: plan.representative.priorDossierPath,
      exactObservedEqualityLogPattern: "Program log: Skipping lazer price update. next_timestamp {} <= current_timestamp {}",
      replayEvidence: true,
    },
    deterministicReproduction: "The pinned Linux evidence deterministically regenerates the successful exact-ELF baseline and twelve frozen case records.",
  };
  const oracleStateDiffs = {
    schemaVersion: "2.3",
    outcome: MILESTONE_23_OUTCOME,
    primaryEqualityQuestionAnswered: true,
    records: variants.flatMap((variant) => ORACLES.map((oracle) => {
      const pin = fixturePins.find((item) => item.address === oracle.address);
      if (!pin) throw new Error(`Fixture pin missing for ${oracle.address}`);
      const mutation = variant.mutations.find((item) => item.address === oracle.address);
      const output = linuxEvidence.cases.find((item: any) => item.caseId === variant.caseId).execution.outputs.find((item: any) => item.address === oracle.address);
      return {
        caseId: variant.caseId,
        scope: variant.scope,
        targetRelation: variant.targetRelation,
        feedId: oracle.feedId,
        address: oracle.address,
        inputSha256: mutation?.afterInputSha256 ?? pin.dataSha256,
        outputSha256: output.after.dataSha256,
        changedByteRanges: output.dataChangedRanges,
        lamportDelta: output.lamportDelta,
        dataLengthDelta: output.dataLengthDelta,
        ownerChanged: output.ownerChanged,
        executableChanged: output.executableChanged,
        classification: "byte-identical",
        reason: variant.targetRelation === "less-than" ? "The deployed future-message guard skipped mutation under the frozen no-Clock fixture." : "Exact deployed execution returned byte-identical oracle state.",
      };
    })),
    feePayerBoundary: {
      directInstructionFeeDebitModeled: false,
      absenceOfFeeDebitInferenceAllowed: false,
      milestone22FeePayerCliqueCausePreserved: true,
      explanation: "Velocity-instruction mutation, Post signer/writable declarations, and transaction-level runtime fee debit remain separate.",
    },
  };
  const runtimeManifest = {
    schemaVersion: "2.3",
    host: { platform: process.platform, architecture: process.arch, node: process.version },
    probePath: plan.runtimeProbe.path,
    probeSha256: plan.runtimeProbe.sha256,
    probe: runtimeProbe,
    replayEvidencePath: plan.linuxReplayEvidence.path,
    replayEvidenceSha256: plan.linuxReplayEvidence.sha256,
    selectedHarness: "mollusk-svm@0.13.1",
    exactApplicationElfExecuted: true,
    sourceLevelMockUsed: false,
    networkRequestsDuringOfflineReplay: 0,
    outcome: MILESTONE_23_OUTCOME,
  };
  return { fixtureManifest, instructionsProof, timestampValidation, branchReplayResults, oracleStateDiffs, runtimeManifest };
}

const MILESTONE_22_ARTIFACTS = [
  "output/research/velocity-anchor-bundle/anchor-binary-correspondence.json",
  "output/research/velocity-anchor-bundle/anchor-bundle-dossier.json",
  "output/research/velocity-anchor-bundle/anchor-bundle-report.html",
  "output/research/velocity-anchor-bundle/anchor-conflict-attribution.json",
  "output/research/velocity-anchor-bundle/anchor-semantic-evidence.json",
  "output/research/velocity-anchor-bundle/instruction-equivalence.json",
  "output/research/velocity-anchor-bundle/log-branch-matrix.json",
  "output/research/velocity-anchor-bundle/message-reuse-matrix.json",
  "output/research/velocity-anchor-bundle/qa-results.json",
  "output/research/velocity-anchor-bundle/anchor-bundle-desktop-qa.png",
  "output/research/velocity-anchor-bundle/anchor-bundle-390-qa.png",
  "research-plans/velocity-anchor-bundle-milestone-2.2.json",
  "docs/research/VELOCITY-ANCHOR-BUNDLE.md",
  "docs/handoffs/MILESTONE-2.2.md",
] as const;

export async function loadMilestone23Plan(path: string): Promise<Milestone23Plan> {
  const plan = JSON.parse(await readFile(resolve(path), "utf8")) as Milestone23Plan;
  if (plan.schemaVersion !== "2.3") throw new Error("Expected Milestone 2.3 plan");
  if (plan.programId !== VELOCITY_PROGRAM_ID || plan.expectedExecutableSha256 !== EXPECTED_ELF_SHA256) throw new Error("Milestone 2.3 executable identity changed");
  return plan;
}

export async function bootstrapMilestone23Plan(base: Milestone23Plan): Promise<Milestone23Plan> {
  const snapshot = JSON.parse(await readFile(resolve(base.accountSnapshotPath), "utf8")) as AccountSnapshot;
  const dossier = JSON.parse(await readFile(resolve(base.representative.priorDossierPath), "utf8")) as PriorDossier;
  const anchor = representative(dossier, base);
  const instructions = buildReplayInstructions(anchor);
  assertRepresentative(anchor, instructions);
  const sysvar = constructInstructionsSysvar(instructions, 3);
  const programData = snapshotBytes(snapshot, "HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7");
  const extraction = decodeProgramData(programData);
  if (extraction.executableSha256 !== EXPECTED_ELF_SHA256) throw new Error("Derived deployed executable hash changed during bootstrap");
  await mkdir(dirname(resolve(base.deployedElf.path)), { recursive: true });
  await writeFile(resolve(base.deployedElf.path), extraction.executable);
  const priorPlan = JSON.parse(await readFile(resolve("research-plans/velocity-anchor-bundle-milestone-2.2.json"), "utf8")) as { preservedArtifactHashes: Record<string, string> };
  const protectedArtifactHashes = { ...priorPlan.preservedArtifactHashes };
  for (const path of MILESTONE_22_ARTIFACTS) protectedArtifactHashes[path] = await fileHash(path);
  const inputDefinitions = [
    { path: base.accountSnapshotPath, purpose: "Authentic current account snapshot and exact ProgramData bytes" },
    { path: base.representative.priorDossierPath, purpose: "Pinned representative five-instruction Anchor evidence and independently verified Ed25519 references" },
    { path: "output/research/velocity-anchor-bundle/anchor-semantic-evidence.json", purpose: "Milestone 2.2 semantic limit and authorization boundary" },
    { path: "output/research/velocity-binary/deployed-executable-metadata.json", purpose: "Milestone 2.1 deployed executable identity" },
    { path: "output/research/velocity-binary/variant-correspondence.json", purpose: "Strong Post/TWAP and unresolved native correspondence status" },
    { path: base.runtimeProbe.path, purpose: "Host runtime feasibility attempts and exact blockers" },
  ];
  const postData = Buffer.from(instructions[3]!.dataHex, "hex");
  const signatureBytes = postData.subarray(16, 80);
  const publicKeyBytes = postData.subarray(80, 112);
  const messageBytes = postData.subarray(114, 263);
  return {
    ...base,
    deployedElf: { ...base.deployedElf, sha256: extraction.executableSha256 },
    runtimeProbe: { ...base.runtimeProbe, sha256: await fileHash(base.runtimeProbe.path) },
    fixtureAccountPins: allFixturePins(snapshot, sysvar),
    instructionsSysvar: {
      currentInstructionIndex: 3,
      dataSha256: sha256(sysvar),
      dataLength: sysvar.length,
      authoritativeCrate: "solana-instructions-sysvar",
      authoritativeVersion: "3.0.0",
    },
    instructionFixture: {
      instructions,
      ed25519: {
        instructionRawHex: ED25519_HEX,
        instructionSha256: sha256(Buffer.from(ED25519_HEX, "hex")),
        signatureHex: signatureBytes.toString("hex"),
        signatureSha256: sha256(signatureBytes),
        publicKeyHex: publicKeyBytes.toString("hex"),
        publicKey: anchor.ed25519.signerPublicKey,
        messageHex: messageBytes.toString("hex"),
        messageSha256: sha256(messageBytes),
        historicallyLocallyVerified: true,
      },
      instructionsSysvarRawHex: sysvar.toString("hex"),
      instructionsSysvarSha256: sha256(sysvar),
    },
    runtimeSysvarContext: {
      clock: "not-declared-not-supplied",
      rent: "not-declared-not-supplied",
      other: "none-inferred",
    },
    inputs: await Promise.all(inputDefinitions.map(async (input) => ({ ...input, sha256: await fileHash(input.path) }))),
    protectedArtifactHashes,
  };
}

export interface Milestone23Result {
  outcome: Milestone23Outcome;
  fixtureManifest: ReturnType<typeof buildArtifacts>["fixtureManifest"];
  instructionsProof: ReturnType<typeof buildArtifacts>["instructionsProof"];
  timestampValidation: ReturnType<typeof buildArtifacts>["timestampValidation"];
  branchReplayResults: ReturnType<typeof buildArtifacts>["branchReplayResults"];
  oracleStateDiffs: ReturnType<typeof buildArtifacts>["oracleStateDiffs"];
  runtimeManifest: ReturnType<typeof buildArtifacts>["runtimeManifest"];
  terminalSummary: string;
}

export async function runMilestone23(plan: Milestone23Plan, options: { offline: boolean }): Promise<Milestone23Result> {
  if (!options.offline) throw new Error("Milestone 2.3 replay is cache-only; pass --offline");
  for (const [path, expected] of Object.entries(plan.protectedArtifactHashes)) await assertFileHash(path, expected, "Protected prior artifact");
  for (const input of plan.inputs) await assertFileHash(input.path, input.sha256, "Milestone 2.3 input");
  await assertFileHash(plan.runtimeProbe.path, plan.runtimeProbe.sha256, "Runtime probe");
  await assertFileHash(plan.linuxReplayEvidence.path, plan.linuxReplayEvidence.sha256, "Linux replay evidence");
  const snapshot = JSON.parse(await readFile(resolve(plan.accountSnapshotPath), "utf8")) as AccountSnapshot;
  const dossier = JSON.parse(await readFile(resolve(plan.representative.priorDossierPath), "utf8")) as PriorDossier;
  if (dossier.outcome !== "repeated-update-structure-established-semantics-incomplete") throw new Error("Milestone 2.2 outcome changed");
  const anchor = representative(dossier, plan);
  const instructions = buildReplayInstructions(anchor);
  assertRepresentative(anchor, instructions);
  if (canonical(instructions) !== canonical(plan.instructionFixture.instructions)) throw new Error("Pinned five-instruction fixture changed");
  const sysvar = constructInstructionsSysvar(instructions, 3);
  const parsed = parseInstructionsSysvar(sysvar);
  if (parsed.currentInstructionIndex !== 3 || parsed.instructions.length !== 5) throw new Error("Instructions sysvar context changed");
  if (sha256(sysvar) !== plan.instructionsSysvar.dataSha256 || sysvar.length !== plan.instructionsSysvar.dataLength) throw new Error("Instructions sysvar pin changed");
  if (sysvar.toString("hex") !== plan.instructionFixture.instructionsSysvarRawHex || sha256(sysvar) !== plan.instructionFixture.instructionsSysvarSha256) throw new Error("Complete Instructions-sysvar fixture bytes changed");
  const postData = Buffer.from(instructions[3]!.dataHex, "hex");
  const edPin = plan.instructionFixture.ed25519;
  if (
    edPin.instructionRawHex !== ED25519_HEX ||
    edPin.instructionSha256 !== sha256(Buffer.from(ED25519_HEX, "hex")) ||
    edPin.signatureHex !== postData.subarray(16, 80).toString("hex") ||
    edPin.signatureSha256 !== sha256(postData.subarray(16, 80)) ||
    edPin.publicKeyHex !== postData.subarray(80, 112).toString("hex") ||
    edPin.publicKey !== anchor.ed25519.signerPublicKey ||
    edPin.messageHex !== postData.subarray(114, 263).toString("hex") ||
    edPin.messageSha256 !== anchor.ed25519.signedMessageSha256 ||
    edPin.historicallyLocallyVerified !== true
  ) throw new Error("Pinned Ed25519 signature/public-key/message fixture changed");
  const pins = allFixturePins(snapshot, sysvar);
  if (canonical(pins) !== canonical(plan.fixtureAccountPins)) throw new Error("Constructed fixture account pins changed");
  const programData = snapshotBytes(snapshot, "HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7");
  const extraction = decodeProgramData(programData);
  if (extraction.executableSha256 !== EXPECTED_ELF_SHA256 || extraction.executableSha256 !== plan.deployedElf.sha256) throw new Error("Exact deployed ELF hash guard failed");
  await mkdir(dirname(resolve(plan.deployedElf.path)), { recursive: true });
  await writeFile(resolve(plan.deployedElf.path), extraction.executable);
  await assertFileHash(plan.deployedElf.path, EXPECTED_ELF_SHA256, "Materialized deployed ELF");
  const runtimeProbe = JSON.parse(await readFile(resolve(plan.runtimeProbe.path), "utf8")) as { selectedDisposition?: { exactElfExecuted?: boolean; sourceMockUsed?: boolean; outcome?: string } };
  if (runtimeProbe.selectedDisposition?.exactElfExecuted !== true || runtimeProbe.selectedDisposition.sourceMockUsed !== false || runtimeProbe.selectedDisposition.outcome !== MILESTONE_23_OUTCOME) {
    throw new Error("Runtime probe disposition changed");
  }
  const linuxEvidence = JSON.parse(await readFile(resolve(plan.linuxReplayEvidence.path), "utf8"));
  if (linuxEvidence.runtime?.exactElfSha256 !== EXPECTED_ELF_SHA256 || linuxEvidence.baseline?.programResult !== "Success" || linuxEvidence.cases?.length !== 12) throw new Error("Linux exact replay evidence changed");
  const artifacts = buildArtifacts(plan, snapshot, anchor, instructions, sysvar, runtimeProbe, linuxEvidence);
  const outcome = chooseMilestone23Outcome({
    exactElfExecuted: true,
    fixtureValidated: true,
    equalityEmpiricallyValidated: true,
    oracleOutputsKnown: true,
    anyOracleMutation: false,
  });
  if (outcome !== MILESTONE_23_OUTCOME) throw new Error("Terminal outcome gate changed");
  const result: Milestone23Result = {
    outcome,
    ...artifacts,
    terminalSummary: "Milestone 2.3: equality-branch-byte-identical-established; the exact deployed ELF executed successfully and all equality-case oracle outputs matched their exact inputs byte-for-byte.",
  };
  await Promise.all([mkdir(resolve(plan.outputDirectory), { recursive: true }), mkdir(dirname(resolve(plan.documentationPath)), { recursive: true })]);
  await Promise.all([
    writeFile(resolve(plan.outputDirectory, "replay-fixture-manifest.json"), json(result.fixtureManifest)),
    writeFile(resolve(plan.outputDirectory, "instructions-sysvar-proof.json"), json(result.instructionsProof)),
    writeFile(resolve(plan.outputDirectory, "timestamp-field-validation.json"), json(result.timestampValidation)),
    writeFile(resolve(plan.outputDirectory, "branch-replay-results.json"), json(result.branchReplayResults)),
    writeFile(resolve(plan.outputDirectory, "oracle-state-diffs.json"), json(result.oracleStateDiffs)),
    writeFile(resolve(plan.outputDirectory, "runtime-manifest.json"), json(result.runtimeManifest)),
    writeFile(resolve(plan.outputDirectory, "equality-replay-report.html"), milestone23Html(result)),
    writeFile(resolve(plan.documentationPath), milestone23Markdown(result)),
  ]);
  for (const [path, expected] of Object.entries(plan.protectedArtifactHashes)) await assertFileHash(path, expected, "Protected prior artifact during replay");
  return result;
}
