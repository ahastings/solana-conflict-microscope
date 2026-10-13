import { firstFitByEdges, improveWaveOrder, reuseWaveWitness } from "./wave-order.js";
import { sumComputeUnits } from "./compute.js";
import { inspectUploadWrite } from "./upload-payload.js";
import type {
  CausalAblation, CausalAblationCause, ConflictAtom, ConflictEdge, ConflictEdgeDelta, CounterfactualModelId,
  CounterfactualModelResult, NormalizedTransaction, PayerAblationEvidence,
  SemanticFootprint, SemanticRefinementEligibility, WaveBounds, WaveContext,
} from "./types.js";

const LOADER_ID = "BPFLoaderUpgradeab1e11111111111111111111111";
const IMPLEMENTATION_SOURCE = "Agave v4.1.2 programs/bpf_loader/src/lib.rs at commit 182084b82aae88b1b0731540f63bf7416f27773a";
const INTERFACE_SOURCE = "solana-loader-v3-interface v8.1.0 at commit 7e9bdc9386b6dcb5d254be23786a7e6ee5521d21";
const SUPPORTED_CAUSE_IDS: CausalAblationCause["id"][] = ["fee-payer-lock", "program-buffer-whole-account-lock"];

export function verifiedSemanticFootprints(programId: string | null, parsedType: string | null, parsedInfo: unknown): SemanticFootprint[] {
  if (programId !== LOADER_ID || parsedType !== "write") return [];
  const evidence = inspectUploadWrite(parsedInfo);
  if (!evidence.valid) return [];
  const { account, authority, offset, finalCoveredByte } = evidence;
  return [{
    account, operationType: "bpf-upgradeable-loader-write", byteRangeStart: offset, byteRangeEnd: finalCoveredByte,
    coordinateSystem: "buffer-program-data", confidence: "high", precision: "exact",
    readOnlyPrerequisites: [
      { account, requirement: "Buffer metadata must decode as Buffer with a present matching authority; data length must contain the requested range." },
      { account: authority, requirement: "The decoded buffer authority account key must match and sign." },
    ],
    sourceEvidence: [
      `${INTERFACE_SOURCE}: Write declares a writable buffer, signer authority, offset, and bytes.`,
      `${IMPLEMENTATION_SOURCE}: the processor reads buffer state and authority, checks the signer and bounds, then copies only metadata_size + offset through the payload end; it does not update buffer metadata or lamports.`,
      "Disjoint successful writes commute at the buffer-account data transition level only when their verified prerequisites share the same valid pre-state and no additional instruction touches the buffer.",
    ],
  }];
}

type ModelOptions = { excludeFeePayer: boolean; refineSemanticRanges: boolean };
type Range = { start: number; end: number };
type InternalEligibility = SemanticRefinementEligibility & { rangesByTransaction: Map<number, Range[]> };
type ScopePolicy = {
  targetIndexes: Set<number>;
  payerInstructionUse: Map<number, boolean>;
  payerAblation: PayerAblationEvidence;
  eligibility: Map<string, InternalEligibility>;
};

const options: Record<CounterfactualModelId, ModelOptions> = {
  "current-declared-locks": { excludeFeePayer: false, refineSemanticRanges: false },
  "fee-payer-decoupled": { excludeFeePayer: true, refineSemanticRanges: false },
  "semantic-range-refinement": { excludeFeePayer: false, refineSemanticRanges: true },
  "joint-fee-payer-and-range": { excludeFeePayer: true, refineSemanticRanges: true },
};
const labels: Record<CounterfactualModelId, string> = {
  "current-declared-locks": "Current locks", "fee-payer-decoupled": "Payer decoupled",
  "semantic-range-refinement": "Semantic range refinement", "joint-fee-payer-and-range": "Joint counterfactual",
};

function payerIsInstructionOperand(tx: NormalizedTransaction): boolean {
  return tx.instructions.some((instruction) => instruction.accountAddresses.includes(tx.feePayer));
}

export function payerAccessMustBePreserved(tx: NormalizedTransaction): boolean {
  return tx.incompleteInstructionEvidence !== undefined || payerIsInstructionOperand(tx) || tx.instructions.some((instruction) => instruction.incompleteAccountOperandEvidence !== undefined);
}

