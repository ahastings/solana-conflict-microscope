export const MAX_SUPPORTED_TRANSACTION_VERSION = 1 as const;
export type SupportedTransactionVersion = "legacy" | 0 | 1;

export type AccountSource = "transaction" | "lookupTable";
export type Confidence = "high" | "medium" | "low";
export type DataKind = "real-network" | "curated-teaching" | "synthetic" | "unknown";

export interface FixtureProvenance {
  cluster: string;
  endpoint: string | null;
  retrievedAt: string | null;
  sourceMode: "fixture" | "rpc" | "scanner-cache" | "range-cache";
  dataKind: DataKind;
  request?: Record<string, unknown>;
}

export interface RpcParsedAccount {
  pubkey: string;
  signer: boolean;
  writable: boolean;
  source?: AccountSource;
}

export interface RpcCompiledInstruction { programIdIndex: number; accounts: number[]; data: string; stackHeight?: number | null }
export interface RpcParsedInstruction {
  programId: string; program?: string; stackHeight?: number | null;
  parsed?: { type?: string; info?: unknown } | string; accounts?: Array<string | number>;
  data?: string; programIdIndex?: number;
}
export type RpcInstruction = RpcParsedInstruction | RpcCompiledInstruction;
export interface RpcInnerInstructions { index: number; instructions: RpcInstruction[] }

export interface RpcBlock {
  blockhash: string; previousBlockhash: string; parentSlot: number | bigint;
  blockTime?: number | bigint | null; blockHeight?: number | bigint | null;
  transactions: RpcTransactionEntry[];
}

export interface RpcTransactionEntry {
  version?: SupportedTransactionVersion;
  transaction: { signatures: string[]; message: { accountKeys: RpcParsedAccount[]; instructions?: RpcInstruction[] } };
  rawTransaction?: { message: { accountKeys?: string[]; instructions?: RpcCompiledInstruction[] } };
  rawInnerInstructions?: RpcInnerInstructions[] | null;
  meta: null | {
    err: unknown; fee: number | bigint; computeUnitsConsumed?: number | bigint;
    logMessages?: string[] | null; innerInstructions?: RpcInnerInstructions[] | null;
  };
}

export interface RoleInference { role: string; confidence: Confidence; evidence: string; instructionIndex: number | null }
export interface NormalizedAccount extends Required<RpcParsedAccount> { knownLabel: string | null; roles: RoleInference[] }

export interface SemanticFootprint {
  account: string; operationType: "bpf-upgradeable-loader-write";
  byteRangeStart: number; byteRangeEnd: number; coordinateSystem: "buffer-program-data";
  readOnlyPrerequisites: Array<{ account: string; requirement: string }>;
  confidence: Confidence; precision: "exact" | "conservative"; sourceEvidence: string[];
}

export interface NormalizedInstruction {
  location: "outer" | "inner"; parentInstructionIndex: number | null; instructionIndex: number;
  programId: string | null; programLabel: string; stackHeight: number | null;
  accountAddresses: string[]; accountIndexes: number[]; data: string | null; dataEncoding: "base58" | null;
  parsedProgram: string | null; parsedType: string | null; parsedInfo: unknown | null;
  parsedRepresentation: unknown | null; rawRepresentation: unknown | null;
  decodeStatus: "parsed" | "partially-decoded" | "raw-only" | "unknown";
  semanticFootprints?: SemanticFootprint[];
  uploadEvidenceIssue?: string;
  incompleteAccountOperandEvidence?: string;
}

export interface NormalizedTransaction {
  id: string; signature: string | null; index: number; status: "success" | "failed" | "unknown";
  feePayer: string; accounts: NormalizedAccount[]; staticAccountKeys: string[]; loadedAccountKeys: string[];
  readSet: string[]; writeSet: string[]; nonFeePayerReadSet: string[]; nonFeePayerWriteSet: string[];
  invokedProgramIds: string[]; instructions: NormalizedInstruction[]; logMessages: string[];
  incompleteInstructionEvidence?: string;
  /** Original non-null RPC meta.err; absent when no failure details were supplied. */
  executionError?: unknown;
  feeLamports: number | null; computeUnitsConsumed: number | null; slot: number;
}

export type ConflictClass = "fee-payer-only" | "same-payer-shared-account" | "cross-payer-shared-account" | "other";
export type LegacyConflictClass = "fee-payer-plus-state" | "cross-payer-shared-state";
export interface ConflictEdge { source: number; target: number; accounts: string[]; classification: ConflictClass }
export interface ConflictAtom { source: number; target: number; account: string }
export interface ConflictEdgeDelta {
  source: number; target: number; removedAccounts: string[]; retainedAccounts: string[];
}
export interface AccountStat {
  account: string; label: string | null; readerCount: number; writerCount: number; affectedTransactionCount: number;
  uniquePairCoverage: number; exclusiveEdgeCount: number; overlappingEdgeCount: number; conflictEdgeCount: number;
}
export interface ConflictComponent { id: number; transactionIndexes: number[] }
export interface ContentionSignature { accounts: string[]; edgeCount: number; pairs: Array<[number, number]> }
export interface WaveContext { wave: number; transactionIndexes: number[]; transactionCount: number; knownComputeUnitsTotal: number; maximumTransactionComputeUnits: number; unknownComputeUnitCount: number }

