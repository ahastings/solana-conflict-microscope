import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getAddressDecoder } from "@solana/kit";
import { analyzeBlock } from "./analyze.js";
import { decodeBase58Bytes, ED25519_PROGRAM_ID, parseEd25519Instruction } from "./ed25519.js";
import {
  milestone20CandidateHtml,
  milestone20CandidateMarkdown,
  milestone20SourceabilityHtml,
} from "./milestone20-report.js";
import type { DiscoveryCandidate, DiscoveryIndex } from "./discovery-types.js";
import type {
  CurrentAccountSnapshot,
  Milestone20InputEvidence,
  Milestone20Result,
  ProgramFamilyMap,
  SourceabilityCandidate,
  SourceabilityFamilyPlan,
  SourceabilityIndex,
  SourceabilityPlan,
  SourceCorrespondence,
  VelocityAccountPosition,
  VelocityAccountRoleRow,
  VelocityAccountSnapshotArtifact,
  VelocityConflictAccountEvidence,
  VelocityDecision,
  VelocityDossier,
  VelocityInstructionEvidence,
  VelocityInstructionLayout,
  VelocityOccurrence,
  VelocityResearchPlan,
  VelocitySignerMessageSummary,
  VelocitySourceManifest,
  VelocityTransactionEvidence,
} from "./milestone20-types.js";
import type { ComponentMeaning, NormalizedInstruction, NormalizedTransaction } from "./types.js";

const UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const POST_PYTH_DISCRIMINATOR = "daedaaf5278fa621";
const UPDATE_TWAP_DISCRIMINATOR = "f717ff41d45addc2";
const NATIVE_DISCRIMINATOR_2_PREFIX = "ffffffff02";

interface SourceCacheRecord {
  schemaVersion: "2.0-source-cache";
  retrievedAt: string;
  url: string;
  httpStatus: number;
  contentType: string | null;
  body: string;
}

interface SnapshotCacheRecord {
  schemaVersion: "2.0-account-snapshot-cache";
  retrievedAt: string;
  endpoint: string;
  commitment: "confirmed";
  addresses: string[];
  response: {
    jsonrpc?: string;
    id?: unknown;
    error?: unknown;
    result?: { context?: { slot?: number }; value?: unknown[] };
  };
}

export interface RunMilestone20Options {
  offline: boolean;
  bootstrapHashes?: boolean;
  fetchText?: (url: string) => Promise<{ status: number; contentType: string | null; body: string }>;
  fetchRpc?: (endpoint: string, body: string) => Promise<{ status: number; body: string }>;
}

const slash = (value: string): string => value.replaceAll("\\", "/");
const unique = <T>(values: T[]): T[] => [...new Set(values)];
const sorted = (values: string[]): string[] => unique(values).sort();
const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

async function fileSha256(path: string): Promise<string> {
  return sha256(await readFile(resolve(path)));
}

function expectedInput(plan: VelocityResearchPlan, path: string): Milestone20InputEvidence | undefined {
  return plan.inputEvidence.find((entry) => slash(entry.path) === slash(path));
}

async function validateInputHash(
  plan: VelocityResearchPlan,
  path: string,
  bootstrapHashes: boolean,
): Promise<Milestone20InputEvidence> {
  const expected = expectedInput(plan, path);
  if (!expected) throw new Error(`Candidate manifest does not hash required input: ${path}`);
  const observed = await fileSha256(path);
  if (expected.sha256 !== "pending" && expected.sha256.toLowerCase() !== observed) {
    throw new Error(`Input evidence hash mismatch for ${path}: expected ${expected.sha256}, observed ${observed}`);
  }
  if (expected.sha256 === "pending" && !bootstrapHashes) {
    throw new Error(`Candidate manifest retains an unresolved hash for ${path}`);
  }
  return { kind: expected.kind, path: expected.path, sha256: observed };
}

async function validateStandaloneHash(path: string, expected: string): Promise<void> {
  const observed = await fileSha256(path);
  if (observed !== expected.toLowerCase()) throw new Error(`Evidence hash mismatch for ${path}: expected ${expected}, observed ${observed}`);
}

export function groupCandidateByProgramFamily(
  candidate: Pick<DiscoveryCandidate, "candidateId" | "invokedProgramIds">,
  families: SourceabilityFamilyPlan[],
): SourceabilityFamilyPlan {
  const invoked = new Set(candidate.invokedProgramIds);
  const matches = families.filter((family) => family.identifyingProgramIds.every((programId) => invoked.has(programId)));
  if (matches.length !== 1) {
    throw new Error(`Candidate ${candidate.candidateId} matched ${matches.length} program families; expected exactly one`);
  }
  return matches[0]!;
}

function materializedDiscoveryRank(candidate: DiscoveryCandidate): number {
  const rank = candidate.materialization?.rank;
  if (!rank || candidate.materialization?.status !== "materialized") {
    throw new Error(`High-priority candidate ${candidate.candidateId} is not materialized`);
  }
  return rank;
}

function sourceabilityDisposition(
  candidateId: string,
  plan: SourceabilityPlan,
): SourceabilityCandidate["disposition"] {
  if (candidateId === plan.candidateDispositions.primaryCandidateId) return "primary-bounded-dossier";
  if (candidateId === plan.candidateDispositions.deferredNotRejectedCandidateId) return "deferred-not-rejected";
  if (candidateId === plan.candidateDispositions.preservedPriorDossierCandidateId) return "preserved-prior-dossier";
  return "triaged-lead";
}