export function payerAblationEvidence(transactions: NormalizedTransaction[], targetIndexes: Set<number>, requested: boolean): PayerAblationEvidence {
  const targeted = transactions.filter((tx) => targetIndexes.has(tx.index));
  const preserved = targeted.filter(payerIsInstructionOperand);
  const unknown = targeted.filter((tx) => !payerIsInstructionOperand(tx) && payerAccessMustBePreserved(tx));
  const removed = targeted.length - preserved.length - unknown.length;
  if (!requested) return {
    status: "not-requested", targetedTransactionCount: targeted.length, removedSyntheticPayerAccessCount: 0,
    preservedInstructionAccessCount: preserved.length, evidence: ["The current model preserves every declared account access."],
    ...(unknown.length ? { preservedUnknownInstructionAccessCount: unknown.length } : {}),
  };
  const status = preserved.length + unknown.length === 0 ? "fully-applicable" : removed > 0 ? "partially-applicable"
    : unknown.length > 0 ? "blocked-by-incomplete-instruction-evidence" : "blocked-by-instruction-use";
  const evidence = [
    `${removed} targeted ${removed === 1 ? "transaction has" : "transactions have"} only synthetic fee-payer access removed.`,
    `${preserved.length} targeted ${preserved.length === 1 ? "transaction preserves" : "transactions preserve"} payer access because an outer or inner instruction also references that address.`,
    "Instruction-referenced payer access retains its original declared read/write mode; account position alone never narrows it.",
  ];
  if (unknown.length) {
    evidence.push(`${unknown.length} targeted ${unknown.length === 1 ? "transaction preserves" : "transactions preserve"} payer access because instruction account operands are unknown; absence of a decoded reference is not evidence of synthetic-only access.`);
    for (const tx of unknown) if (tx.incompleteInstructionEvidence) evidence.push(`Transaction #${tx.index}: ${tx.incompleteInstructionEvidence}`);
    for (const tx of unknown) for (const instruction of tx.instructions) if (instruction.incompleteAccountOperandEvidence) evidence.push(`Transaction #${tx.index} ${instruction.location} instruction ${instruction.instructionIndex}: ${instruction.incompleteAccountOperandEvidence}`);
  }
  return { status, targetedTransactionCount: targeted.length, removedSyntheticPayerAccessCount: removed, preservedInstructionAccessCount: preserved.length, evidence, ...(unknown.length ? { preservedUnknownInstructionAccessCount: unknown.length } : {}) };
}

const lifecycleType = (type: string | null): boolean => Boolean(type && /initialize|deploy|upgrade|close|authority|extend|resize/i.test(type));

export function semanticRefinementEligibility(transactions: NormalizedTransaction[], targetIndexes: Set<number>): SemanticRefinementEligibility[] {
  return [...buildEligibility(transactions, targetIndexes).values()].map(publicEligibility);
}

function publicEligibility(item: InternalEligibility): SemanticRefinementEligibility {
  return {
    account: item.account, eligible: item.eligible, relevantTransactionIndexes: item.relevantTransactionIndexes,
    exactFootprintCount: item.exactFootprintCount, blockingEvidence: item.blockingEvidence,
    prerequisiteEvidence: item.prerequisiteEvidence,
  };
}

