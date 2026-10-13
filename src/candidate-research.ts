import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getAddressDecoder } from "@solana/kit";
import { analyzeBlock } from "./analyze.js";
import { decodeBase58Bytes, ED25519_PROGRAM_ID, parseEd25519Instruction } from "./ed25519.js";
import { candidateDossierHtml, candidateDossierMarkdown, serializeCandidateDossier, serializeCandidateEvidence } from "./research-report.js";
import type {
  AccountSnapshotArtifact,
  AccountSnapshotSummary,
  CandidateDossier,
  CandidateOccurrence,
  CandidateResearchPlan,
  CandidateTransactionEvidence,
  DossierDecision,
  LogPayloadRecord,
  PayloadLayoutArtifact,
  PayloadRecord,
  ResearchAccountPosition,
  ResearchEvidenceInput,
  SignerMessageSummaryArtifact,
  SourceManifestArtifact,
} from "./research-types.js";
import type { Analysis, ComponentMeaning, NormalizedInstruction, NormalizedTransaction } from "./types.js";

const INSTRUCTIONS_SYSVAR = "Sysvar1nstructions1111111111111111111111111";
const UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const slash = (value: string): string => value.replaceAll("\\", "/");
const unique = <T>(values: T[]): T[] => [...new Set(values)];
const sorted = (values: string[]): string[] => unique(values).sort();
const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

interface SourceCacheRecord {
  schemaVersion: "1.9-source-cache";
  retrievedAt: string;
  url: string;
  httpStatus: number;
  contentType: string | null;
  body: string;
}

