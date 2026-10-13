import type { Ed25519ParseResult } from "./ed25519.js";
import type { Confidence } from "./types.js";

export type SourceabilityState =
  | "authoritative-source-and-interface"
  | "authoritative-identity-source-incomplete"
  | "maintained-interface-only"
  | "third-party-identity-only"
  | "black-box";

export type SourceCorrespondence =
  | "exact verified deployment"
  | "strongly version-correlated"
  | "source-family-only"
  | "unresolved";

export type VelocityDecision =
  | "source-confirmed-semantics"
  | "identity-found-semantics-incomplete"
  | "black-box-structure-only";

export interface SourceabilityFamilyPlan {
  familyId: string;
  label: string;
  identifyingProgramIds: string[];
  primaryProgramId: string;
  authoritativeExactProgramIdMatch: boolean;
  maintainedSdkOrIdl: boolean;
  publicSourceRepository: boolean;
  verifiedBuildEvidence: string;
  versionDeploymentCorrespondence: SourceCorrespondence;
  sourceabilityOutcome: SourceabilityState;
  researchPriority: number;
  researchPriorityReasons: string[];
  evidence: Array<{ kind: string; url: string | null; result: string }>;
}

export interface SourceabilityPlan {
  schemaVersion: "2.0";
  researchAt: string;
  discoveryIndex: { path: string; sha256: string };
  candidateOneDossier: { path: string; sha256: string; expectedDecision: "black-box-structure-only" };
  expectedCandidateCount: 19;
  expectedFamilyCount: 6;
  outputDirectory: string;
  candidateDispositions: {
    primaryCandidateId: string;
    deferredNotRejectedCandidateId: string;
    preservedPriorDossierCandidateId: string;
  };
  evidenceLadder: Array<{ state: SourceabilityState; meaning: string }>;
  families: SourceabilityFamilyPlan[];
}

export interface SourceabilityCandidate {
  candidateId: string;
  discoveryRank: number;
  exactInvokedProgramIds: string[];
  recurrenceCount: number;
  payerCount: number;
  depth: {
    lowerBound: number;
    upperBound: number;
    provenMinimum: number | null;
  };
  knownComputeContext: {
    qualifiedShare: number | null;
    coverage: number;
  };
  existingCauseRoleEvidence: {
    cause: string;
    decodedRoles: string[];
    selectionReasons: string[];
  };
  sharedWritableAccountCount: number;
  materializationPath: {
    status: string;
    analysis: string | null;
    report: string | null;
  };
  programFamilyId: string;
  authoritativeExactProgramIdMatch: boolean;
  maintainedSdkOrIdlAvailability: boolean;
  publicSourceRepositoryAvailability: boolean;
  verifiedBuildEvidence: string;
  versionDeploymentCorrespondence: SourceCorrespondence;
  sourceabilityOutcome: SourceabilityState;
  researchPriority: number;
  researchPriorityReasons: string[];
  disposition: "primary-bounded-dossier" | "deferred-not-rejected" | "preserved-prior-dossier" | "triaged-lead";
}

export interface SourceabilityIndex {
  schemaVersion: "2.0";
  generatedAt: string;
  purpose: string;
  discoveryRankPreserved: true;
  evidenceLadder: SourceabilityPlan["evidenceLadder"];
  coverage: {
    candidateCount: 19;
    familyCount: 6;
    allHighPriorityCandidatesMappedOnce: true;
  };
  candidateTwoFinding: {
    candidateId: "candidate-e5d929864077a76b";
    disposition: "deferred-not-rejected";
    authoritativeMutationSourceFound: boolean;
    preservedFacts: string[];
  };
  candidates: SourceabilityCandidate[];
}

export interface ProgramFamilyMap {
  schemaVersion: "2.0";
  generatedAt: string;
  groupingRule: string;
  families: Array<SourceabilityFamilyPlan & {
    discoveryRanks: number[];
    candidateIds: string[];
  }>;
}