function buildEligibility(transactions: NormalizedTransaction[], targetIndexes: Set<number>): Map<string, InternalEligibility> {
  const candidates = new Set<string>();
  for (const tx of transactions) if (targetIndexes.has(tx.index)) for (const instruction of tx.instructions) {
    for (const footprint of instruction.semanticFootprints ?? []) if (footprint.precision === "exact") candidates.add(footprint.account);
  }
  const result = new Map<string, InternalEligibility>();
  for (const account of [...candidates].sort()) {
    const relevant = transactions.filter((tx) => targetIndexes.has(tx.index) && (tx.readSet.includes(account) || tx.writeSet.includes(account)));
    const blockers = new Set<string>(), prerequisites = new Set<string>(); let footprintCount = 0;
    const rangesByTransaction = new Map<number, Range[]>();
    for (const tx of relevant) {
      if (tx.incompleteInstructionEvidence) blockers.add(`Transaction #${tx.index}: ${tx.incompleteInstructionEvidence}`);
      if (tx.status !== "success") blockers.add(`Transaction #${tx.index} is ${tx.status}; every buffer-touching transaction must succeed.`);
      for (const instruction of tx.instructions) if (instruction.incompleteAccountOperandEvidence) blockers.add(`Transaction #${tx.index} ${instruction.location} instruction ${instruction.instructionIndex} has unknown account operands and cannot rule out another buffer touch.`);
      const touches = tx.instructions.filter((instruction) => instruction.accountAddresses.includes(account) || (instruction.semanticFootprints ?? []).some((footprint) => footprint.account === account));
      if (!touches.length) blockers.add(`Transaction #${tx.index} declares buffer access without a represented instruction touch.`);
      const ranges: Range[] = [];
      for (const instruction of touches) {
        const exact = (instruction.semanticFootprints ?? []).filter((footprint) => footprint.account === account && footprint.precision === "exact" && footprint.confidence === "high");
        if (lifecycleType(instruction.parsedType)) blockers.add(`Transaction #${tx.index} instruction ${instruction.instructionIndex} is lifecycle or authority mutation '${instruction.parsedType}'.`);
        if (!exact.length) blockers.add(`Transaction #${tx.index} ${instruction.location} instruction ${instruction.instructionIndex} touches the buffer without an exact verified footprint (decode status: ${instruction.decodeStatus}).`);
        for (const footprint of exact) {
          footprintCount++;
          const complete = footprint.readOnlyPrerequisites.length > 0 && footprint.readOnlyPrerequisites.every((item) =>
            item.account.length > 0 && item.requirement.length > 0 && tx.accounts.some((candidate) => candidate.pubkey === item.account));
          if (!complete) blockers.add(`Transaction #${tx.index} instruction ${instruction.instructionIndex} does not represent every required semantic prerequisite.`);
          else prerequisites.add(`Transaction #${tx.index} instruction ${instruction.instructionIndex} represents ${footprint.readOnlyPrerequisites.length} read-only prerequisites.`);
          ranges.push({ start: footprint.byteRangeStart, end: footprint.byteRangeEnd });
        }
      }
      rangesByTransaction.set(tx.index, ranges.sort((a, b) => a.start - b.start || a.end - b.end));
    }
    if (!relevant.length) blockers.add("No transaction in the target scope declares access to this candidate buffer.");
    result.set(account, {
      account, eligible: blockers.size === 0, relevantTransactionIndexes: relevant.map((tx) => tx.index),
      exactFootprintCount: footprintCount, blockingEvidence: [...blockers], prerequisiteEvidence: [...prerequisites],
      rangesByTransaction,
    });
  }
  return result;
}

function buildScopePolicy(transactions: NormalizedTransaction[], targetIndexes: Set<number>, payerRequested: boolean): ScopePolicy {
  return {
    targetIndexes,
    payerInstructionUse: new Map(transactions.filter((tx) => targetIndexes.has(tx.index)).map((tx) => [tx.index, payerAccessMustBePreserved(tx)])),
    payerAblation: payerAblationEvidence(transactions, targetIndexes, payerRequested),
    eligibility: buildEligibility(transactions, targetIndexes),
  };
}

function access(tx: NormalizedTransaction, account: string, model: ModelOptions, scope: ScopePolicy): "none" | "read" | "write" {
  const removeSyntheticPayer = model.excludeFeePayer && scope.targetIndexes.has(tx.index) && account === tx.feePayer && !scope.payerInstructionUse.get(tx.index);
  if (removeSyntheticPayer) return "none";
  return tx.writeSet.includes(account) ? "write" : tx.readSet.includes(account) ? "read" : "none";
}