export async function buildSourceabilityArtifacts(
  plan: SourceabilityPlan,
): Promise<{ index: SourceabilityIndex; familyMap: ProgramFamilyMap }> {
  await Promise.all([
    validateStandaloneHash(plan.discoveryIndex.path, plan.discoveryIndex.sha256),
    validateStandaloneHash(plan.candidateOneDossier.path, plan.candidateOneDossier.sha256),
  ]);
  const discovery = JSON.parse(await readFile(resolve(plan.discoveryIndex.path), "utf8")) as DiscoveryIndex;
  if (discovery.schemaVersion !== "1.8" || discovery.coverage.requested !== 500 || discovery.coverage.observed !== 500 || discovery.candidateCount !== 70) {
    throw new Error("Milestone 1.8 discovery baseline changed");
  }
  if (discovery.highPriorityCandidateIds.length !== plan.expectedCandidateCount) throw new Error("High-priority candidate count changed");
  const priorDossier = JSON.parse(await readFile(resolve(plan.candidateOneDossier.path), "utf8")) as { decision?: unknown };
  if (priorDossier.decision !== plan.candidateOneDossier.expectedDecision) throw new Error("Candidate #1 dossier decision changed");

  const highPriority = discovery.candidates
    .filter((candidate) => discovery.highPriorityCandidateIds.includes(candidate.candidateId))
    .sort((left, right) => materializedDiscoveryRank(left) - materializedDiscoveryRank(right));
  if (highPriority.length !== plan.expectedCandidateCount) throw new Error("Not every high-priority candidate is present in the discovery index");
  if (plan.families.length !== plan.expectedFamilyCount) throw new Error("Sourceability family count changed");

  const candidates: SourceabilityCandidate[] = highPriority.map((candidate) => {
    const family = groupCandidateByProgramFamily(candidate, plan.families);
    const materialization = candidate.materialization!;
    return {
      candidateId: candidate.candidateId,
      discoveryRank: materializedDiscoveryRank(candidate),
      exactInvokedProgramIds: [...candidate.invokedProgramIds],
      recurrenceCount: candidate.recurrenceBlockCount,
      payerCount: candidate.distinctFeePayerCount,
      depth: {
        lowerBound: candidate.componentWaveLowerBound,
        upperBound: candidate.componentWaveUpperBound,
        provenMinimum: candidate.provenMinimumWaveCount,
      },
      knownComputeContext: {
        qualifiedShare: candidate.knownComputeUnitShare,
        coverage: candidate.knownComputeCoverage,
      },
      existingCauseRoleEvidence: {
        cause: candidate.cause,
        decodedRoles: [...candidate.decodedAccountRoles],
        selectionReasons: [...candidate.selectionReasons],
      },
      sharedWritableAccountCount: candidate.nonFeePayerSharedWritableAccounts.length,
      materializationPath: {
        status: materialization.status,
        analysis: materialization.analysisPath,
        report: materialization.reportPath,
      },
      programFamilyId: family.familyId,
      authoritativeExactProgramIdMatch: family.authoritativeExactProgramIdMatch,
      maintainedSdkOrIdlAvailability: family.maintainedSdkOrIdl,
      publicSourceRepositoryAvailability: family.publicSourceRepository,
      verifiedBuildEvidence: family.verifiedBuildEvidence,
      versionDeploymentCorrespondence: family.versionDeploymentCorrespondence,
      sourceabilityOutcome: family.sourceabilityOutcome,
      researchPriority: family.researchPriority,
      researchPriorityReasons: [...family.researchPriorityReasons],
      disposition: sourceabilityDisposition(candidate.candidateId, plan),
    };
  });

  const deferred = candidates.find((candidate) => candidate.disposition === "deferred-not-rejected");
  if (!deferred || deferred.candidateId !== plan.candidateDispositions.deferredNotRejectedCandidateId) {
    throw new Error("Candidate #2 defer-not-reject disposition is missing");
  }
  const index: SourceabilityIndex = {
    schemaVersion: "2.0",
    generatedAt: plan.researchAt,
    purpose: "Discovery rank preserves contention significance; this evidence ladder separately orders bounded semantic research by authoritative public sourceability.",
    discoveryRankPreserved: true,
    evidenceLadder: plan.evidenceLadder.map((item) => ({ ...item })),
    coverage: {
      candidateCount: 19,
      familyCount: 6,
      allHighPriorityCandidatesMappedOnce: true,
    },
    candidateTwoFinding: {
      candidateId: "candidate-e5d929864077a76b",
      disposition: "deferred-not-rejected",
      authoritativeMutationSourceFound: deferred.authoritativeExactProgramIdMatch && deferred.publicSourceRepositoryAvailability,
      preservedFacts: [
        "Recurs across six observed blocks.",
        "Representative component has two transactions from two distinct fee payers.",
        "One shared writable account carries a decoded destination role.",
        "Declared contention has one edge, one atom, and proven depth two.",
        "Qualified known-compute share is 0.551766 with complete coverage.",
        "The rank-2 materialized analysis and HTML report remain valid evidence.",
      ],
    },
    candidates,
  };

  const familyMap: ProgramFamilyMap = {
    schemaVersion: "2.0",
    generatedAt: plan.researchAt,
    groupingRule: "A candidate belongs to the one configured meaningful family whose identifying unfamiliar program IDs are all in its exact invoked-program set; native infrastructure and token interfaces do not split protocol families.",
    families: [...plan.families]
      .sort((left, right) => left.researchPriority - right.researchPriority)
      .map((family) => {
        const members = candidates.filter((candidate) => candidate.programFamilyId === family.familyId);
        return {
          ...family,
          identifyingProgramIds: [...family.identifyingProgramIds],
          researchPriorityReasons: [...family.researchPriorityReasons],
          evidence: family.evidence.map((item) => ({ ...item })),
          discoveryRanks: members.map((candidate) => candidate.discoveryRank),
          candidateIds: members.map((candidate) => candidate.candidateId),
        };
      }),
  };
  if (familyMap.families.some((family) => family.candidateIds.length === 0)) throw new Error("A configured program family has no candidates");
  return { index, familyMap };
}

async function defaultFetchText(url: string): Promise<{ status: number; contentType: string | null; body: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": "Solana-Conflict-Microscope/0.1 read-only-research" },
    signal: AbortSignal.timeout(60_000),
  });
  return { status: response.status, contentType: response.headers.get("content-type"), body: await response.text() };
}

async function acquireSources(plan: VelocityResearchPlan, options: RunMilestone20Options): Promise<void> {
  const fetchText = options.fetchText ?? defaultFetchText;
  for (const source of plan.sources) {
    try {
      await readFile(resolve(source.cachePath), "utf8");
      continue;
    } catch {
      if (options.offline) throw new Error(`Offline replay is missing source cache ${source.cachePath}`);
    }
    const fetched = await fetchText(source.url);
    const record: SourceCacheRecord = {
      schemaVersion: "2.0-source-cache",
      retrievedAt: plan.researchAt,
      url: source.url,
      httpStatus: fetched.status,
      contentType: fetched.contentType,
      body: fetched.body,
    };
    await mkdir(dirname(resolve(source.cachePath)), { recursive: true });
    await writeFile(resolve(source.cachePath), json(record));
  }
}

function snapshotAddresses(plan: VelocityResearchPlan): string[] {
  return unique([
    plan.snapshotRequest.programId,
    plan.snapshotRequest.programDataAddress,
    ...plan.snapshotRequest.sharedWritableAddresses,
    ...plan.snapshotRequest.representativeInstructionSpecificAddresses,
  ]);
}

async function defaultFetchRpc(endpoint: string, body: string): Promise<{ status: number; body: string }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(90_000),
  });
  return { status: response.status, body: await response.text() };
}

function safeRpcParse(text: string): SnapshotCacheRecord["response"] {
  return JSON.parse(text.replace(/("rentEpoch"\s*:\s*)(\d+)/g, '$1"$2"')) as SnapshotCacheRecord["response"];
}

async function acquireSnapshots(plan: VelocityResearchPlan, options: RunMilestone20Options): Promise<void> {
  try {
    await readFile(resolve(plan.snapshotRequest.cachePath), "utf8");
    return;
  } catch {
    if (options.offline) throw new Error(`Offline replay is missing account snapshot cache ${plan.snapshotRequest.cachePath}`);
  }
  const addresses = snapshotAddresses(plan);
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "getMultipleAccounts",
    params: [addresses, { encoding: "base64", commitment: plan.snapshotRequest.commitment }],
  });
  const fetched = await (options.fetchRpc ?? defaultFetchRpc)(plan.snapshotRequest.endpoint, body);
  if (fetched.status !== 200) throw new Error(`Account snapshot RPC returned HTTP ${fetched.status}`);
  const response = safeRpcParse(fetched.body);
  if (response.error || !response.result?.context || !Array.isArray(response.result.value)) {
    throw new Error(`Account snapshot RPC returned invalid data: ${JSON.stringify(response.error ?? null)}`);
  }
  const record: SnapshotCacheRecord = {
    schemaVersion: "2.0-account-snapshot-cache",
    retrievedAt: plan.researchAt,
    endpoint: plan.snapshotRequest.endpoint,
    commitment: plan.snapshotRequest.commitment,
    addresses,
    response,
  };
  await mkdir(dirname(resolve(plan.snapshotRequest.cachePath)), { recursive: true });
  await writeFile(resolve(plan.snapshotRequest.cachePath), json(record));
}

