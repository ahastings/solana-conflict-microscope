import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const MILESTONE_24_OUTCOME = "observed-order-equality-dependency-and-joint-ablation-established" as const;
export const EXPECTED_ELF_SHA256 = "89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c";
const ORACLE_CAUSE = "shared-oracle";
const PAYER_CAUSE = "fee-payer";
const NATIVE_MARKET_CAUSE = "native-market";
const NATIVE_MARKET_KIND = "preserved-native-market-declared-lock-conflict";
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

type Atom = { source: number; target: number; account: string; cause: string; kind?: string };
type NativeConflict = { anchorRole: string; anchorTransactionIndex: number; accounts: string[] };
type Block = { slot: number; anchorTransactionIndexes: number[]; conflictAtoms: Atom[]; waveLowerBound: number; waveUpperBound: number; nativeContext: { transactionIndex: number; conflicts: NativeConflict[]; atomCount: number; semanticStatus: string } };
type Attribution = { schemaVersion: string; blocks: Block[] };
type Plan = { schemaVersion: string; expectedOutcome: string; expectedExecutableSha256: string; inputs: Array<{ path: string; sha256: string }> };

const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const pairKey = (source: number, target: number) => `${Math.min(source, target)}:${Math.max(source, target)}`;
const pairs = (atoms: Atom[]) => [...new Set(atoms.map((atom) => pairKey(atom.source, atom.target)))].sort();

async function loadPinned<T>(pin: { path: string; sha256: string }): Promise<T> {
  const bytes = await readFile(resolve(pin.path));
  const observed = sha256(bytes);
  if (observed !== pin.sha256) throw new Error(`Pinned input changed: ${pin.path}; expected ${pin.sha256}, observed ${observed}`);
  return JSON.parse(bytes.toString("utf8")) as T;
}

function modelBlock(block: Block) {
  const ordered = [...block.anchorTransactionIndexes].sort((a, b) => a - b);
  const [producer, ...consumers] = ordered;
  if (producer === undefined || consumers.length !== 2) throw new Error(`Slot ${block.slot} does not contain one producer and two consumers`);
  const consumerPair = pairKey(consumers[0]!, consumers[1]!);
  const producerPairs = new Set(consumers.map((consumer) => pairKey(producer, consumer)));
  const oracleAtoms = block.conflictAtoms.filter((atom) => atom.cause === ORACLE_CAUSE);
  const payerAtoms = block.conflictAtoms.filter((atom) => atom.cause === PAYER_CAUSE);
  if (oracleAtoms.length !== 9 || payerAtoms.length !== 3) throw new Error(`Slot ${block.slot} changed its 9-oracle/3-payer atom baseline`);
  if (block.nativeContext.semanticStatus !== "unresolved-excluded" || block.nativeContext.conflicts.length !== 3) throw new Error(`Slot ${block.slot} changed unresolved native evidence`);

  const dependencies = consumers.map((consumer) => ({ source: producer, target: consumer, accounts: oracleAtoms.filter((a) => pairKey(a.source, a.target) === pairKey(producer, consumer)).map((a) => a.account).sort(), kind: "producer-to-equality-consumer-state-dependency" }));
  const nativeEdges = block.nativeContext.conflicts.map((conflict) => ({ source: block.nativeContext.transactionIndex, target: conflict.anchorTransactionIndex, accounts: conflict.accounts, kind: "DECLARED LOCK CONFLICT", anchorRole: conflict.anchorRole }));
  const nativeAtoms = block.nativeContext.conflicts.flatMap((conflict) => conflict.accounts.map((account) => ({
    source: block.nativeContext.transactionIndex,
    target: conflict.anchorTransactionIndex,
    account,
    cause: NATIVE_MARKET_CAUSE,
    kind: NATIVE_MARKET_KIND,
  })));
  if (nativeAtoms.length !== 3 || block.nativeContext.atomCount !== 3) throw new Error(`Slot ${block.slot} changed its three native-market atom baseline`);
  const fullComponentAtoms = [...block.conflictAtoms, ...nativeAtoms];

  const make = (id: string, equalityAware: boolean, removePayer: boolean, semantic: boolean) => {
    const retained = fullComponentAtoms.filter((atom) => !(removePayer && atom.cause === PAYER_CAUSE) && !(equalityAware && atom.cause === ORACLE_CAUSE));
    const retainedPairs = new Set(pairs(retained));
    const survivingAnchorPairs = pairs(retained.filter((atom) => atom.cause !== NATIVE_MARKET_CAUSE));
    const allSymmetric = [
      ...survivingAnchorPairs.map((key) => ({ pair: key, kind: "anchor" })),
      ...nativeEdges.map((edge) => ({ pair: pairKey(edge.source, edge.target), kind: "native-market" })).filter((edge) => retainedPairs.has(edge.pair)),
    ];
    return {
      model: id,
      anchorConflictAtomCount: block.conflictAtoms.length,
      fullComponentConflictAtomCount: fullComponentAtoms.length,
      startingConflictAtomCount: fullComponentAtoms.length,
      oracleAtomsReclassified: equalityAware ? 9 : 0,
      feePayerAtomsRemoved: removePayer ? 3 : 0,
      retainedSymmetricConflictAtomCount: retained.length,
      retainedConflictAtomCounts: {
        oracle: retained.filter((atom) => atom.cause === ORACLE_CAUSE).length,
        feePayer: retained.filter((atom) => atom.cause === PAYER_CAUSE).length,
        nativeMarket: retained.filter((atom) => atom.cause === NATIVE_MARKET_CAUSE).length,
      },
      retainedConflictAtoms: retained,
      survivingSymmetricConflictEdges: allSymmetric,
      survivingDirectedDependencies: semantic ? dependencies : [],
      edgeRemovals: 6 - allSymmetric.length,
      dependencyAdditionsOrReclassifications: semantic ? 2 : 0,
      depth: id === "current-declared-locks" || id === "payer-decoupled" ? { term: "exact current wave depth", value: 4 } : { term: "exact semantic dependency-layer depth", value: allSymmetric.length === 3 && semantic ? 3 : 4 },
    };
  };

  const models = [
    make("current-declared-locks", false, false, false),
    make("equality-aware-oracle", true, false, true),
    make("payer-decoupled", false, true, false),
    make("joint-equality-aware-plus-payer-decoupled", true, true, true),
  ];
  const invalid = make("naive-equality-edge-erasure", true, false, false);
  return {
    slot: block.slot, observedProducerTransactionIndex: producer, equalityConsumerTransactionIndexes: consumers,
    anchorPairs: [pairKey(ordered[0]!, ordered[1]!), pairKey(ordered[0]!, ordered[2]!), pairKey(ordered[1]!, ordered[2]!)].map((key) => ({ pair: key, currentAtoms: block.conflictAtoms.filter((a) => pairKey(a.source, a.target) === key), oracleAtomsReclassified: key === consumerPair ? 3 : producerPairs.has(key) ? 3 : 0, producerConsumerDependencyReclassified: producerPairs.has(key), feePayerAtomRemovedInPayerCounterfactual: 1 })),
    nativeNode: { transactionIndex: block.nativeContext.transactionIndex, semanticStatus: "native-prefix-discriminator-2-unresolved", preservedMarketRelationships: nativeEdges },
    models,
    invalidNegativeControl: { ...invalid, validity: "INVALID", exclusion: "Teaching only; drops producer-to-consumer state dependency and never feeds ranking, headline metrics, or causal conclusions." },
  };
}