function modelConflictAccounts(a: NormalizedTransaction, b: NormalizedTransaction, model: ModelOptions, scope: ScopePolicy, candidates?: string[]): string[] {
  const accounts = candidates ?? [...new Set([...a.readSet, ...a.writeSet, ...b.readSet, ...b.writeSet])].sort(), conflicts: string[] = [];
  for (const account of accounts) {
    const aa = access(a, account, model, scope), ba = access(b, account, model, scope);
    if (aa === "none" || ba === "none" || (aa === "read" && ba === "read")) continue;
    if (model.refineSemanticRanges && scope.targetIndexes.has(a.index) && scope.targetIndexes.has(b.index) && aa === "write" && ba === "write") {
      const eligibility = scope.eligibility.get(account);
      const ar = eligibility?.rangesByTransaction.get(a.index), br = eligibility?.rangesByTransaction.get(b.index);
      if (eligibility?.eligible && ar?.length && br?.length && ar.every((left) => br.every((right) => left.end < right.start || right.end < left.start))) continue;
    }
    conflicts.push(account);
  }
  return conflicts;
}

function edgesFor(transactions: NormalizedTransaction[], model: ModelOptions, scope: ScopePolicy, baseline?: ConflictEdge[]): ConflictEdge[] {
  const result: ConflictEdge[] = [];
  if (baseline) {
    // Both supported counterfactual operations only remove declared conflicts.
    // Re-evaluate their original causes, including all scope/eligibility gates.
    const byIndex = new Map(transactions.map(tx => [tx.index, tx]));
    for (const edge of baseline) {
      const a = byIndex.get(edge.source)!, b = byIndex.get(edge.target)!;
      const accounts = modelConflictAccounts(a, b, model, scope, edge.accounts);
      if (accounts.length) result.push({ source: a.index, target: b.index, accounts, classification: "other" });
    }
    return result;
  }
  // Only pairs sharing an account with at least one writer can conflict.
  // Index by input position to preserve the original nested-loop edge order,
  // including callers supplying noncontiguous or reordered transaction indexes.
  const usage = new Map<string, {users:Set<number>;writers:Set<number>}>();
  transactions.forEach((tx, position) => {
    for (const account of [...tx.readSet, ...tx.writeSet]) {
      const entry = usage.get(account) ?? {users:new Set<number>(),writers:new Set<number>()};
      entry.users.add(position); usage.set(account,entry);
    }
    for (const account of tx.writeSet) usage.get(account)!.writers.add(position);
  });
  const candidates = new Map<number, Map<number, Set<string>>>();
  for (const [account, entry] of usage) for (const writer of entry.writers) for (const other of entry.users) {
    if (writer === other) continue;
    const left = Math.min(writer,other), right = Math.max(writer,other);
    const peers = candidates.get(left) ?? new Map<number, Set<string>>();
    const causes = peers.get(right) ?? new Set<string>();
    causes.add(account); peers.set(right,causes); candidates.set(left,peers);
  }
  for (const [left, peers] of [...candidates].sort(([a],[b]) => a-b)) for (const [right, causes] of [...peers].sort(([a],[b]) => a-b)) {
    const a = transactions[left]!, b = transactions[right]!;
    const accounts = modelConflictAccounts(a,b,model,scope,[...causes].sort());
    if (accounts.length) result.push({source:a.index,target:b.index,accounts,classification:"other"});
  }
  return result;
}

function scheduleByEdges(transactions: NormalizedTransaction[], edges: ConflictEdge[]): number[][] {
  const nodes = transactions.map(tx => tx.index);
  return improveWaveOrder(nodes, edges, firstFitByEdges(nodes, edges));
}

function cliqueWitness(indexes: number[], edges: ConflictEdge[]): number[] {
  if (!indexes.length) return [];
  if (!edges.length) return [indexes[0]!];
  if (edges.length === indexes.length * (indexes.length - 1) / 2) return [...indexes].sort((a, b) => a - b);
  const neighbors = new Map(indexes.map((index) => [index, new Set<number>()]));
  for (const edge of edges) { neighbors.get(edge.source)?.add(edge.target); neighbors.get(edge.target)?.add(edge.source); }
  const order = [...indexes].sort((a, b) => (neighbors.get(b)?.size ?? 0) - (neighbors.get(a)?.size ?? 0) || a - b); let best = [indexes[0]!];
  const rank = new Map(order.map((node, position) => [node, position]));
  for (const start of order) {
    const adjacent = neighbors.get(start)!;
    // A clique containing start cannot exceed its degree plus one. Ties never replace best.
    if (adjacent.size + 1 <= best.length) continue;
    const clique = [start];
    // Every later member must neighbor start; retain the old global candidate order.
    const candidates = [...adjacent].sort((a,b) => rank.get(a)! - rank.get(b)!);
    for (const candidate of candidates) if (clique.every(member => neighbors.get(member)!.has(candidate))) clique.push(candidate);
    if (clique.length > best.length) best = clique;
  }
  return best.sort((a, b) => a - b);
}

