import type { Confidence } from "./types.js";
import type { Ed25519ParseResult } from "./ed25519.js";

export type EvidenceLevel = 1 | 2 | 3 | 4 | 5;
export type DossierDecision = "source-confirmed-semantics" | "identity-found-semantics-incomplete" | "black-box-structure-only";

export interface ResearchEvidenceInput {
  kind: "discovery-index" | "discovery-plan" | "block-cache" | "materialized-analysis" | "materialized-report" | "source-cache" | "account-snapshot-cache";
  path: string;
  sha256: string;
}

export interface ResearchSourcePlan {
  id: string;
  title: string;
  organization: string;
  repository: string | null;
  path: string | null;
  version: string;
  commit: string | null;
  url: string;
  cachePath: string;
  expectedHttpStatus: number;
  classification: "primary" | "maintained-interface" | "verified-build-record";
  supports: string[];
  doesNotSupport: string[];
  accessedAt: string;
}

export interface SourceSearchRecord {
  query: string;
  venue: string;
  url: string | null;
  accessedAt: string;
  result: string;
  classification: "primary-search" | "maintained-registry-search" | "third-party-lead";
  authoritativeMatch: boolean;
}

export interface CandidateResearchPlan {
  schemaVersion: "1.9";
  candidateId: string;
  cluster: "devnet";
  researchAt: string;
  identity: { kind: "exact-account-set"; accounts: string[] };
  invokedProgramIds: string[];
  observedRecurrenceSlots: number[];
  representative: { slot: number; componentId: number };
  discoveryEvidenceReferences: string[];
  sourceCachePaths: string[];
  materializedPaths: { analysis: string; report: string };
  expectedStructuralCounts: {
    recurrenceBlockCount: number;
    representativeTransactionCount: number;
    representativeDistinctFeePayerCount: number;
    representativeConflictEdgeCount: number;
    representativeConflictAtomCount: number;
    representativeWaveLowerBound: number;
    representativeWaveUpperBound: number;
  };
  snapshotRequest: {
    endpoint: string;
    commitment: "confirmed";
    cachePath: string;
    programId: string;
    programDataAddress: string;
    fixedAddresses: string[];
    representativeUpdateSpecificAddresses: string[];
  };
  sources: ResearchSourcePlan[];
  sourceSearches: SourceSearchRecord[];
  retrievalProvenance: {
    discoveryPlan: string;
    discoveryGeneratedAt: string;
    accountSnapshotScope: string;
    sourceScope: string;
  };
  inputEvidence: ResearchEvidenceInput[];
  outputDirectory: string;
  documentationPath: string;
}

export interface ResearchAccountPosition {
  position: number;
  signer: boolean;
  writable: boolean;
  flagsStable: boolean;
  constantAcrossOccurrences: boolean;
  distinctAddressCount: number;
  addresses: string[];
  currentMetadataCoverage: number;
  currentOwners: string[];
  currentDataLengths: number[];
  candidateConflictRelation: "first-exact-identity-account" | "second-exact-identity-account" | "none";
  recurrenceClass: "globally-recurring" | "update-specific";
  decodedRole: string | null;
  sourceConfirmedRole: string | null;
  inferredRole: string;
  confidence: Confidence;
  evidence: string[];
  declaredAccessOnly: true;
  actualMutation: "unknown";
}

export interface PayloadRecord {
  slot: number;
  transactionIndex: number;
  signature: string | null;
  instructionIndex: number;
  byteLength: number;
  discriminatorHex: string;
  rawHex: string;
  rawSha256: string;
  fields: {
    field_0: number | null;
    optional_value_a_marker: number | null;
    value_a: string | null;
    optional_value_b_marker: number | null;
    value_b: string | null;
    candidate_timestamp: string | null;
    candidate_timestamp_matches_block_time: boolean;
  };
}

export interface LogPayloadRecord {
  slot: number;
  transactionIndex: number;
  signature: string | null;
  byteLength: number;
  prefixHex: string;
  rawHex: string;
  rawSha256: string;
  blockTimeLittleEndianOffsets: number[];
}

export interface CandidateTransactionEvidence {
  index: number;
  signature: string | null;
  status: "success" | "failed" | "unknown";
  feePayer: string;
  computeUnitsConsumed: number | null;
  instructionProgramOrder: Array<string | null>;
  instructionCount: number;
  accountPositions: Array<{ position: number; address: string; signer: boolean; writable: boolean }>;
  ed25519: Ed25519ParseResult[];
  candidatePayloads: PayloadRecord[];
  logPayloads: LogPayloadRecord[];
  logShape: string[];
}

export interface CandidateOccurrence {
  evidenceId: string;
  slot: number;
  blockTime: number | null;
  componentId: number;
  transactionIndexes: number[];
  transactionSignatures: Array<string | null>;
  statusCounts: { success: number; failed: number; unknown: number };
  distinctFeePayers: string[];
  conflictEdges: Array<{ source: number; target: number; accounts: string[]; classification: string }>;
  conflictAtoms: Array<{ source: number; target: number; account: string }>;
  waveLowerBound: number;
  waveUpperBound: number;
  provenMinimumWaveCount: number | null;
  knownComputeUnits: number;
  knownComputeCoverage: number;
  invokedPrograms: string[];
  transactions: CandidateTransactionEvidence[];
  deviationsFromRepresentative: string[];
  sourceCachePath: string;
  sourceCacheSha256: string;
}