function addressFromBytes(bytes: Buffer): string | null {
  try {
    return getAddressDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function requestedAs(address: string, plan: VelocityResearchPlan): CurrentAccountSnapshot["requestedAs"] {
  if (address === plan.snapshotRequest.programId) return "program";
  if (address === plan.snapshotRequest.programDataAddress) return "program-data";
  if (plan.snapshotRequest.sharedWritableAddresses.includes(address)) return "candidate-shared-writable";
  return "representative-instruction-specific";
}

function accountSnapshot(
  address: string,
  contextSlot: number,
  value: unknown,
  plan: VelocityResearchPlan,
): CurrentAccountSnapshot {
  const scope = requestedAs(address, plan);
  if (!value || typeof value !== "object") {
    return {
      address,
      requestedAs: scope,
      exists: false,
      contextSlot,
      owner: null,
      executable: null,
      lamports: null,
      dataLength: null,
      rentEpoch: null,
      rawDataSha256: null,
      loaderType: "missing",
      programDataAddress: null,
      lastDeploySlot: null,
      upgradeAuthority: null,
      temporalScope: "current-snapshot-not-historical",
    };
  }
  const item = value as { owner?: unknown; executable?: unknown; lamports?: unknown; rentEpoch?: unknown; data?: unknown };
  const encoded = Array.isArray(item.data) && typeof item.data[0] === "string" ? item.data[0] : "";
  const data = Buffer.from(encoded, "base64");
  const owner = typeof item.owner === "string" ? item.owner : null;
  let loaderType: CurrentAccountSnapshot["loaderType"] = owner === plan.velocityProgramId ? "program-owned-data" : "other";
  let programDataAddress: string | null = null;
  let lastDeploySlot: string | null = null;
  let upgradeAuthority: string | null = null;
  if (address === plan.velocityProgramId && data.length >= 36 && data.readUInt32LE(0) === 2) {
    loaderType = "bpf-upgradeable-program";
    programDataAddress = addressFromBytes(data.subarray(4, 36));
  } else if (address === plan.programDataAddress && data.length >= 13 && data.readUInt32LE(0) === 3) {
    loaderType = "bpf-upgradeable-programdata";
    lastDeploySlot = data.readBigUInt64LE(4).toString();
    upgradeAuthority = data[12] === 1 && data.length >= 45 ? addressFromBytes(data.subarray(13, 45)) : null;
  }
  return {
    address,
    requestedAs: scope,
    exists: true,
    contextSlot,
    owner,
    executable: typeof item.executable === "boolean" ? item.executable : null,
    lamports: item.lamports == null ? null : String(item.lamports),
    dataLength: data.length,
    rentEpoch: item.rentEpoch == null ? null : String(item.rentEpoch),
    rawDataSha256: sha256(data),
    loaderType,
    programDataAddress,
    lastDeploySlot,
    upgradeAuthority,
    temporalScope: "current-snapshot-not-historical",
  };
}

async function buildAccountSnapshotArtifact(
  plan: VelocityResearchPlan,
  bootstrapHashes: boolean,
): Promise<{ artifact: VelocityAccountSnapshotArtifact; hash: Milestone20InputEvidence }> {
  const hash = await validateInputHash(plan, plan.snapshotRequest.cachePath, bootstrapHashes);
  const record = JSON.parse(await readFile(resolve(plan.snapshotRequest.cachePath), "utf8")) as SnapshotCacheRecord;
  if (record.schemaVersion !== "2.0-account-snapshot-cache" || record.endpoint !== plan.snapshotRequest.endpoint || record.commitment !== plan.snapshotRequest.commitment) {
    throw new Error("Account snapshot cache provenance mismatch");
  }
  const contextSlot = Number(record.response.result?.context?.slot);
  const values = record.response.result?.value;
  if (!Number.isSafeInteger(contextSlot) || !Array.isArray(values) || values.length !== record.addresses.length) {
    throw new Error("Account snapshot result is malformed");
  }
  const snapshots = record.addresses.map((address, index) => accountSnapshot(address, contextSlot, values[index], plan));
  const program = snapshots.find((item) => item.address === plan.velocityProgramId);
  const programData = snapshots.find((item) => item.address === plan.programDataAddress);
  if (!program || program.programDataAddress !== plan.programDataAddress) throw new Error("Current program account does not point to the planned ProgramData address");
  if (!programData || programData.dataLength !== plan.snapshotRequest.expectedCurrentProgramMetadata.programDataLength) throw new Error("Current ProgramData length changed");
  if (programData.lastDeploySlot !== plan.snapshotRequest.expectedCurrentProgramMetadata.lastDeploySlot) throw new Error("Current last-deploy slot changed");
  if (programData.upgradeAuthority !== plan.snapshotRequest.expectedCurrentProgramMetadata.upgradeAuthority) throw new Error("Current upgrade authority changed");
  const rawValue = values[record.addresses.indexOf(plan.programDataAddress)];
  const rawEncoded = rawValue && typeof rawValue === "object" && Array.isArray((rawValue as { data?: unknown }).data)
    ? (rawValue as { data: unknown[] }).data[0]
    : null;
  const rawData = typeof rawEncoded === "string" ? Buffer.from(rawEncoded, "base64") : null;
  const metadataLength = rawData && rawData.length >= 13 ? (rawData[12] === 1 ? 45 : 13) : null;
  const executableHash = rawData && metadataLength !== null ? sha256(rawData.subarray(metadataLength)) : null;
  if (executableHash !== plan.snapshotRequest.expectedCurrentProgramMetadata.executableBytesSha256) {
    throw new Error(`Current deployed executable hash changed: ${executableHash}`);
  }
  return {
    artifact: {
      schemaVersion: "2.0",
      cluster: "devnet",
      endpoint: record.endpoint,
      commitment: record.commitment,
      retrievedAt: record.retrievedAt,
      contextSlot,
      cachePath: plan.snapshotRequest.cachePath,
      cacheSha256: hash.sha256,
      requestedAddresses: [...record.addresses],
      snapshots,
      deployedProgram: {
        programId: plan.velocityProgramId,
        programDataAddress: plan.programDataAddress,
        lastDeploySlot: programData.lastDeploySlot,
        upgradeAuthority: programData.upgradeAuthority,
        executableBytesSha256: executableHash,
        correspondenceSearchHashMatched: false,
      },
      limitation: "These values are current read-only snapshots at one RPC context slot, not historical account-state snapshots for the six sampled slots. Ownership and byte hashes do not establish what fields changed in the historical transactions.",
    },
    hash,
  };
}

async function buildSourceManifest(
  plan: VelocityResearchPlan,
  bootstrapHashes: boolean,
): Promise<{ artifact: VelocitySourceManifest; hashes: Milestone20InputEvidence[] }> {
  const sources: VelocitySourceManifest["sources"] = [];
  const hashes: Milestone20InputEvidence[] = [];
  for (const source of plan.sources) {
    const inputHash = await validateInputHash(plan, source.cachePath, bootstrapHashes);
    hashes.push(inputHash);
    const record = JSON.parse(await readFile(resolve(source.cachePath), "utf8")) as SourceCacheRecord;
    if (record.schemaVersion !== "2.0-source-cache" || record.url !== source.url || record.httpStatus !== source.expectedHttpStatus) {
      throw new Error(`Source cache provenance mismatch for ${source.id}`);
    }
    if (!record.body.includes(source.requiredContentMarker)) throw new Error(`Source ${source.id} lacks required content marker`);
    sources.push({
      ...source,
      supports: [...source.supports],
      doesNotSupport: [...source.doesNotSupport],
      cacheSha256: inputHash.sha256,
      contentSha256: sha256(record.body),
      contentBytes: Buffer.byteLength(record.body),
      httpStatus: record.httpStatus,
    });
  }
  const officialIdentity = sources.some((source) => source.classification === "official-documentation" && source.exactProgramIdMatch && source.supports.some((claim) => /Velocity association/.test(claim)));
  if (!officialIdentity) throw new Error("Authoritative exact Velocity program-ID evidence is missing");
  return {
    artifact: {
      schemaVersion: "2.0",
      accessedAt: plan.researchAt,
      programId: plan.velocityProgramId,
      authoritativeProgramIdentityFound: true,
      identityFinding: "The official velocity-exchange documentation repository identifies the exact program ID as Velocity on devnet and mainnet.",
      sources,
      searches: plan.sourceSearches.map((item) => ({ ...item })),
      deployedSourceCorrespondence: "source-family-only",
      correspondenceReasons: [
        "The official protocol-v2 tree is a public Velocity source family and its instruction names/log strings match two observed Anchor discriminators.",
        "The pinned source tree declares the Drift program ID dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH rather than the exact Velocity ID.",
        "The repository .verified-build.json maps only the Drift program ID, and the exact Velocity ID returned is_verified false from the maintained verification service.",
        "No official release hash or reproducible build record matched executable SHA-256 89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c.",
        "The observed native discriminator-2 instruction succeeds with five accounts, while the pinned source-family handler requires at least six.",
        "Observed skip logs use a <= comparison, while the pinned source-family Pyth Lazer handler and message use <.",
      ],
      inheritedDriftDistinction: [
        "The public repository retains Drift module/package names and a Drift declare_id; it is evidence about the maintained Velocity source family, not automatic proof of deployed Velocity semantics.",
        "Drift semantics are not substituted merely because Velocity derives from Drift.",
        "Only exact observed bytes/logs are labeled as observed; handler roles and mutations remain explicitly source-family-only.",
      ],
      verifiedBuildMatchFound: false,
    },
    hashes,
  };
}

function nonFeePayerSharedAccounts(analysis: ReturnType<typeof analyzeBlock>, meaning: ComponentMeaning): string[] {
  const transactions = meaning.transactionIndexes.map((index) => analysis.transactions[index]!).filter(Boolean);
  const payers = new Set(transactions.map((transaction) => transaction.feePayer));
  return meaning.sharedConflictAccounts.filter((account) => !payers.has(account)).sort();
}

export function isExactMilestone20Identity(observed: string[], expected: string[]): boolean {
  return JSON.stringify(sorted(observed)) === JSON.stringify(sorted(expected));
}

function outerInstructions(transaction: NormalizedTransaction): NormalizedInstruction[] {
  return transaction.instructions
    .filter((instruction) => instruction.location === "outer")
    .sort((left, right) => left.instructionIndex - right.instructionIndex);
}

function bytesForInstruction(instruction: NormalizedInstruction): Uint8Array | null {
  if (instruction.data === null) return null;
  try {
    return decodeBase58Bytes(instruction.data);
  } catch {
    return null;
  }
}

export function anchorInstructionDiscriminator(name: string): string {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8).toString("hex");
}

export function classifyVelocityInstructionBytes(bytes: Uint8Array | null): {
  encoding: VelocityInstructionEvidence["encoding"];
  observedVariant: string;
  sourceFamilyVariant: string | null;
  discriminatorHex: string | null;
  prefixHex: string | null;
} {
  if (!bytes) return { encoding: "no-data", observedVariant: "undecodable", sourceFamilyVariant: null, discriminatorHex: null, prefixHex: null };
  const buffer = Buffer.from(bytes);
  const discriminatorHex = buffer.length >= 8 ? buffer.subarray(0, 8).toString("hex") : null;
  const prefixHex = buffer.subarray(0, Math.min(8, buffer.length)).toString("hex");
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("hex") === NATIVE_DISCRIMINATOR_2_PREFIX) {
    return {
      encoding: "native-prefix",
      observedVariant: "native-prefix-discriminator-2",
      sourceFamilyVariant: "handle_set_oracle_cache_entries_native",
      discriminatorHex,
      prefixHex,
    };
  }
  if (discriminatorHex === POST_PYTH_DISCRIMINATOR) {
    return {
      encoding: "anchor-discriminator",
      observedVariant: "post-pyth-lazer-oracle-update",
      sourceFamilyVariant: "post_pyth_lazer_oracle_update",
      discriminatorHex,
      prefixHex,
    };
  }
  if (discriminatorHex === UPDATE_TWAP_DISCRIMINATOR) {
    return {
      encoding: "anchor-discriminator",
      observedVariant: "update-perp-bid-ask-twap",
      sourceFamilyVariant: "update_perp_bid_ask_twap",
      discriminatorHex,
      prefixHex,
    };
  }
  return { encoding: "other", observedVariant: "unknown-velocity-instruction", sourceFamilyVariant: null, discriminatorHex, prefixHex };
}