function bounds(indexes: number[], edges: ConflictEdge[], waves: number[][]): WaveBounds {
  const witness = cliqueWitness(indexes, edges), lower = witness.length, upper = waves.length, match = lower === upper;
  const lowerBoundEvidence = !indexes.length ? "No transactions are present in this model."
    : edges.length === 0 ? "No conflict edges remain in this model; one wave is sufficient."
      : `A verified clique contains ${lower} pairwise-conflicting ${lower === 1 ? "transaction" : "transactions"}.`;
  return { cliqueWitness: witness, cliqueLowerBound: lower, generatedWaveUpperBound: upper, boundsMatch: match, provenMinimumWaveCount: match ? lower : null, lowerBoundEvidence, upperBoundEvidence: `A generated conflict-free grouping uses ${upper} ${upper === 1 ? "wave" : "waves"}.` };
}

function context(waves: number[][], transactions: NormalizedTransaction[]): WaveContext[] {
  const byIndex = new Map(transactions.map((tx) => [tx.index, tx]));
  return waves.map((indexes, wave) => { const values = indexes.map((index) => byIndex.get(index)?.computeUnitsConsumed).filter((value): value is number => value !== null && value !== undefined); return { wave, transactionIndexes: indexes, transactionCount: indexes.length, knownComputeUnitsTotal: sumComputeUnits(values), maximumTransactionComputeUnits: Math.max(0, ...values), unknownComputeUnitCount: indexes.length - values.length }; });
}

const pairKey = (source: number, target: number): string => `${Math.min(source, target)}:${Math.max(source, target)}`;
const atomKey = (atom: ConflictAtom): string => `${atom.source}:${atom.target}:${atom.account}`;

function atomsFor(edges: ConflictEdge[]): ConflictAtom[] {
  return edges.flatMap((edge) => edge.accounts.map((account) => ({ source: edge.source, target: edge.target, account })))
    .sort((a, b) => a.source - b.source || a.target - b.target || a.account.localeCompare(b.account));
}

function atomDelta(currentEdges: ConflictEdge[], modelEdges: ConflictEdge[]): {
  currentAtoms: ConflictAtom[]; modelAtoms: ConflictAtom[]; removed: ConflictAtom[]; retained: ConflictAtom[];
  eliminated: ConflictEdgeDelta[]; masked: ConflictEdgeDelta[];
} {
  const currentAtoms = atomsFor(currentEdges), modelAtoms = atomsFor(modelEdges);
  const modelAtomKeys = new Set(modelAtoms.map(atomKey));
  const removed = currentAtoms.filter((atom) => !modelAtomKeys.has(atomKey(atom)));
  const retained = currentAtoms.filter((atom) => modelAtomKeys.has(atomKey(atom)));
  const modelByPair = new Map(modelEdges.map((edge) => [pairKey(edge.source, edge.target), edge]));
  const eliminated: ConflictEdgeDelta[] = [], masked: ConflictEdgeDelta[] = [];
  for (const edge of currentEdges) {
    const surviving = modelByPair.get(pairKey(edge.source, edge.target));
    const retainedAccounts = surviving?.accounts ?? [];
    const removedAccounts = edge.accounts.filter((account) => !retainedAccounts.includes(account));
    if (!removedAccounts.length) continue;
    const delta = { source: edge.source, target: edge.target, removedAccounts, retainedAccounts };
    if (surviving) masked.push(delta); else eliminated.push(delta);
  }
  return { currentAtoms, modelAtoms, removed, retained, eliminated, masked };
}