export type Cause = "program-buffer writes" | "transfer/funding source" | "application state" | "vote account" | "repeated fee payer" | "other decoded account role" | "unknown";
export type ActorPattern = "same payer" | "cross payer" | "unknown";
export type Actionability = "likely protocol-required or intentional" | "potentially redesignable" | "insufficient evidence";
export interface EvidenceConclusion<T extends string> { value: T; confidence: Confidence; evidence: string[] }
export interface WaveBounds {
  /** Transaction indexes forming the lower-bound clique; absent in older saved analyses. */
  cliqueWitness?: number[];
  cliqueLowerBound: number; generatedWaveUpperBound: number; boundsMatch: boolean;
  provenMinimumWaveCount: number | null; lowerBoundEvidence: string; upperBoundEvidence: string;
}
export type CounterfactualModelId = "current-declared-locks" | "fee-payer-decoupled" | "semantic-range-refinement" | "joint-fee-payer-and-range";
export type PayerAblationStatus = "not-requested" | "fully-applicable" | "partially-applicable" | "blocked-by-instruction-use" | "blocked-by-incomplete-instruction-evidence";
export interface PayerAblationEvidence {
  status: PayerAblationStatus; targetedTransactionCount: number;
  removedSyntheticPayerAccessCount: number; preservedInstructionAccessCount: number; evidence: string[];
  preservedUnknownInstructionAccessCount?: number;
}
export interface SemanticRefinementEligibility {
  account: string; eligible: boolean; relevantTransactionIndexes: number[];
  exactFootprintCount: number; blockingEvidence: string[]; prerequisiteEvidence: string[];
}
export interface CounterfactualModelResult {
  model: CounterfactualModelId; label: string; hypothetical: boolean;
  availableUnderCurrentSolanaAccountLocking: boolean; semanticRangeRefinementApplied: boolean;
  payerAblation: PayerAblationEvidence; semanticRefinementEligibility: SemanticRefinementEligibility[];
  transactionCountRetained: number; knownComputeUnitsRetained: number; unknownComputeUnitCountRetained: number;
  conflictEdgeCount: number; conflictAtomCount: number; conflictEdges: ConflictEdge[]; conflictAtoms: ConflictAtom[];
  currentConflictAtomCount: number; removedConflictAtoms: ConflictAtom[]; retainedConflictAtoms: ConflictAtom[];
  edgesEliminated: ConflictEdgeDelta[]; edgesSurvivingDueToOtherCauses: ConflictEdgeDelta[];
  waveBounds: WaveBounds; waves: number[][]; waveContext: WaveContext[];
  generatedWaveDepthReduction: number; interpretation: string;
}
export interface CausalAblationCause {
  id: "fee-payer-lock" | "program-buffer-whole-account-lock"; label: string;
  change: "remove-fee-payer-role" | "refine-to-verified-byte-ranges"; accountCount: number;
  affectedPairCount: number; removedAtomCount: number; edgesEliminatedCount: number;
  maskedSurvivingEdgeCount: number; evidence: string[];
}
export type InteractionClassification =
  | "same-pair-masking-plus-joint-only-depth-reduction"
  | "separate-bottleneck-joint-only-depth-reduction"
  | "same-pair-cause-overlap-without-depth-reduction"
  | "supported-overlap-or-depth-effect-without-joint-only-reduction"
  | "no-supported-interaction";