interface SnapshotCacheRecord {
  schemaVersion: "1.9-account-snapshot-cache";
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

export interface RunCandidateResearchOptions {
  offline: boolean;
  bootstrapHashes?: boolean;
  fetchText?: (url: string) => Promise<{ status: number; contentType: string | null; body: string }>;
  fetchRpc?: (endpoint: string, body: string) => Promise<{ status: number; body: string }>;
}

export interface CandidateResearchResult {
  dossier: CandidateDossier;
  occurrences: CandidateOccurrence[];
  payloadLayout: PayloadLayoutArtifact;
  signerSummary: SignerMessageSummaryArtifact;
  sourceManifest: SourceManifestArtifact;
  accountSnapshots: AccountSnapshotArtifact;
  observedInputHashes: ResearchEvidenceInput[];
  terminalSummary: string;
}

async function fileSha256(path: string): Promise<string> { return sha256(await readFile(resolve(path))); }

function expectedHashFor(plan: CandidateResearchPlan, path: string): ResearchEvidenceInput | undefined {
  const normalized = slash(path);
  return plan.inputEvidence.find((entry) => slash(entry.path) === normalized);
}

async function validateInputHash(plan: CandidateResearchPlan, path: string, bootstrapHashes: boolean): Promise<ResearchEvidenceInput> {
  const expected = expectedHashFor(plan, path);
  if (!expected) throw new Error(`Research manifest does not hash required input evidence: ${path}`);
  const observed = await fileSha256(path);
  if (expected.sha256 !== "pending" && expected.sha256.toLowerCase() !== observed) {
    throw new Error(`Input evidence hash mismatch for ${path}: expected ${expected.sha256}, observed ${observed}`);
  }
  if (expected.sha256 === "pending" && !bootstrapHashes) throw new Error(`Research manifest retains an unresolved hash for ${path}`);
  return { ...expected, sha256: observed };
}

function exactAccounts(left: string[], right: string[]): boolean {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

export function isExactCandidateIdentity(observedAccounts: string[], identityAccounts: string[]): boolean {
  return exactAccounts(observedAccounts, identityAccounts);
}

export function classifyCandidateAccountRelation(observedAccounts: string[], identityAccounts: string[]): "exact" | "related-one-account" | "separate" {
  if (isExactCandidateIdentity(observedAccounts, identityAccounts)) return "exact";
  return unique(observedAccounts.filter((account) => identityAccounts.includes(account))).length === 1 ? "related-one-account" : "separate";
}

function nonFeePayerSharedAccounts(analysis: Analysis, meaning: ComponentMeaning): string[] {
  const transactions = meaning.transactionIndexes.map((index) => analysis.transactions[index]!).filter(Boolean);
  const payers = new Set(transactions.map((transaction) => transaction.feePayer));
  return meaning.sharedConflictAccounts.filter((account) => !payers.has(account)).sort();
}

function instructionBytes(instruction: NormalizedInstruction): Uint8Array | null {
  if (instruction.data === null) return null;
  try { return decodeBase58Bytes(instruction.data); } catch { return null; }
}

function outerInstructions(transaction: NormalizedTransaction): NormalizedInstruction[] {
  return transaction.instructions.filter((instruction) => instruction.location === "outer").sort((left, right) => left.instructionIndex - right.instructionIndex);
}

function parseCandidatePayload(slot: number, blockTime: number | null, transaction: NormalizedTransaction, instruction: NormalizedInstruction): PayloadRecord | null {
  const bytes = instructionBytes(instruction);
  if (!bytes) return null;
  const buffer = Buffer.from(bytes), hasNeutralLayout = buffer.length === 35;
  const markerA = hasNeutralLayout ? buffer[9]! : null, markerB = hasNeutralLayout ? buffer[18]! : null;
  const timestamp = hasNeutralLayout ? buffer.readBigUInt64LE(27).toString() : null;
  return {
    slot,
    transactionIndex: transaction.index,
    signature: transaction.signature,
    instructionIndex: instruction.instructionIndex,
    byteLength: buffer.length,
    discriminatorHex: buffer.subarray(0, Math.min(8, buffer.length)).toString("hex"),
    rawHex: buffer.toString("hex"),
    rawSha256: sha256(buffer),
    fields: {
      field_0: hasNeutralLayout ? buffer[8]! : null,
      optional_value_a_marker: markerA,
      value_a: hasNeutralLayout && markerA === 1 ? buffer.readBigInt64LE(10).toString() : null,
      optional_value_b_marker: markerB,
      value_b: hasNeutralLayout && markerB === 1 ? buffer.readBigInt64LE(19).toString() : null,
      candidate_timestamp: timestamp,
      candidate_timestamp_matches_block_time: timestamp !== null && blockTime !== null && timestamp === String(blockTime),
    },
  };
}

function findBytes(haystack: Buffer, needle: Buffer): number[] {
  const offsets: number[] = [];
  if (needle.length === 0) return offsets;
  for (let offset = haystack.indexOf(needle); offset >= 0; offset = haystack.indexOf(needle, offset + 1)) offsets.push(offset);
  return offsets;
}

function parseLogPayloads(slot: number, blockTime: number | null, transaction: NormalizedTransaction): LogPayloadRecord[] {
  const records: LogPayloadRecord[] = [];
  for (const message of transaction.logMessages) {
    if (!message.startsWith("Program data: ")) continue;
    const encoded = message.slice("Program data: ".length).trim();
    try {
      const buffer = Buffer.from(encoded, "base64");
      const time = blockTime === null ? null : (() => { const value = Buffer.alloc(8); value.writeBigUInt64LE(BigInt(blockTime)); return value; })();
      records.push({
        slot,
        transactionIndex: transaction.index,
        signature: transaction.signature,
        byteLength: buffer.length,
        prefixHex: buffer.subarray(0, Math.min(8, buffer.length)).toString("hex"),
        rawHex: buffer.toString("hex"),
        rawSha256: sha256(buffer),
        blockTimeLittleEndianOffsets: time ? findBytes(buffer, time) : [],
      });
    } catch { /* malformed base64 remains represented by the transaction log shape */ }
  }
  return records;
}

function logShape(transaction: NormalizedTransaction): string[] {
  return transaction.logMessages.map((message) => {
    if (message.startsWith("Program data: ")) {
      try { return `program-data:${Buffer.from(message.slice("Program data: ".length).trim(), "base64").length}-bytes`; }
      catch { return "program-data:malformed"; }
    }
    if (/^Program \S+ invoke \[\d+\]$/.test(message)) return "program-invoke";
    if (/^Program \S+ consumed \d+ of \d+ compute units$/.test(message)) return "program-consumed";
    if (/^Program \S+ success$/.test(message)) return "program-success";
    if (/^Program \S+ failed/.test(message)) return "program-failed";
    return "other-log";
  });
}

function candidateAccountPositions(transaction: NormalizedTransaction, instruction: NormalizedInstruction): CandidateTransactionEvidence["accountPositions"] {
  return instruction.accountAddresses.map((address, position) => {
    const account = transaction.accounts.find((item) => item.pubkey === address);
    return { position, address, signer: account?.signer ?? false, writable: account?.writable ?? false };
  });
}

function transactionEvidence(
  plan: CandidateResearchPlan,
  slot: number,
  blockTime: number | null,
  transaction: NormalizedTransaction,
): CandidateTransactionEvidence {
  const instructions = outerInstructions(transaction);
  const maxIndex = Math.max(-1, ...instructions.map((instruction) => instruction.instructionIndex));
  const instructionDatas = Array.from({ length: maxIndex + 1 }, () => null as Uint8Array | null);
  for (const instruction of instructions) instructionDatas[instruction.instructionIndex] = instructionBytes(instruction);
  const ed25519 = instructions.filter((instruction) => instruction.programId === ED25519_PROGRAM_ID)
    .map((instruction) => parseEd25519Instruction(instructionDatas, instruction.instructionIndex));
  const candidateInstructions = instructions.filter((instruction) => instruction.programId === plan.snapshotRequest.programId);
  return {
    index: transaction.index,
    signature: transaction.signature,
    status: transaction.status,
    feePayer: transaction.feePayer,
    computeUnitsConsumed: transaction.computeUnitsConsumed,
    instructionProgramOrder: instructions.map((instruction) => instruction.programId),
    instructionCount: instructions.length,
    accountPositions: candidateInstructions.flatMap((instruction) => candidateAccountPositions(transaction, instruction)),
    ed25519,
    candidatePayloads: candidateInstructions.flatMap((instruction) => {
      const payload = parseCandidatePayload(slot, blockTime, transaction, instruction);
      return payload ? [payload] : [];
    }),
    logPayloads: parseLogPayloads(slot, blockTime, transaction),
    logShape: logShape(transaction),
  };
}

function statusCounts(transactions: NormalizedTransaction[]): CandidateOccurrence["statusCounts"] {
  return {
    success: transactions.filter((transaction) => transaction.status === "success").length,
    failed: transactions.filter((transaction) => transaction.status === "failed").length,
    unknown: transactions.filter((transaction) => transaction.status === "unknown").length,
  };
}

function structuralShape(occurrence: CandidateOccurrence): string {
  const shape = {
    transactionCount: occurrence.transactionIndexes.length,
    edgeCount: occurrence.conflictEdges.length,
    atomCount: occurrence.conflictAtoms.length,
    bounds: [occurrence.waveLowerBound, occurrence.waveUpperBound],
    transactions: occurrence.transactions.map((transaction) => ({
      programs: transaction.instructionProgramOrder,
      instructionCount: transaction.instructionCount,
      accountFlags: transaction.accountPositions.map((account) => [account.position, account.signer, account.writable]),
      payloadLengths: transaction.candidatePayloads.map((payload) => payload.byteLength),
      signatureCounts: transaction.ed25519.map((item) => item.signatureCount),
      logShape: transaction.logShape,
    })),
  };
  return JSON.stringify(shape);
}

function addDeviations(occurrences: CandidateOccurrence[], representativeSlot: number): void {
  const representative = occurrences.find((occurrence) => occurrence.slot === representativeSlot);
  if (!representative) throw new Error(`Representative slot ${representativeSlot} was not revalidated`);
  const expectedShape = structuralShape(representative);
  for (const occurrence of occurrences) {
    const deviations: string[] = [];
    if (occurrence.transactionIndexes.length !== representative.transactionIndexes.length) deviations.push("transaction count differs");
    if (occurrence.conflictEdges.length !== representative.conflictEdges.length) deviations.push("conflict-edge count differs");
    if (occurrence.conflictAtoms.length !== representative.conflictAtoms.length) deviations.push("conflict-atom count differs");
    if (occurrence.waveLowerBound !== representative.waveLowerBound || occurrence.waveUpperBound !== representative.waveUpperBound) deviations.push("wave bounds differ");
    if (structuralShape(occurrence) !== expectedShape && deviations.length === 0) deviations.push("instruction, account-flag, payload, signature, or log shape differs");
    occurrence.deviationsFromRepresentative = deviations;
  }
}

async function revalidateOccurrences(plan: CandidateResearchPlan, bootstrapHashes: boolean): Promise<{ occurrences: CandidateOccurrence[]; related: CandidateDossier["relatedFamilyEvidence"]; hashes: ResearchEvidenceInput[] }> {
  const occurrences: CandidateOccurrence[] = [], related: CandidateDossier["relatedFamilyEvidence"] = [], hashes: ResearchEvidenceInput[] = [];
  if (plan.sourceCachePaths.length !== plan.observedRecurrenceSlots.length) throw new Error("Research manifest slot/cache cardinality mismatch");
  for (let offset = 0; offset < plan.observedRecurrenceSlots.length; offset++) {
    const expectedSlot = plan.observedRecurrenceSlots[offset]!, cachePath = plan.sourceCachePaths[offset]!;
    hashes.push(await validateInputHash(plan, cachePath, bootstrapHashes));
    const cached = JSON.parse(await readFile(resolve(cachePath), "utf8")) as { slot?: unknown; block?: unknown; provenance?: unknown };
    if (Number(cached.slot) !== expectedSlot || cached.block === undefined) throw new Error(`Cached block ${cachePath} does not contain expected slot ${expectedSlot}`);
    const analysis = analyzeBlock(cached.block, expectedSlot, "fixture", {
      cluster: plan.cluster,
      endpoint: null,
      retrievedAt: null,
      sourceMode: "scanner-cache",
      dataKind: "real-network",
    });
    const exact = analysis.componentMeanings.filter((meaning) => meaning.isContentionFinding && isExactCandidateIdentity(nonFeePayerSharedAccounts(analysis, meaning), plan.identity.accounts));
    if (exact.length !== 1) throw new Error(`Slot ${expectedSlot} has ${exact.length} exact candidate components; expected one`);
    const meaning = exact[0]!, indexes = new Set(meaning.transactionIndexes);
    for (const other of analysis.componentMeanings) {
      if (other.componentId === meaning.componentId) continue;
      const otherIdentity = nonFeePayerSharedAccounts(analysis, other);
      const intersection = otherIdentity.filter((account) => plan.identity.accounts.includes(account));
      const programs = unique(other.transactionIndexes.flatMap((index) => analysis.transactions[index]?.invokedProgramIds ?? []));
      if (classifyCandidateAccountRelation(otherIdentity, plan.identity.accounts) === "related-one-account" && programs.includes(plan.snapshotRequest.programId)) {
        related.push({ slot: expectedSlot, componentId: other.componentId, sharedCandidateAccount: intersection[0]!, reason: "Same program and one candidate account, but not the exact two-account identity." });
      }
    }
    const transactions = meaning.transactionIndexes.map((index) => analysis.transactions[index]!).filter(Boolean);
    const edges = analysis.conflictEdges.filter((edge) => indexes.has(edge.source) && indexes.has(edge.target));
    const atoms = edges.flatMap((edge) => edge.accounts.map((account) => ({ source: edge.source, target: edge.target, account })));
    const known = transactions.filter((transaction) => transaction.computeUnitsConsumed !== null);
    occurrences.push({
      evidenceId: `slot-${expectedSlot}#component-${meaning.componentId}`,
      slot: expectedSlot,
      blockTime: analysis.context.blockTime,
      componentId: meaning.componentId,
      transactionIndexes: [...meaning.transactionIndexes],
      transactionSignatures: transactions.map((transaction) => transaction.signature),
      statusCounts: statusCounts(transactions),
      distinctFeePayers: sorted(transactions.map((transaction) => transaction.feePayer)),
      conflictEdges: edges.map((edge) => ({ ...edge, accounts: [...edge.accounts] })),
      conflictAtoms: atoms,
      waveLowerBound: meaning.waveBounds.cliqueLowerBound,
      waveUpperBound: meaning.waveBounds.generatedWaveUpperBound,
      provenMinimumWaveCount: meaning.waveBounds.provenMinimumWaveCount,
      knownComputeUnits: transactions.reduce((sum, transaction) => sum + (transaction.computeUnitsConsumed ?? 0), 0),
      knownComputeCoverage: transactions.length === 0 ? 0 : known.length / transactions.length,
      invokedPrograms: sorted(transactions.flatMap((transaction) => transaction.invokedProgramIds)),
      transactions: transactions.map((transaction) => transactionEvidence(plan, expectedSlot, analysis.context.blockTime, transaction)),
      deviationsFromRepresentative: [],
      sourceCachePath: cachePath,
      sourceCacheSha256: hashes.at(-1)!.sha256,
    });
  }
  addDeviations(occurrences, plan.representative.slot);
  return { occurrences, related, hashes };
}

async function defaultFetchText(url: string): Promise<{ status: number; contentType: string | null; body: string }> {
  const response = await fetch(url, { headers: { "user-agent": "Solana-Conflict-Microscope/0.1 read-only research" }, signal: AbortSignal.timeout(30_000) });
  return { status: response.status, contentType: response.headers.get("content-type"), body: await response.text() };
}

async function acquireSources(plan: CandidateResearchPlan, options: RunCandidateResearchOptions): Promise<void> {
  const fetchText = options.fetchText ?? defaultFetchText;
  for (const source of plan.sources) {
    try { await readFile(resolve(source.cachePath), "utf8"); continue; }
    catch { if (options.offline) throw new Error(`Offline research cache is missing source input ${source.cachePath}`); }
    const fetched = await fetchText(source.url);
    const record: SourceCacheRecord = { schemaVersion: "1.9-source-cache", retrievedAt: source.accessedAt, url: source.url, httpStatus: fetched.status, contentType: fetched.contentType, body: fetched.body };
    await mkdir(dirname(resolve(source.cachePath)), { recursive: true });
    await writeFile(resolve(source.cachePath), json(record));
  }
}

function safeRpcParse(text: string): SnapshotCacheRecord["response"] {
  return JSON.parse(text.replace(/("rentEpoch"\s*:\s*)(\d+)/g, '$1"$2"')) as SnapshotCacheRecord["response"];
}

async function defaultFetchRpc(endpoint: string, body: string): Promise<{ status: number; body: string }> {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(60_000) });
  return { status: response.status, body: await response.text() };
}

