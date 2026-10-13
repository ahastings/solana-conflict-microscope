import { uploadIdentity } from './upload-identity.js';
import { rangeParentLinks } from './range-parent-links.js';
import { countOffsetInversions } from './offset-order.js';
import { sumComputeUnits } from "./compute.js";
import { inspectUploadWrite } from "./upload-payload.js";
import { createHash } from "node:crypto";
import { scheduleWaves } from "./analyze.js";
import type { AcquiredRange } from "./range-input.js";
import type { RangeInstructionPosition, AlignmentHypothesis, ByteRange, CrossBlockPerBlockMetrics, CrossBlockSequence, CrossBlockWriteChunk, LoaderLifecycleEvent, RangeAnalysis, RangeSlotRecord, RecurringContentionEntry } from "./range-types.js";
import type { Analysis, ComponentMeaning, WaveBounds } from "./types.js";

const LOADER_ID = "BPFLoaderUpgradeab1e11111111111111111111111";
const lifecyclePattern = /initialize|deploy|upgrade|close|set.?authority|extend/i;
type PositionedEvidence = RangeInstructionPosition & { slot: number; transactionIndex: number };
// Inner indexes are local to their parent. Preserve recorded invocation order;
// this is not a reconstruction of validator execution timing.
const outerPosition = (item: PositionedEvidence): number => item.location === "inner" ? item.parentInstructionIndex! : item.instructionIndex;
const chronological = (a: PositionedEvidence, b: PositionedEvidence): number => a.slot - b.slot || a.transactionIndex - b.transactionIndex || outerPosition(a) - outerPosition(b) || Number(a.location === "inner") - Number(b.location === "inner") || a.instructionIndex - b.instructionIndex;
const after = (a: PositionedEvidence, b: PositionedEvidence): boolean => chronological(a, b) > 0;
const atOrBefore = (a: PositionedEvidence, b: PositionedEvidence): boolean => chronological(a, b) <= 0;
const byteRange = (firstByte: number, lastByte: number): ByteRange => ({ firstByte, lastByte, byteCount: lastByte - firstByte + 1 });
const emptyBounds = (): WaveBounds => ({ cliqueLowerBound: 0, generatedWaveUpperBound: 0, boundsMatch: true, provenMinimumWaveCount: 0, lowerBoundEvidence: "No component transactions were identified.", upperBoundEvidence: "No component transactions were identified." });

function stringsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") out.add(value);
  else if (Array.isArray(value)) value.forEach((item) => stringsIn(item, out));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => stringsIn(item, out));
  return out;
}

function extractEvidence(records: RangeSlotRecord[]): { chunks: CrossBlockWriteChunk[]; events: LoaderLifecycleEvent[] } {
  const chunks: CrossBlockWriteChunk[] = [], events: LoaderLifecycleEvent[] = [];
  for (const record of records) {
    const analysis = record.analysis; if (!analysis) continue;
    for (const tx of analysis.transactions) for (const ix of tx.instructions) {
      if (ix.programId !== LOADER_ID) continue;
      if (ix.parsedType === "write") {
        const evidence = inspectUploadWrite(ix.parsedInfo);
        if (!evidence.valid) continue;
        const { account: buffer, authority, offset, byteLength, payload, finalCoveredByte } = evidence;
        chunks.push({ transactionStatus: tx.status, slot: record.slot, blockTime: analysis.context.blockTime, transactionIndex: tx.index, instructionIndex: ix.instructionIndex, location: ix.location, parentInstructionIndex: ix.parentInstructionIndex, offset, byteLength, finalCoveredByte, payloadSha256: createHash("sha256").update(payload).digest("hex"), buffer, authority });
      } else if (ix.parsedType && lifecyclePattern.test(ix.parsedType)) {
        const accounts = [...new Set([...ix.accountAddresses, ...stringsIn(ix.parsedInfo)])].sort();
        events.push({ transactionStatus: tx.status, slot: record.slot, transactionIndex: tx.index, instructionIndex: ix.instructionIndex, location: ix.location, parentInstructionIndex: ix.parentInstructionIndex, type: ix.parsedType, accounts, evidence: `RPC-decoded BPF Upgradeable Loader ${ix.parsedType} instruction.` });
      }
    }
  }
  return { chunks: chunks.sort(chronological), events: events.sort(chronological) };
}

