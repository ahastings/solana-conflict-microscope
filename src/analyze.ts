import { uploadIdentity } from './upload-identity.js';
import { improveWaveOrder, reuseWaveWitness, WAVE_ORDER_LIMITS, WAVE_HEURISTIC_DESCRIPTION } from "./wave-order.js";
import { sumComputeUnits } from "./compute.js";
import { publicRpcEndpoint } from "./rpc-provenance.js";
import { inspectUploadWrite } from "./upload-payload.js";
import { knownAccountLabel } from "./known.js";
import { normalizeBlock, validateBlock } from "./normalize.js";
import { buildCausalAblation, buildCounterfactualModels, payerAccessMustBePreserved } from "./semantic.js";
import type { AccountStat, Actionability, ActorPattern, Analysis, Cause, ComponentMeaning, ConflictClass, ConflictComponent, ConflictEdge, ContentionSignature, DecodedTransferEvidence, EvidenceConclusion, FindingReason, FixtureProvenance, LegacyConflictClass, NormalizedTransaction, NotableFinding, ProgramBufferWriteChunk, ProgramBufferWriteGroup, ProgramBufferWriteSequence, WaveBounds, WaveContext } from "./types.js";

type Usage = { readers: Set<number>; writers: Set<number> };
const LOADER_ID = "BPFLoaderUpgradeab1e11111111111111111111111";
const SYSTEM_ID = "11111111111111111111111111111111";
const edgeKey = (a: number, b: number): string => a < b ? `${a}:${b}` : `${b}:${a}`;
const roundShare = (part: number, whole: number): number => whole === 0 ? 0 : Number((part / whole).toFixed(6));
const plural = (n: number, one: string, many = `${one}s`): string => n === 1 ? one : many;

export function normalizeConflictClass(value: ConflictClass | LegacyConflictClass): ConflictClass {
  return value === "fee-payer-plus-state" ? "same-payer-shared-account" : value === "cross-payer-shared-state" ? "cross-payer-shared-account" : value;
}

function accessSets(tx: NormalizedTransaction, excludeFeePayer: boolean): { reads: string[]; writes: string[] } {
  if (!excludeFeePayer || payerAccessMustBePreserved(tx)) return { reads: tx.readSet, writes: tx.writeSet };
  return { reads: tx.readSet.filter((account) => account !== tx.feePayer), writes: tx.writeSet.filter((account) => account !== tx.feePayer) };
}

export function transactionsConflict(a: NormalizedTransaction, b: NormalizedTransaction, excludeFeePayers = false): string[] {
  const aa = accessSets(a, excludeFeePayers), ba = accessSets(b, excludeFeePayers);
  const ar = new Set(aa.reads), aw = new Set(aa.writes), br = new Set(ba.reads), bw = new Set(ba.writes);
  return [...new Set([...aw].filter((x) => br.has(x) || bw.has(x)).concat([...bw].filter((x) => ar.has(x))))].sort();
}

function classifyEdge(a: NormalizedTransaction, b: NormalizedTransaction, causes: string[]): ConflictClass {
  if (a.feePayer === b.feePayer && causes.includes(a.feePayer)) return causes.length === 1 ? "fee-payer-only" : "same-payer-shared-account";
  if (a.feePayer !== b.feePayer && causes.some((x) => x !== a.feePayer && x !== b.feePayer)) return "cross-payer-shared-account";
  return "other";
}

function payerExcludedEdges(transactions: NormalizedTransaction[], declaredEdges: ConflictEdge[]): ConflictEdge[] {
  const byIndex = new Map(transactions.map(tx => [tx.index, tx]));
  const retainedPayers = new Set(transactions.filter(payerAccessMustBePreserved).map(tx => tx.index));
  const edges: ConflictEdge[] = [];
  // Removing accesses cannot introduce a new conflict; retain only surviving
  // causes from the declared graph instead of enumerating every transaction pair.
  for (const edge of declaredEdges) {
    const a = byIndex.get(edge.source)!, b = byIndex.get(edge.target)!;
    const accounts = edge.accounts.filter(account =>
      (account !== a.feePayer || retainedPayers.has(a.index)) &&
      (account !== b.feePayer || retainedPayers.has(b.index)));
    if (accounts.length) edges.push({ source: a.index, target: b.index, accounts, classification: classifyEdge(a, b, accounts) });
  }
  return edges;
}