export interface ExpectedVelocityOccurrence {
  slot: number;
  componentId: number;
  transactionIndexes: number[];
  transactionSignatures: string[];
  transactionCount: number;
  conflictEdgeCount: number;
  conflictAtomCount: number;
  distinctPayerCount: number;
  waveLowerBound: number;
  waveUpperBound: number;
  knownComputeUnits: number;
  knownComputeCoverage: number;
}

export interface Milestone20InputEvidence {
  kind: string;
  path: string;
  sha256: string;
}

export interface VelocitySourcePlan {
  id: string;
  title: string;
  organization: string;
  repository: string | null;
  commit: string | null;
  release: string | null;
  path: string | null;
  url: string;
  cachePath: string;
  expectedHttpStatus: number;
  requiredContentMarker: string;
  classification: string;
  exactProgramIdMatch: boolean;
  supports: string[];
  doesNotSupport: string[];
}

export interface VelocityResearchPlan {
  schemaVersion: "2.0";
  candidateId: "candidate-043c938568ad5e15";
  cluster: "devnet";
  researchAt: string;
  identity: { kind: "exact-account-set"; accounts: string[] };
  observedRecurrenceSlots: number[];
  sourceCachePaths: string[];
  representative: { slot: number; componentId: number };
  invokedProgramIds: string[];
  velocityProgramId: string;
  programDataAddress: string;
  evidenceReferences: string[];
  expectedOccurrences: ExpectedVelocityOccurrence[];
  expectedStructuralCounts: {
    recurrenceBlockCount: number;
    transactionCountPerOccurrence: number;
    conflictEdgeCountPerOccurrence: number;
    conflictAtomCountPerOccurrence: number;
    distinctPayerCountPerOccurrence: number;
    waveLowerBoundPerOccurrence: number;
    waveUpperBoundPerOccurrence: number;
    totalOccurrenceTransactions: number;
    totalOccurrenceEdges: number;
    totalOccurrenceAtoms: number;
    totalKnownComputeUnits: number;
    knownComputeCoverage: number;
  };
  materializedPaths: { analysis: string; report: string };
  sourceabilityPlanPath: string;
  snapshotRequest: {
    endpoint: string;
    commitment: "confirmed";
    cachePath: string;
    programId: string;
    programDataAddress: string;
    sharedWritableAddresses: string[];
    representativeInstructionSpecificAddresses: string[];
    expectedCurrentProgramMetadata: {
      programDataLength: number;
      lastDeploySlot: string;
      upgradeAuthority: string;
      executableBytesSha256: string;
    };
  };
  sources: VelocitySourcePlan[];
  sourceSearches: Array<{
    query: string;
    venue: string;
    url: string | null;
    accessedAt: string;
    result: string;
    authoritativeMatch: boolean;
  }>;
  inputEvidence: Milestone20InputEvidence[];
  offlineReplay: {
    command: string;
    cacheFirst: true;
    networkRequestsWhenOffline: 0;
    generatedAtFromManifest: true;
    completeBlockAnalysesEmbedded: false;
  };
  outputDirectory: string;
  sourceabilityOutputDirectory: string;
  documentationPath: string;
}

export interface VelocityAccountPosition {
  position: number;
  address: string;
  signer: boolean;
  writable: boolean;
}

export interface VelocityInstructionEvidence {
  instructionIndex: number;
  programId: string;
  byteLength: number | null;
  rawSha256: string | null;
  prefixHex: string | null;
  discriminatorHex: string | null;
  encoding: "anchor-discriminator" | "native-prefix" | "other" | "no-data";
  observedLogNames: string[];
  observedVariant: string;
  sourceFamilyVariant: string | null;
  exactDeployedVariantEstablished: boolean;
  accounts: VelocityAccountPosition[];
}

export interface VelocityTransactionEvidence {
  index: number;
  signature: string | null;
  status: "success" | "failed" | "unknown";
  feePayer: string;
  computeUnitsConsumed: number | null;
  instructionProgramOrder: Array<string | null>;
  velocityInstructions: VelocityInstructionEvidence[];
  ed25519: Ed25519ParseResult[];
  logs: string[];
  programDataLogHashes: Array<{ byteLength: number; prefixHex: string; sha256: string }>;
}