function requestedSnapshotAddresses(plan: CandidateResearchPlan): string[] {
  return unique([plan.snapshotRequest.programId, plan.snapshotRequest.programDataAddress, ...plan.snapshotRequest.fixedAddresses, ...plan.snapshotRequest.representativeUpdateSpecificAddresses]);
}

async function acquireSnapshots(plan: CandidateResearchPlan, options: RunCandidateResearchOptions): Promise<void> {
  try { await readFile(resolve(plan.snapshotRequest.cachePath), "utf8"); return; }
  catch { if (options.offline) throw new Error(`Offline research cache is missing account snapshots ${plan.snapshotRequest.cachePath}`); }
  const addresses = requestedSnapshotAddresses(plan);
  const requestBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [addresses, { encoding: "base64", commitment: plan.snapshotRequest.commitment }] });
  const fetched = await (options.fetchRpc ?? defaultFetchRpc)(plan.snapshotRequest.endpoint, requestBody);
  if (fetched.status !== 200) throw new Error(`Account snapshot RPC returned HTTP ${fetched.status}`);
  const response = safeRpcParse(fetched.body);
  if (response.error || !response.result?.context || !Array.isArray(response.result.value)) throw new Error(`Account snapshot RPC returned an invalid result: ${JSON.stringify(response.error ?? null)}`);
  const record: SnapshotCacheRecord = { schemaVersion: "1.9-account-snapshot-cache", retrievedAt: plan.researchAt, endpoint: plan.snapshotRequest.endpoint, commitment: plan.snapshotRequest.commitment, addresses, response };
  await mkdir(dirname(resolve(plan.snapshotRequest.cachePath)), { recursive: true });
  await writeFile(resolve(plan.snapshotRequest.cachePath), json(record));
}

