import { createHash } from "node:crypto";
import { knownAccountLabel, isKnownSysvar } from "./known.js";
import type { DiscoveryCandidate, InfrastructureClassification } from "./discovery-types.js";
import type { Analysis, ComponentMeaning } from "./types.js";

const LOADER_IDS = new Set([
  "BPFLoaderUpgradeab1e11111111111111111111111",
  "BPFLoader2111111111111111111111111111111111",
  "LoaderV411111111111111111111111111111111111",
]);
const VOTE_ID = "Vote111111111111111111111111111111111111111";

const unique = <T>(values: T[]): T[] => [...new Set(values)];
const sorted = (values: string[]): string[] => unique(values).sort();
const slash = (value: string): string => value.replaceAll("\\", "/");

export function deterministicCandidateId(cluster: string, identity: string): string {
  const digest = createHash("sha256").update(JSON.stringify({ cluster, identity })).digest("hex").slice(0, 16);
  return `candidate-${digest}`;
}

function infrastructureFor(
  meaning: ComponentMeaning,
  programs: string[],
  nonFeeAccounts: string[],
  feePayers: Set<string>,
  componentEdgeClasses: string[],
): InfrastructureClassification | null {
  if (meaning.cause.value === "vote account" || programs.includes(VOTE_ID)) return "vote-activity";
  if (meaning.cause.value === "program-buffer writes" || programs.some((program) => LOADER_IDS.has(program))) return "loader-deployment";
  if (meaning.cause.value === "transfer/funding source") return "system-funding";
  const onlyFeePayers = meaning.sharedConflictAccounts.length > 0 && meaning.sharedConflictAccounts.every((account) => feePayers.has(account));
  if (onlyFeePayers || (componentEdgeClasses.length > 0 && componentEdgeClasses.every((value) => value === "fee-payer-only"))) return "fee-payer-only";
  if (meaning.cause.value === "repeated fee payer" || (meaning.samePayer && nonFeeAccounts.length === 0)) return "pure-same-payer-repetition";
  if (nonFeeAccounts.length > 0 && nonFeeAccounts.every((account) => isKnownSysvar(account) || knownAccountLabel(account) !== null)) return "known-program-or-sysvar";
  return null;
}