export function buildConflictData(transactions: NormalizedTransaction[]): { edges: ConflictEdge[]; accounts: AccountStat[]; signatures: ContentionSignature[] } {
  const usage = new Map<string, Usage>(), byIndex = new Map(transactions.map((tx) => [tx.index, tx]));
  for (const tx of transactions) {
    for (const account of tx.readSet) { const u = usage.get(account) ?? { readers: new Set<number>(), writers: new Set<number>() }; u.readers.add(tx.index); usage.set(account, u); }
    for (const account of tx.writeSet) { const u = usage.get(account) ?? { readers: new Set<number>(), writers: new Set<number>() }; u.writers.add(tx.index); usage.set(account, u); }
  }
  const pairAccounts = new Map<string, Set<string>>();
  for (const [account, users] of usage) {
    const affected = [...new Set([...users.readers, ...users.writers])].sort((a, b) => a - b);
    for (const writer of [...users.writers].sort((a, b) => a - b)) for (const other of affected) if (writer !== other) {
      const key = edgeKey(writer, other), set = pairAccounts.get(key) ?? new Set<string>(); set.add(account); pairAccounts.set(key, set);
    }
  }
  const edges = [...pairAccounts].map(([key, set]) => {
    const [source, target] = key.split(":").map(Number) as [number, number], accounts = [...set].sort();
    return { source, target, accounts, classification: classifyEdge(byIndex.get(source)!, byIndex.get(target)!, accounts) };
  }).sort((a, b) => a.source - b.source || a.target - b.target);
  const coverage = new Map<string, { pairs: number; exclusive: number }>();
  for (const edge of edges) for (const account of edge.accounts) {
    const count = coverage.get(account) ?? { pairs: 0, exclusive: 0 };
    count.pairs++;
    if (edge.accounts.length === 1) count.exclusive++;
    coverage.set(account, count);
  }
  const accounts = [...usage].map(([account, users]) => {
    const count = coverage.get(account) ?? { pairs: 0, exclusive: 0 };
    return { account, label: knownAccountLabel(account), readerCount: users.readers.size, writerCount: users.writers.size, affectedTransactionCount: new Set([...users.readers, ...users.writers]).size, uniquePairCoverage: count.pairs, exclusiveEdgeCount: count.exclusive, overlappingEdgeCount: count.pairs - count.exclusive, conflictEdgeCount: count.pairs };
  }).sort((a, b) => b.uniquePairCoverage - a.uniquePairCoverage || b.writerCount - a.writerCount || a.account.localeCompare(b.account));
  const grouped = new Map<string, {accounts:string[];pairs:Array<[number,number]>}>();
  for (const edge of edges) {
    const key = JSON.stringify(edge.accounts), group = grouped.get(key) ?? {accounts:[...edge.accounts],pairs:[]};
    group.pairs.push([edge.source,edge.target]);grouped.set(key,group);
  }
  const signatures = [...grouped.values()].map(({accounts,pairs}) => ({accounts,edgeCount:pairs.length,pairs})).sort((a,b) => b.edgeCount-a.edgeCount || a.accounts.join().localeCompare(b.accounts.join()));
  return { edges, accounts, signatures };
}

export function connectedComponents(transactionCount: number, edges: ConflictEdge[]): ConflictComponent[] {
  const neighbors = Array.from({ length: transactionCount }, () => new Set<number>());
  for (const e of edges) { neighbors[e.source]?.add(e.target); neighbors[e.target]?.add(e.source); }
  const seen = new Set<number>(), components: ConflictComponent[] = [];
  for (let start = 0; start < transactionCount; start++) {
    if (seen.has(start)) continue; const stack = [start], indexes: number[] = []; seen.add(start);
    while (stack.length) { const current = stack.pop()!; indexes.push(current); for (const next of neighbors[current] ?? []) if (!seen.has(next)) { seen.add(next); stack.push(next); } }
    components.push({ id: components.length, transactionIndexes: indexes.sort((a, b) => a - b) });
  }
  return components;
}

export function scheduleWaves(transactions: NormalizedTransaction[], excludeFeePayers = false): number[][] {
  return scheduleWithEdges(transactions, excludeFeePayers);
}