function semanticTitle(component: ComponentMeaning | undefined, chunkCount: number): string {
  const count = component?.transactionIndexes.length ?? chunkCount;
  if (component?.cause.value === "program-buffer writes" || chunkCount > 0) return `${count}-transaction program-buffer upload`;
  if (component?.cause.value === "transfer/funding source") return `${count}-transaction shared funding-source finding`;
  if (component?.cause.value === "application state") return `${count}-transaction application-state contention`;
  return `${count}-transaction contention finding`;
}

function perBlockMetrics(run: CrossBlockWriteChunk[], records: RangeSlotRecord[]): CrossBlockPerBlockMetrics[] {
  const result: CrossBlockPerBlockMetrics[] = [];
  for (const slot of [...new Set(run.map((chunk) => chunk.slot))].sort((a, b) => a - b)) {
    const record = records.find((item) => item.slot === slot), analysis = record?.analysis; if (!analysis) continue;
    const chunks = run.filter((chunk) => chunk.slot === slot), ordering = orderingEvidence(chunks), indexes = new Set(chunks.map((chunk) => chunk.transactionIndex));
    const component = analysis.componentMeanings.find((meaning) => meaning.transactionIndexes.some((index) => indexes.has(index)) && meaning.sharedConflictAccounts.includes(chunks[0]!.buffer))
      ?? analysis.componentMeanings.find((meaning) => meaning.transactionIndexes.some((index) => indexes.has(index)));
    const componentIndexes = new Set(component?.transactionIndexes ?? [...indexes]);
    const relevantTxs = analysis.transactions.filter((tx) => indexes.has(tx.index));
    const knownValues = relevantTxs.map((tx) => tx.computeUnitsConsumed).filter((value): value is number => value !== null);
    const remaining = analysis.transactions.filter((tx) => !componentIndexes.has(tx.index)), remainingDepth = scheduleWaves(remaining).length;
    const model = (id: Analysis["counterfactualModels"][number]["model"]): Analysis["counterfactualModels"][number] => analysis.counterfactualModels.find((item) => item.model === id)!;
result.push({ slot, chunkCount: chunks.length, conflictPairContribution: component?.edgeCount ?? 0, knownComputeUnits: sumComputeUnits(knownValues), knownComputeTransactionCount: knownValues.length, unknownComputeTransactionCount: relevantTxs.length - knownValues.length, componentWaveBounds: component?.waveBounds ?? emptyBounds(), fullBlockWaveBounds: analysis.blockWaveBounds, depthAfterExcludingUploadComponent: remainingDepth, fullBlockDepthDifference: analysis.blockWaveBounds.generatedWaveUpperBound - remainingDepth, actualProvenMinimumDepth: analysis.blockWaveBounds.provenMinimumWaveCount, feePayerDecoupledWaveBounds: model("fee-payer-decoupled").waveBounds, rangeAwareBufferWaveBounds: model("semantic-range-refinement").waveBounds, jointCounterfactualWaveBounds: model("joint-fee-payer-and-range").waveBounds, uploadStillDeterminesBlockDepth: (component?.waveBounds.generatedWaveUpperBound ?? 0) === analysis.blockWaveBounds.generatedWaveUpperBound, counterfactualModels: analysis.counterfactualModels, componentCounterfactualModels: component?.counterfactualModels ?? [], componentCausalAblation: component?.causalAblation ?? null, byteCoverageContiguous: ordering.byteCoverageContiguous, blockOrderOffsetsMonotonic: ordering.blockOrderOffsetsMonotonic, blockOrderOffsetInversionCount: ordering.blockOrderOffsetInversionCount, chronologicalOffsetsMonotonic: ordering.blockOrderOffsetsMonotonic, chronologicalOffsetInversionCount: ordering.blockOrderOffsetInversionCount, offsetSortedChunkIndexes: ordering.offsetSortedChunkIndexes.map(({ transactionIndex, instructionIndex, location, parentInstructionIndex, offset }) => ({ transactionIndex, instructionIndex, location, parentInstructionIndex, offset })), transactionOrderedChunkIndexes: ordering.transactionOrderedChunkIndexes.map(({ transactionIndex, instructionIndex, location, parentInstructionIndex, offset }) => ({ transactionIndex, instructionIndex, location, parentInstructionIndex, offset })), findingTitle: semanticTitle(component, chunks.length), componentId: component?.componentId ?? -1 });
  }
  return result;
}