function instructionAccountPositions(transaction: NormalizedTransaction, instruction: NormalizedInstruction): VelocityAccountPosition[] {
  return instruction.accountAddresses.map((address, position) => {
    const account = transaction.accounts.find((item) => item.pubkey === address);
    return { position, address, signer: account?.signer ?? false, writable: account?.writable ?? false };
  });
}

function velocityInstructionEvidence(
  plan: VelocityResearchPlan,
  transaction: NormalizedTransaction,
  instruction: NormalizedInstruction,
): VelocityInstructionEvidence {
  const bytes = bytesForInstruction(instruction);
  const classified = classifyVelocityInstructionBytes(bytes);
  return {
    instructionIndex: instruction.instructionIndex,
    programId: plan.velocityProgramId,
    byteLength: bytes?.length ?? null,
    rawSha256: bytes ? sha256(bytes) : null,
    prefixHex: classified.prefixHex,
    discriminatorHex: classified.discriminatorHex,
    encoding: classified.encoding,
    observedLogNames: transaction.logMessages
      .filter((message) => message.startsWith("Program log: Instruction: "))
      .map((message) => message.slice("Program log: Instruction: ".length)),
    observedVariant: classified.observedVariant,
    sourceFamilyVariant: classified.sourceFamilyVariant,
    exactDeployedVariantEstablished: false,
    accounts: instructionAccountPositions(transaction, instruction),
  };
}

function programDataLogHashes(logs: string[]): VelocityTransactionEvidence["programDataLogHashes"] {
  const records: VelocityTransactionEvidence["programDataLogHashes"] = [];
  for (const message of logs) {
    if (!message.startsWith("Program data: ")) continue;
    try {
      const bytes = Buffer.from(message.slice("Program data: ".length).trim(), "base64");
      records.push({ byteLength: bytes.length, prefixHex: bytes.subarray(0, Math.min(8, bytes.length)).toString("hex"), sha256: sha256(bytes) });
    } catch {
      // The full malformed log remains in occurrence evidence.
    }
  }
  return records;
}

function transactionEvidence(plan: VelocityResearchPlan, transaction: NormalizedTransaction): VelocityTransactionEvidence {
  const instructions = outerInstructions(transaction);
  const maxIndex = Math.max(-1, ...instructions.map((instruction) => instruction.instructionIndex));
  const instructionDatas = Array.from({ length: maxIndex + 1 }, () => null as Uint8Array | null);
  for (const instruction of instructions) instructionDatas[instruction.instructionIndex] = bytesForInstruction(instruction);
  return {
    index: transaction.index,
    signature: transaction.signature,
    status: transaction.status,
    feePayer: transaction.feePayer,
    computeUnitsConsumed: transaction.computeUnitsConsumed,
    instructionProgramOrder: instructions.map((instruction) => instruction.programId),
    velocityInstructions: instructions
      .filter((instruction) => instruction.programId === plan.velocityProgramId)
      .map((instruction) => velocityInstructionEvidence(plan, transaction, instruction)),
    ed25519: instructions
      .filter((instruction) => instruction.programId === ED25519_PROGRAM_ID)
      .map((instruction) => parseEd25519Instruction(instructionDatas, instruction.instructionIndex)),
    logs: [...transaction.logMessages],
    programDataLogHashes: programDataLogHashes(transaction.logMessages),
  };
}

function conflictAccountFlags(
  transactions: NormalizedTransaction[],
  edges: VelocityOccurrence["conflictEdges"],
): VelocityConflictAccountEvidence[] {
  const byIndex = new Map(transactions.map((transaction) => [transaction.index, transaction]));
  return edges.flatMap((edge) => edge.accounts.map((address) => {
    const source = byIndex.get(edge.source)?.accounts.find((account) => account.pubkey === address);
    const target = byIndex.get(edge.target)?.accounts.find((account) => account.pubkey === address);
    return {
      address,
      sourceTransactionIndex: edge.source,
      targetTransactionIndex: edge.target,
      sourceSigner: source?.signer ?? false,
      sourceWritable: source?.writable ?? false,
      targetSigner: target?.signer ?? false,
      targetWritable: target?.writable ?? false,
    };
  }));
}

function assertOccurrence(expected: VelocityResearchPlan["expectedOccurrences"][number], occurrence: VelocityOccurrence): void {
  const checks: Array<[string, unknown, unknown]> = [
    ["component", occurrence.componentId, expected.componentId],
    ["transaction indexes", occurrence.transactionIndexes, expected.transactionIndexes],
    ["transaction signatures", occurrence.transactionSignatures, expected.transactionSignatures],
    ["transaction count", occurrence.transactionIndexes.length, expected.transactionCount],
    ["edge count", occurrence.conflictEdges.length, expected.conflictEdgeCount],
    ["atom count", occurrence.conflictAtoms.length, expected.conflictAtomCount],
    ["payer count", occurrence.distinctPayers.length, expected.distinctPayerCount],
    ["wave lower bound", occurrence.waveLowerBound, expected.waveLowerBound],
    ["wave upper bound", occurrence.waveUpperBound, expected.waveUpperBound],
    ["known compute units", occurrence.knownComputeUnits, expected.knownComputeUnits],
    ["known compute coverage", occurrence.knownComputeCoverage, expected.knownComputeCoverage],
  ];
  for (const [label, observed, wanted] of checks) {
    if (JSON.stringify(observed) !== JSON.stringify(wanted)) {
      throw new Error(`Slot ${expected.slot} ${label} changed: expected ${JSON.stringify(wanted)}, observed ${JSON.stringify(observed)}`);
    }
  }
}

function occurrenceShape(occurrence: VelocityOccurrence): string {
  return JSON.stringify({
    transactions: occurrence.transactionIndexes.length,
    payers: occurrence.distinctPayers.length,
    edges: occurrence.conflictEdges.length,
    atoms: occurrence.conflictAtoms.length,
    waves: [occurrence.waveLowerBound, occurrence.waveUpperBound],
    variants: occurrence.transactions.flatMap((transaction) => transaction.velocityInstructions.map((instruction) => instruction.observedVariant)).sort(),
    ed25519: occurrence.transactions.flatMap((transaction) => transaction.ed25519.map((instruction) => instruction.signatureCount)),
  });
}