function scheduleWithEdges(transactions: NormalizedTransaction[], excludeFeePayers = false, knownEdges?: ConflictEdge[]): number[][] {
  const waves: { indexes: number[]; reads: Set<string>; writes: Set<string> }[] = [];
  for (const tx of transactions) {
    const { reads, writes } = accessSets(tx, excludeFeePayers);
    let selected = waves.find((w) => !writes.some((a) => w.reads.has(a) || w.writes.has(a)) && !reads.some((a) => w.writes.has(a)));
    if (!selected) { selected = { indexes: [], reads: new Set(), writes: new Set() }; waves.push(selected); }
    selected.indexes.push(tx.index); reads.forEach((a) => selected!.reads.add(a)); writes.forEach((a) => selected!.writes.add(a));
  }
  const baseline = waves.map((w) => w.indexes);
  if (baseline.length <= 2 || transactions.length > WAVE_ORDER_LIMITS.maxNodes) return baseline;
  const declared = knownEdges ?? buildConflictData(transactions).edges;
  const edges = knownEdges || !excludeFeePayers ? declared : payerExcludedEdges(transactions, declared);
  return improveWaveOrder(transactions.map(tx => tx.index), edges, baseline);
}

function cliqueBound(indexes: number[], edges: ConflictEdge[]): { size: number; full: boolean; witness: number[] } {
  if (indexes.length < 2) return { size: indexes.length, full: true, witness: [...indexes].sort((a, b) => a - b) };
  const set = new Set(indexes), relevant = edges.filter((e) => set.has(e.source) && set.has(e.target));
  if (relevant.length === indexes.length * (indexes.length - 1) / 2) return { size: indexes.length, full: true, witness: [...indexes].sort((a, b) => a - b) };
  const neighbors = new Map(indexes.map((i) => [i, new Set<number>()]));
  for (const e of relevant) { neighbors.get(e.source)?.add(e.target); neighbors.get(e.target)?.add(e.source); }
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
  return { size: best.length, full: false, witness: best.sort((a, b) => a - b) };
}

function waveBounds(indexes: number[], edges: ConflictEdge[], waves: number[][]): WaveBounds {
  const clique = cliqueBound(indexes, edges), lower = clique.size, upper = waves.length, match = lower === upper;
  return { cliqueWitness: clique.witness, cliqueLowerBound: lower, generatedWaveUpperBound: upper, boundsMatch: match, provenMinimumWaveCount: match ? lower : null, lowerBoundEvidence: `A verified clique contains ${lower} pairwise-conflicting ${plural(lower, "transaction")}.`, upperBoundEvidence: `A generated conflict-free grouping uses ${upper} ${plural(upper, "wave")}.` };
}

function waveContext(waves: number[][], transactions: NormalizedTransaction[]): WaveContext[] {
  const byIndex = new Map(transactions.map((tx) => [tx.index, tx]));
  return waves.map((indexes, wave) => { const values = indexes.map((i) => byIndex.get(i)?.computeUnitsConsumed).filter((v): v is number => v != null); return { wave, transactionIndexes: indexes, transactionCount: indexes.length, knownComputeUnitsTotal: sumComputeUnits(values), maximumTransactionComputeUnits: Math.max(0, ...values), unknownComputeUnitCount: indexes.length - values.length }; });
}