async function buildSourceManifest(plan: CandidateResearchPlan, bootstrapHashes: boolean): Promise<{ artifact: SourceManifestArtifact; hashes: ResearchEvidenceInput[] }> {
  const sources: SourceManifestArtifact["sources"] = [], hashes: ResearchEvidenceInput[] = [];
  for (const source of plan.sources) {
    hashes.push(await validateInputHash(plan, source.cachePath, bootstrapHashes));
    const record = JSON.parse(await readFile(resolve(source.cachePath), "utf8")) as SourceCacheRecord;
    if (record.schemaVersion !== "1.9-source-cache" || record.url !== source.url || record.httpStatus !== source.expectedHttpStatus) throw new Error(`Source cache provenance mismatch for ${source.id}`);
    sources.push({ ...source, cacheSha256: hashes.at(-1)!.sha256, contentSha256: sha256(record.body), httpStatus: record.httpStatus, contentBytes: Buffer.byteLength(record.body) });
  }
  const identity = plan.sourceSearches.some((search) => search.authoritativeMatch);
  return {
    artifact: {
      schemaVersion: "1.9",
      accessedAt: plan.researchAt,
      sources,
      searches: plan.sourceSearches,
      authoritativeProgramIdentityFound: identity,
      authoritativeMutationSemanticsFound: false,
      programIdentityFinding: identity ? "An authoritative exact-ID match was recorded." : "No primary source, maintained interface, verified-build record, or source-linked metadata establishes the exact program identity or its mutation semantics.",
    },
    hashes,
  };
}

function addressFromBytes(bytes: Buffer): string | null {
  try { return getAddressDecoder().decode(bytes); } catch { return null; }
}

function snapshotSummary(address: string, contextSlot: number, value: unknown, plan: CandidateResearchPlan): AccountSnapshotSummary {
  if (!value || typeof value !== "object") return { address, exists: false, contextSlot, owner: null, executable: null, lamports: null, dataLength: null, rentEpoch: null, rawDataSha256: null, loaderType: "missing", programDataAddress: null, lastDeployedSlot: null, upgradeAuthority: null, temporalScope: "current-snapshot-not-historical" };
  const item = value as { owner?: unknown; executable?: unknown; lamports?: unknown; rentEpoch?: unknown; data?: unknown };
  const encoded = Array.isArray(item.data) && typeof item.data[0] === "string" ? item.data[0] : "";
  const data = Buffer.from(encoded, "base64"), owner = typeof item.owner === "string" ? item.owner : null;
  let loaderType: AccountSnapshotSummary["loaderType"] = owner === UPGRADEABLE_LOADER ? "other" : owner === plan.snapshotRequest.programId ? "program-owned-data" : "other";
  let programDataAddress: string | null = null, lastDeployedSlot: string | null = null, upgradeAuthority: string | null = null;
  if (address === plan.snapshotRequest.programId && data.length >= 36 && data.readUInt32LE(0) === 2) {
    loaderType = "bpf-upgradeable-program"; programDataAddress = addressFromBytes(data.subarray(4, 36));
  } else if (address === plan.snapshotRequest.programDataAddress && data.length >= 13 && data.readUInt32LE(0) === 3) {
    loaderType = "bpf-upgradeable-programdata"; lastDeployedSlot = data.readBigUInt64LE(4).toString();
    upgradeAuthority = data[12] === 1 && data.length >= 45 ? addressFromBytes(data.subarray(13, 45)) : null;
  }
  return {
    address,
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
    lastDeployedSlot,
    upgradeAuthority,
    temporalScope: "current-snapshot-not-historical",
  };
}

async function buildAccountSnapshots(plan: CandidateResearchPlan, bootstrapHashes: boolean): Promise<{ artifact: AccountSnapshotArtifact; hash: ResearchEvidenceInput }> {
  const hash = await validateInputHash(plan, plan.snapshotRequest.cachePath, bootstrapHashes);
  const record = JSON.parse(await readFile(resolve(plan.snapshotRequest.cachePath), "utf8")) as SnapshotCacheRecord;
  if (record.schemaVersion !== "1.9-account-snapshot-cache" || record.endpoint !== plan.snapshotRequest.endpoint || record.commitment !== plan.snapshotRequest.commitment) throw new Error("Account snapshot cache provenance mismatch");
  const contextSlot = Number(record.response.result?.context?.slot), values = record.response.result?.value;
  if (!Number.isSafeInteger(contextSlot) || !Array.isArray(values) || values.length !== record.addresses.length) throw new Error("Account snapshot cache result is malformed");
  const snapshots = record.addresses.map((address, index) => snapshotSummary(address, contextSlot, values[index], plan));
  const programDataIndex = record.addresses.indexOf(plan.snapshotRequest.programDataAddress);
  const programDataValue = programDataIndex < 0 ? null : values[programDataIndex];
  const encoded = programDataValue && typeof programDataValue === "object" && Array.isArray((programDataValue as { data?: unknown }).data) ? (programDataValue as { data: unknown[] }).data[0] : null;
  const data = typeof encoded === "string" ? Buffer.from(encoded, "base64") : null;
  const executable = data && data.length >= 45 ? data.subarray(45) : null, text = executable?.toString("latin1") ?? "";
  const embeddedPathLeads = sorted([...text.matchAll(/(?:programs\/dex|crates\/pichor|src\/sysvars\/instructions)[A-Za-z0-9_./-]*\.rs/g)].map((match) => match[0]!)).slice(0, 50);
  return {
    artifact: {
      schemaVersion: "1.9",
      cluster: plan.cluster,
      endpoint: record.endpoint,
      commitment: record.commitment,
      retrievedAt: record.retrievedAt,
      contextSlot,
      cachePath: plan.snapshotRequest.cachePath,
      cacheSha256: hash.sha256,
      requestedAddresses: record.addresses,
      snapshots,
      programDataInspection: {
        accountAddress: plan.snapshotRequest.programDataAddress,
        executableBytesSha256: executable ? sha256(executable) : null,
        embeddedPathLeads,
        explicitProjectIdentifierFound: false,
        securityTxtFound: text.includes("=======BEGIN SECURITY.TXT"),
        interpretation: "Embedded build paths are deterministically decoded binary strings. They are a discovery lead, not authoritative protocol identity or mutation semantics.",
      },
      limitation: `These are current snapshots at RPC context slot ${contextSlot}; they are not historical account-state snapshots from slot ${plan.representative.slot}.`,
    },
    hash,
  };
}

