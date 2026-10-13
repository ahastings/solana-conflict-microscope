import type { Ed25519Offsets, Ed25519Reference } from "./ed25519.js";
import type { VelocityAccountPosition } from "./milestone20-types.js";

export type AnchorBundleRole = "anchor-A" | "anchor-B" | "anchor-C";
export type Milestone22Outcome =
  | "anchor-variant-semantics-established"
  | "repeated-update-structure-established-semantics-incomplete"
  | "no-additional-semantic-bridge";

export interface Milestone22Input {
  path: string;
  sha256: string;
  purpose: string;
}

export interface SourceBlobPin {
  repository: string;
  repositoryUrl: string;
  commit: string;
  path: string;
  sha256: string;
  purpose: string;
}

export interface InstructionPin {
  instructionIndex: number;
  programId: string | null;
  byteLength: number | null;
  dataSha256: string | null;
  accountListSha256: string;
}

export interface BundleTransactionPin {
  role: AnchorBundleRole | "native-unresolved";
  transactionIndex: number;
  signature: string;
  feePayer: string;
  ed25519InstructionIndexes: number[];
  bqsInstructionIndexes: number[];
  velocityInstructionIndexes: number[];
  postPythInstructionIndexes: number[];
  updateTwapInstructionIndexes: number[];
  instructionData: InstructionPin[];
  logSha256: string;
  signedMessageSha256: string | null;
}

export interface BundlePin {
  slot: number;
  componentId: number;
  transactions: BundleTransactionPin[];
  conflictEvidenceReference: string;
  sourceCachePath: string;
  sourceCacheSha256: string;
}

export interface Milestone22Plan {
  schemaVersion: "2.2";
  generatedAt: string;
  cluster: "devnet";
  outputDirectory: string;
  documentationPath: string;
  programId: string;
  candidateId: "candidate-043c938568ad5e15";
  expectedPriorDecision: "identity-found-semantics-incomplete";
  expectedBinaryOutcome: "variant-level-strong-correspondence";
  expectedContinuity: "sample-binary-continuity-established";
  expectedExecutableSha256: string;
  priorPlans: { sourceability: string; candidate: string; binary: string };
  repositories: { velocity: string; pyth: string };
  pinnedCommits: { velocity: string; pyth: string };
  expectedBundles: BundlePin[];
  inputs: Milestone22Input[];
  sourceBlobs: SourceBlobPin[];
  preservedArtifactHashes: Record<string, string>;
  offlineReplay: { command: string; cacheFirst: true; networkRequestsWhenOffline: 0 };
}

export interface DecodedPythProperty {
  id: number;
  name: string;
  value: string | number | null;
  sourceConfirmed: true;
}

export interface DecodedPythFeed {
  feedId: number;
  properties: DecodedPythProperty[];
  oraclePda: string;
  oracleBump: number;
  oracleInstructionPosition: number;
}

export interface DecodedPythMessage {
  rawHex: string;
  rawSha256: string;
  byteLength: number;
  formatMagic: number;
  timestampUs: string;
  channelId: number;
  channelName: string;
  feedCount: number;
  feeds: DecodedPythFeed[];
  bytesConsumed: number;
  completeRoundTripBoundary: boolean;
  sourceAuthority: string;
}

export interface AnchorTransactionEvidence {
  role: AnchorBundleRole;
  transactionIndex: number;
  signature: string;
  payer: string;
  computeUnits: number;
  instructionOrder: Array<string | null>;
  outerInstructions: InstructionPin[];
  ed25519: {
    instructionIndex: number;
    instructionDataSha256: string;
    signerPublicKey: string;
    signedMessageSha256: string;
    signedMessageHex: string;
    locallyVerified: boolean;
    offsets: Ed25519Offsets;
    signatureReference: Ed25519Reference;
    publicKeyReference: Ed25519Reference;
    messageReference: Ed25519Reference;
  };
  postPyth: {
    instructionIndex: number;
    discriminatorHex: string;
    rawHex: string;
    rawSha256: string;
    accountList: VelocityAccountPosition[];
    accountListSha256: string;
  };
  updateTwap: {
    instructionIndex: number;
    discriminatorHex: string;
    rawHex: string;
    rawSha256: string;
    accountList: VelocityAccountPosition[];
    accountListSha256: string;
    marketWritableAccount: string;
    oracleWritableAccount: string;
    makerInputs: string[];
  };
  relevantLogs: string[];
  logSha256: string;
  branch: "posting" | "skipping" | "mixed" | "unresolved";
  postingLogCount: number;
  skippingLogCount: number;
  updateTwapLogCount: number;
  failureOrEarlyReturnLogs: string[];
}

