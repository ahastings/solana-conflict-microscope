import type { rangeParentLinks } from './range-parent-links.js';
import type { Analysis, NormalizedInstruction, NormalizedTransaction, CausalAblation, Confidence, CounterfactualModelResult, FixtureProvenance, WaveBounds } from "./types.js";

export type SlotStatus = "observed" | "missing" | "skipped" | "unavailable" | "failed";
export type RangeSourceMode = "offline-cache" | "cache-only" | "cache+rpc" | "rpc";

export interface RangeSlotRecord {
  slot: number; status: SlotStatus; source: "cache" | "rpc" | "none"; attempts: number;
  cachePath: string | null; error: string | null; analysis: Analysis | null;
}

export type RangeInstructionPosition = Pick<NormalizedInstruction, "location" | "parentInstructionIndex" | "instructionIndex">;

export interface CrossBlockWriteChunk extends RangeInstructionPosition {
  transactionStatus: NormalizedTransaction["status"];
  slot: number; blockTime: number | null; transactionIndex: number; instructionIndex: number;
  offset: number; byteLength: number; finalCoveredByte: number; payloadSha256: string;
  buffer: string; authority: string;
}

export interface LoaderLifecycleEvent extends RangeInstructionPosition {
  transactionStatus: NormalizedTransaction["status"];
  slot: number; transactionIndex: number; instructionIndex: number; type: string;
  accounts: string[]; evidence: string;
}

export interface ByteRange { firstByte: number; lastByte: number; byteCount: number }
export interface DuplicateWrite { original: CrossBlockWriteChunk; duplicate: CrossBlockWriteChunk }
export interface OverlappingWrite { earlier: CrossBlockWriteChunk; later: CrossBlockWriteChunk; overlap: ByteRange }
export interface AlignmentHypothesis { missingRange: ByteRange; suggestedChunkCount: number | null; confidence: Confidence; evidence: string[] }

export interface CrossBlockPerBlockMetrics {
  slot: number; chunkCount: number; conflictPairContribution: number;
  knownComputeUnits: number; knownComputeTransactionCount: number; unknownComputeTransactionCount: number;
  componentWaveBounds: WaveBounds; fullBlockWaveBounds: WaveBounds;
  depthAfterExcludingUploadComponent: number; fullBlockDepthDifference: number;
  actualProvenMinimumDepth: number | null; feePayerDecoupledWaveBounds: WaveBounds;
  rangeAwareBufferWaveBounds: WaveBounds; jointCounterfactualWaveBounds: WaveBounds;
  uploadStillDeterminesBlockDepth: boolean;
  counterfactualModels: CounterfactualModelResult[]; componentCounterfactualModels: CounterfactualModelResult[];
  componentCausalAblation: CausalAblation | null;
  byteCoverageContiguous: boolean; blockOrderOffsetsMonotonic: boolean; blockOrderOffsetInversionCount: number;
  /** @deprecated 1.7.2 compatibility alias; use blockOrderOffsetsMonotonic. */ chronologicalOffsetsMonotonic: boolean;
  /** @deprecated 1.7.2 compatibility alias; use blockOrderOffsetInversionCount. */ chronologicalOffsetInversionCount: number;
  offsetSortedChunkIndexes: Array<RangeInstructionPosition & { transactionIndex: number; offset: number }>;
  transactionOrderedChunkIndexes: Array<RangeInstructionPosition & { transactionIndex: number; offset: number }>;
  findingTitle: string; componentId: number;
}

export interface CrossBlockSequence {
  id: string; buffer: string; authority: string; lifecycleContext: number;
  authorityChangesDetected: boolean; authoritiesObservedForBuffer: string[];
  status: "fully-observed-contiguous" | "observed-segments-with-gaps" | "observed-with-overlap-or-duplicates";
  plainLanguageFinding: string; firstObservedSlot: number; lastObservedSlot: number;
  rangeCoverageComplete: boolean; uploadStartBoundaryObserved: boolean; uploadEndBoundaryObserved: boolean;
  lifecycleCompleteness: "complete" | "start-observed-end-unknown" | "start-unknown-end-observed" | "boundaries-unknown";
  firstAlignedChunkIndex: number | null; lastAlignedChunkIndex: number | null;
  firstBlockTime: number | null; lastBlockTime: number | null; observedBlockCount: number;
  unavailableOrSkippedSlotCount: number; missingSlotData: Array<{ slot: number; status: Exclude<SlotStatus, "observed"> }>;
  observedChunkCount: number; observedByteCount: number; firstOffset: number; lastCoveredByte: number;
  contiguousCoverage: boolean; byteCoverageContiguous: boolean;
  blockOrderOffsetsMonotonic: boolean; blockOrderOffsetInversionCount: number;
  /** @deprecated 1.7.2 compatibility alias; use blockOrderOffsetsMonotonic. */ chronologicalOffsetsMonotonic: boolean;
  /** @deprecated 1.7.2 compatibility alias; use blockOrderOffsetInversionCount. */ chronologicalOffsetInversionCount: number;
  offsetSortedChunkIndexes: Array<RangeInstructionPosition & { slot: number; transactionIndex: number; offset: number }>;
  transactionOrderedChunkIndexes: Array<RangeInstructionPosition & { slot: number; transactionIndex: number; offset: number }>;
  observedCoveredByteRanges: ByteRange[]; missingByteRanges: ByteRange[];
  duplicates: DuplicateWrite[]; overlaps: OverlappingWrite[]; changingChunkSizes: boolean; chunkSizes: number[];
  chunks: CrossBlockWriteChunk[]; lifecycleEvents: LoaderLifecycleEvent[]; hypotheses: AlignmentHypothesis[];
  perBlock: CrossBlockPerBlockMetrics[];
  aggregateTotals: { conflictPairContribution: number; knownComputeUnits: number };
}

export interface RecurringContentionEntry {
  account: string; label: string | null; observedBlocks: number[]; distinctFeePayers: string[];
  totalCrossPayerConflictPairs: number; associatedInvokedPrograms: string[]; decodedAccountRoles: string[];
  semanticFootprintOperationTypes: string[];
}

export interface RangeProvenance {
  endpoint: string | null; cluster: string; requestedStartSlot: number; requestedEndSlot: number;
  observedSlots: number[]; missingSlots: number[]; unavailableSlots: number[]; failedSlots: number[]; skippedSlots: number[];
  retrievalTime: string | null; sourceMode: RangeSourceMode; sourceProvenance: FixtureProvenance[];
}

export interface RangeAnalysis {
  schemaVersion: "1.7.3"; methodology: {
    scope: string; observedEvidenceRule: string; scheduleDisclaimer: string; percentageRule: string;
    alignmentRule: string; orderingRule: string; semanticCounterfactualDisclaimer: string;
  };
  provenance: RangeProvenance; slots: RangeSlotRecord[]; crossBlockSequences: CrossBlockSequence[];
  recurringContentionIndex: RecurringContentionEntry[];
  parentLinks?: ReturnType<typeof rangeParentLinks>;
}