export interface VelocityConflictAccountEvidence {
  address: string;
  sourceTransactionIndex: number;
  targetTransactionIndex: number;
  sourceSigner: boolean;
  sourceWritable: boolean;
  targetSigner: boolean;
  targetWritable: boolean;
}

export interface VelocityOccurrence {
  evidenceId: string;
  slot: number;
  componentId: number;
  blockTime: number | null;
  transactionIndexes: number[];
  transactionSignatures: Array<string | null>;
  statusCounts: { success: number; failed: number; unknown: number };
  distinctPayers: string[];
  conflictEdges: Array<{ source: number; target: number; accounts: string[]; classification: string }>;
  conflictAtoms: Array<{ source: number; target: number; account: string }>;
  conflictingAccountFlags: VelocityConflictAccountEvidence[];
  waveLowerBound: number;
  waveUpperBound: number;
  provenMinimumWaveCount: number | null;
  knownComputeUnits: number;
  knownComputeCoverage: number;
  invokedProgramIds: string[];
  instructionOrder: Array<{ transactionIndex: number; programIds: Array<string | null> }>;
  transactions: VelocityTransactionEvidence[];
  deviationsFromRepresentative: string[];
  partialIdentityComponentsRejected: Array<{ componentId: number; overlappingAccounts: string[] }>;
  sourceCachePath: string;
  sourceCacheSha256: string;
}

export interface CurrentAccountSnapshot {
  address: string;
  requestedAs: "program" | "program-data" | "candidate-shared-writable" | "representative-instruction-specific";
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
  lastDeploySlot: string | null;
  upgradeAuthority: string | null;
  temporalScope: "current-snapshot-not-historical";
}

export interface VelocityAccountSnapshotArtifact {
  schemaVersion: "2.0";
  cluster: "devnet";
  endpoint: string;
  commitment: "confirmed";
  retrievedAt: string;
  contextSlot: number;
  cachePath: string;
  cacheSha256: string;
  requestedAddresses: string[];
  snapshots: CurrentAccountSnapshot[];
  deployedProgram: {
    programId: string;
    programDataAddress: string;
    lastDeploySlot: string | null;
    upgradeAuthority: string | null;
    executableBytesSha256: string | null;
    correspondenceSearchHashMatched: false;
  };
  limitation: string;
}

export interface VelocitySourceManifest {
  schemaVersion: "2.0";
  accessedAt: string;
  programId: string;
  authoritativeProgramIdentityFound: boolean;
  identityFinding: string;
  sources: Array<VelocitySourcePlan & {
    cacheSha256: string;
    contentSha256: string;
    contentBytes: number;
    httpStatus: number;
  }>;
  searches: VelocityResearchPlan["sourceSearches"];
  deployedSourceCorrespondence: SourceCorrespondence;
  correspondenceReasons: string[];
  inheritedDriftDistinction: string[];
  verifiedBuildMatchFound: false;
}

export interface VelocitySignerMessageSummary {
  schemaVersion: "2.0";
  transactionCount: number;
  ed25519InstructionCount: number;
  signatureCount: number;
  decodedInstructionCount: number;
  malformedInstructionCount: number;
  unsupportedReferenceCount: number;
  localVerificationPassCount: number;
  sameInstructionReferenceCount: number;
  crossInstructionReferenceCount: number;
  distinctSignerCount: number;
  distinctMessageCount: number;
  signers: Array<{ publicKey: string; signatureCount: number; occurrenceCount: number }>;
  messages: Array<{ messageSha256: string; byteLength: number; signatureCount: number; signerPublicKeys: string[]; occurrenceCount: number }>;
  interpretation: string;
}

export interface VelocityAccountRoleRow {
  observedVariant: string;
  position: number;
  signer: boolean;
  writable: boolean;
  flagsStable: boolean;
  addressRecurrence: Array<{ address: string; count: number }>;
  currentOwners: string[];
  currentDataLengths: number[];
  sourceConstraintName: string | null;
  sourceFamilyRole: string | null;
  sourceConfirmedDeployedRole: string | null;
  declaredAccess: "read-only" | "writable";
  sourceRequiredWritable: boolean | null;
  sourceFamilyMutation: string | null;
  sourceConfirmedMutation: "unknown";
  exactFieldsOrRegions: string[];
  scope: "global" | "market-specific" | "oracle-specific" | "signer-configuration-specific" | "other" | "unknown";
  accountTypeOrDiscriminator: string | null;
  pdaSeeds: string[];
  confidence: Confidence;
  evidence: string[];
}