export interface AnchorBundleEvidence {
  slot: number;
  componentId: number;
  blockTime: number;
  transactionsInBlockOrder: AnchorBundleRole[];
  anchors: AnchorTransactionEvidence[];
  native: { transactionIndex: number; signature: string; payer: string; semanticScope: "excluded-unresolved" };
  decodedMessage: DecodedPythMessage;
  topologyRepeats: boolean;
}

export interface MessageReuseMatrix {
  schemaVersion: "2.2";
  signerPublicKey: string;
  blocks: Array<{
    slot: number;
    messageSha256: string;
    messageByteLength: number;
    roles: AnchorBundleRole[];
    transactionIndexes: number[];
    transactionSignatures: string[];
    feePayers: string[];
    occurrenceCount: 3;
    allMessageBytesIdentical: true;
    sameSigner: true;
    identicalOffsetReferenceStructure: true;
    transactionSignaturesDiffer: true;
    feePayersDiffer: false;
    crossFeePayerReuse: "not-observed";
  }>;
  distinctMessageCount: 6;
  anyCrossBlockReuse: false;
  oneMessagePerThreeAnchorTransactions: true;
  interpretation: string;
}

export interface InstructionEquivalenceArtifact {
  schemaVersion: "2.2";
  blocks: Array<{
    slot: number;
    classification: "byte-identical-update" | "same-message-different-wrapper" | "different-update" | "unresolved";
    postPythPayloadHashes: string[];
    postPythRawHex: string;
    postPythAccountListHashes: string[];
    postPythAccountListsIdentical: boolean;
    postPythBytesIdentical: boolean;
    updateTwapPayloadHashes: string[];
    updateTwapBytesIdentical: boolean;
    updateTwapWrappersDifferByAccounts: true;
    varyingFields: string[];
  }>;
  allBlocksByteIdenticalPostPyth: true;
  updateTwapDiscriminatorOnlySha256: string;
}

export interface LogBranchMatrix {
  schemaVersion: "2.2";
  blocks: Array<{
    slot: number;
    messageTimestampUs: string;
    blockTime: number;
    transactionOrder: Array<{
      ordinal: 1 | 2 | 3;
      role: AnchorBundleRole;
      transactionIndex: number;
      branch: AnchorTransactionEvidence["branch"];
      relevantLogs: string[];
      postingLogCount: number;
      skippingLogCount: number;
      updateTwapLogCount: number;
      targetMarket: string;
      targetOracle: string;
    }>;
    firstPostsAndLaterTwoSkip: true;
  }>;
  totals: { postingLogs: number; skippingLogs: number; updateTwapInstructionLogs: number; failuresOrEarlyReturns: number };
  wordingNormalized: false;
  transactionOrderDisclaimer: string;
}

export interface AnchorConflictAttribution {
  schemaVersion: "2.2";
  blocks: Array<{
    slot: number;
    anchorTransactionIndexes: number[];
    pairEdges: Array<{ source: number; target: number; accounts: string[] }>;
    conflictAtoms: Array<{ source: number; target: number; account: string; cause: "shared-oracle" | "fee-payer" | "other" }>;
    edgeCount: 3;
    atomCount: 12;
    waveLowerBound: 3;
    waveUpperBound: 3;
    commonOracleSetAlonePreservesClique: true;
    feePayerIndependentlyPreservesClique: true;
    marketAccountsCauseAnchorPairConflict: false;
    otherCauses: string[];
    nativeContext: {
      transactionIndex: number;
      conflicts: Array<{ anchorRole: AnchorBundleRole; anchorTransactionIndex: number; accounts: string[] }>;
      atomCount: 3;
      semanticStatus: "unresolved-excluded";
    };
  }>;
  authoritativeFullGraphUnchanged: true;
  observationalOnly: true;
}