function stableRanges(buffers: Buffer[]): Array<{ start: number; endExclusive: number; hex: string }> {
  if (buffers.length === 0) return [];
  const length = buffers[0]!.length;
  if (buffers.some((buffer) => buffer.length !== length)) return [];
  const stable = Array.from({ length }, (_, index) => buffers.every((buffer) => buffer[index] === buffers[0]![index]));
  const ranges: Array<{ start: number; endExclusive: number; hex: string }> = [];
  for (let start = 0; start < stable.length;) {
    if (!stable[start]) { start++; continue; }
    let endExclusive = start + 1;
    while (endExclusive < stable.length && stable[endExclusive]) endExclusive++;
    ranges.push({ start, endExclusive, hex: buffers[0]!.subarray(start, endExclusive).toString("hex") });
    start = endExclusive;
  }
  return ranges;
}

function distribution(values: Array<string | number | boolean | null>): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) { const key = value === null ? "null" : String(value); counts.set(key, (counts.get(key) ?? 0) + 1); }
  return [...counts].map(([value, count]) => ({ value, count })).sort((left, right) => left.value.localeCompare(right.value));
}

export function buildPayloadLayout(occurrences: CandidateOccurrence[]): PayloadLayoutArtifact {
  const records = occurrences.flatMap((occurrence) => occurrence.transactions.flatMap((transaction) => transaction.candidatePayloads));
  const logs = occurrences.flatMap((occurrence) => occurrence.transactions.flatMap((transaction) => transaction.logPayloads));
  const group = <T extends { byteLength: number; rawHex: string }>(items: T[], key: (item: T) => string, name: "discriminatorHex" | "prefixHex") => {
    const groups = new Map<string, T[]>();
    for (const item of items) { const id = `${item.byteLength}:${key(item)}`; groups.set(id, [...(groups.get(id) ?? []), item]); }
    return [...groups.values()].map((values) => ({ byteLength: values[0]!.byteLength, [name]: key(values[0]!), count: values.length, stableByteRanges: stableRanges(values.map((value) => Buffer.from(value.rawHex, "hex"))) }))
      .sort((left, right) => left.byteLength - right.byteLength || String(left[name]).localeCompare(String(right[name])));
  };
  return {
    schemaVersion: "1.9",
    instructionPayloads: {
      count: records.length,
      groups: group(records, (record) => record.discriminatorHex, "discriminatorHex") as PayloadLayoutArtifact["instructionPayloads"]["groups"],
      fieldDistributions: {
        field_0: distribution(records.map((record) => record.fields.field_0)),
        optional_value_a_marker: distribution(records.map((record) => record.fields.optional_value_a_marker)),
        value_a: distribution(records.map((record) => record.fields.value_a)),
        optional_value_b_marker: distribution(records.map((record) => record.fields.optional_value_b_marker)),
        value_b: distribution(records.map((record) => record.fields.value_b)),
        candidate_timestamp: distribution(records.map((record) => record.fields.candidate_timestamp)),
        candidate_timestamp_matches_block_time: distribution(records.map((record) => record.fields.candidate_timestamp_matches_block_time)),
      },
      records,
      neutralLayout: [
        { name: "instruction_discriminator", start: 0, endExclusive: 8, interpretation: "Stable eight-byte instruction discriminator; no public interface supplies an instruction name.", evidenceLevel: 2 },
        { name: "field_0", start: 8, endExclusive: 9, interpretation: "One-byte field with a bounded observed distribution; meaning unknown.", evidenceLevel: 2 },
        { name: "optional_value_a", start: 9, endExclusive: 18, interpretation: "Observed one-byte optional marker followed by an eight-byte little-endian signed value when marker is one; meaning unknown.", evidenceLevel: 2 },
        { name: "optional_value_b", start: 18, endExclusive: 27, interpretation: "Observed one-byte optional marker followed by an eight-byte little-endian signed value when marker is one; meaning unknown.", evidenceLevel: 2 },
        { name: "candidate_timestamp", start: 27, endExclusive: 35, interpretation: "Eight-byte little-endian value compared exactly with block time; field name remains neutral.", evidenceLevel: 2 },
      ],
    },
    programDataLogs: {
      count: logs.length,
      groups: group(logs, (record) => record.prefixHex, "prefixHex") as PayloadLayoutArtifact["programDataLogs"]["groups"],
      records: logs,
    },
    unsupportedMarketLabelsAbsent: true,
    limitations: [
      "Field boundaries are structural observations, not source-confirmed application semantics.",
      "Numerical plausibility is not evidence of denomination, asset, market, side, or confidence semantics.",
      "Program-data log fields remain unnamed except for exact byte matches and neutral candidate labels.",
    ],
  };
}

export function buildSignerMessageSummary(occurrences: CandidateOccurrence[]): SignerMessageSummaryArtifact {
  const instructions = occurrences.flatMap((occurrence) => occurrence.transactions.flatMap((transaction) => transaction.ed25519.map((item) => ({ occurrence, item }))));
  const signatures = instructions.flatMap(({ occurrence, item }) => item.signatures.map((signature) => ({ occurrence, signature })));
  const signerMap = new Map<string, { count: number; slots: Set<number> }>();
  const messageMap = new Map<string, { byteLength: number; count: number; signers: Set<string>; slots: Set<number> }>();
  for (const { occurrence, signature } of signatures) {
    const signer = signerMap.get(signature.publicKey) ?? { count: 0, slots: new Set<number>() }; signer.count++; signer.slots.add(occurrence.slot); signerMap.set(signature.publicKey, signer);
    const message = messageMap.get(signature.messageSha256) ?? { byteLength: signature.messageHex.length / 2, count: 0, signers: new Set<string>(), slots: new Set<number>() }; message.count++; message.signers.add(signature.publicKey); message.slots.add(occurrence.slot); messageMap.set(signature.messageSha256, message);
  }
  return {
    schemaVersion: "1.9",
    transactionCount: occurrences.reduce((sum, occurrence) => sum + occurrence.transactions.length, 0),
    ed25519InstructionCount: instructions.length,
    signatureCount: signatures.length,
    malformedInstructionCount: instructions.filter(({ item }) => item.status === "malformed").length,
    unsupportedReferenceCount: instructions.filter(({ item }) => item.status === "unsupported-reference").length,
    localVerificationPassCount: signatures.filter(({ signature }) => signature.locallyVerified).length,
    distinctSignerCount: signerMap.size,
    signers: [...signerMap].map(([publicKey, value]) => ({ publicKey, signatureCount: value.count, occurrenceCount: value.slots.size, repeated: value.count > 1 })).sort((left, right) => left.publicKey.localeCompare(right.publicKey)),
    distinctMessageCount: messageMap.size,
    messages: [...messageMap].map(([messageSha256, value]) => ({ messageSha256, byteLength: value.byteLength, signatureCount: value.count, signerPublicKeys: [...value.signers].sort(), occurrenceCount: value.slots.size })).sort((left, right) => left.messageSha256.localeCompare(right.messageSha256)),
    sameInstructionReferenceCount: signatures.filter(({ signature }) => signature.signatureReference.sameInstruction && signature.publicKeyReference.sameInstruction && signature.messageReference.sameInstruction).length,
    crossInstructionReferenceCount: signatures.filter(({ signature }) => !signature.signatureReference.sameInstruction || !signature.publicKeyReference.sameInstruction || !signature.messageReference.sameInstruction).length,
    signerIndependence: "not-inferred",
    realWorldIdentity: "not-inferred",
  };
}