export function buildCounterfactualModels(transactions: NormalizedTransaction[], targetTransactionIndexes?: Set<number>): CounterfactualModelResult[] {
  const knownComputeUnitsRetained = sumComputeUnits(transactions.map(tx => tx.computeUnitsConsumed));
  const targetIndexes = targetTransactionIndexes ?? new Set(transactions.map((tx) => tx.index));
  const ids = Object.keys(options) as CounterfactualModelId[];
  const policies = new Map(ids.map((id) => [id, buildScopePolicy(transactions, targetIndexes, options[id].excludeFeePayer)]));
  const baselineEdges = edgesFor(transactions, options["current-declared-locks"], policies.get("current-declared-locks")!);
  const generated = ids.map((model) => {
    const scope = policies.get(model)!, edges = model === "current-declared-locks" ? baselineEdges : edgesFor(transactions, options[model], scope, baselineEdges), waves = scheduleByEdges(transactions, edges);
    return { model, scope, edges, waves };
  });

  const witnesses = generated.map(item => item.waves);
  for (const item of generated) if (item.model !== "current-declared-locks") item.waves = reuseWaveWitness(transactions.map(tx => tx.index), item.edges, item.waves, witnesses);
  const baseline = generated.find((item) => item.model === "current-declared-locks")!.waves.length;
  return generated.map(({ model, scope, edges, waves }) => {
    const applied = options[model].refineSemanticRanges && [...scope.eligibility.values()].some((item) => item.eligible);
    const hypothetical = model !== "current-declared-locks", reduction = baseline - waves.length;
    const interpretation = model === "current-declared-locks" ? "Observed declared whole-account locks under current Solana behavior."
      : reduction > 0 ? `This hypothetical model reduces the generated-wave upper bound by ${reduction} while retaining every transaction.`
        : "This hypothetical change alone does not reduce the generated-wave upper bound for this scope.";
    const known = transactions.filter((tx) => tx.computeUnitsConsumed !== null);
    const delta = atomDelta(baselineEdges, edges);
    return {
      model, label: labels[model], hypothetical, availableUnderCurrentSolanaAccountLocking: !hypothetical,
      semanticRangeRefinementApplied: applied, payerAblation: scope.payerAblation,
      semanticRefinementEligibility: [...scope.eligibility.values()].map(publicEligibility),
      transactionCountRetained: transactions.length, knownComputeUnitsRetained,
      unknownComputeUnitCountRetained: transactions.length - known.length,
      conflictEdgeCount: edges.length, conflictAtomCount: delta.modelAtoms.length, conflictEdges: edges, conflictAtoms: delta.modelAtoms,
      currentConflictAtomCount: delta.currentAtoms.length, removedConflictAtoms: delta.removed, retainedConflictAtoms: delta.retained,
      edgesEliminated: delta.eliminated, edgesSurvivingDueToOtherCauses: delta.masked,
      waveBounds: bounds(transactions.map((tx) => tx.index), edges, waves), waves, waveContext: context(waves, transactions),
      generatedWaveDepthReduction: reduction, interpretation,
    };
  });
}

function contribution(model: CounterfactualModelResult): {
  affectedAccountCount: number; affectedPairCount: number; removedAtomCount: number;
  edgesEliminatedCount: number; maskedSurvivingEdgeCount: number;
} {
  return {
    affectedAccountCount: new Set(model.removedConflictAtoms.map((atom) => atom.account)).size,
    affectedPairCount: new Set(model.removedConflictAtoms.map((atom) => pairKey(atom.source, atom.target))).size,
    removedAtomCount: model.removedConflictAtoms.length,
    edgesEliminatedCount: model.edgesEliminated.length,
    maskedSurvivingEdgeCount: model.edgesSurvivingDueToOtherCauses.length,
  };
}