const infoObject = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function detectProgramBufferWriteSequences(transactions: NormalizedTransaction[]): ProgramBufferWriteGroup[] {
  const grouped = new Map<string, { buffer: string; authority: string; chunks: ProgramBufferWriteChunk[] }>();
  for (const tx of transactions) for (const ix of tx.instructions) {
    if (ix.programId !== LOADER_ID || ix.parsedType !== "write") continue;
    const evidence = inspectUploadWrite(ix.parsedInfo);
    if (!evidence.valid) continue;
    const { account: buffer, authority, offset, byteLength, finalCoveredByte } = evidence;
    const key = JSON.stringify([buffer, authority]), group = grouped.get(key) ?? { buffer, authority, chunks: [] };
    group.chunks.push({ location: ix.location, parentInstructionIndex: ix.parentInstructionIndex, instructionIndex: ix.instructionIndex, transactionStatus: tx.status, transactionIndex: tx.index, offset, byteLength, finalCoveredByte }); grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => {
    const chunks = [...group.chunks].sort((a, b) => a.offset - b.offset || a.transactionIndex - b.transactionIndex), runs: ProgramBufferWriteChunk[][] = [], gaps: ProgramBufferWriteGroup["gaps"] = [], overlaps: ProgramBufferWriteGroup["overlaps"] = [];
    let coveredEnd = -1;
    let active: ProgramBufferWriteChunk[] = [];
    for (const chunk of chunks) {
      const previous = runs.at(-1)?.at(-1);
      if (!previous) runs.push([chunk]);
      else if (chunk.offset === previous.finalCoveredByte + 1) runs.at(-1)!.push(chunk);
      else runs.push([chunk]);
      // Coverage uses the union of preceding ranges: nested writes cannot create
      // false gaps or hide overlap with an earlier, longer write.
      if (previous && chunk.offset > coveredEnd + 1) gaps.push({ afterOffset: coveredEnd, beforeOffset: chunk.offset, byteCount: chunk.offset - coveredEnd - 1 });
      active = active.filter((earlier) => earlier.finalCoveredByte >= chunk.offset);
      for (const earlier of active) overlaps.push({ firstOffset: earlier.offset, secondOffset: chunk.offset, byteCount: Math.min(earlier.finalCoveredByte, chunk.finalCoveredByte) - chunk.offset + 1 });
      active.push(chunk);
      coveredEnd = Math.max(coveredEnd, chunk.finalCoveredByte);
    }
    const sequences: ProgramBufferWriteSequence[] = runs.map((items, n) => { const chunkSizes = [...new Set(items.map((i) => i.byteLength))].sort((a, b) => a - b); return { id: `${uploadIdentity(group.buffer,group.authority)}:${items[0]!.offset}:${n}`, buffer: group.buffer, authority: group.authority, chunks: items, chunkCount: items.length, chunkSizeMode: chunkSizes.length === 1 ? "uniform" : "varying", chunkSizes, firstOffset: items[0]!.offset, lastStartingOffset: items.at(-1)!.offset, finalCoveredByte: Math.max(...items.map((i) => i.finalCoveredByte)), totalBytes: items.reduce((sum, i) => sum + i.byteLength, 0) }; });
    return { buffer: group.buffer, authority: group.authority, chunks, sequences, gaps, overlaps };
  }).sort((a, b) => a.buffer.localeCompare(b.buffer) || a.authority.localeCompare(b.authority));
}

function decodedTransfers(transactions: NormalizedTransaction[]): DecodedTransferEvidence[] {
  const result: DecodedTransferEvidence[] = [];
  for (const tx of transactions) for (const ix of tx.instructions) {
    if (ix.programId !== SYSTEM_ID || ix.parsedType !== "transfer") continue; const info = infoObject(ix.parsedInfo);
    if (typeof info?.source !== "string" || typeof info.destination !== "string" || typeof info.lamports !== "number" || !Number.isSafeInteger(info.lamports) || info.lamports < 0) continue;
    result.push({ transactionStatus: tx.status, parentInstructionIndex: ix.parentInstructionIndex, transactionIndex: tx.index, source: info.source, destination: info.destination, lamports: info.lamports, hasAirdropLog: tx.logMessages.some((m) => m.includes("Airdrop")), instructionIndex: ix.instructionIndex, location: ix.location });
  }
  return result;
}
const conclusion = <T extends string>(value: T, confidence: "high" | "medium" | "low", evidence: string[]): EvidenceConclusion<T> => ({ value, confidence, evidence });