async function revalidateVelocityOccurrences(
  plan: VelocityResearchPlan,
  bootstrapHashes: boolean,
): Promise<{ occurrences: VelocityOccurrence[]; hashes: Milestone20InputEvidence[] }> {
  if (plan.observedRecurrenceSlots.length !== 6 || plan.sourceCachePaths.length !== 6 || plan.expectedOccurrences.length !== 6) {
    throw new Error("Candidate #3 manifest must contain exactly six occurrence references");
  }
  const occurrences: VelocityOccurrence[] = [];
  const hashes: Milestone20InputEvidence[] = [];
  for (let offset = 0; offset < plan.observedRecurrenceSlots.length; offset++) {
    const slot = plan.observedRecurrenceSlots[offset]!;
    const cachePath = plan.sourceCachePaths[offset]!;
    const expected = plan.expectedOccurrences[offset]!;
    if (expected.slot !== slot) throw new Error("Candidate occurrence order does not align with cache paths");
    const inputHash = await validateInputHash(plan, cachePath, bootstrapHashes);
    hashes.push(inputHash);
    const cached = JSON.parse(await readFile(resolve(cachePath), "utf8")) as { slot?: unknown; block?: unknown };
    if (Number(cached.slot) !== slot || cached.block === undefined) throw new Error(`Cached block ${cachePath} does not contain slot ${slot}`);
    const analysis = analyzeBlock(cached.block, slot, "fixture", {
      cluster: plan.cluster,
      endpoint: null,
      retrievedAt: null,
      sourceMode: "scanner-cache",
      dataKind: "real-network",
    });
    const contention = analysis.componentMeanings.filter((meaning) => meaning.isContentionFinding);
    const exact = contention.filter((meaning) => isExactMilestone20Identity(nonFeePayerSharedAccounts(analysis, meaning), plan.identity.accounts));
    if (exact.length !== 1) throw new Error(`Slot ${slot} has ${exact.length} exact candidate identities; expected one`);
    const meaning = exact[0]!;
    const partialIdentityComponentsRejected = contention
      .filter((other) => other.componentId !== meaning.componentId)
      .map((other) => ({
        componentId: other.componentId,
        overlappingAccounts: nonFeePayerSharedAccounts(analysis, other).filter((account) => plan.identity.accounts.includes(account)).sort(),
      }))
      .filter((item) => item.overlappingAccounts.length > 0);
    const indexSet = new Set(meaning.transactionIndexes);
    const transactions = meaning.transactionIndexes.map((index) => analysis.transactions[index]!).filter(Boolean);
    const edges = analysis.conflictEdges
      .filter((edge) => indexSet.has(edge.source) && indexSet.has(edge.target))
      .map((edge) => ({ source: edge.source, target: edge.target, accounts: [...edge.accounts], classification: edge.classification }));
    const atoms = edges.flatMap((edge) => edge.accounts.map((account) => ({ source: edge.source, target: edge.target, account })));
    const knownCount = transactions.filter((transaction) => transaction.computeUnitsConsumed !== null).length;
    const occurrence: VelocityOccurrence = {
      evidenceId: `slot-${slot}#component-${meaning.componentId}`,
      slot,
      componentId: meaning.componentId,
      blockTime: analysis.context.blockTime,
      transactionIndexes: [...meaning.transactionIndexes],
      transactionSignatures: transactions.map((transaction) => transaction.signature),
      statusCounts: {
        success: transactions.filter((transaction) => transaction.status === "success").length,
        failed: transactions.filter((transaction) => transaction.status === "failed").length,
        unknown: transactions.filter((transaction) => transaction.status === "unknown").length,
      },
      distinctPayers: sorted(transactions.map((transaction) => transaction.feePayer)),
      conflictEdges: edges,
      conflictAtoms: atoms,
      conflictingAccountFlags: conflictAccountFlags(transactions, edges),
      waveLowerBound: meaning.waveBounds.cliqueLowerBound,
      waveUpperBound: meaning.waveBounds.generatedWaveUpperBound,
      provenMinimumWaveCount: meaning.waveBounds.provenMinimumWaveCount,
      knownComputeUnits: transactions.reduce((sum, transaction) => sum + (transaction.computeUnitsConsumed ?? 0), 0),
      knownComputeCoverage: transactions.length === 0 ? 0 : knownCount / transactions.length,
      invokedProgramIds: sorted(transactions.flatMap((transaction) => transaction.invokedProgramIds)),
      instructionOrder: transactions.map((transaction) => ({
        transactionIndex: transaction.index,
        programIds: outerInstructions(transaction).map((instruction) => instruction.programId),
      })),
      transactions: transactions.map((transaction) => transactionEvidence(plan, transaction)),
      deviationsFromRepresentative: [],
      partialIdentityComponentsRejected,
      sourceCachePath: cachePath,
      sourceCacheSha256: inputHash.sha256,
    };
    assertOccurrence(expected, occurrence);
    if (occurrence.statusCounts.success !== 4 || occurrence.statusCounts.failed !== 0 || occurrence.statusCounts.unknown !== 0) {
      throw new Error(`Slot ${slot} transaction status baseline changed`);
    }
    occurrences.push(occurrence);
  }
  const representative = occurrences.find((occurrence) => occurrence.slot === plan.representative.slot);
  if (!representative) throw new Error("Representative occurrence was not revalidated");
  const representativeShape = occurrenceShape(representative);
  for (const occurrence of occurrences) {
    const deviations: string[] = [];
    if (occurrenceShape(occurrence) !== representativeShape) deviations.push("instruction or structural shape differs");
    if (occurrence.knownComputeUnits !== representative.knownComputeUnits) deviations.push("known compute total differs");
    if (occurrence.componentId !== representative.componentId) deviations.push("component identifier differs");
    occurrence.deviationsFromRepresentative = deviations;
  }
  return { occurrences, hashes };
}

function counts<T>(values: T[], key: (value: T) => string): Array<{ value: string; count: number }> {
  const map = new Map<string, number>();
  for (const value of values) {
    const item = key(value);
    map.set(item, (map.get(item) ?? 0) + 1);
  }
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([value, count]) => ({ value, count }));
}

export function buildVelocitySignerSummary(occurrences: VelocityOccurrence[]): VelocitySignerMessageSummary {
  const instructionRecords = occurrences.flatMap((occurrence) => occurrence.transactions.flatMap((transaction) => transaction.ed25519.map((instruction) => ({ occurrence, instruction }))));
  const signatures = instructionRecords.flatMap(({ occurrence, instruction }) => instruction.signatures.map((signature) => ({ occurrence, signature })));
  const signerRows = counts(signatures, (item) => item.signature.publicKey).map((row) => ({
    publicKey: row.value,
    signatureCount: row.count,
    occurrenceCount: new Set(signatures.filter((item) => item.signature.publicKey === row.value).map((item) => item.occurrence.slot)).size,
  }));
  const messageRows = counts(signatures, (item) => item.signature.messageSha256).map((row) => {
    const matching = signatures.filter((item) => item.signature.messageSha256 === row.value);
    return {
      messageSha256: row.value,
      byteLength: matching[0]!.signature.messageHex.length / 2,
      signatureCount: row.count,
      signerPublicKeys: sorted(matching.map((item) => item.signature.publicKey)),
      occurrenceCount: new Set(matching.map((item) => item.occurrence.slot)).size,
    };
  });
  const references = signatures.flatMap((item) => [
    item.signature.signatureReference,
    item.signature.publicKeyReference,
    item.signature.messageReference,
  ]);
  return {
    schemaVersion: "2.0",
    transactionCount: occurrences.reduce((sum, occurrence) => sum + occurrence.transactions.length, 0),
    ed25519InstructionCount: instructionRecords.length,
    signatureCount: signatures.length,
    decodedInstructionCount: instructionRecords.filter((item) => item.instruction.status === "decoded").length,
    malformedInstructionCount: instructionRecords.filter((item) => item.instruction.status === "malformed").length,
    unsupportedReferenceCount: instructionRecords.filter((item) => item.instruction.status === "unsupported-reference").length,
    localVerificationPassCount: signatures.filter((item) => item.signature.locallyVerified).length,
    sameInstructionReferenceCount: references.filter((reference) => reference.sameInstruction).length,
    crossInstructionReferenceCount: references.filter((reference) => !reference.sameInstruction).length,
    distinctSignerCount: signerRows.length,
    distinctMessageCount: messageRows.length,
    signers: signerRows,
    messages: messageRows,
    interpretation: "Offsets, referenced instruction indexes, covered message bytes, signatures, and local verification are structural evidence. They do not establish signer real-world identity, organizational independence, or deployed application semantics.",
  };
}