export function compactCandidatesForAnalysis(analysis: Analysis, cluster: string, sourceCachePath: string): DiscoveryCandidate[] {
  const candidates: DiscoveryCandidate[] = [];
  for (const meaning of analysis.componentMeanings.filter((item) => item.isContentionFinding)) {
    const indexes = new Set(meaning.transactionIndexes);
    const transactions = meaning.transactionIndexes.map((index) => analysis.transactions[index]!).filter(Boolean);
    const feePayers = new Set(transactions.map((transaction) => transaction.feePayer));
    const componentEdges = analysis.conflictEdges.filter((edge) => indexes.has(edge.source) && indexes.has(edge.target));
    const nonFeeAccounts = meaning.sharedConflictAccounts.filter((account) => !feePayers.has(account)).sort();
    const invokedProgramIds = sorted(transactions.flatMap((transaction) => transaction.invokedProgramIds));
    const decodedAccountRoles = sorted(transactions.flatMap((transaction) => transaction.accounts)
      .filter((account) => meaning.sharedConflictAccounts.includes(account.pubkey))
      .flatMap((account) => account.roles.map((role) => role.role)));
    const identityAccounts = nonFeeAccounts.length > 0 ? nonFeeAccounts : meaning.sharedConflictAccounts;
    const identity = identityAccounts.length > 0
      ? { kind: "account-set" as const, value: identityAccounts.join("+") }
      : { kind: "component" as const, value: `slot-${analysis.context.slot}-component-${meaning.componentId}` };
    const payer = meaning.causalAblation.transformations.find((transformation) => transformation.causeId === "fee-payer-lock");
    const infrastructureClassification = infrastructureFor(meaning, invokedProgramIds, nonFeeAccounts, feePayers, componentEdges.map((edge) => edge.classification));
    candidates.push({
      candidateId: deterministicCandidateId(cluster, `${identity.kind}:${identity.value}`),
      cluster,
      observedSlots: [analysis.context.slot],
      identity,
      representativeSlot: analysis.context.slot,
      componentId: meaning.componentId,
      transactionCount: transactions.length,
      uniqueConflictPairCount: meaning.edgeCount,
      conflictAtomCount: componentEdges.reduce((sum, edge) => sum + edge.accounts.length, 0),
      distinctFeePayerCount: meaning.payerCount,
      samePayerParticipation: meaning.samePayer,
      crossPayerParticipation: !meaning.samePayer,
      nonFeePayerSharedWritableAccounts: nonFeeAccounts,
      invokedProgramIds,
      decodedAccountRoles,
      componentWaveLowerBound: meaning.waveBounds.cliqueLowerBound,
      componentWaveUpperBound: meaning.waveBounds.generatedWaveUpperBound,
      provenMinimumWaveCount: meaning.waveBounds.provenMinimumWaveCount,
      componentTransactionShare: meaning.transactionShare,
      uniqueConflictPairShare: meaning.uniqueConflictPairShare,
      knownComputeUnitShare: meaning.knownComputeUnitShare,
      knownComputeCoverage: transactions.length === 0 ? 0 : meaning.knownComputeUnitCount / transactions.length,
      payerAblationAtomsRemoved: payer?.removedAtomCount ?? 0,
      payerAblationEdgesEliminated: payer?.edgesEliminatedCount ?? 0,
      payerAblationEdgesMaskedByOtherAccounts: payer?.maskedSurvivingEdgeCount ?? 0,
      samePairCauseOverlapCount: meaning.causalAblation.interaction.samePairCauseOverlapCount,
      cause: meaning.cause.value,
      actorPattern: meaning.actorPattern.value,
      recurrenceBlockCount: 1,
      selectionReasons: [],
      priorityTier: 3,
      infrastructureClassification,
      confidence: meaning.cause.confidence,
      evidenceReferences: [`slot-${analysis.context.slot}#component-${meaning.componentId}`],
      sourceCachePaths: [slash(sourceCachePath)],
      materialization: null,
    });
  }
  return candidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
}

function representativeWins(candidate: DiscoveryCandidate, current: DiscoveryCandidate): boolean {
  const candidateDepth = candidate.provenMinimumWaveCount ?? candidate.componentWaveUpperBound;
  const currentDepth = current.provenMinimumWaveCount ?? current.componentWaveUpperBound;
  return candidateDepth > currentDepth
    || (candidateDepth === currentDepth && candidate.uniqueConflictPairCount > current.uniqueConflictPairCount)
    || (candidateDepth === currentDepth && candidate.uniqueConflictPairCount === current.uniqueConflictPairCount && candidate.representativeSlot < current.representativeSlot);
}

export function aggregateCandidates(records: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const map = new Map<string, DiscoveryCandidate>();
  for (const record of records) {
    const existing = map.get(record.candidateId);
    if (!existing) { map.set(record.candidateId, structuredClone(record)); continue; }
    const selected = representativeWins(record, existing) ? structuredClone(record) : existing;
    selected.observedSlots = unique([...existing.observedSlots, ...record.observedSlots]).sort((a, b) => a - b);
    selected.recurrenceBlockCount = selected.observedSlots.length;
    selected.evidenceReferences = sorted([...existing.evidenceReferences, ...record.evidenceReferences]);
    selected.sourceCachePaths = sorted([...existing.sourceCachePaths, ...record.sourceCachePaths]);
    map.set(record.candidateId, selected);
  }
  return [...map.values()];
}