function componentMeanings(components: ConflictComponent[], edges: ConflictEdge[], transactions: NormalizedTransaction[], groups: ProgramBufferWriteGroup[]): ComponentMeaning[] {
  const totalKnownCu = sumComputeUnits(transactions.map(tx => tx.computeUnitsConsumed)), allTransfers = decodedTransfers(transactions);
  return components.map((component) => {
    const indexes = new Set(component.transactionIndexes), componentEdges = edges.filter((e) => indexes.has(e.source) && indexes.has(e.target)), txs = component.transactionIndexes.map((i) => transactions[i]!);
    const payers = new Set(txs.map((tx) => tx.feePayer)), samePayer = payers.size === 1, shared = [...new Set(componentEdges.flatMap((e) => e.accounts))].sort(), waves = scheduleWithEdges(txs, false, componentEdges), bounds = waveBounds(component.transactionIndexes, componentEdges, waves), clique = cliqueBound(component.transactionIndexes, edges);
    const knownComputeUnitCount = txs.filter((tx) => tx.computeUnitsConsumed !== null).length, knownCu = sumComputeUnits(txs.map(tx => tx.computeUnitsConsumed));
    const transfers = allTransfers.filter((t) => indexes.has(t.transactionIndex) && shared.includes(t.source)), bySource = new Map<string, DecodedTransferEvidence[]>();
    for (const transfer of transfers) { const items = bySource.get(transfer.source) ?? []; items.push(transfer); bySource.set(transfer.source, items); }
    const sharedTransfer = [...bySource].find(([, items]) => new Set(items.map((i) => i.transactionIndex)).size >= 2);
    const sequenceIds = groups.flatMap((g) => g.sequences).filter((s) => s.chunks.filter((c) => indexes.has(c.transactionIndex)).length >= 2 && shared.includes(s.buffer)).map((s) => s.id);
    const roles = txs.flatMap((tx) => tx.accounts).filter((a) => shared.includes(a.pubkey)).flatMap((a) => a.roles);
    let cause: EvidenceConclusion<Cause>;
    if (!componentEdges.length) cause = conclusion("unknown", "high", ["No declared conflict exists in this singleton component."]);
    else if (sequenceIds.length) cause = conclusion("program-buffer writes", "high", [`${sequenceIds.length} decoded BPF Upgradeable Loader write ${plural(sequenceIds.length, "sequence")} ${sequenceIds.length === 1 ? "targets" : "target"} shared conflict accounts in this component.`, "The RPC-decoded write fields identify both buffer and authority."]);
    else if (sharedTransfer) {
      const [source, items] = sharedTransfer, amounts = [...new Set(items.map((i) => i.lamports))], destinations = new Set(items.map((i) => i.destination));
      const evidence = [`${items.length} RPC-decoded System Program ${plural(items.length, "transfer")} use the same writable source account ${source}.`, amounts.length === 1 ? `Each decoded transfer specifies ${amounts[0]!.toLocaleString("en-US")} lamports.` : `Decoded transfer amounts vary across ${amounts.length} values.`, destinations.size === items.length ? "The decoded destinations differ." : "At least one decoded destination repeats."];
      const participants = [...new Map(items.map(item => [item.transactionIndex, item])).values()];
      evidence.push('Participating transaction outcomes: '+participants.filter(item => item.transactionStatus === 'success').length+' successful, '+participants.filter(item => item.transactionStatus === 'failed').length+' failed, '+participants.filter(item => item.transactionStatus === 'unknown').length+' unknown. Decoded amounts describe instructions, not verified balance changes.');
      if (participants.every((i) => i.hasAirdropLog)) evidence.push(participants.length === 2 ? "Both participating transactions contain an Airdrop log." : `All ${participants.length} participating transactions contain an Airdrop log.`); cause = conclusion("transfer/funding source", "high", evidence);
    } else if (roles.some((r) => /(^|\s)state(\s|$)/i.test(r.role) && !/buffer/i.test(r.role))) cause = conclusion("application state", "high", ["RPC-decoded instruction fields identify a shared application-state account."]);
    else if (roles.some((r) => r.role === "vote account")) cause = conclusion("vote account", "high", ["RPC-decoded instruction fields identify a shared vote account."]);
    else if (roles.some((r) => r.role !== "fee payer" && r.role !== "invoked program")) cause = conclusion("other decoded account role", "medium", ["Decoded fields identify a shared role outside the more specific cause categories."]);
    else if (samePayer && shared.includes(txs[0]!.feePayer)) cause = conclusion("repeated fee payer", "high", ["The same protocol-position fee-payer account is writable in each conflicting transaction.", "This does not establish common real-world ownership."]);
    else cause = conclusion("unknown", "low", ["Declared locks prove the conflict, but decoded evidence does not identify the account's semantic role."]);
    const actorPattern: EvidenceConclusion<ActorPattern> = !componentEdges.length ? conclusion("unknown", "high", ["Actor pattern is not assigned to a singleton without contention."]) : samePayer ? conclusion("same payer", "high", ["All transactions declare the same fee-payer address.", "A shared payer does not prove common real-world ownership."]) : conclusion("cross payer", "high", [`${payers.size} distinct fee-payer addresses participate.`]);
    const redesignEvidence = txs.flatMap((tx) => tx.instructions).map((ix) => infoObject(ix.parsedInfo)).find((info) => typeof info?.logicalIndependenceEvidence === "string" && info.logicalIndependenceEvidence.length > 0 && typeof info.alternativeAccountPartitioning === "string" && info.alternativeAccountPartitioning.length > 0);
    const actionability: EvidenceConclusion<Actionability> = cause.value === "program-buffer writes"
      ? conclusion("likely protocol-required or intentional", "high", ["Contiguous writes to one decoded upgradeable-loader buffer form an ordered upload sequence."])
      : cause.value === "application state" && redesignEvidence
        ? conclusion("potentially redesignable", "high", [`Decoded logical-independence evidence: ${String(redesignEvidence.logicalIndependenceEvidence)}`, `Decoded alternative account partitioning: ${String(redesignEvidence.alternativeAccountPartitioning)}`])
        : conclusion("insufficient evidence", cause.value === "unknown" ? "high" : "medium", [cause.value === "application state" ? "Decoding application state does not prove logical independence or provide a concrete alternative partitioning." : "Decoded evidence does not prove a safe alternative account layout or operation design."]);
    const explanation = !componentEdges.length ? "This transaction has no declared conflict with another transaction in the analyzed block." : `This finding contains ${txs.length} ${plural(txs.length, "transaction")} and ${componentEdges.length} unique conflict ${plural(componentEdges.length, "pair")} (${(roundShare(componentEdges.length, edges.length) * 100).toFixed(1)}% of block pairs). ${samePayer ? "It has one declared fee payer." : `It spans ${payers.size} declared fee payers.`} ${bounds.boundsMatch ? `The clique lower bound and generated-wave upper bound both equal ${bounds.provenMinimumWaveCount}, giving a proven minimum wave count of ${bounds.provenMinimumWaveCount}.` : `The clique lower bound is ${bounds.cliqueLowerBound}; the generated conflict-free-wave upper bound is ${bounds.generatedWaveUpperBound}, so the minimum remains estimated within those bounds.`}`;
    const counterfactualModels = buildCounterfactualModels(txs), causalAblation = buildCausalAblation(txs, counterfactualModels);
    return { componentId: component.id, transactionIndexes: component.transactionIndexes, edgeCount: componentEdges.length, transactionShare: roundShare(txs.length, transactions.length), uniqueConflictPairShare: roundShare(componentEdges.length, edges.length), knownComputeUnitShare: totalKnownCu ? roundShare(knownCu, totalKnownCu) : null, payerCount: payers.size, samePayer, sharedConflictAccounts: shared, cliqueLowerBound: clique.size, cliqueBoundIsExact: clique.full, waveBounds: bounds, estimatedWaveContext: waveContext(waves, transactions), isContentionFinding: componentEdges.length > 0, cause, actorPattern, actionability, decodedTransfers: transfers, programBufferSequenceIds: sequenceIds, knownComputeUnitCount, unknownComputeUnitCount: txs.length - knownComputeUnitCount, explanation, counterfactualModels, causalAblation };
  }).sort((a, b) => b.edgeCount - a.edgeCount || b.transactionIndexes.length - a.transactionIndexes.length || a.componentId - b.componentId);
}