function sourceRole(variant: string, position: number): {
  constraint: string | null;
  role: string | null;
  requiredWritable: boolean | null;
  mutation: string | null;
  fields: string[];
  scope: VelocityAccountRoleRow["scope"];
  accountType: string | null;
  pdaSeeds: string[];
  evidence: string[];
} {
  if (variant === "post-pyth-lazer-oracle-update") {
    if (position === 0) return { constraint: "keeper", role: "keeper signer", requiredWritable: true, mutation: "No explicit handler field mutation; source-family account constraint declares mutability.", fields: [], scope: "signer-configuration-specific", accountType: "Signer", pdaSeeds: [], evidence: ["Pinned source-family UpdatePythLazerOracle account constraints."] };
    if (position === 1) return { constraint: "pyth_lazer_storage", role: "Pyth Lazer signer/storage configuration", requiredWritable: false, mutation: null, fields: [], scope: "global", accountType: "Storage-compatible account", pdaSeeds: [], evidence: ["Pinned source-family storage address constraint and signature verification flow."] };
    if (position === 2) return { constraint: "ix_sysvar", role: "Instructions sysvar", requiredWritable: false, mutation: null, fields: [], scope: "global", accountType: "Instructions sysvar", pdaSeeds: [], evidence: ["Pinned source-family exact sysvar address constraint."] };
    return {
      constraint: "remaining_accounts[feed_index]",
      role: "Pyth Lazer oracle PDA candidate",
      requiredWritable: true,
      mutation: "Source-family branch conditionally writes price, posted_slot, publish_time, exponent, and conf after signature/message/PDA/timestamp validation; stale updates skip.",
      fields: ["price", "posted_slot", "publish_time", "exponent", "conf"],
      scope: "oracle-specific",
      accountType: "PythLazerOracle",
      pdaSeeds: ["PYTH_LAZER_ORACLE_SEED", "feed_id.to_le_bytes()"],
      evidence: ["Pinned source-family handler iterates one mutable remaining account per feed and validates its PDA."],
    };
  }
  if (variant === "update-perp-bid-ask-twap") {
    const entries = [
      { constraint: "state", role: "protocol state", writable: false, mutation: null, fields: [] as string[], scope: "global" as const, type: "State" },
      { constraint: "perp_market", role: "perpetual market", writable: true, mutation: "Source-family handler mutates AMM/mark TWAP state and may update funding-related market state after validation.", fields: ["amm.last_bid_price_twap", "amm.last_ask_price_twap", "amm.last_mark_price_twap_ts", "funding-related PerpMarket state"], scope: "market-specific" as const, type: "PerpMarket" },
      { constraint: "oracle", role: "market oracle", writable: false, mutation: null, fields: [] as string[], scope: "oracle-specific" as const, type: "oracle account" },
      { constraint: "keeper_stats", role: "keeper permissions/stake state", writable: false, mutation: null, fields: [] as string[], scope: "signer-configuration-specific" as const, type: "UserStats" },
      { constraint: "authority", role: "keeper authority signer", writable: false, mutation: null, fields: [] as string[], scope: "signer-configuration-specific" as const, type: "Signer" },
    ];
    const entry = entries[position];
    if (entry) return { constraint: entry.constraint, role: entry.role, requiredWritable: entry.writable, mutation: entry.mutation, fields: entry.fields, scope: entry.scope, accountType: entry.type, pdaSeeds: [], evidence: ["Pinned source-family IDL and UpdatePerpBidAskTwap handler."] };
    return { constraint: "remaining_accounts[maker_index]", role: "optional maker input", requiredWritable: false, mutation: null, fields: [], scope: "market-specific", accountType: "User source-family input", pdaSeeds: [], evidence: ["Pinned source-family handler loads makers from remaining accounts."] };
  }
  if (variant === "native-prefix-discriminator-2") {
    const names = ["admin", "state", "cache0", "cache1", "system_program", "rent"];
    const roles = ["administrative signer/payer", "protocol state", "oracle cache buffer 0", "oracle cache buffer 1", "System Program", "Rent sysvar"];
    const scopes: VelocityAccountRoleRow["scope"][] = ["signer-configuration-specific", "global", "oracle-specific", "oracle-specific", "global", "global"];
    const writable = [true, false, true, true, false, false];
    return {
      constraint: names[position] ?? null,
      role: roles[position] ?? null,
      requiredWritable: writable[position] ?? null,
      mutation: position === 2 || position === 3 ? "Source-family handler initializes/reallocates both cache buffers and overwrites cache metadata and entries." : null,
      fields: position === 2 || position === 3 ? ["cache_id", "buffer_index", "entries"] : [],
      scope: scopes[position] ?? "unknown",
      accountType: position === 2 || position === 3 ? "OraclePriceCache" : null,
      pdaSeeds: position === 2 || position === 3 ? ["ORACLE_PRICE_CACHE_SEED", "cache_id", "buffer_index"] : [],
      evidence: ["Pinned source-family native discriminator-2 handler.", "Observed instruction supplies five accounts while that handler requires at least six, so this role mapping is not accepted as deployed truth."],
    };
  }
  return { constraint: null, role: null, requiredWritable: null, mutation: null, fields: [], scope: "unknown", accountType: null, pdaSeeds: [], evidence: [] };
}

export function buildVelocityInstructionLayout(
  occurrences: VelocityOccurrence[],
  snapshots: VelocityAccountSnapshotArtifact,
): VelocityInstructionLayout {
  const records = occurrences.flatMap((occurrence) => occurrence.transactions.flatMap((transaction) => transaction.velocityInstructions.map((instruction) => ({ occurrence, instruction }))));
  const groups = counts(records, (record) => `${record.instruction.observedVariant}|${record.instruction.byteLength ?? -1}`).map((group) => {
    const matching = records.filter((record) => `${record.instruction.observedVariant}|${record.instruction.byteLength ?? -1}` === group.value);
    const first = matching[0]!.instruction;
    const comparison = first.observedVariant === "native-prefix-discriminator-2"
      ? "The prefix maps to native discriminator 2 in the pinned source family, but observed account cardinality/flags contradict that exact handler."
      : "The Anchor discriminator and emitted instruction name match the pinned source family; exact deployed source correspondence remains unproven.";
    return {
      observedVariant: first.observedVariant,
      encoding: first.encoding,
      discriminatorHex: first.discriminatorHex,
      byteLength: first.byteLength ?? 0,
      count: group.count,
      slots: [...new Set(matching.map((record) => record.occurrence.slot))].sort((a, b) => a - b),
      observedLogNames: sorted(matching.flatMap((record) => record.instruction.observedLogNames)),
      sourceFamilyVariant: first.sourceFamilyVariant,
      exactDeployedVariantEstablished: false as const,
      sourceFamilyComparison: comparison,
    };
  }).sort((left, right) => left.observedVariant.localeCompare(right.observedVariant));

  const accountRecords = records.flatMap(({ instruction }) => instruction.accounts.map((account) => ({ variant: instruction.observedVariant, account })));
  const roleKeys = unique(accountRecords.map((record) => `${record.variant}|${record.account.position}`)).sort();
  const accountRoleMatrix: VelocityAccountRoleRow[] = roleKeys.map((key) => {
    const [variant, positionText] = key.split("|");
    const position = Number(positionText);
    const matching = accountRecords.filter((record) => record.variant === variant && record.account.position === position).map((record) => record.account);
    const role = sourceRole(variant!, position);
    const addresses = counts(matching, (account) => account.address).map((entry) => ({ address: entry.value, count: entry.count }));
    const metadata = addresses.map((entry) => snapshots.snapshots.find((snapshot) => snapshot.address === entry.address)).filter((item): item is CurrentAccountSnapshot => Boolean(item));
    return {
      observedVariant: variant!,
      position,
      signer: matching[0]?.signer ?? false,
      writable: matching[0]?.writable ?? false,
      flagsStable: matching.every((account) => account.signer === matching[0]?.signer && account.writable === matching[0]?.writable),
      addressRecurrence: addresses,
      currentOwners: sorted(metadata.flatMap((item) => item.owner ? [item.owner] : [])),
      currentDataLengths: unique(metadata.flatMap((item) => item.dataLength === null ? [] : [item.dataLength])).sort((left, right) => left - right),
      sourceConstraintName: role.constraint,
      sourceFamilyRole: role.role,
      sourceConfirmedDeployedRole: null,
      declaredAccess: matching[0]?.writable ? "writable" : "read-only",
      sourceRequiredWritable: role.requiredWritable,
      sourceFamilyMutation: role.mutation,
      sourceConfirmedMutation: "unknown",
      exactFieldsOrRegions: [...role.fields],
      scope: role.scope,
      accountTypeOrDiscriminator: role.accountType,
      pdaSeeds: [...role.pdaSeeds],
      confidence: variant === "native-prefix-discriminator-2" ? "low" : "medium",
      evidence: [
        ...role.evidence,
        "Signer/writable flags and addresses are observed transaction declarations.",
        "No source-family role or mutation is promoted to deployed source-confirmed truth.",
      ],
    };
  });
  return {
    schemaVersion: "2.0",
    deploymentCorrespondence: "source-family-only",
    groups,
    accountRoleMatrix,
    nativeVariantMismatch: {
      observedPrefix: "ffffffff02",
      observedAccountCount: 5,
      sourceFamilyMinimumAccountCount: 6,
      interpretation: "All six successful native-prefix transactions supply five accounts. The pinned official source-family discriminator-2 handler rejects fewer than six, so the handler cannot be treated as the exact deployed branch.",
    },
    eventAndLogFinding: "Eighteen transaction paths emit PostPythLazerOracleUpdate followed by UpdatePerpBidAskTwap; six native-prefix paths emit no Anchor instruction name. No event discriminator is used to bridge the unresolved deployed-source gap.",
  };
}