export function buildAccountPositionMatrix(plan: CandidateResearchPlan, occurrences: CandidateOccurrence[], snapshots: AccountSnapshotArtifact): ResearchAccountPosition[] {
  const positions = new Map<number, CandidateTransactionEvidence["accountPositions"]>();
  for (const account of occurrences.flatMap((occurrence) => occurrence.transactions.flatMap((transaction) => transaction.accountPositions))) positions.set(account.position, [...(positions.get(account.position) ?? []), account]);
  const metadata = new Map(snapshots.snapshots.map((snapshot) => [snapshot.address, snapshot]));
  return [...positions].sort(([left], [right]) => left - right).map(([position, observations]) => {
    const addresses = sorted(observations.map((observation) => observation.address)), current = addresses.map((address) => metadata.get(address)).filter((value): value is AccountSnapshotSummary => Boolean(value?.exists));
    const relation = addresses.length === 1 && addresses[0] === plan.identity.accounts[0] ? "first-exact-identity-account" : addresses.length === 1 && addresses[0] === plan.identity.accounts[1] ? "second-exact-identity-account" : "none";
    const instructionSysvar = addresses.length === 1 && addresses[0] === INSTRUCTIONS_SYSVAR;
    const recurring = addresses.length === 1;
    const inferredRole = instructionSysvar ? "Instructions sysvar account; exact BQsAJ inspection behavior is not source-confirmed" : relation !== "none" ? "globally recurring shared writable account; actual state transition unknown" : recurring ? "fixed instruction account; function unknown" : "update-specific instruction account; function unknown";
    return {
      position,
      signer: observations[0]!.signer,
      writable: observations[0]!.writable,
      flagsStable: observations.every((observation) => observation.signer === observations[0]!.signer && observation.writable === observations[0]!.writable),
      constantAcrossOccurrences: recurring,
      distinctAddressCount: addresses.length,
      addresses,
      currentMetadataCoverage: addresses.length === 0 ? 0 : current.length / addresses.length,
      currentOwners: sorted(current.flatMap((snapshot) => snapshot.owner ? [snapshot.owner] : [])),
      currentDataLengths: unique(current.flatMap((snapshot) => snapshot.dataLength === null ? [] : [snapshot.dataLength])).sort((left, right) => left - right),
      candidateConflictRelation: relation,
      recurrenceClass: recurring ? "globally-recurring" : "update-specific",
      decodedRole: instructionSysvar ? "Instructions Sysvar" : null,
      sourceConfirmedRole: instructionSysvar ? "The maintained Solana interface identifies this address as the Instructions sysvar and exposes checked instruction-loading APIs." : null,
      inferredRole,
      confidence: instructionSysvar || relation !== "none" ? "high" : "low",
      evidence: [
        `Observed at BQsAJ account position ${position} in ${observations.length} candidate transaction(s).`,
        `${addresses.length} distinct address(es); signer/writable flags ${observations[0]!.signer}/${observations[0]!.writable}.`,
        "Writable is a declared access flag and does not by itself prove mutation.",
      ],
      declaredAccessOnly: true,
      actualMutation: "unknown",
    };
  });
}

export function chooseDossierDecision(authoritativeIdentityFound: boolean, mutationSemanticsFound: boolean): DossierDecision {
  if (authoritativeIdentityFound && mutationSemanticsFound) return "source-confirmed-semantics";
  if (authoritativeIdentityFound) return "identity-found-semantics-incomplete";
  return "black-box-structure-only";
}

function variantShapes(occurrences: CandidateOccurrence[]): CandidateDossier["variantShapes"] {
  const groups = new Map<string, CandidateOccurrence[]>();
  for (const occurrence of occurrences) { const shape = sha256(structuralShape(occurrence)).slice(0, 16); groups.set(shape, [...(groups.get(shape) ?? []), occurrence]); }
  return [...groups].map(([shape, values]) => ({ shape, occurrenceCount: values.length, slots: values.map((value) => value.slot) })).sort((left, right) => left.shape.localeCompare(right.shape));
}

function coreProgramPatternCount(occurrences: CandidateOccurrence[]): number {
  const shapes = occurrences.flatMap((occurrence) => occurrence.transactions.map((transaction) => JSON.stringify({
    programs: transaction.instructionProgramOrder,
    accountFlags: transaction.accountPositions.map((account) => [account.position, account.signer, account.writable]),
    payloads: transaction.candidatePayloads.map((payload) => [payload.byteLength, payload.discriminatorHex]),
    ed25519SignatureCounts: transaction.ed25519.map((item) => item.signatureCount),
    logShape: transaction.logShape,
  })));
  return new Set(shapes).size;
}

