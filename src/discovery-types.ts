import type { SlotStatus } from "./range-types.js";
import type { Confidence } from "./types.js";

export interface DiscoveryWindow { startSlot: number; endSlot: number }

export interface DiscoveryPlan {
  schemaVersion: "1.8";
  cluster: string;
  rpcUrl: string;
  /** Saved provenance omits connection details; online replay needs an explicit override. */
  rpcUrlRequiresOverride?: boolean;
  resolutionMode: "latest" | "explicit";
  resolvedAt: string;
  resolvedLatestSlot: number | null;
  windows: DiscoveryWindow[];
  requestedSlotCount: number;
  cacheDir: string;
  outputDir: string;
  options: {
    delayMs: number;
    concurrency: number;
    maxRetries: number;
    backoffMs: number;
    top: number;
    jsonBudgetBytes: number;
    htmlBudgetBytes: number;
    skippedSlots: number[];
  };
}

export interface DiscoverySlotRecord {
  slot: number;
  status: SlotStatus;
  source: "cache" | "rpc" | "none";
  attempts: number;
  cachePath: string | null;
  error: string | null;
}

export type InfrastructureClassification =
  | "vote-activity"
  | "loader-deployment"
  | "pure-same-payer-repetition"
  | "system-funding"
  | "known-program-or-sysvar"
  | "fee-payer-only";

export type CandidatePriorityTier = 1 | 2 | 3;

export interface DiscoveryCandidate {
  candidateId: string;
  cluster: string;
  observedSlots: number[];
  identity: { kind: "account-set" | "component"; value: string };
  representativeSlot: number;
  componentId: number;
  transactionCount: number;
  uniqueConflictPairCount: number;
  conflictAtomCount: number;
  distinctFeePayerCount: number;
  samePayerParticipation: boolean;
  crossPayerParticipation: boolean;
  nonFeePayerSharedWritableAccounts: string[];
  invokedProgramIds: string[];
  decodedAccountRoles: string[];
  componentWaveLowerBound: number;
  componentWaveUpperBound: number;
  provenMinimumWaveCount: number | null;
  componentTransactionShare: number;
  uniqueConflictPairShare: number;
  knownComputeUnitShare: number | null;
  knownComputeCoverage: number;
  payerAblationAtomsRemoved: number;
  payerAblationEdgesEliminated: number;
  payerAblationEdgesMaskedByOtherAccounts: number;
  samePairCauseOverlapCount: number;
  cause: string;
  actorPattern: string;
  recurrenceBlockCount: number;
  selectionReasons: string[];
  priorityTier: CandidatePriorityTier;
  infrastructureClassification: InfrastructureClassification | null;
  confidence: Confidence;
  evidenceReferences: string[];
  sourceCachePaths: string[];
  materialization: null | {
    rank: number;
    status: "materialized" | "missing-source" | "failed";
    analysisPath: string | null;
    reportPath: string | null;
    error: string | null;
  };
}

export interface DiscoveryCoverage {
  requested: number;
  observed: number;
  skipped: number;
  missing: number;
  unavailable: number;
  failed: number;
  retryAttempts: number;
  slots: DiscoverySlotRecord[];
}

export interface DiscoveryIndex {
  schemaVersion: "1.8";
  generatedAt: string;
  planPath: "discovery-plan.json";
  methodology: {
    stageA: string;
    stageB: string;
    conflictRule: string;
    scheduleDisclaimer: string;
    actionabilityDisclaimer: string;
  };
  coverage: DiscoveryCoverage;
  candidateCount: number;
  highPriorityCandidateIds: string[];
  infrastructureCandidateIds: Record<InfrastructureClassification, string[]>;
  candidates: DiscoveryCandidate[];
}

export interface ArtifactBudgets {
  jsonBudgetBytes: number;
  htmlBudgetBytes: number;
}