function partitionLifecycle(chunks: CrossBlockWriteChunk[], events: LoaderLifecycleEvent[]): Array<{ chunks: CrossBlockWriteChunk[]; events: LoaderLifecycleEvent[] }> {
  const ordered = [...chunks].sort(chronological), runs: CrossBlockWriteChunk[][] = [];
  for (const chunk of ordered) {
    const previous = runs.at(-1)?.at(-1);
    const hasBoundary = previous ? events.some((event) => event.transactionStatus !== "failed" && after(event, previous) && atOrBefore(event, chunk)) : false;
    if (!previous || hasBoundary) runs.push([chunk]); else runs.at(-1)!.push(chunk);
  }
  return runs.map((items, index) => {
    const end = items.at(-1)!, previousEnd = index > 0 ? runs[index - 1]!.at(-1)! : null;
    return { chunks: items, events: events.filter((event) => (!previousEnd || after(event, previousEnd)) && atOrBefore(event, end)) };
  });
}

function analyzeBytes(chunks: CrossBlockWriteChunk[]): { ranges: ByteRange[]; gaps: ByteRange[]; duplicates: CrossBlockSequence["duplicates"]; overlaps: CrossBlockSequence["overlaps"] } {
  const sorted = [...chunks].sort((a, b) => a.offset - b.offset || chronological(a, b)), duplicates: CrossBlockSequence["duplicates"] = [], unique: CrossBlockWriteChunk[] = [], seen = new Map<string, CrossBlockWriteChunk>();
  for (const chunk of sorted) {
    const key = `${chunk.offset}:${chunk.byteLength}:${chunk.payloadSha256}`, original = seen.get(key);
    if (original) duplicates.push({ original, duplicate: chunk }); else { seen.set(key, chunk); unique.push(chunk); }
  }
  const ranges: ByteRange[] = [], gaps: ByteRange[] = [], overlaps: CrossBlockSequence["overlaps"] = [];
  let active: CrossBlockWriteChunk[] = [];
  for (const chunk of unique) {
    active = active.filter(earlier => earlier.finalCoveredByte >= chunk.offset);
    for (const earlier of active) overlaps.push({ earlier, later: chunk, overlap: byteRange(chunk.offset, Math.min(earlier.finalCoveredByte, chunk.finalCoveredByte)) });
    active.push(chunk);
    const range = ranges.at(-1);
    if (!range) ranges.push(byteRange(chunk.offset, chunk.finalCoveredByte));
    else if (chunk.offset > range.lastByte + 1) {
      gaps.push(byteRange(range.lastByte + 1, chunk.offset - 1));
      ranges.push(byteRange(chunk.offset, chunk.finalCoveredByte));
    } else if (chunk.finalCoveredByte > range.lastByte) {
      range.lastByte = chunk.finalCoveredByte;
      range.byteCount = range.lastByte - range.firstByte + 1;
    }
  }
  return { ranges, gaps, duplicates, overlaps };
}