function buildDossier(plan: CandidateResearchPlan, occurrences: CandidateOccurrence[], related: CandidateDossier["relatedFamilyEvidence"], matrix: ResearchAccountPosition[], sources: SourceManifestArtifact, snapshots: AccountSnapshotArtifact): CandidateDossier {
  const representative = occurrences.find((occurrence) => occurrence.slot === plan.representative.slot)!;
  const decision = chooseDossierDecision(sources.authoritativeProgramIdentityFound, sources.authoritativeMutationSemanticsFound);
  const candidatePayloads = occurrences.flatMap((occurrence) => occurrence.transactions.flatMap((transaction) => transaction.candidatePayloads));
  const timestampMatchCount = candidatePayloads.filter((payload) => payload.fields.candidate_timestamp_matches_block_time).length;
  return {
    schemaVersion: "1.9",
    candidateId: plan.candidateId,
    generatedAt: plan.researchAt,
    executiveFinding: `All ${occurrences.length} cached references independently resolve to the same exact two-account recurring pattern. Each observed candidate transaction places native Ed25519 verification before one structurally consistent BQsAJ instruction. Current snapshots and embedded binary paths add context, but no authoritative public source identifies the program or proves which shared-account bytes are read or mutated.`,
    decision,
    decisionBasis: [
      `${occurrences.length}/${plan.expectedStructuralCounts.recurrenceBlockCount} exact recurrence references revalidated from cached blocks.`,
      "Native Ed25519 layouts, referenced bytes, signer keys, message hashes, and local signature checks were decoded deterministically.",
      sources.programIdentityFinding,
      "Without exact source-confirmed mutation semantics, no decoder, commutativity finding, redesign conclusion, or new counterfactual is justified.",
    ],
    evidenceLadder: [
      { level: 1, label: "observed on-chain declaration", application: "Exact account keys, flags, instruction order, logs, conflict edges, conflict atoms, and component bounds from cached blocks." },
      { level: 2, label: "deterministically decoded structure", application: "Ed25519 offsets and covered bytes, loader metadata, hashes, stable payload boundaries, current account metadata, and binary strings." },
      { level: 3, label: "source-confirmed semantics", application: "Generic Solana Ed25519, Instructions sysvar, and upgradeable-loader behavior only; no exact BQsAJ instruction or mutation semantics." },
      { level: 4, label: "supported inference", application: "The repeated pattern appears to carry a signed update into a DEX-like current binary, but exact purpose and mutations remain unconfirmed." },
      { level: 5, label: "unresolved hypothesis", application: "Protocol identity, field meanings, shared-account state transitions, signer organization, and logical independence remain unknown." },
    ],
    exactIdentity: { accounts: plan.identity.accounts, recurrenceBlockCount: occurrences.length, allReferencesRevalidated: occurrences.length === plan.expectedStructuralCounts.recurrenceBlockCount, oneRepeatedExactPattern: coreProgramPatternCount(occurrences) === 1 },
    representative: {
      slot: representative.slot,
      componentId: representative.componentId,
      transactionCount: representative.transactionIndexes.length,
      distinctFeePayerCount: representative.distinctFeePayers.length,
      conflictEdgeCount: representative.conflictEdges.length,
      conflictAtomCount: representative.conflictAtoms.length,
      waveLowerBound: representative.waveLowerBound,
      waveUpperBound: representative.waveUpperBound,
    },
    recurrenceTimeline: occurrences.map((occurrence) => ({ evidenceId: occurrence.evidenceId, slot: occurrence.slot, componentId: occurrence.componentId, transactionCount: occurrence.transactionIndexes.length, distinctFeePayerCount: occurrence.distinctFeePayers.length, conflictEdgeCount: occurrence.conflictEdges.length, conflictAtomCount: occurrence.conflictAtoms.length, waveBounds: `${occurrence.waveLowerBound}-${occurrence.waveUpperBound}`, deviations: occurrence.deviationsFromRepresentative })),
    variantShapes: variantShapes(occurrences),
    exactConflictEvidence: { totalOccurrenceEdges: occurrences.reduce((sum, occurrence) => sum + occurrence.conflictEdges.length, 0), totalOccurrenceAtoms: occurrences.reduce((sum, occurrence) => sum + occurrence.conflictAtoms.length, 0), identityAccounts: plan.identity.accounts, declarationOnly: true },
    accountPositionMatrix: matrix,
    signerMessageSummaryPath: "signer-message-summary.json",
    payloadLayoutPath: "payload-layout.json",
    accountSnapshotsPath: "account-snapshots.json",
    sourceManifestPath: "source-manifest.json",
    candidateEvidencePath: "candidate-evidence.ndjson",
    currentAccountMetadataFinding: snapshots.limitation,
    programIdentityEvidence: [
      `The current executable program is owned by ${UPGRADEABLE_LOADER} and points to ProgramData ${plan.snapshotRequest.programDataAddress}.`,
      `The current ProgramData contains ${snapshots.programDataInspection.embeddedPathLeads.length} bounded embedded Rust path lead(s), including DEX- and oracle-named paths; these do not name a public organization or prove historical code identity.`,
      sources.programIdentityFinding,
    ],
    sourceConfirmedSemantics: [
      "The pinned maintained Ed25519 interface defines a two-byte header, fourteen-byte offset records, 32-byte public keys, 64-byte signatures, and 0xffff same-instruction references.",
      "The pinned Agave processor resolves non-0xffff indexes against transaction instruction data and bounds-checks every referenced slice before verification.",
      "The pinned Instructions sysvar interface allows a program to load checked transaction instructions when supplied the correct sysvar account.",
      "No pinned source identifies the exact BQsAJ instruction, its validation branch, or any shared-account mutation.",
    ],
    supportedInferences: [
      "The Ed25519 instruction preceding BQsAJ and the declared Instructions sysvar position support a signed-update hypothesis, but do not prove how BQsAJ uses the verified bytes.",
      "Rotating writable addresses at two positions and two fixed shared writable addresses establish distinct structural roles, not actual mutation or logical independence.",
      "Current embedded build paths support a low-confidence DEX-like implementation inference; they do not establish a protocol name.",
    ],
    hypotheses: [
      { statement: "The repeated instruction may process signed update data.", confidence: "medium", supportingEvidence: ["Each candidate transaction places a successfully verified Ed25519 instruction before BQsAJ.", "The BQsAJ account list includes the Instructions sysvar.", `${timestampMatchCount}/${candidatePayloads.length} candidate payloads contain a neutral timestamp field exactly matching block time.`], contradictingOrMissingEvidence: ["No public interface or exact source shows BQsAJ loading or interpreting the preceding instruction.", "Signer organizations and message schema are unknown."] },
      { statement: "An oracle-related DEX path may be involved.", confidence: "low", supportingEvidence: ["The current executable contains embedded paths under programs/dex and a utils/oracle.rs path."], contradictingOrMissingEvidence: ["No authoritative source or project identifier matches the deployed program ID.", "Current binary strings do not prove the historical implementation at the observed slots or exact instruction path."] },
    ],
    unresolvedQuestions: [
      "Which organization or protocol controls this devnet deployment?",
      "What is the exact instruction variant represented by the stable discriminator?",
      "Which fields or byte regions, if any, change in the two shared writable accounts?",
      "Do rotating payload identifiers select logically separate state, and under what prerequisites?",
      "Are the two Ed25519 signers organizationally independent? No such identity is inferred here.",
      "Does current ProgramData match the code deployed at every 25 observed slot?",
    ],
    relatedFamilyEvidence: related,
    actionabilityGate: { passed: false, semanticDecoderAllowed: false, newCounterfactualAllowed: false, redesignConclusionAllowed: false, reason: "Exact shared-account mutation semantics and logical independence are not source-confirmed. Candidate #2 may be reviewed next; candidate #1 must remain structural only." },
    limitations: [
      "Declared writable access does not prove that an account was mutated.",
      "Current account snapshots are not historical state at the representative slot.",
      "A successful native signature check proves validity for referenced bytes, not signer identity, independence, or application meaning.",
      "Execution-wave bounds describe declared account contention and potential parallelism, not a validator's exact private schedule.",
      "No runtime, scheduling, throughput, trading, or state-transition actionability claim is made.",
    ],
    compactness: { completeBlockAnalysesEmbedded: false, occurrenceEvidenceExternalizedToNdjson: true },
  };
}