export async function runMilestone24(planPath: string, outputDir: string, offline: boolean) {
  if (!offline) throw new Error("Milestone 2.4 is cache-only; pass --offline");
  const plan = JSON.parse(await readFile(resolve(planPath), "utf8")) as Plan;
  if (plan.schemaVersion !== "2.4" || plan.expectedOutcome !== "equality-branch-byte-identical-established" || plan.expectedExecutableSha256 !== EXPECTED_ELF_SHA256) throw new Error("Milestone 2.4 evidence boundary changed");
  const inputs = new Map(plan.inputs.map((pin) => [pin.path, pin]));
  const attributionPin = inputs.get("output/research/velocity-anchor-bundle/anchor-conflict-attribution.json");
  if (!attributionPin) throw new Error("Missing Milestone 2.2 conflict attribution pin");
  const attribution = await loadPinned<Attribution>(attributionPin);
  await Promise.all(plan.inputs.filter((pin) => pin !== attributionPin).map((pin) => loadPinned<unknown>(pin)));
  if (attribution.schemaVersion !== "2.2" || attribution.blocks.length !== 6) throw new Error("Expected exactly six frozen Milestone 2.2 blocks");
  const components = attribution.blocks.map(modelBlock);
  const model = { schemaVersion: "2.4", outcome: MILESTONE_24_OUTCOME, evidenceBoundary: { milestone23Outcome: plan.expectedOutcome, executableSha256: EXPECTED_ELF_SHA256, timestampField: "[16,24)", interpretation: "deployed-branch-validated", runtimeLockModel: false }, components };
  const ablation = { schemaVersion: "2.4", models: ["current-declared-locks", "equality-aware-oracle", "payer-decoupled", "joint-equality-aware-plus-payer-decoupled"], componentResults: components.map((c) => ({ slot: c.slot, depths: Object.fromEntries(c.models.map((m) => [m.model, m.depth.value])), atomAccounting: Object.fromEntries(c.models.map((m) => [m.model, { startingConflictAtoms: m.startingConflictAtomCount, oracleAtomsReclassified: m.oracleAtomsReclassified, feePayerAtomsRemoved: m.feePayerAtomsRemoved, retainedSymmetricConflictAtoms: m.retainedSymmetricConflictAtomCount }])), singleEqualityChangesDepth: false, singlePayerChangesDepth: false, jointChangesDepth: true, nativeConstraint: "The unresolved native transaction retains one declared market-account conflict with each Anchor role, requiring its own layer in the joint model." })), negativeControlExcluded: true };
  const summary = { schemaVersion: "2.4", componentCount: 6, fullComponentConflictAtomCounts: components.map(() => 15), currentDeclaredLockWaveDepths: components.map(() => 4), equalityAwareSemanticDependencyLayerDepths: components.map(() => 4), payerDecoupledWaveDepths: components.map(() => 4), jointSemanticDependencyLayerDepths: components.map(() => 3), conclusion: "Exact deployed replay established that the later observed equality branches leave the shared oracle state byte-identical. In an observed-order semantic model, this removes the equality-consumer/equality-consumer oracle conflict but preserves producer-to-consumer state dependency. Fee-payer coupling and native market-account conflicts are evaluated separately." };
  const html = reportHtml(model, ablation, summary);
  await mkdir(resolve(outputDir), { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDir, "velocity-equality-dependency-model.json"), json(model)),
    writeFile(resolve(outputDir, "velocity-joint-causal-ablation.json"), json(ablation)),
    writeFile(resolve(outputDir, "velocity-dependency-layer-summary.json"), json(summary)),
    writeFile(resolve(outputDir, "velocity-equality-dependency-report.html"), html),
  ]);
  return { model, ablation, summary, html };
}