export function buildCausalAblation(_transactions: NormalizedTransaction[], models: CounterfactualModelResult[]): CausalAblation {
  const current = models.find((model) => model.model === "current-declared-locks")!;
  const payer = models.find((model) => model.model === "fee-payer-decoupled")!;
  const range = models.find((model) => model.model === "semantic-range-refinement")!;
  const joint = models.find((model) => model.model === "joint-fee-payer-and-range")!;
  const payerContribution = contribution(payer), bufferContribution = contribution(range);
  const payerApplicable = payer.payerAblation.removedSyntheticPayerAccessCount > 0;
  const bufferApplicable = range.semanticRefinementEligibility.some((item) => item.eligible);
  const transformations: CausalAblation["transformations"] = [
    { causeId: "fee-payer-lock", applicable: payerApplicable, ...payerContribution },
    { causeId: "program-buffer-whole-account-lock", applicable: bufferApplicable, ...bufferContribution },
  ];
  const causes: CausalAblationCause[] = [];
  if (payerContribution.removedAtomCount > 0) causes.push({
    id: "fee-payer-lock", label: "Fee-payer role coupling", change: "remove-fee-payer-role",
    accountCount: payerContribution.affectedAccountCount, affectedPairCount: payerContribution.affectedPairCount,
    removedAtomCount: payerContribution.removedAtomCount, edgesEliminatedCount: payerContribution.edgesEliminatedCount,
    maskedSurvivingEdgeCount: payerContribution.maskedSurvivingEdgeCount,
    evidence: [
      `Role-preserving payer ablation removes ${payerContribution.removedAtomCount} payer conflict ${payerContribution.removedAtomCount === 1 ? "atom" : "atoms"} across ${payerContribution.affectedPairCount} transaction ${payerContribution.affectedPairCount === 1 ? "pair" : "pairs"}.`,
      ...payer.payerAblation.evidence,
    ],
  });
  if (bufferContribution.removedAtomCount > 0) causes.push({
    id: "program-buffer-whole-account-lock", label: "Verified loader-buffer whole-account locking", change: "refine-to-verified-byte-ranges",
    accountCount: bufferContribution.affectedAccountCount, affectedPairCount: bufferContribution.affectedPairCount,
    removedAtomCount: bufferContribution.removedAtomCount, edgesEliminatedCount: bufferContribution.edgesEliminatedCount,
    maskedSurvivingEdgeCount: bufferContribution.maskedSurvivingEdgeCount,
    evidence: [
      `Verified semantic range refinement removes ${bufferContribution.removedAtomCount} buffer conflict ${bufferContribution.removedAtomCount === 1 ? "atom" : "atoms"} across ${bufferContribution.affectedPairCount} transaction ${bufferContribution.affectedPairCount === 1 ? "pair" : "pairs"}.`,
      "Overlapping ranges and ineligible buffer touches remain conflict atoms and do not establish this cause.",
    ],
  });
  const combinations: Array<{ ids: CausalAblationCause["id"][]; model: CounterfactualModelResult }> = [
    { ids: ["fee-payer-lock"], model: payer },
    { ids: ["program-buffer-whole-account-lock"], model: range },
    { ids: ["fee-payer-lock", "program-buffer-whole-account-lock"], model: joint },
  ];
  const presentCauseIds = causes.map((cause) => cause.id);
  const minimalSupportedCauseSets = combinations.filter(({ ids, model }) =>
    ids.every((id) => presentCauseIds.includes(id))
    && model.waveBounds.generatedWaveUpperBound < current.waveBounds.generatedWaveUpperBound
    && !combinations.some((candidate) => candidate.ids.length < ids.length && candidate.ids.every((id) => ids.includes(id)) && candidate.model.waveBounds.generatedWaveUpperBound < current.waveBounds.generatedWaveUpperBound))
    .map(({ ids, model }) => ({ causeIds: ids, generatedWaveDepthReduction: current.waveBounds.generatedWaveUpperBound - model.waveBounds.generatedWaveUpperBound }));
  const payerPairs = new Set(payer.removedConflictAtoms.map((atom) => pairKey(atom.source, atom.target)));
  const rangePairs = new Set(range.removedConflictAtoms.map((atom) => pairKey(atom.source, atom.target)));
  const samePairCauseOverlapCount = [...payerPairs].filter((key) => rangePairs.has(key)).length;
  const payerOnlyDepthReduction = Math.max(0, current.waveBounds.generatedWaveUpperBound - payer.waveBounds.generatedWaveUpperBound);
  const rangeOnlyDepthReduction = Math.max(0, current.waveBounds.generatedWaveUpperBound - range.waveBounds.generatedWaveUpperBound);
  const jointDepthReduction = Math.max(0, current.waveBounds.generatedWaveUpperBound - joint.waveBounds.generatedWaveUpperBound);
  const jointOnlyDepthReductionPresent = presentCauseIds.length === 2
    && payerOnlyDepthReduction === 0 && rangeOnlyDepthReduction === 0 && jointDepthReduction > 0;
  const samePairCauseOverlapPresent = samePairCauseOverlapCount > 0;
  const anyDepthReductionPresent = payerOnlyDepthReduction > 0 || rangeOnlyDepthReduction > 0 || jointDepthReduction > 0;
  const classification = samePairCauseOverlapPresent && jointOnlyDepthReductionPresent
    ? "same-pair-masking-plus-joint-only-depth-reduction"
    : !samePairCauseOverlapPresent && jointOnlyDepthReductionPresent
      ? "separate-bottleneck-joint-only-depth-reduction"
      : samePairCauseOverlapPresent && jointDepthReduction === 0
        ? "same-pair-cause-overlap-without-depth-reduction"
        : samePairCauseOverlapPresent || anyDepthReductionPresent
          ? "supported-overlap-or-depth-effect-without-joint-only-reduction"
          : "no-supported-interaction";
  const presentationTitle = classification === "same-pair-masking-plus-joint-only-depth-reduction"
    ? "Same-pair masking with joint-only depth reduction"
    : classification === "separate-bottleneck-joint-only-depth-reduction"
      ? "Separate-bottleneck joint-only depth reduction"
      : classification === "same-pair-cause-overlap-without-depth-reduction"
        ? "Same-pair cause overlap without depth reduction"
        : classification === "supported-overlap-or-depth-effect-without-joint-only-reduction"
          ? "No joint-only depth interaction"
          : "No supported interaction";
  const explanations = {
    "same-pair-masking-plus-joint-only-depth-reduction": "The supported causes overlap on at least one transaction pair, and neither modeled change reduces component depth alone while their joint removal does.",
    "separate-bottleneck-joint-only-depth-reduction": "The supported causes constrain separate transaction pairs, and neither modeled change reduces component depth alone while their joint removal does.",
    "same-pair-cause-overlap-without-depth-reduction": "The supported causes overlap on at least one transaction pair, but their joint removal does not reduce component depth because modeled conflicts remain.",
    "supported-overlap-or-depth-effect-without-joint-only-reduction": `Cause overlap and depth effects are reported independently: same-pair overlap is ${samePairCauseOverlapPresent ? "present" : "absent"}; payer-only, range-only, and joint depth reductions are ${payerOnlyDepthReduction}, ${rangeOnlyDepthReduction}, and ${jointDepthReduction}. Joint-only synergy is not established.`,
    "no-supported-interaction": "No supported interaction is established by the modeled cause transformations.",
  } as const;
  return {
    supported: causes.length > 0, causes, models,
    supportedCauseUniverse: {
      exhaustiveWithinSupportedUniverse: true, causeIds: SUPPORTED_CAUSE_IDS,
      statement: "The exhaustive supported cause universe is limited to fee-payer role coupling and verified loader-buffer whole-account locking; it is not arbitrary N-cause discovery.",
    },
    presentCauseIds, transformations, minimalSupportedCauseSets,
    interaction: {
      classification, presentationTitle, samePairCauseOverlapPresent, samePairCauseOverlapCount, jointOnlyDepthReductionPresent,
      payerOnlyDepthReduction, rangeOnlyDepthReduction, jointDepthReduction,
      currentConflictAtomCount: current.conflictAtomCount,
      jointRemovedAtomCount: joint.removedConflictAtoms.length, jointEdgesEliminatedCount: joint.edgesEliminated.length,
      jointMaskedSurvivingEdgeCount: joint.edgesSurvivingDueToOtherCauses.length,
      jointResidualConflictEdgeCount: joint.conflictEdgeCount,
      explanation: explanations[classification],
    },
    scopeDisclaimer: "Exhaustiveness applies only within the two declared supported causes. Causal language is limited to these defined graph transformations and does not establish validator behavior or practical runtime implementability.",
  };
}