export function chooseVelocityDecision(
  authoritativeIdentity: boolean,
  correspondence: SourceCorrespondence,
  exactInstructionBranch: boolean,
  mutationSemantics: boolean,
): VelocityDecision {
  if (!authoritativeIdentity) return "black-box-structure-only";
  if ((correspondence === "exact verified deployment" || correspondence === "strongly version-correlated") && exactInstructionBranch && mutationSemantics) {
    return "source-confirmed-semantics";
  }
  return "identity-found-semantics-incomplete";
}

function buildVelocityDossier(
  plan: VelocityResearchPlan,
  occurrences: VelocityOccurrence[],
  sources: VelocitySourceManifest,
  snapshots: VelocityAccountSnapshotArtifact,
  layout: VelocityInstructionLayout,
): VelocityDossier {
  const representative = occurrences.find((occurrence) => occurrence.slot === plan.representative.slot)!;
  const decision = chooseVelocityDecision(sources.authoritativeProgramIdentityFound, sources.deployedSourceCorrespondence, false, false);
  if (decision !== "identity-found-semantics-incomplete") throw new Error("Candidate #3 decision gate produced an unexpected outcome");
  const sourceFamilyRolesByAddress = new Map<string, Set<string>>();
  for (const row of layout.accountRoleMatrix) {
    for (const address of row.addressRecurrence) {
      const roles = sourceFamilyRolesByAddress.get(address.address) ?? new Set<string>();
      if (row.sourceFamilyRole) roles.add(`${row.observedVariant}: ${row.sourceFamilyRole}`);
      sourceFamilyRolesByAddress.set(address.address, roles);
    }
  }
  const sharedWritableAnswers = plan.identity.accounts.map((address) => {
    const roles = [...(sourceFamilyRolesByAddress.get(address) ?? new Set<string>())].sort();
    return {
      address,
      answer: `Declared writable in the candidate conflict graph. Observed positions align with ${roles.join("; ") || "no stable source-family role"}, but no verified deployed source maps that declaration to an exact state transition; actual mutation remains unknown.`,
    };
  });
  return {
    schemaVersion: "2.0",
    candidateId: plan.candidateId,
    generatedAt: plan.researchAt,
    decision,
    executiveFinding: "Official Velocity documentation authoritatively identifies the exact program ID, and observed discriminators/log names align with the official protocol-v2 source family. The deployed executable is unverified and unmapped, while a five-versus-six-account native-handler mismatch and comparison-log divergence prevent mutation-level or independence claims.",
    decisionBasis: [
      "Authoritative exact Velocity identity is established.",
      "All six exact account-set occurrences independently revalidate and partial overlaps are rejected.",
      "Two Anchor discriminators and their emitted names match official source-family instruction paths.",
      "The exact deployed binary has no verified build, release hash, or reproducible source mapping.",
      "Observed native discriminator-2 behavior contradicts the pinned source-family handler's minimum account cardinality.",
      "Therefore exact deployed branches, shared-account mutations, and semantic independence remain incomplete.",
    ],
    exactIdentity: {
      accounts: [...plan.identity.accounts],
      recurrenceBlockCount: 6,
      allReferencesRevalidated: true,
      partialMatchesRejected: true,
    },
    representative: {
      slot: representative.slot,
      componentId: representative.componentId,
      transactionCount: representative.transactions.length,
      distinctPayerCount: representative.distinctPayers.length,
      conflictEdgeCount: representative.conflictEdges.length,
      conflictAtomCount: representative.conflictAtoms.length,
      waveLowerBound: representative.waveLowerBound,
      waveUpperBound: representative.waveUpperBound,
      knownComputeUnits: representative.knownComputeUnits,
      knownComputeCoverage: representative.knownComputeCoverage,
    },
    recurrenceTimeline: occurrences.map((occurrence) => ({
      slot: occurrence.slot,
      componentId: occurrence.componentId,
      transactionIndexes: [...occurrence.transactionIndexes],
      signatures: [...occurrence.transactionSignatures],
      status: `${occurrence.statusCounts.success} success / ${occurrence.statusCounts.failed} failed / ${occurrence.statusCounts.unknown} unknown`,
      payers: occurrence.distinctPayers.length,
      edges: occurrence.conflictEdges.length,
      atoms: occurrence.conflictAtoms.length,
      waveBounds: `${occurrence.waveLowerBound}-${occurrence.waveUpperBound}`,
      knownComputeUnits: occurrence.knownComputeUnits,
      knownComputeCoverage: occurrence.knownComputeCoverage,
      deviations: [...occurrence.deviationsFromRepresentative],
    })),
    velocityIdentity: {
      authoritative: true,
      programId: plan.velocityProgramId,
      organization: "velocity-exchange",
      evidence: [
        "Pinned official Velocity docs commit bd4846ff6039747ea254c0f339ce7a2b6b022ae9 names the exact ID on devnet and mainnet.",
        "The official organization owns the protocol-v2 repository and publishes @velocity-exchange/sdk.",
      ],
    },
    sourceCorrespondence: {
      state: "source-family-only",
      programDataAddress: plan.programDataAddress,
      currentLastDeploySlot: snapshots.deployedProgram.lastDeploySlot,
      currentExecutableSha256: snapshots.deployedProgram.executableBytesSha256,
      reasons: [...sources.correspondenceReasons],
    },
    instructionPathFinding: {
      anchorLoggedVariants: ["PostPythLazerOracleUpdate", "UpdatePerpBidAskTwap"],
      nativeObservedVariant: "0xffffffff native prefix, discriminator 2, 84 bytes, five accounts",
      exactDeployedBranchEstablished: false,
      reasons: [
        "Anchor discriminator hashes daedaaf5278fa621 and f717ff41d45addc2 match the two emitted names and official source-family entrypoints.",
        "The native prefix is structurally identified, but its successful five-account layout contradicts the pinned six-account-minimum handler.",
        "Observed logs alone cannot prove the exact deployed source branch or fields mutated.",
      ],
    },
    mutationTrace: {
      exactDeployedMutationEstablished: false,
      sourceFamilyOnlyFindings: [
        "The pinned Pyth Lazer handler validates an Instructions sysvar/preceding signature instruction, parses feeds, verifies oracle PDA seeds, skips older timestamps, and otherwise writes price, posted_slot, publish_time, exponent, and conf.",
        "The pinned UpdatePerpBidAskTwap handler validates state/market/oracle/keeper prerequisites, updates AMM/mark TWAP fields on a mutable PerpMarket, and enters a funding-update path.",
        "The pinned native discriminator-2 handler initializes or reallocates two OraclePriceCache PDAs and overwrites cache metadata/entries, but its account contract does not match the observed successful instruction.",
        "These are source-family traces only; none answers deployed mutation truth for the sampled transactions.",
      ],
      sharedWritableAnswers,
    },
    semanticIndependence: {
      outcome: "cannot-be-established",
      scope: "The six occurrence components and their update-specific identities only.",
      reasons: [
        "Exact deployed branch/mutation correspondence is missing.",
        "The three logged paths share declared writable oracle/market accounts and a signer, while the native path intersects update-specific writable accounts.",
        "Source-family handlers contain validation, timestamp, oracle, market, funding, and optional-maker dependencies whose deployed equivalence is unresolved.",
        "No valid-prestate application transition can be proven disjoint or commuting from declared locks and source-family similarity alone.",
      ],
      nonClaims: [
        "No claim about current Solana concurrency or validator scheduling.",
        "No throughput estimate or recovery claim.",
        "No runtime redesign or semantic counterfactual.",
      ],
    },
    evidencePaths: {
      sourceabilityIndex: "../sourceability/sourceability-index.json",
      sourceManifest: "source-manifest.json",
      accountSnapshots: "account-snapshots.json",
      instructionLayout: "instruction-layout.json",
      signerMessageSummary: "signer-message-summary.json",
      occurrenceEvidence: "candidate-evidence.ndjson",
    },
    actionabilityGate: {
      passed: false,
      semanticDecoderAllowed: false,
      semanticCounterfactualAllowed: false,
      redesignConclusionAllowed: false,
      reason: "Authoritative identity is insufficient: deployed-version correspondence, the exact native branch, shared-account state transitions, and semantic independence are not established.",
    },
    limitations: [
      "Current snapshots are not historical state snapshots.",
      "Declared writable flags prove lock contention, not actual mutation.",
      "Official source-family similarity is not a verified deployment mapping.",
      "Inherited Drift names and semantics are never substituted for Velocity deployed truth.",
      "Related or partially overlapping components are not merged into the six exact occurrences.",
      "Estimated wave bounds describe declared contention and potential parallelism, not a validator's exact private schedule.",
    ],
    compactness: {
      completeBlockAnalysesEmbedded: false,
      occurrenceEvidenceExternalizedToNdjson: true,
    },
  };
}