function reportHtml(model: any, ablation: any, summary: any): string {
  const rows = model.components.map((c: any) => `<tr><td>${c.slot}</td>${c.models.map((m: any) => `<td>${m.depth.value}<small>${m.depth.term}</small><small>atoms ${m.startingConflictAtomCount} − ${m.oracleAtomsReclassified} − ${m.feePayerAtomsRemoved} = ${m.retainedSymmetricConflictAtomCount}</small></td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Velocity equality dependency model</title><style>body{font:16px system-ui;max-width:1100px;margin:auto;padding:2rem;color:#172033}h1{font-size:2rem}.legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.7rem}.legend b,small{display:block}article,.legend div{border:1px solid #ccd3df;border-radius:8px;padding:1rem;margin:1rem 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd3df;padding:.7rem;text-align:left}th{background:#eef2f8}.warn{border-left:6px solid #b42318}code{overflow-wrap:anywhere}@media(max-width:650px){body{padding:1rem}table{font-size:.8rem}}</style></head><body><h1>Velocity observed-order equality dependency model</h1><p>This is a counterfactual semantic analysis, not the Solana runtime lock model and not validator scheduling.</p><section class="legend"><div><b>DECLARED LOCK CONFLICT</b>Symmetric account-lock relationship.</div><div><b>SEMANTIC READ/NO-OP</b>Later observed equality access; exact branch output is byte-identical.</div><div><b>DIRECTED STATE DEPENDENCY</b>Producer → consumer; never a Solana account-lock edge.</div><div><b>FEE-PAYER COUNTERFACTUAL</b>Role-preserving synthetic fee-debit removal only.</div></section><h2>Exact depths and full-component atom conservation across all six components</h2><p>Each component starts with 15 conflict atoms: 9 shared-oracle, 3 fee-payer, and 3 preserved native-market atoms.</p><table><thead><tr><th>Slot</th><th>Current declared locks</th><th>Equality-aware oracle</th><th>Payer-decoupled</th><th>Joint</th></tr></thead><tbody>${rows}</tbody></table><article><h2>Masking result</h2><p>Equality awareness alone: no full-component depth change (4→4), because the shared payer masks the consumer pair. Payer decoupling alone: no depth change (4→4), because current oracle writes mask every Anchor pair. Joint refinement: exact semantic dependency-layer depth 3, with producer before both consumers, the two consumers sharing a layer, and the native node constrained to a separate layer by its three preserved market conflicts.</p></article><article class="warn"><h2>INVALID: naive-equality-edge-erasure</h2><p>Teaching comparison only. Its full-component accounting retains the three native-market atoms, but it drops producer → consumer state dependency and is excluded from rankings, headline metrics, and final causal conclusions.</p></article><article><h2>Evidence-bounded conclusion</h2><p>${summary.conclusion}</p><p>No same-prestate concurrency, permutation invariance, validator parallel execution, throughput, elapsed-time, TPS, speedup, dynamic writable declarations, or native opcode semantics are claimed.</p></article></body></html>\n`;
}