export interface AnchorBinaryCorrespondence {
  schemaVersion: "2.2";
  executableSha256: string;
  boundedAnalysis: true;
  variants: Array<{
    variant: "post-pyth-lazer-oracle-update" | "update-perp-bid-ask-twap";
    discriminatorHex: string;
    discriminatorOffsets: number[];
    instructionName: string;
    instructionNameOffsets: number[];
    sourcePath: string;
    sourcePathOffsets: number[];
    exactLogFingerprints: Array<{ value: string; count: number; offsets: number[]; sections: string[] }>;
    accountCardinalities: number[];
    sourceBlobPins: SourceBlobPin[];
    evidenceLevel: 3 | 4;
    correspondence: "strong-deployed-fingerprint";
    level5Reached: false;
    limitations: string[];
  }>;
  deployedSkipInvestigation: {
    exactString: string;
    occurrenceCount: number;
    offsets: number[];
    sections: string[];
    nearbyStrings: Array<{ offset: number; value: string }>;
    boundedCodeReferenceEstablished: false;
    publicHistory: Array<{ commit: string; predicate: string; classification: string }>;
    stringVersionMismatch: true;
    controlConditionMismatchAtEquality: true;
    deployedPredicatesComplementary: true;
    semanticMismatchEstablished: false;
    explanation: string;
  };
  nativeVariant: { correspondence: "unresolved"; excludedFromPromotion: true };
}

export interface AnchorSemanticEvidence {
  schemaVersion: "2.2";
  outcome: Milestone22Outcome;
  variants: Array<{
    variant: "post-pyth-lazer-oracle-update" | "update-perp-bid-ask-twap";
    reachedLevels: number[];
    highestLevel: 4;
    level5Reached: false;
    observedStructure: string[];
    sourceFamilyBehavior: string[];
    deployedMutationConclusion: "incomplete";
    blockers: string[];
  }>;
  repeatedUpdate: {
    sameSignedMessagePerBlock: true;
    sameOraclePdaSetPerBlock: true;
    firstObservedPath: "posting-logs";
    laterObservedPaths: "equal-timestamp-skip-logs";
    exactDeployedNoOpEstablished: false;
    classification: "state-dependent-below-level-5";
    reason: string;
  };
  twapTargets: { distinctMarketStatePerBundle: true; markets: string[]; observedTwapLogsOnAllTransactions: true; exactDeployedMutationEstablished: false };
  authorization: { anchorVariantSemanticDecoderAllowed: false; laterAnchorCounterfactualMilestoneAllowed: false; optimizationImplemented: false };
  nonClaims: string[];
}

export interface AnchorBundleDossier {
  schemaVersion: "2.2";
  generatedAt: string;
  outcome: Milestone22Outcome;
  executiveFinding: string;
  counts: Record<string, number>;
  stableRoleDefinition: Array<{ role: AnchorBundleRole; market: string; oracle: string; makerInputs: string[] }>;
  bundles: AnchorBundleEvidence[];
  topologyFinding: string;
  nativeBoundary: string;
  actionability: AnchorSemanticEvidence["authorization"];
  artifactPaths: Record<string, string>;
  inputProvenance: { files: Milestone22Input[]; sourceBlobs: SourceBlobPin[] };
}

export interface Milestone22Result {
  outcome: Milestone22Outcome;
  dossier: AnchorBundleDossier;
  messageReuse: MessageReuseMatrix;
  instructionEquivalence: InstructionEquivalenceArtifact;
  logBranches: LogBranchMatrix;
  conflictAttribution: AnchorConflictAttribution;
  binaryCorrespondence: AnchorBinaryCorrespondence;
  semanticEvidence: AnchorSemanticEvidence;
  terminalSummary: string;
}