export interface AccountSnapshotSummary {
  address: string;
  exists: boolean;
  contextSlot: number;
  owner: string | null;
  executable: boolean | null;
  lamports: string | null;
  dataLength: number | null;
  rentEpoch: string | null;
  rawDataSha256: string | null;
  loaderType: "bpf-upgradeable-program" | "bpf-upgradeable-programdata" | "program-owned-data" | "other" | "missing";
  programDataAddress: string | null;
  lastDeployedSlot: string | null;
  upgradeAuthority: string | null;
  temporalScope: "current-snapshot-not-historical";
}

export interface AccountSnapshotArtifact {
  schemaVersion: "1.9";
  cluster: "devnet";
  endpoint: string;
  commitment: "confirmed";
  retrievedAt: string;
  contextSlot: number;
  cachePath: string;
  cacheSha256: string;
  requestedAddresses: string[];
  snapshots: AccountSnapshotSummary[];
  programDataInspection: {
    accountAddress: string;
    executableBytesSha256: string | null;
    embeddedPathLeads: string[];
    explicitProjectIdentifierFound: false;
    securityTxtFound: boolean;
    interpretation: string;
  };
  limitation: string;
}

export interface SourceManifestArtifact {
  schemaVersion: "1.9";
  accessedAt: string;
  sources: Array<ResearchSourcePlan & { cacheSha256: string; contentSha256: string; httpStatus: number; contentBytes: number }>;
  searches: SourceSearchRecord[];
  authoritativeProgramIdentityFound: boolean;
  authoritativeMutationSemanticsFound: boolean;
  programIdentityFinding: string;
}

export interface PayloadLayoutArtifact {
  schemaVersion: "1.9";
  instructionPayloads: {
    count: number;
    groups: Array<{ byteLength: number; discriminatorHex: string; count: number; stableByteRanges: Array<{ start: number; endExclusive: number; hex: string }> }>;
    fieldDistributions: Record<string, Array<{ value: string; count: number }>>;
    records: PayloadRecord[];
    neutralLayout: Array<{ name: string; start: number; endExclusive: number; interpretation: string; evidenceLevel: EvidenceLevel }>;
  };
  programDataLogs: {
    count: number;
    groups: Array<{ byteLength: number; prefixHex: string; count: number; stableByteRanges: Array<{ start: number; endExclusive: number; hex: string }> }>;
    records: LogPayloadRecord[];
  };
  unsupportedMarketLabelsAbsent: true;
  limitations: string[];
}

export interface SignerMessageSummaryArtifact {
  schemaVersion: "1.9";
  transactionCount: number;
  ed25519InstructionCount: number;
  signatureCount: number;
  malformedInstructionCount: number;
  unsupportedReferenceCount: number;
  localVerificationPassCount: number;
  distinctSignerCount: number;
  signers: Array<{ publicKey: string; signatureCount: number; occurrenceCount: number; repeated: boolean }>;
  distinctMessageCount: number;
  messages: Array<{ messageSha256: string; byteLength: number; signatureCount: number; signerPublicKeys: string[]; occurrenceCount: number }>;
  sameInstructionReferenceCount: number;
  crossInstructionReferenceCount: number;
  signerIndependence: "not-inferred";
  realWorldIdentity: "not-inferred";
}

export interface CandidateDossier {
  schemaVersion: "1.9";
  candidateId: string;
  generatedAt: string;
  executiveFinding: string;
  decision: DossierDecision;
  decisionBasis: string[];
  evidenceLadder: Array<{ level: EvidenceLevel; label: string; application: string }>;
  exactIdentity: { accounts: string[]; recurrenceBlockCount: number; allReferencesRevalidated: boolean; oneRepeatedExactPattern: boolean };
  representative: {
    slot: number; componentId: number; transactionCount: number; distinctFeePayerCount: number;
    conflictEdgeCount: number; conflictAtomCount: number; waveLowerBound: number; waveUpperBound: number;
  };
  recurrenceTimeline: Array<{ evidenceId: string; slot: number; componentId: number; transactionCount: number; distinctFeePayerCount: number; conflictEdgeCount: number; conflictAtomCount: number; waveBounds: string; deviations: string[] }>;
  variantShapes: Array<{ shape: string; occurrenceCount: number; slots: number[] }>;
  exactConflictEvidence: { totalOccurrenceEdges: number; totalOccurrenceAtoms: number; identityAccounts: string[]; declarationOnly: true };
  accountPositionMatrix: ResearchAccountPosition[];
  signerMessageSummaryPath: string;
  payloadLayoutPath: string;
  accountSnapshotsPath: string;
  sourceManifestPath: string;
  candidateEvidencePath: string;
  currentAccountMetadataFinding: string;
  programIdentityEvidence: string[];
  sourceConfirmedSemantics: string[];
  supportedInferences: string[];
  hypotheses: Array<{ statement: string; confidence: Confidence; supportingEvidence: string[]; contradictingOrMissingEvidence: string[] }>;
  unresolvedQuestions: string[];
  relatedFamilyEvidence: Array<{ slot: number; componentId: number; sharedCandidateAccount: string; reason: string }>;
  actionabilityGate: {
    passed: false;
    semanticDecoderAllowed: false;
    newCounterfactualAllowed: false;
    redesignConclusionAllowed: false;
    reason: string;
  };
  limitations: string[];
  compactness: { completeBlockAnalysesEmbedded: false; occurrenceEvidenceExternalizedToNdjson: true };
}