function orderingEvidence(chunks: CrossBlockWriteChunk[]): {
  byteCoverageContiguous: boolean; blockOrderOffsetsMonotonic: boolean;
  blockOrderOffsetInversionCount: number;
  chronologicalOffsetsMonotonic: boolean; chronologicalOffsetInversionCount: number;
  offsetSortedChunkIndexes: Array<RangeInstructionPosition & { slot: number; transactionIndex: number; offset: number }>;
  transactionOrderedChunkIndexes: Array<RangeInstructionPosition & { slot: number; transactionIndex: number; offset: number }>;
} {
  const transactionOrdered = [...chunks].sort(chronological);
  const offsetSorted = [...chunks].sort((a, b) => a.offset - b.offset || chronological(a, b));
  const inversions = countOffsetInversions(transactionOrdered.map(chunk => chunk.offset));
  const index = (chunk: CrossBlockWriteChunk) => ({
    slot: chunk.slot, transactionIndex: chunk.transactionIndex,
    instructionIndex: chunk.instructionIndex, location: chunk.location, parentInstructionIndex: chunk.parentInstructionIndex, offset: chunk.offset,
  });
  return {
    byteCoverageContiguous: analyzeBytes(chunks).gaps.length === 0,
    blockOrderOffsetsMonotonic: inversions === 0,
    blockOrderOffsetInversionCount: inversions,
    chronologicalOffsetsMonotonic: inversions === 0,
    chronologicalOffsetInversionCount: inversions,
    offsetSortedChunkIndexes: offsetSorted.map(index),
    transactionOrderedChunkIndexes: transactionOrdered.map(index),
  };
}

