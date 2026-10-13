export type SampleBinaryContinuity =
  | "sample-binary-continuity-established"
  | "sample-binary-continuity-probable"
  | "sample-binary-continuity-unresolved";

export type BuildResult =
  | "exact-binary-match"
  | "reproducible-binary-mismatch"
  | "non-reproducible-build"
  | "build-unavailable";

export type OverallBinaryOutcome =
  | "exact-deployed-source-match"
  | "variant-level-strong-correspondence"
  | "source-family-only-confirmed";

export type VariantConfidence = "exact" | "strong" | "source-family-only" | "unresolved";

export interface Milestone21Input {
  path: string;
  sha256: string;
  purpose: string;
}

export interface Milestone21Plan {
  schemaVersion: "2.1";
  generatedAt: string;
  cluster: "devnet";
  endpoint: string;
  outputDirectory: string;
  documentationPath: string;
  programId: string;
  programDataAddress: string;
  expectedLastDeploySlot: number;
  expectedSnapshotContextSlot: number;
  sampleSlots: number[];
  candidateId: string;
  candidateDiscoveryRank: number;
  expectedPriorDecision: "identity-found-semantics-incomplete";
  expectedPriorCorrespondence: "source-family-only";
  cache: {
    accountSnapshotsRaw: string;
    deploymentHistoryRaw: string;
    loaderSourceRaw: string;
    sourceHistoryRaw: string;
    buildEnvironmentRaw: string;
    velocityV1Tarball: string;
  };
  repositories: {
    protocolV2: string;
    agave: string;
  };
  pinnedCommits: {
    agave: string;
    agaveTag: string;
    driftForkRelease: string;
    driftOracleTimestamp: string;
    driftNativeOpcode2: string;
    velocityRebrand: string;
    velocityNativeHardening: string;
    velocityCandidate: string;
    velocityReachableTag: string;
    protocolCurrentHead: string;
  };
  inputs: Milestone21Input[];
  preservedArtifactHashes: Record<string, string>;
  offlineReplay: {
    command: string;
    cacheFirst: true;
    networkRequestsWhenOffline: 0;
  };
}

export interface ProgramDataExtraction {
  stateTag: number;
  slot: number;
  upgradeAuthorityOption: number;
  upgradeAuthorityBytesHex: string | null;
  headerLength: number;
  rawLength: number;
  rawSha256: string;
  executableLength: number;
  executableSha256: string;
  executable: Buffer;
}

export interface ElfHeader {
  magicHex: string;
  class: number;
  dataEncoding: number;
  version: number;
  osAbi: number;
  type: number;
  machine: number;
  entry: string;
  programHeaderOffset: string;
  sectionHeaderOffset: string;
  flags: number;
  headerSize: number;
  programHeaderEntrySize: number;
  programHeaderCount: number;
  sectionHeaderEntrySize: number;
  sectionHeaderCount: number;
  sectionNameStringTableIndex: number;
}

export interface ElfSection {
  index: number;
  name: string;
  type: number;
  typeName: string;
  flags: string;
  address: string;
  offset: number;
  size: number;
  link: number;
  info: number;
  alignment: string;
  entrySize: string;
  sha256: string;
}

export interface ElfSymbol {
  table: string;
  index: number;
  name: string;
  binding: number;
  type: number;
  visibility: number;
  sectionIndex: number;
  value: string;
  size: string;
}

export interface ElfParseResult {
  valid: boolean;
  validationErrors: string[];
  header: ElfHeader;
  sections: ElfSection[];
  symbols: ElfSymbol[];
  relocationSections: Array<{ name: string; type: string; entryCount: number; targetSectionIndex: number; symbolTableIndex: number }>;
}

export interface ExtractedString {
  offset: number;
  value: string;
}

export interface SourceCommitFinding {
  repository: string;
  commit: string;
  authoredAt: string;
  committedAt: string;
  subject: string;
  reachableFrom: string[];
  relevance: string[];
  blobHashes: Array<{ path: string; sha256: string }>;
}

export interface SourceHistoryRaw {
  schemaVersion: "2.1-source-history-cache";
  acquiredAt: string;
  repositoryUrl: string;
  repositoryHead: string;
  refs: Array<{ name: string; object: string }>;
  commits: SourceCommitFinding[];
  fingerprints: {
    publicVelocityCandidate: Record<string, unknown>;
    publicDriftOpcode2: Record<string, unknown>;
    comparisonHistory: Array<Record<string, unknown>>;
  };
  velocityV1: Record<string, unknown>;
}

export interface DeploymentHistoryRaw {
  schemaVersion: "2.1-deployment-history-cache";
  acquiredAt: string;
  endpoint: string;
  versionResponse: unknown;
  programSignatures: unknown;
  programDataSignaturePages: unknown[];
  programDataTransactions: unknown;
}

export interface BuildEnvironmentRaw {
  schemaVersion: "2.1-build-environment-cache";
  acquiredAt: string;
  host: string;
  commands: Array<{ command: string; available: boolean; version: string | null }>;
  isolatedRuntimes: Array<{ name: string; available: boolean; detail: string }>;
}

export interface AccountContractEntry {
  position: number;
  role: string;
  signer: boolean;
  writable: boolean;
  address?: string;
  owner?: string;
}

export interface StructuralComparison {
  candidate: string;
  observedCount: number;
  sourceMinimumCount: number;
  cardinalityCompatible: boolean;
  systemProgramMismatch: boolean;
  positionComparisons: Array<{
    position: number;
    observedAddress: string | null;
    observedOwner: string | null;
    sourceRole: string | null;
    compatible: boolean;
    reason: string;
  }>;
  structurallyCompatible: boolean;
  conclusion: string;
}

export interface BuildAttempt {
  sourceRepository: string;
  commit: string;
  toolchain: Record<string, string>;
  command: string;
  status: BuildResult;
  resultingBinarySha256: string | null;
  executableLength: number | null;
  deterministicRepeatStatus: "matched" | "mismatched" | "not-run";
  deployedExecutableSha256: string;
  comparison: string;
}

export interface VariantCorrespondenceRow {
  observedVariant: string;
  observedDiscriminator: string;
  observedAccountCardinality: number;
  observedLogs: string[];
  candidateSourceCommit: string | null;
  sourceAccountContract: AccountContractEntry[];
  sourceComparisonCondition: string | null;
  exactStringMatches: string[];
  buildResult: BuildResult;
  binaryMatchStatus: "matched" | "not-matched" | "not-built";
  deploymentWindowCompatible: boolean;
  confidence: VariantConfidence;
  remainingContradictions: string[];
}

export interface Milestone21Result {
  continuity: SampleBinaryContinuity;
  overallOutcome: OverallBinaryOutcome;
  programData: Record<string, unknown>;
  executable: Record<string, unknown>;
  sectionManifest: Record<string, unknown>;
  sourceHistory: Record<string, unknown>;
  buildAttempts: Record<string, unknown>;
  fingerprintMatrix: Record<string, unknown>;
  variantCorrespondence: Record<string, unknown>;
  deploymentHistory: Record<string, unknown>;
  terminalSummary: string;
}