export interface CausalAblation {
  supported: boolean; causes: CausalAblationCause[]; models: CounterfactualModelResult[];
  supportedCauseUniverse: { exhaustiveWithinSupportedUniverse: true; causeIds: CausalAblationCause["id"][]; statement: string };
  presentCauseIds: CausalAblationCause["id"][];
  transformations: Array<{
    causeId: CausalAblationCause["id"]; applicable: boolean; removedAtomCount: number;
    affectedAccountCount: number; affectedPairCount: number; edgesEliminatedCount: number;
    maskedSurvivingEdgeCount: number;
  }>;
  minimalSupportedCauseSets: Array<{ causeIds: CausalAblationCause["id"][]; generatedWaveDepthReduction: number }>;
  interaction: {
    classification: InteractionClassification;
    presentationTitle: string;
    samePairCauseOverlapPresent: boolean; samePairCauseOverlapCount: number;
    jointOnlyDepthReductionPresent: boolean;
    payerOnlyDepthReduction: number; rangeOnlyDepthReduction: number; jointDepthReduction: number;
    currentConflictAtomCount: number; jointRemovedAtomCount: number; jointEdgesEliminatedCount: number;
    jointMaskedSurvivingEdgeCount: number; jointResidualConflictEdgeCount: number;
    explanation: string;
  };
  scopeDisclaimer: string;
}
export interface DecodedTransferEvidence {
  transactionStatus: NormalizedTransaction["status"]; parentInstructionIndex: number | null;
  transactionIndex: number; source: string; destination: string; lamports: number;
  hasAirdropLog: boolean; instructionIndex: number; location: "outer" | "inner";
}
export interface ProgramBufferWriteChunk extends Pick<NormalizedInstruction, "location" | "parentInstructionIndex" | "instructionIndex"> { transactionStatus: NormalizedTransaction["status"]; transactionIndex: number; offset: number; byteLength: number; finalCoveredByte: number }
export interface ProgramBufferWriteSequence {
  id: string; buffer: string; authority: string; chunks: ProgramBufferWriteChunk[];
  chunkCount: number; chunkSizeMode: "uniform" | "varying"; chunkSizes: number[];
  firstOffset: number; lastStartingOffset: number; finalCoveredByte: number; totalBytes: number;
}
export interface ProgramBufferWriteGroup {
  buffer: string; authority: string; chunks: ProgramBufferWriteChunk[]; sequences: ProgramBufferWriteSequence[];
  gaps: Array<{ afterOffset: number; beforeOffset: number; byteCount: number }>;
  overlaps: Array<{ firstOffset: number; secondOffset: number; byteCount: number }>;
}
export type FindingReason = "deepest serialization" | "largest unique-conflict-pair share" | "largest known-compute share" | "cross-payer component" | "potentially redesignable" | "program-buffer upload";
export interface NotableFinding { componentId: number; reasons: FindingReason[]; primaryReason: FindingReason; label: string }
export interface ComponentMeaning {
  componentId: number; transactionIndexes: number[]; edgeCount: number; transactionShare: number;
  uniqueConflictPairShare: number; knownComputeUnitShare: number | null; payerCount: number; samePayer: boolean;
  sharedConflictAccounts: string[]; cliqueLowerBound: number; cliqueBoundIsExact: boolean; waveBounds: WaveBounds;
  estimatedWaveContext: WaveContext[];
  isContentionFinding: boolean; cause: EvidenceConclusion<Cause>; actorPattern: EvidenceConclusion<ActorPattern>;
  actionability: EvidenceConclusion<Actionability>; decodedTransfers: DecodedTransferEvidence[];
  programBufferSequenceIds: string[]; knownComputeUnitCount: number; unknownComputeUnitCount: number;
  explanation: string; counterfactualModels: CounterfactualModelResult[]; causalAblation: CausalAblation;
}

export interface Analysis {
  methodology: {
    conflictRule: string; waveHeuristic: string; scheduleDisclaimer: string;
    feePayerCounterfactualDisclaimer: string; semanticCounterfactualDisclaimer: string; source: "fixture" | "rpc";
  };
  provenance: FixtureProvenance;
  context: { slot: number; blockhash: string; previousBlockhash: string; parentSlot: number; blockTime: number | null; blockHeight: number | null };
  summary: {
    transactionCount: number; successCount: number; failureCount: number; unknownStatusCount: number;
    conflictEdgeCount: number; feePayerOnlyConflictEdgeCount: number; samePayerSharedAccountConflictEdgeCount: number;
    crossPayerSharedAccountConflictEdgeCount: number; componentCount: number;
    dominantComponentTransactionShare: number; dominantComponentEdgeShare: number;
    largestPairwiseConflictGroupLowerBound: number; largestPairwiseConflictBoundIsExact: boolean;
    waveCount: number; feePayerExcludedAnalyticalWaveCount: number; dominantComponentExcludedWaveCount: number;
    maximumWaveWidth: number; knownComputeUnitTransactionCount: number; unknownComputeUnitTransactionCount: number;
    knownComputeUnitCoverage: number; totalKnownComputeUnits: number;
  };
  transactions: NormalizedTransaction[]; conflictEdges: ConflictEdge[]; contentionSignatures: ContentionSignature[];
  explanations: string[];
  components: ConflictComponent[]; componentMeanings: ComponentMeaning[]; dominantComponent: ComponentMeaning | null;
  notableFindings: NotableFinding[]; programBufferWriteGroups: ProgramBufferWriteGroup[];
  blockWaveBounds: WaveBounds; feePayerExcludedWaveBounds: WaveBounds; dominantComponentExcludedWaveBounds: WaveBounds;
  counterfactualModels: CounterfactualModelResult[];
  waves: number[][]; waveContext: WaveContext[]; feePayerExcludedAnalyticalWaves: number[][]; dominantComponentExcludedWaves: number[][];
  accounts: AccountStat[]; hotWritableAccounts: AccountStat[];
}