function hypotheses(gaps: ByteRange[], chunks: CrossBlockWriteChunk[]): AlignmentHypothesis[] {
  const counts = new Map<number, number>(); for (const chunk of chunks) counts.set(chunk.byteLength, (counts.get(chunk.byteLength) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0, uniform = counts.size === 1;
  return gaps.map((gap) => {
    const aligned = common > 0 && gap.byteCount % common === 0 && (gap.firstByte - chunks[0]!.offset) % common === 0;
    return { missingRange: gap, suggestedChunkCount: aligned ? gap.byteCount / common : null, confidence: aligned && uniform ? "high" : "low", evidence: aligned ? [`The missing range is exactly ${gap.byteCount / common} aligned chunks of ${common} bytes.`, "Those chunks are inferred from alignment only and are not observed evidence."] : ["The observed chunk geometry does not support an exact whole-chunk count.", "No missing write is treated as observed."] };
  });
}

function buildSequences(records: RangeSlotRecord[]): CrossBlockSequence[] {
  const { chunks, events } = extractEvidence(records), grouped = new Map<string, CrossBlockWriteChunk[]>();
  for (const chunk of chunks) { const key = JSON.stringify([chunk.buffer, chunk.authority]), values = grouped.get(key) ?? []; values.push(chunk); grouped.set(key, values); }
  const authorities = new Map<string, Set<string>>(); for (const chunk of chunks) { const set = authorities.get(chunk.buffer) ?? new Set<string>(); set.add(chunk.authority); authorities.set(chunk.buffer, set); }
  const sequences: CrossBlockSequence[] = [];
  for (const values of grouped.values()) {
    const buffer = values[0]!.buffer, authority = values[0]!.authority, relevantEvents = events.filter((event) => event.accounts.includes(buffer));
    const partitions = partitionLifecycle(values, relevantEvents);
    for (const [lifecycleContext, run] of partitions.entries()) {
      const bytes = analyzeBytes(run.chunks), slots = [...new Set(run.chunks.map((chunk) => chunk.slot))].sort((a, b) => a - b), firstSlot = slots[0]!, lastSlot = slots.at(-1)!;
      const missingSlotData = records.filter((record) => record.slot >= firstSlot && record.slot <= lastSlot && record.status !== "observed").map((record) => ({ slot: record.slot, status: record.status as Exclude<typeof record.status, "observed"> }));
      const chunkSizes = [...new Set(run.chunks.map((chunk) => chunk.byteLength))].sort((a, b) => a - b), contiguous = bytes.gaps.length === 0;
      const clean = contiguous && bytes.duplicates.length === 0 && bytes.overlaps.length === 0 && missingSlotData.length === 0;
      const status = clean ? "fully-observed-contiguous" : bytes.gaps.length ? "observed-segments-with-gaps" : "observed-with-overlap-or-duplicates";
      const firstChunk = run.chunks[0]!, lastChunk = run.chunks.at(-1)!, previousEnd = lifecycleContext > 0 ? partitions[lifecycleContext - 1]!.chunks.at(-1)! : null, nextStart = lifecycleContext + 1 < partitions.length ? partitions[lifecycleContext + 1]!.chunks[0]! : null;
      const contextEvents = relevantEvents.filter((event) => (!previousEnd || after(event, previousEnd)) && (!nextStart || chronological(event, nextStart) < 0));
      const startObserved = contextEvents.some((event) => event.transactionStatus === "success" && /initializebuffer/i.test(event.type) && atOrBefore(event, firstChunk));
      const endObserved = contextEvents.some((event) => event.transactionStatus === "success" && /deploy|upgrade|close/i.test(event.type) && after(event, lastChunk));
      const lifecycleCompleteness = startObserved && endObserved ? "complete" : startObserved ? "start-observed-end-unknown" : endObserved ? "start-unknown-end-observed" : "boundaries-unknown";
      const commonSize = chunkSizes.length === 1 ? chunkSizes[0]! : 0, firstOffset = Math.min(...run.chunks.map((chunk) => chunk.offset)), lastStartingOffset = Math.max(...run.chunks.map((chunk) => chunk.offset));
      const aligned = commonSize > 0 && run.chunks.every((chunk) => chunk.offset % commonSize === 0);
      const firstAlignedChunkIndex = aligned ? firstOffset / commonSize : null, lastAlignedChunkIndex = aligned ? lastStartingOffset / commonSize : null;
      const rangeCoverageComplete = records.every((record) => record.status === "observed");
      const observedBytes = run.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0), lifecycleSentence = startObserved && endObserved ? "Both decoded upload lifecycle boundaries are observed." : "The complete upload lifecycle boundaries are not established.";
      const plainLanguageFinding = clean
        ? `Contiguous byte coverage after sorting by offset. ${lifecycleSentence} ${run.chunks.length} decoded writes across ${slots.length} observed blocks cover ${observedBytes.toLocaleString("en-US")} bytes.`
        : `${run.chunks.length} decoded program-buffer writes form ${bytes.ranges.length} observed byte segment(s). Exact gaps, overlaps, duplicates, missing slot data, and alignment hypotheses are reported separately; inferred chunks are never counted as observed. ${lifecycleSentence}`;
      const ordering = orderingEvidence(run.chunks), perBlock = perBlockMetrics(run.chunks, records), bufferAuthorities = [...(authorities.get(buffer) ?? new Set<string>())].sort();
      sequences.push({ id: `${uploadIdentity(buffer,authority)}:lifecycle-${lifecycleContext}`, buffer, authority, lifecycleContext, authorityChangesDetected: bufferAuthorities.length > 1, authoritiesObservedForBuffer: bufferAuthorities, status, plainLanguageFinding, firstObservedSlot: firstSlot, lastObservedSlot: lastSlot, rangeCoverageComplete, uploadStartBoundaryObserved: startObserved, uploadEndBoundaryObserved: endObserved, lifecycleCompleteness, firstAlignedChunkIndex, lastAlignedChunkIndex, firstBlockTime: records.find((r) => r.slot === firstSlot)?.analysis?.context.blockTime ?? null, lastBlockTime: records.find((r) => r.slot === lastSlot)?.analysis?.context.blockTime ?? null, observedBlockCount: slots.length, unavailableOrSkippedSlotCount: missingSlotData.filter((item) => item.status === "unavailable" || item.status === "skipped").length, missingSlotData, observedChunkCount: run.chunks.length, observedByteCount: observedBytes, firstOffset, lastCoveredByte: Math.max(...run.chunks.map((chunk) => chunk.finalCoveredByte)), contiguousCoverage: contiguous, ...ordering, observedCoveredByteRanges: bytes.ranges, missingByteRanges: bytes.gaps, duplicates: bytes.duplicates, overlaps: bytes.overlaps, changingChunkSizes: chunkSizes.length > 1, chunkSizes, chunks: [...run.chunks].sort(chronological), lifecycleEvents: contextEvents, hypotheses: hypotheses(bytes.gaps, [...run.chunks].sort((a, b) => a.offset - b.offset)), perBlock, aggregateTotals: { conflictPairContribution: perBlock.reduce((sum, item) => sum + item.conflictPairContribution, 0), knownComputeUnits: sumComputeUnits(perBlock.map(item => item.knownComputeUnits)) } });
    }
  }
  return sequences.sort((a, b) => a.firstObservedSlot - b.firstObservedSlot || a.firstOffset - b.firstOffset || a.buffer.localeCompare(b.buffer) || a.authority.localeCompare(b.authority));
}

function recurringIndex(records: RangeSlotRecord[]): RecurringContentionEntry[] {
  const map = new Map<string, { label: string | null; blocks: Set<number>; payers: Set<string>; crossPairs: number; programs: Set<string>; roles: Set<string>; footprints: Set<string> }>();
  for (const record of records) {
    const analysis = record.analysis; if (!analysis) continue;
    for (const stat of analysis.accounts.filter((account) => account.writerCount > 0 && account.uniquePairCoverage > 0)) {
      const item = map.get(stat.account) ?? { label: stat.label, blocks: new Set<number>(), payers: new Set<string>(), crossPairs: 0, programs: new Set<string>(), roles: new Set<string>(), footprints: new Set<string>() };
      item.blocks.add(record.slot);
      const relevantTxs = analysis.transactions.filter((tx) => tx.accounts.some((account) => account.pubkey === stat.account));
      relevantTxs.forEach((tx) => { item.payers.add(tx.feePayer); tx.invokedProgramIds.forEach((program) => item.programs.add(program)); tx.accounts.find((account) => account.pubkey === stat.account)?.roles.forEach((role) => item.roles.add(role.role)); tx.instructions.flatMap((instruction) => instruction.semanticFootprints ?? []).filter((footprint) => footprint.account === stat.account).forEach((footprint) => item.footprints.add(footprint.operationType)); });
      item.crossPairs += analysis.conflictEdges.filter((edge) => edge.classification === "cross-payer-shared-account" && edge.accounts.includes(stat.account)).length;
      map.set(stat.account, item);
    }
  }
  return [...map].filter(([, item]) => item.blocks.size > 1).map(([account, item]) => ({ account, label: item.label, observedBlocks: [...item.blocks].sort((a, b) => a - b), distinctFeePayers: [...item.payers].sort(), totalCrossPayerConflictPairs: item.crossPairs, associatedInvokedPrograms: [...item.programs].sort(), decodedAccountRoles: [...item.roles].sort(), semanticFootprintOperationTypes: [...item.footprints].sort() })).sort((a, b) => b.observedBlocks.length - a.observedBlocks.length || b.totalCrossPayerConflictPairs - a.totalCrossPayerConflictPairs || a.account.localeCompare(b.account));
}

export function analyzeRange(acquired: AcquiredRange): RangeAnalysis {
  return { schemaVersion: "1.7.3", methodology: { scope: "Bounded read-only analysis of declared account contention and decoded evidence across observed blocks.", observedEvidenceRule: "Observed chunks are decoded write payloads in observed blocks, including failed or unknown transactions. Byte coverage does not establish final buffer contents. Lifecycle boundaries require successful transactions; unknown lifecycle events conservatively separate runs. Missing slots and alignment hypotheses remain separate.", scheduleDisclaimer: "Per-block wave bounds describe declared account compatibility, not a validator's exact private schedule.", percentageRule: "Conflict-pair shares retain per-block denominators. Aggregate totals are sums of counts, never sums of percentages.", alignmentRule: "Aligned chunk indexes are arithmetic positions relative to byte zero for the observed uniform chunk size; they are not protocol-level upload sequence numbers and do not establish lifecycle boundaries.", orderingRule: "Contiguous byte coverage is determined after sorting by offset. Instruction order retains outer positions and inner indexes within each parent. Transaction order is descriptive block order only, not arrival order, scheduler order, or runtime parallelism.", semanticCounterfactualDisclaimer: "Semantic counterfactuals describe hypothetical finer-grained execution rules. They are not supported by current Solana account locking and do not represent validator scheduling." }, provenance: acquired.provenance, slots: acquired.slots, parentLinks: rangeParentLinks(acquired.slots), crossBlockSequences: buildSequences(acquired.slots), recurringContentionIndex: recurringIndex(acquired.slots) };
}