function buildNotableFindings(meanings: ComponentMeaning[]): NotableFinding[] {
  const conflicted = meanings.filter((m) => m.isContentionFinding); if (!conflicted.length) return [];
  const map = new Map<number, Set<FindingReason>>(), add = (m: ComponentMeaning, r: FindingReason): void => { const set = map.get(m.componentId) ?? new Set<FindingReason>(); set.add(r); map.set(m.componentId, set); };
  add([...conflicted].sort((a, b) => (b.waveBounds.provenMinimumWaveCount ?? b.waveBounds.generatedWaveUpperBound) - (a.waveBounds.provenMinimumWaveCount ?? a.waveBounds.generatedWaveUpperBound) || Number(b.waveBounds.boundsMatch) - Number(a.waveBounds.boundsMatch) || a.componentId - b.componentId)[0]!, "deepest serialization");
  add([...conflicted].sort((a, b) => b.uniqueConflictPairShare - a.uniqueConflictPairShare || a.componentId - b.componentId)[0]!, "largest unique-conflict-pair share");
  const known = conflicted.filter((m) => m.knownComputeUnitCount); if (known.length) add([...known].sort((a, b) => (b.knownComputeUnitShare ?? 0) - (a.knownComputeUnitShare ?? 0) || a.componentId - b.componentId)[0]!, "largest known-compute share");
  for (const m of conflicted) { if (m.actorPattern.value === "cross payer") add(m, "cross-payer component"); if (m.actionability.value === "potentially redesignable") add(m, "potentially redesignable"); if (m.programBufferSequenceIds.length) add(m, "program-buffer upload"); }
  const order: FindingReason[] = ["deepest serialization", "largest unique-conflict-pair share", "largest known-compute share", "cross-payer component", "potentially redesignable", "program-buffer upload"];
  const labels: Record<FindingReason, string> = { "deepest serialization": "Primary structural bottleneck", "largest unique-conflict-pair share": "Largest conflict-pair share", "largest known-compute share": "Highest-compute conflicted component", "cross-payer component": "Cross-payer finding", "potentially redesignable": "Potentially redesignable finding", "program-buffer upload": "Program-buffer upload" };
  return [...map].map(([componentId, set]) => { const reasons = order.filter((r) => set.has(r)), primaryReason = reasons[0]!; return { componentId, reasons, primaryReason, label: labels[primaryReason] }; }).sort((a, b) => order.indexOf(a.primaryReason) - order.indexOf(b.primaryReason) || a.componentId - b.componentId);
}