export interface VelocityInstructionLayout {
  schemaVersion: "2.0";
  deploymentCorrespondence: SourceCorrespondence;
  groups: Array<{
    observedVariant: string;
    encoding: VelocityInstructionEvidence["encoding"];
    discriminatorHex: string | null;
    byteLength: number;
    count: number;
    slots: number[];
    observedLogNames: string[];
    sourceFamilyVariant: string | null;
    exactDeployedVariantEstablished: false;
    sourceFamilyComparison: string;
  }>;
  accountRoleMatrix: VelocityAccountRoleRow[];
  nativeVariantMismatch: {
    observedPrefix: "ffffffff02";
    observedAccountCount: 5;
    sourceFamilyMinimumAccountCount: 6;
    interpretation: string;
  };
  eventAndLogFinding: string;
}

export interface VelocityDossier {
  schemaVersion: "2.0";
  candidateId: string;
  generatedAt: string;
  decision: VelocityDecision;
  executiveFinding: string;
  decisionBasis: string[];
  exactIdentity: {
    accounts: string[];
    recurrenceBlockCount: 6;
    allReferencesRevalidated: true;
    partialMatchesRejected: true;
  };
  representative: {
    slot: number;
    componentId: number;
    transactionCount: number;
    distinctPayerCount: number;
    conflictEdgeCount: number;
    conflictAtomCount: number;
    waveLowerBound: number;
    waveUpperBound: number;
    knownComputeUnits: number;
    knownComputeCoverage: number;
  };
  recurrenceTimeline: Array<{
    slot: number;
    componentId: number;
    transactionIndexes: number[];
    signatures: Array<string | null>;
    status: string;
    payers: number;
    edges: number;
    atoms: number;
    waveBounds: string;
    knownComputeUnits: number;
    knownComputeCoverage: number;
    deviations: string[];
  }>;
  velocityIdentity: {
    authoritative: true;
    programId: string;
    organization: "velocity-exchange";
    evidence: string[];
  };
  sourceCorrespondence: {
    state: SourceCorrespondence;
    programDataAddress: string;
    currentLastDeploySlot: string | null;
    currentExecutableSha256: string | null;
    reasons: string[];
  };
  instructionPathFinding: {
    anchorLoggedVariants: string[];
    nativeObservedVariant: string;
    exactDeployedBranchEstablished: false;
    reasons: string[];
  };
  mutationTrace: {
    exactDeployedMutationEstablished: false;
    sourceFamilyOnlyFindings: string[];
    sharedWritableAnswers: Array<{ address: string; answer: string }>;
  };
  semanticIndependence: {
    outcome: "cannot-be-established";
    scope: string;
    reasons: string[];
    nonClaims: string[];
  };
  evidencePaths: {
    sourceabilityIndex: string;
    sourceManifest: string;
    accountSnapshots: string;
    instructionLayout: string;
    signerMessageSummary: string;
    occurrenceEvidence: string;
  };
  actionabilityGate: {
    passed: false;
    semanticDecoderAllowed: false;
    semanticCounterfactualAllowed: false;
    redesignConclusionAllowed: false;
    reason: string;
  };
  limitations: string[];
  compactness: {
    completeBlockAnalysesEmbedded: false;
    occurrenceEvidenceExternalizedToNdjson: true;
  };
}

export interface Milestone20Result {
  sourceabilityIndex: SourceabilityIndex;
  programFamilyMap: ProgramFamilyMap;
  occurrences: VelocityOccurrence[];
  sourceManifest: VelocitySourceManifest;
  accountSnapshots: VelocityAccountSnapshotArtifact;
  instructionLayout: VelocityInstructionLayout;
  signerSummary: VelocitySignerMessageSummary;
  dossier: VelocityDossier;
  observedInputHashes: Milestone20InputEvidence[];
  terminalSummary: string;
}