function assertExpectedTotals(plan: VelocityResearchPlan, occurrences: VelocityOccurrence[]): void {
  const expected = plan.expectedStructuralCounts;
  const totals = {
    blocks: occurrences.length,
    transactions: occurrences.reduce((sum, occurrence) => sum + occurrence.transactions.length, 0),
    edges: occurrences.reduce((sum, occurrence) => sum + occurrence.conflictEdges.length, 0),
    atoms: occurrences.reduce((sum, occurrence) => sum + occurrence.conflictAtoms.length, 0),
    compute: occurrences.reduce((sum, occurrence) => sum + occurrence.knownComputeUnits, 0),
  };
  if (totals.blocks !== expected.recurrenceBlockCount || totals.transactions !== expected.totalOccurrenceTransactions || totals.edges !== expected.totalOccurrenceEdges || totals.atoms !== expected.totalOccurrenceAtoms || totals.compute !== expected.totalKnownComputeUnits) {
    throw new Error(`Candidate #3 aggregate baseline changed: ${JSON.stringify(totals)}`);
  }
}

export async function loadSourceabilityPlan(path: string): Promise<SourceabilityPlan> {
  const plan = JSON.parse(await readFile(resolve(path), "utf8")) as SourceabilityPlan;
  if (plan.schemaVersion !== "2.0") throw new Error("Unsupported sourceability plan schema");
  return plan;
}

export async function loadVelocityResearchPlan(path: string): Promise<VelocityResearchPlan> {
  const plan = JSON.parse(await readFile(resolve(path), "utf8")) as VelocityResearchPlan;
  if (plan.schemaVersion !== "2.0" || plan.identity.kind !== "exact-account-set") throw new Error("Unsupported Velocity research plan schema");
  if (anchorInstructionDiscriminator("post_pyth_lazer_oracle_update") !== POST_PYTH_DISCRIMINATOR) throw new Error("PostPyth discriminator constant is invalid");
  if (anchorInstructionDiscriminator("update_perp_bid_ask_twap") !== UPDATE_TWAP_DISCRIMINATOR) throw new Error("UpdatePerpBidAskTwap discriminator constant is invalid");
  return plan;
}

export async function runMilestone20(
  sourceabilityPlan: SourceabilityPlan,
  plan: VelocityResearchPlan,
  options: RunMilestone20Options,
): Promise<Milestone20Result> {
  const bootstrapHashes = options.bootstrapHashes ?? false;
  await acquireSources(plan, options);
  await acquireSnapshots(plan, options);
  const [sourceability, occurrenceResult, sourceResult, snapshotResult] = await Promise.all([
    buildSourceabilityArtifacts(sourceabilityPlan),
    revalidateVelocityOccurrences(plan, bootstrapHashes),
    buildSourceManifest(plan, bootstrapHashes),
    buildAccountSnapshotArtifact(plan, bootstrapHashes),
  ]);
  const otherInputPaths = plan.inputEvidence
    .filter((entry) => entry.kind !== "block-cache" && entry.kind !== "source-cache" && entry.kind !== "account-snapshot-cache")
    .map((entry) => entry.path);
  const otherHashes = await Promise.all(otherInputPaths.map((path) => validateInputHash(plan, path, bootstrapHashes)));
  assertExpectedTotals(plan, occurrenceResult.occurrences);
  const signerSummary = buildVelocitySignerSummary(occurrenceResult.occurrences);
  const instructionLayout = buildVelocityInstructionLayout(occurrenceResult.occurrences, snapshotResult.artifact);
  const dossier = buildVelocityDossier(plan, occurrenceResult.occurrences, sourceResult.artifact, snapshotResult.artifact, instructionLayout);
  const observedInputHashes = [...otherHashes, ...occurrenceResult.hashes, ...sourceResult.hashes, snapshotResult.hash]
    .sort((left, right) => left.path.localeCompare(right.path));

  await Promise.all([
    mkdir(resolve(sourceabilityPlan.outputDirectory), { recursive: true }),
    mkdir(resolve(plan.outputDirectory), { recursive: true }),
    mkdir(dirname(resolve(plan.documentationPath)), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(resolve(sourceabilityPlan.outputDirectory, "sourceability-index.json"), json(sourceability.index)),
    writeFile(resolve(sourceabilityPlan.outputDirectory, "program-family-map.json"), json(sourceability.familyMap)),
    writeFile(resolve(sourceabilityPlan.outputDirectory, "sourceability-report.html"), milestone20SourceabilityHtml(sourceability.index, sourceability.familyMap)),
    writeFile(resolve(plan.outputDirectory, "candidate-dossier.json"), json(dossier)),
    writeFile(resolve(plan.outputDirectory, "candidate-dossier.html"), milestone20CandidateHtml(dossier, instructionLayout, signerSummary, sourceResult.artifact, snapshotResult.artifact)),
    writeFile(resolve(plan.outputDirectory, "candidate-evidence.ndjson"), occurrenceResult.occurrences.map((occurrence) => JSON.stringify(occurrence)).join("\n") + "\n"),
    writeFile(resolve(plan.outputDirectory, "source-manifest.json"), json(sourceResult.artifact)),
    writeFile(resolve(plan.outputDirectory, "account-snapshots.json"), json(snapshotResult.artifact)),
    writeFile(resolve(plan.outputDirectory, "instruction-layout.json"), json(instructionLayout)),
    writeFile(resolve(plan.outputDirectory, "signer-message-summary.json"), json(signerSummary)),
    writeFile(resolve(plan.documentationPath), milestone20CandidateMarkdown(dossier, instructionLayout, signerSummary, sourceResult.artifact, snapshotResult.artifact)),
  ]);
  return {
    sourceabilityIndex: sourceability.index,
    programFamilyMap: sourceability.familyMap,
    occurrences: occurrenceResult.occurrences,
    sourceManifest: sourceResult.artifact,
    accountSnapshots: snapshotResult.artifact,
    instructionLayout,
    signerSummary,
    dossier,
    observedInputHashes,
    terminalSummary: `Milestone 2.0: 19 candidates / 6 families triaged; 6 exact Candidate #3 occurrences revalidated; decision ${dossier.decision}; deployed source correspondence ${sourceResult.artifact.deployedSourceCorrespondence}.`,
  };
}