function defaultProvenance(source: "fixture" | "rpc", supplied?: Partial<FixtureProvenance>): FixtureProvenance {
  return { cluster: supplied?.cluster ?? "unknown", endpoint: publicRpcEndpoint(supplied?.endpoint), retrievedAt: supplied?.retrievedAt ?? null, sourceMode: supplied?.sourceMode ?? source, dataKind: supplied?.dataKind ?? "unknown", ...(supplied?.request ? { request: supplied.request } : {}) };
}

export function analyzeBlock(blockValue: unknown, slot: number, source: "fixture" | "rpc", provenance?: Partial<FixtureProvenance>): Analysis {
  validateBlock(blockValue); const block = blockValue, transactions = normalizeBlock(block, slot);
  const totalKnownComputeUnits = sumComputeUnits(transactions.map(tx => tx.computeUnitsConsumed));
  const { edges, accounts, signatures } = buildConflictData(transactions), components = connectedComponents(transactions.length, edges), waves = scheduleWithEdges(transactions, false, edges), groups = detectProgramBufferWriteSequences(transactions), meanings = componentMeanings(components, edges, transactions, groups), dominant = meanings.find((m) => m.isContentionFinding) ?? null;
  const excluded = new Set(dominant?.transactionIndexes ?? []), remainingTxs = transactions.filter((tx) => !excluded.has(tx.index)), payerEdges = payerExcludedEdges(transactions, edges), remainingEdges = edges.filter(edge => !excluded.has(edge.source) && !excluded.has(edge.target)), withoutDominant = reuseWaveWitness(remainingTxs.map(tx => tx.index), remainingEdges, scheduleWithEdges(remainingTxs, false, remainingEdges), [waves.map(wave => wave.filter(index => !excluded.has(index))).filter(wave => wave.length > 0)]), withoutPayers = reuseWaveWitness(transactions.map(tx => tx.index), payerEdges, scheduleWithEdges(transactions, true, payerEdges), [waves]);
  const successCount = transactions.filter((tx) => tx.status === "success").length, failureCount = transactions.filter((tx) => tx.status === "failed").length, largest = meanings.reduce((best, m) => m.cliqueLowerBound > best.cliqueLowerBound ? m : best, meanings[0] ?? { cliqueLowerBound: 0, cliqueBoundIsExact: true });
  const blockBounds = waveBounds(transactions.map((tx) => tx.index), edges, waves), payerBounds = waveBounds(transactions.map((tx) => tx.index), payerEdges, withoutPayers), remainingBounds = waveBounds(remainingTxs.map((tx) => tx.index), remainingEdges, withoutDominant), explanations: string[] = [];
  if (dominant) { explanations.push(`The primary structural component contains ${dominant.transactionIndexes.length} ${plural(dominant.transactionIndexes.length, "transaction")} and creates ${dominant.edgeCount} of ${edges.length} unique conflict ${plural(edges.length, "pair")}.`); explanations.push(dominant.waveBounds.boundsMatch ? `Its lower and upper bounds match at ${dominant.waveBounds.provenMinimumWaveCount}: this is a proven minimum wave count.` : `Its minimum wave count remains between ${dominant.waveBounds.cliqueLowerBound} and ${dominant.waveBounds.generatedWaveUpperBound}.`); const remaining = transactions.length - dominant.transactionIndexes.length; explanations.push(`After excluding that component, the remaining ${remaining} ${plural(remaining, "transaction")} ${remaining === 1 ? "fits" : "fit"} into ${withoutDominant.length} ${plural(withoutDominant.length, "wave")} under the same bounded grouping heuristic.`); explanations.push(...dominant.cause.evidence); }
  const feeOnly = edges.filter((e) => e.classification === "fee-payer-only").length, sameShared = edges.filter((e) => e.classification === "same-payer-shared-account").length, cross = edges.filter((e) => e.classification === "cross-payer-shared-account").length;
  if (feeOnly + sameShared === edges.length && edges.length) explanations.push(`Every conflict pair shares a fee payer: ${feeOnly} ${feeOnly === 1 ? "is" : "are"} fee-payer-only and ${sameShared} also share at least one other conflicting account.`);
  const knownCount = transactions.filter((tx) => tx.computeUnitsConsumed !== null).length;
  const supported = meanings.find((meaning) => meaning.programBufferSequenceIds.length > 0), counterfactualModels = buildCounterfactualModels(transactions, new Set(supported?.transactionIndexes ?? transactions.map((tx) => tx.index)));
  return {
    methodology: { conflictRule: "Two transactions conflict when they share an account and at least one declares it writable.", waveHeuristic: WAVE_HEURISTIC_DESCRIPTION, scheduleDisclaimer: "This is one valid conflict-free grouping for potential parallelism, not the validator's exact schedule.", feePayerCounterfactualDisclaimer: "Role-preserving payer ablation removes only synthetic fee-debit access. If an outer or inner instruction also references the payer address, its declared read/write access is preserved; validators still lock fee payers.", semanticCounterfactualDisclaimer: "Semantic counterfactuals describe hypothetical finer-grained execution rules. They are not supported by current Solana account locking and do not represent validator scheduling.", source },
    provenance: defaultProvenance(source, provenance), context: { slot, blockhash: block.blockhash, previousBlockhash: block.previousBlockhash, parentSlot: Number(block.parentSlot), blockTime: block.blockTime == null ? null : Number(block.blockTime), blockHeight: block.blockHeight == null ? null : Number(block.blockHeight) },
    summary: { transactionCount: transactions.length, successCount, failureCount, unknownStatusCount: transactions.length - successCount - failureCount, conflictEdgeCount: edges.length, feePayerOnlyConflictEdgeCount: feeOnly, samePayerSharedAccountConflictEdgeCount: sameShared, crossPayerSharedAccountConflictEdgeCount: cross, componentCount: components.length, dominantComponentTransactionShare: dominant?.transactionShare ?? 0, dominantComponentEdgeShare: dominant?.uniqueConflictPairShare ?? 0, largestPairwiseConflictGroupLowerBound: largest.cliqueLowerBound, largestPairwiseConflictBoundIsExact: largest.cliqueBoundIsExact, waveCount: waves.length, feePayerExcludedAnalyticalWaveCount: withoutPayers.length, dominantComponentExcludedWaveCount: withoutDominant.length, maximumWaveWidth: Math.max(0, ...waves.map((w) => w.length)), knownComputeUnitTransactionCount: knownCount, unknownComputeUnitTransactionCount: transactions.length - knownCount, knownComputeUnitCoverage: roundShare(knownCount, transactions.length), totalKnownComputeUnits },
    transactions, conflictEdges: edges, contentionSignatures: signatures, explanations, components, componentMeanings: meanings, dominantComponent: dominant, notableFindings: buildNotableFindings(meanings), programBufferWriteGroups: groups, blockWaveBounds: blockBounds, feePayerExcludedWaveBounds: payerBounds, dominantComponentExcludedWaveBounds: remainingBounds, counterfactualModels, waves, waveContext: waveContext(waves, transactions), feePayerExcludedAnalyticalWaves: withoutPayers, dominantComponentExcludedWaves: withoutDominant, accounts, hotWritableAccounts: accounts.filter((a) => a.writerCount > 0 && a.uniquePairCoverage > 0),
  };
}