function reasonsFor(candidate: DiscoveryCandidate): string[] {
  const reasons: string[] = [];
  const unknownRole = candidate.decodedAccountRoles.length === 0 || candidate.cause === "unknown";
  if (candidate.crossPayerParticipation && candidate.nonFeePayerSharedWritableAccounts.length > 0) reasons.push("cross-payer non-fee-payer shared writable contention");
  if (candidate.recurrenceBlockCount > 1) reasons.push(`recurs across ${candidate.recurrenceBlockCount} observed blocks`);
  if (candidate.distinctFeePayerCount >= 3) reasons.push(`${candidate.distinctFeePayerCount} distinct fee payers`);
  if (candidate.knownComputeUnitShare !== null && candidate.knownComputeCoverage >= 0.5 && candidate.knownComputeUnitShare >= 0.25) reasons.push("high qualified known-compute share");
  if (candidate.knownComputeUnitShare !== null && candidate.knownComputeCoverage < 1) reasons.push(`known-compute context qualified by ${(candidate.knownComputeCoverage * 100).toFixed(1)}% component coverage`);
  if ((candidate.provenMinimumWaveCount ?? candidate.componentWaveUpperBound) >= 5) reasons.push(candidate.provenMinimumWaveCount === null ? "deep estimated serial component" : "deep proven serial component");
  if (candidate.payerAblationAtomsRemoved > 0 && candidate.payerAblationEdgesMaskedByOtherAccounts > 0 && unknownRole) reasons.push("payer-role atoms removed while an unknown non-payer cause masks edges");
  if (candidate.decodedAccountRoles.some((role) => /state/i.test(role) && !/buffer/i.test(role))) reasons.push("decoded application-state role");
  if (unknownRole && candidate.infrastructureClassification === null && candidate.nonFeePayerSharedWritableAccounts.length > 0) reasons.push("unknown shared-account role involving non-infrastructure programs");
  if (candidate.invokedProgramIds.length > 1) reasons.push("multiple invoked programs");
  if (candidate.samePairCauseOverlapCount > 0) reasons.push("several account causes occur on the same transaction pairs");
  if (!["unknown", "program-buffer writes", "transfer/funding source", "vote account", "repeated fee payer"].includes(candidate.cause)) reasons.push(`unusual decoded cause: ${candidate.cause}`);
  return reasons;
}

function tierFor(candidate: DiscoveryCandidate): 1 | 2 | 3 {
  if (candidate.infrastructureClassification !== null) return 3;
  const unfamiliar = candidate.cause === "unknown" || candidate.decodedAccountRoles.some((role) => /state/i.test(role));
  if (candidate.crossPayerParticipation && candidate.nonFeePayerSharedWritableAccounts.length > 0 && (unfamiliar || candidate.recurrenceBlockCount > 1 || candidate.distinctFeePayerCount >= 3)) return 1;
  if (candidate.crossPayerParticipation || candidate.recurrenceBlockCount > 1 || candidate.payerAblationEdgesMaskedByOtherAccounts > 0 || (candidate.provenMinimumWaveCount ?? candidate.componentWaveUpperBound) >= 5) return 2;
  return 3;
}

export function compareRankedCandidates(left: DiscoveryCandidate, right: DiscoveryCandidate): number {
  const leftInfra = left.infrastructureClassification === null ? 0 : 1, rightInfra = right.infrastructureClassification === null ? 0 : 1;
  const leftQualifiedCompute = left.knownComputeCoverage >= 0.5 ? left.knownComputeUnitShare ?? -1 : -1;
  const rightQualifiedCompute = right.knownComputeCoverage >= 0.5 ? right.knownComputeUnitShare ?? -1 : -1;
  return leftInfra - rightInfra
    || left.priorityTier - right.priorityTier
    || right.recurrenceBlockCount - left.recurrenceBlockCount
    || Number(right.crossPayerParticipation) - Number(left.crossPayerParticipation)
    || right.distinctFeePayerCount - left.distinctFeePayerCount
    || rightQualifiedCompute - leftQualifiedCompute
    || (right.provenMinimumWaveCount ?? right.componentWaveUpperBound) - (left.provenMinimumWaveCount ?? left.componentWaveUpperBound)
    || right.uniqueConflictPairCount - left.uniqueConflictPairCount
    || right.transactionCount - left.transactionCount
    || left.representativeSlot - right.representativeSlot
    || left.candidateId.localeCompare(right.candidateId);
}

export function rankCandidates(records: DiscoveryCandidate[]): DiscoveryCandidate[] {
  return aggregateCandidates(records).map((candidate) => ({
    ...candidate,
    recurrenceBlockCount: candidate.observedSlots.length,
    selectionReasons: reasonsFor(candidate),
    priorityTier: tierFor(candidate),
  })).sort(compareRankedCandidates);
}