function assertExpectedBaseline(plan: CandidateResearchPlan, occurrences: CandidateOccurrence[], dossier: CandidateDossier): void {
  const expected = plan.expectedStructuralCounts, representative = dossier.representative;
  const checks: Array<[boolean, string]> = [
    [occurrences.length === expected.recurrenceBlockCount, `recurrence count ${occurrences.length}/${expected.recurrenceBlockCount}`],
    [representative.transactionCount === expected.representativeTransactionCount, `representative transaction count ${representative.transactionCount}/${expected.representativeTransactionCount}`],
    [representative.distinctFeePayerCount === expected.representativeDistinctFeePayerCount, `representative payer count ${representative.distinctFeePayerCount}/${expected.representativeDistinctFeePayerCount}`],
    [representative.conflictEdgeCount === expected.representativeConflictEdgeCount, `representative edge count ${representative.conflictEdgeCount}/${expected.representativeConflictEdgeCount}`],
    [representative.conflictAtomCount === expected.representativeConflictAtomCount, `representative atom count ${representative.conflictAtomCount}/${expected.representativeConflictAtomCount}`],
    [representative.waveLowerBound === expected.representativeWaveLowerBound, `representative lower bound ${representative.waveLowerBound}/${expected.representativeWaveLowerBound}`],
    [representative.waveUpperBound === expected.representativeWaveUpperBound, `representative upper bound ${representative.waveUpperBound}/${expected.representativeWaveUpperBound}`],
  ];
  const failures = checks.filter(([pass]) => !pass).map(([, message]) => message);
  if (failures.length) throw new Error(`Candidate baseline mismatch: ${failures.join("; ")}`);
}

export async function loadCandidateResearchPlan(path: string): Promise<CandidateResearchPlan> {
  const plan = JSON.parse(await readFile(resolve(path), "utf8")) as CandidateResearchPlan;
  if (plan.schemaVersion !== "1.9" || plan.candidateId.length === 0 || plan.identity.kind !== "exact-account-set") throw new Error("Candidate research manifest must use schema 1.9 and an exact account-set identity");
  if (plan.identity.accounts.length !== 2 || new Set(plan.observedRecurrenceSlots).size !== plan.observedRecurrenceSlots.length) throw new Error("Candidate research manifest identity or recurrence slots are invalid");
  return plan;
}

export async function runCandidateResearch(plan: CandidateResearchPlan, options: RunCandidateResearchOptions): Promise<CandidateResearchResult> {
  const bootstrapHashes = options.bootstrapHashes ?? false;
  await acquireSources(plan, options);
  await acquireSnapshots(plan, options);
  const baselinePaths = ["output/discovery-devnet/discovery-index.json", "output/discovery-devnet/discovery-plan.json", plan.materializedPaths.analysis, plan.materializedPaths.report];
  const observedInputHashes: ResearchEvidenceInput[] = [];
  for (const path of baselinePaths) observedInputHashes.push(await validateInputHash(plan, path, bootstrapHashes));
  const revalidated = await revalidateOccurrences(plan, bootstrapHashes); observedInputHashes.push(...revalidated.hashes);
  const sourceResult = await buildSourceManifest(plan, bootstrapHashes); observedInputHashes.push(...sourceResult.hashes);
  const snapshotResult = await buildAccountSnapshots(plan, bootstrapHashes); observedInputHashes.push(snapshotResult.hash);
  const payloadLayout = buildPayloadLayout(revalidated.occurrences), signerSummary = buildSignerMessageSummary(revalidated.occurrences);
  const matrix = buildAccountPositionMatrix(plan, revalidated.occurrences, snapshotResult.artifact);
  const dossier = buildDossier(plan, revalidated.occurrences, revalidated.related, matrix, sourceResult.artifact, snapshotResult.artifact);
  assertExpectedBaseline(plan, revalidated.occurrences, dossier);
  const output = resolve(plan.outputDirectory);
  await mkdir(output, { recursive: true });
  const ndjson = serializeCandidateEvidence(revalidated.occurrences);
  await Promise.all([
    writeFile(resolve(output, "candidate-dossier.json"), serializeCandidateDossier(dossier)),
    writeFile(resolve(output, "candidate-dossier.html"), candidateDossierHtml(dossier, payloadLayout, signerSummary, sourceResult.artifact, snapshotResult.artifact)),
    writeFile(resolve(output, "candidate-evidence.ndjson"), ndjson),
    writeFile(resolve(output, "source-manifest.json"), json(sourceResult.artifact)),
    writeFile(resolve(output, "account-snapshots.json"), json(snapshotResult.artifact)),
    writeFile(resolve(output, "payload-layout.json"), json(payloadLayout)),
    writeFile(resolve(output, "signer-message-summary.json"), json(signerSummary)),
    mkdir(dirname(resolve(plan.documentationPath)), { recursive: true }).then(async () => await writeFile(resolve(plan.documentationPath), candidateDossierMarkdown(dossier, payloadLayout, signerSummary, sourceResult.artifact, snapshotResult.artifact))),
  ]);
  return {
    dossier,
    occurrences: revalidated.occurrences,
    payloadLayout,
    signerSummary,
    sourceManifest: sourceResult.artifact,
    accountSnapshots: snapshotResult.artifact,
    observedInputHashes,
    terminalSummary: `Candidate research 1.9: ${revalidated.occurrences.length}/${plan.expectedStructuralCounts.recurrenceBlockCount} exact recurrence references revalidated; ${signerSummary.signatureCount} Ed25519 signatures decoded; decision ${dossier.decision}.`,
  };
}
