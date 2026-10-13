import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBlock } from "./analyze.js";
import { decodeBase58Bytes, ED25519_PROGRAM_ID, parseEd25519Instruction } from "./ed25519.js";
import { solveDependencyLayers, type DependencyLayerResult, type LayerConstraint } from "./dependency-layers.js";
import type { ConflictAtom, FixtureProvenance, NormalizedTransaction, RpcBlock, RpcTransactionEntry } from "./types.js";

export interface ReviewerRole { transactionIndex: number; signature: string }
export interface ReviewerCase {
  slot: number;
  file: string;
  sha256: string;
  originalPath: string;
  provenance: FixtureProvenance;
  componentId: number;
  producer: ReviewerRole;
  consumers: ReviewerRole[];
  native: ReviewerRole;
  postDataSha256: string;
  signedMessageSha256: string;
}
export interface ReviewerManifest {
  schemaVersion: "reviewer-1";
  title: string;
  programId: string;
  sharedPayer: string;
  oracleAccounts: string[];
  historicalEvidenceReferences: {
    deployedElfSha256: string;
    linuxExecutionRecordSha256: string;
    status: "reference-only-not-bundled-or-reexecuted";
    scope: string;
  };
  cases: ReviewerCase[];
}

type ExactLayers = Extract<DependencyLayerResult, { status: "exact" }>;
type Cause = "shared-oracle" | "shared-payer" | "preserved-other";
type ClassifiedAtom = ConflictAtom & { cause: Cause };
export interface ConditionalGraphInput {
  nodes: number[];
  producer: number;
  consumers: number[];
  native: number;
  atoms: ConflictAtom[];
  oracleAccounts: string[];
  sharedPayer: string;
}

const PROGRAM = "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P";
const POST_PREFIX = "daedaaf5278fa621";
const TWAP_BYTES = "f717ff41d45addc2";
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
export const reviewerSha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const pair = (source: number, target: number): string => `${Math.min(source, target)}:${Math.max(source, target)}`;
function requireReview(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reviewer rejected input: ${message}`);
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const sorted = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);

function exact(nodes: number[], conflicts: LayerConstraint[], dependencies: LayerConstraint[], maxSearchStates?: number): ExactLayers {
  const result = solveDependencyLayers({ nodes, conflicts, dependencies }, maxSearchStates === undefined ? {} : { maxSearchStates });
  requireReview(result.status === "exact", "layer search is inconclusive; increase the explicit search budget before making an exact claim");
  return result;
}

/** Apply hypotheses only to Anchor/Anchor atoms; preserve every other cause. */
export function reviewConditionalGraph(input: ConditionalGraphInput, maxSearchStates?: number) {
  const { nodes, producer, consumers, native, atoms, oracleAccounts, sharedPayer } = input;
  requireReview(consumers.length === 2 && same(sorted(nodes), sorted([producer, ...consumers, native])) && new Set(nodes).size === 4, "expected distinct producer, two consumers, and native nodes");
  requireReview(oracleAccounts.length === 3 && new Set(oracleAccounts).size === 3 && !oracleAccounts.includes(sharedPayer), "oracle/payer identities overlap or are incomplete");
  requireReview(new Set(atoms.map((atom) => `${pair(atom.source, atom.target)}:${atom.account}`)).size === atoms.length, "duplicate conflict atom");
  const anchors = new Set([producer, ...consumers]);
  const classified: ClassifiedAtom[] = atoms.map((atom) => {
    requireReview(nodes.includes(atom.source) && nodes.includes(atom.target) && atom.source !== atom.target && typeof atom.account === "string" && atom.account.length > 0, "invalid conflict atom");
    const anchorPair = anchors.has(atom.source) && anchors.has(atom.target);
    return { ...atom, cause: anchorPair && oracleAccounts.includes(atom.account) ? "shared-oracle" : anchorPair && atom.account === sharedPayer ? "shared-payer" : "preserved-other" };
  });
  const dependencies = consumers.map((target) => {
    const accounts = classified.filter((atom) => atom.cause === "shared-oracle" && pair(atom.source, atom.target) === pair(producer, target)).map((atom) => atom.account).sort();
    requireReview(same(accounts, [...oracleAccounts].sort()), "producer/consumer oracle evidence is incomplete");
    return { source: producer, target, accounts };
  });
  const make = (id: string, equalityHypothesis: boolean, payerHypothesis: boolean, keepDependencies = true) => {
    const retainedAtoms = classified.filter((atom) => !(equalityHypothesis && atom.cause === "shared-oracle") && !(payerHypothesis && atom.cause === "shared-payer"));
    const removedAtoms = classified.filter((atom) => !retainedAtoms.includes(atom));
    const edgePairs = [...new Set(retainedAtoms.map((atom) => pair(atom.source, atom.target)))].sort();
    const conflicts = edgePairs.map((key) => { const [source, target] = key.split(":").map(Number); return { source: source!, target: target! }; });
    const directedDependencies = equalityHypothesis && keepDependencies ? dependencies : [];
    return { id, conditional: equalityHypothesis || payerHypothesis, equalityHypothesis, payerHypothesis, retainedAtoms, removedAtoms, conflicts, dependencies: directedDependencies, solution: exact(nodes, conflicts, directedDependencies, maxSearchStates) };
  };
  const models = [make("current-declared-locks", false, false), make("equality-only", true, false), make("payer-only", false, true), make("joint", true, true)];
  return {
    nodes: sorted(nodes), roles: { producer, consumers: sorted(consumers), native }, currentAtoms: classified, models,
    invalidProducerErasure: { ...make("invalid-producer-erasure", true, true, false), validity: "INVALID" as const, excludedFromConclusions: true, reason: "Drops producer-to-consumer dependencies; its smaller mathematical depth is not a valid semantic conclusion." },
    singleCauseMasking: { equalityOnlyChangesDepth: models[1]!.solution.depth < models[0]!.solution.depth, payerOnlyChangesDepth: models[2]!.solution.depth < models[0]!.solution.depth, jointChangesDepth: models[3]!.solution.depth < models[0]!.solution.depth },
  };
}

function validateManifest(manifest: ReviewerManifest): void {
  const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  const role = (value: ReviewerRole) => value && Number.isSafeInteger(value.transactionIndex) && value.transactionIndex >= 0 && typeof value.signature === "string" && value.signature.length > 0;
  requireReview(manifest.schemaVersion === "reviewer-1" && manifest.programId === PROGRAM && typeof manifest.title === "string", "manifest identity/schema changed");
  requireReview(Array.isArray(manifest.oracleAccounts) && manifest.oracleAccounts.length === 3 && new Set(manifest.oracleAccounts).size === 3 && typeof manifest.sharedPayer === "string", "invalid account identities");
  requireReview(manifest.historicalEvidenceReferences?.status === "reference-only-not-bundled-or-reexecuted" && hash(manifest.historicalEvidenceReferences.deployedElfSha256) && hash(manifest.historicalEvidenceReferences.linuxExecutionRecordSha256), "historical evidence must remain reference-only");
  requireReview(Array.isArray(manifest.cases) && manifest.cases.length === 6 && new Set(manifest.cases.map((item) => item.slot)).size === 6, "expected six distinct observed blocks");
  for (const item of manifest.cases) {
    requireReview(Number.isSafeInteger(item.slot) && item.slot > 0 && Number.isSafeInteger(item.componentId), "invalid slot/component identity");
    requireReview(typeof item.file === "string" && item.file === basename(item.file) && /^slot-\d+\.json$/.test(item.file), "block paths must be local fixture filenames");
    requireReview(hash(item.sha256) && hash(item.postDataSha256) && hash(item.signedMessageSha256), "invalid evidence hash");
    requireReview(role(item.producer) && role(item.native) && Array.isArray(item.consumers) && item.consumers.length === 2 && item.consumers.every(role), "invalid transaction role identities");
    requireReview(item.provenance?.cluster === "devnet" && item.provenance.dataKind === "real-network" && typeof item.originalPath === "string", "missing public-block provenance");
  }
}

function validateInstructionRepresentations(entry: RpcTransactionEntry): void {
  const parsed = entry.transaction.message.instructions, raw = entry.rawTransaction?.message.instructions;
  requireReview(parsed && raw && parsed.length === raw.length, "both instruction representations are required");
  const keys = entry.transaction.message.accountKeys.map((account) => account.pubkey);
  for (let index = 0; index < raw.length; index += 1) {
    const compiled = raw[index]!, described = parsed[index]!;
    requireReview("programId" in described && described.programId === keys[compiled.programIdIndex] && described.data === compiled.data && same(described.accounts, compiled.accounts.map((position) => keys[position])), "raw/parsed instruction representations disagree");
  }
}

function anchorEvidence(transaction: NormalizedTransaction, specification: ReviewerCase, manifest: ReviewerManifest, producer: boolean) {
  const outer = transaction.instructions.filter((instruction) => instruction.location === "outer");
  requireReview(transaction.status === "success" && outer.length === 5 && transaction.instructions.length === 5, "Anchor status or five-instruction identity changed");
  const post = outer[3]!, twap = outer[4]!;
  requireReview(outer[2]!.programId === ED25519_PROGRAM_ID && post.programId === PROGRAM && twap.programId === PROGRAM, "Anchor instruction program identity changed");
  const bytes = outer.map((instruction) => instruction.data === null ? null : Buffer.from(decodeBase58Bytes(instruction.data)));
  requireReview(bytes[3]?.subarray(0, 8).toString("hex") === POST_PREFIX && reviewerSha256(bytes[3]) === specification.postDataSha256 && bytes[4]?.toString("hex") === TWAP_BYTES, "Post/TWAP instruction bytes changed");
  requireReview(transaction.feePayer === manifest.sharedPayer, "shared payer identity changed");
  const expectedPost = [manifest.sharedPayer, "3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL", "Sysvar1nstructions1111111111111111111111111", ...manifest.oracleAccounts];
  requireReview(same(post.accountAddresses, expectedPost), "Post account wrapper changed");
  for (const account of [...manifest.oracleAccounts, manifest.sharedPayer]) requireReview(transaction.accounts.find((item) => item.pubkey === account)?.writable, "oracle/payer writable declaration changed");
  requireReview(transaction.accounts.find((item) => item.pubkey === manifest.sharedPayer)?.signer && twap.accountAddresses.includes(manifest.sharedPayer), "writable payer instruction role changed");
  const twapOracle = twap.accountAddresses[2], twapMarket = twap.accountAddresses[1];
  requireReview(twapOracle && manifest.oracleAccounts.includes(twapOracle) && twapMarket && transaction.writeSet.includes(twapMarket), "TWAP writable account roles changed");
  const verification = parseEd25519Instruction(bytes, 2), signature = verification.signatures[0];
  requireReview(verification.status === "decoded" && verification.signatures.length === 1 && signature?.locallyVerified && signature.messageSha256 === specification.signedMessageSha256, "signed message verification/reuse changed");
  requireReview(signature.signatureReference.resolvedInstructionIndex === 3 && signature.publicKeyReference.resolvedInstructionIndex === 3 && signature.messageReference.resolvedInstructionIndex === 3, "Ed25519 cross-instruction references changed");
  const posting = transaction.logMessages.flatMap((log) => { const match = /^Program log: Posting new lazer update\. current ts (\d+) < next_timestamp (\d+)$/.exec(log); return match ? [{ current: match[1]!, next: match[2]! }] : []; });
  const skipping = transaction.logMessages.flatMap((log) => { const match = /^Program log: Skipping lazer price update\. next_timestamp (\d+) <= current_timestamp (\d+)$/.exec(log); return match ? [{ current: match[2]!, next: match[1]! }] : []; });
  requireReview(producer ? posting.length === 3 && skipping.length === 0 && posting.every((item) => BigInt(item.current) < BigInt(item.next)) : skipping.length === 3 && posting.length === 0 && skipping.every((item) => item.current === item.next), "observed posting/equality role logs changed");
  const timestamps = (producer ? posting : skipping).map((item) => item.next);
  requireReview(new Set(timestamps).size === 1, "inconsistent observed message timestamps");
  return { transactionIndex: transaction.index, signature: transaction.signature, observedRole: producer ? "posting-log-producer" : "equality-log-consumer", postDataSha256: reviewerSha256(bytes[3]), signedMessageSha256: signature.messageSha256, publicMessageSignatureVerified: true, observedNextTimestamp: timestamps[0]!, twapOracle, twapMarket, payerDeclaredWritableSignerInInstructions: true, wholeTransactionOracleNoOpProven: false };
}

/** Does not execute instructions or infer deployed semantics from log text. */
export function reviewCachedBlock(cached: { slot: number; block: unknown; provenance: FixtureProvenance }, specification: ReviewerCase, manifest: ReviewerManifest, maxSearchStates?: number) {
  requireReview(cached.slot === specification.slot && same(cached.provenance, specification.provenance), "block slot/provenance identity changed");
  const analysis = analyzeBlock(cached.block, specification.slot, "fixture", cached.provenance);
  const roles = [specification.producer, ...specification.consumers, specification.native], nodes = sorted(roles.map((role) => role.transactionIndex));
  requireReview(new Set(nodes).size === 4 && new Set(roles.map((role) => role.signature)).size === 4, "duplicate role node/signature");
  for (const role of roles) {
    requireReview(analysis.transactions[role.transactionIndex]?.signature === role.signature && analysis.transactions[role.transactionIndex]?.status === "success", "transaction signature/status identity changed");
    validateInstructionRepresentations((cached.block as RpcBlock).transactions[role.transactionIndex]!);
  }
  requireReview(specification.consumers.every((role) => role.transactionIndex > specification.producer.transactionIndex), "producer must precede observed consumers");
  const component = analysis.components.find((item) => item.id === specification.componentId);
  requireReview(component && same(component.transactionIndexes, nodes), "target component identity/isolation changed");
  const selected = new Set(nodes);
  requireReview(!analysis.conflictEdges.some((edge) => selected.has(edge.source) !== selected.has(edge.target)), "target has external conflicts");
  const evidence = [anchorEvidence(analysis.transactions[specification.producer.transactionIndex]!, specification, manifest, true), ...specification.consumers.map((role) => anchorEvidence(analysis.transactions[role.transactionIndex]!, specification, manifest, false))];
  requireReview(new Set(evidence.map((item) => item.observedNextTimestamp)).size === 1 && new Set(evidence.map((item) => item.twapMarket)).size === 3 && new Set(evidence.map((item) => item.twapOracle)).size === 3, "repeated message or distinct TWAP roles changed");
  const native = analysis.transactions[specification.native.transactionIndex]!;
  requireReview(native.instructions.some((instruction) => instruction.programId === PROGRAM && instruction.data !== null && Buffer.from(decodeBase58Bytes(instruction.data)).subarray(0, 5).toString("hex") === "ffffffff02"), "unresolved native prefix identity changed");
  const atoms = analysis.conflictEdges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)).flatMap((edge) => edge.accounts.map((account) => ({ source: edge.source, target: edge.target, account })));
  const conditional = reviewConditionalGraph({ nodes, producer: specification.producer.transactionIndex, consumers: specification.consumers.map((role) => role.transactionIndex), native: specification.native.transactionIndex, atoms, oracleAccounts: manifest.oracleAccounts, sharedPayer: manifest.sharedPayer }, maxSearchStates);
  const expectedNative = evidence.map((item) => `${pair(native.index, item.transactionIndex)}:${item.twapMarket}`).sort();
  const preserved = conditional.currentAtoms.filter((atom) => atom.cause === "preserved-other");
  requireReview(same(preserved.map((atom) => `${pair(atom.source, atom.target)}:${atom.account}`).sort(), expectedNative), "native market/unknown conflict causes changed");
  requireReview(conditional.currentAtoms.filter((atom) => atom.cause === "shared-oracle").length === 9 && conditional.currentAtoms.filter((atom) => atom.cause === "shared-payer").length === 3, "three-oracle/shared-payer Anchor topology changed");

  const components = analysis.components.map((item) => {
    const members = new Set(item.transactionIndexes);
    const currentEdges = analysis.conflictEdges.filter((edge) => members.has(edge.source) && members.has(edge.target));
    return { id: item.id, nodes: item.transactionIndexes, currentEdges, solution: exact(item.transactionIndexes, currentEdges, [], maxSearchStates) };
  });
  const otherComponents = components.filter((item) => item.id !== specification.componentId);
  const currentDepth = Math.max(0, ...components.map((item) => item.solution.depth));
  const deepestOther = Math.max(0, ...otherComponents.map((item) => item.solution.depth));
  const joint = conditional.models.find((model) => model.id === "joint")!;
  const currentAtoms = analysis.conflictEdges.flatMap((edge) => edge.accounts.map((account) => ({ source: edge.source, target: edge.target, account })));
  const outsideAtoms = currentAtoms.filter((atom) => !selected.has(atom.source) || !selected.has(atom.target));
  const substitutedAtoms = [...outsideAtoms, ...joint.retainedAtoms.map(({ source, target, account }) => ({ source, target, account }))];
  const outsideAfter = substitutedAtoms.filter((atom) => !selected.has(atom.source) || !selected.has(atom.target));
  const beforeHash = reviewerSha256(json(outsideAtoms)), afterHash = reviewerSha256(json(outsideAfter));
  requireReview(beforeHash === afterHash && joint.dependencies.every((edge) => selected.has(edge.source) && selected.has(edge.target)), "substitution altered non-target constraints");
  const conditionalDepth = Math.max(joint.solution.depth, deepestOther);
  return {
    slot: specification.slot, input: { file: specification.file, sha256: specification.sha256, originalPath: specification.originalPath, provenance: specification.provenance },
    observedEvidence: evidence, nativeSemantics: "unresolved-preserved-market-conflicts", conditional,
    fullBlock: { transactionCount: analysis.summary.transactionCount, componentCount: components.length, currentDeclaredLockDepth: currentDepth, deepestOtherComponentDepth: deepestOther, conditionalJointDepth: conditionalDepth, reducesDepth: conditionalDepth < currentDepth, components, substitution: { targetIsIsolated: true, outsideAtomsBeforeSha256: beforeHash, outsideAtomsAfterSha256: afterHash, outsideAtomCount: outsideAtoms.length, retainedTargetAtoms: joint.retainedAtoms.length, directedDependencies: joint.dependencies.length, nonTargetConstraintsUnchanged: true } },
  };
}

const BOUNDARIES = [
  "The reviewer reanalyzes bundled public blocks and computes conditional graph layers. It performs no native ELF execution and no network requests.",
  "Historical Post-only execution is a separate recorded experiment. Its ELF and execution-record hashes are references only here, not revalidated execution evidence.",
  "Equality refinement assumes the whole consumer transaction has a compatible oracle read/no-op footprint after its producer. Trailing TWAP mutation semantics remain unproven; observed equality logs do not prove this assumption.",
  "Payer refinement hypothetically removes shared payer coupling, including explicit writable instruction roles. Changing only transaction fee debit has not been shown to implement it.",
  "Native-prefix-discriminator-2 remains unresolved; every observed native market conflict is preserved.",
  "All depths are declared-lock or conditional semantic-model results, not validator scheduling, same-prestate concurrency, throughput, or elapsed-time measurements.",
] as const;

export async function runReviewer(options: { fixtureDirectory?: string; outputDirectory?: string | null; maxSearchStates?: number } = {}) {
  if (options.maxSearchStates !== undefined && (!Number.isSafeInteger(options.maxSearchStates) || options.maxSearchStates < 1)) throw new Error("maxSearchStates must be a positive safe integer");
  const fixtureDirectory = options.fixtureDirectory ?? fileURLToPath(new URL("../fixtures/reviewer/", import.meta.url));
  const manifestBytes = await readFile(resolve(fixtureDirectory, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as ReviewerManifest;
  validateManifest(manifest);
  const blocks = [];
  for (const specification of manifest.cases) {
    const bytes = await readFile(resolve(fixtureDirectory, specification.file));
    requireReview(reviewerSha256(bytes) === specification.sha256, `SHA-256 mismatch for ${specification.file}`);
    blocks.push(reviewCachedBlock(JSON.parse(bytes.toString("utf8")) as { slot: number; block: RpcBlock; provenance: FixtureProvenance }, specification, manifest, options.maxSearchStates));
  }
  // Synthetic controls isolate the hypothesis error and full-block masking rule.
  const control = blocks[0]!.conditional, joint = control.models.find((model) => model.id === "joint")!;
  const isolatedCliqueNodes = [100, 101, 102, 103];
  const isolatedCliqueEdges = isolatedCliqueNodes.flatMap((source, index) => isolatedCliqueNodes.slice(index + 1).map((target) => ({ source, target })));
  const maskedCurrent = exact([...control.nodes, ...isolatedCliqueNodes], [...control.models[0]!.conflicts, ...isolatedCliqueEdges], [], options.maxSearchStates);
  const maskedJoint = exact([...control.nodes, ...isolatedCliqueNodes], [...joint.conflicts, ...isolatedCliqueEdges], joint.dependencies, options.maxSearchStates);
  const result = {
    schemaVersion: "reviewer-1", title: manifest.title, manifestSha256: reviewerSha256(manifestBytes), evidenceScope: "public-block-validation-and-conditional-graph-recomputation", networkRequests: 0, nativeExecutionPerformed: false,
    historicalEvidenceReferences: manifest.historicalEvidenceReferences, boundaries: BOUNDARIES, blocks,
    summary: { observedBlocks: blocks.length, conditionalFullBlocksReduced: blocks.filter((block) => block.fullBlock.reducesDepth).length, localDepths: blocks.map((block) => ({ slot: block.slot, depths: Object.fromEntries(block.conditional.models.map((model) => [model.id, model.solution.depth])) })), wholeTransactionSemanticRefinementProven: false },
    syntheticControls: { unchangedDisconnectedClique: { dataKind: "synthetic", current: maskedCurrent, conditionalJoint: maskedJoint, masksLocalReduction: maskedJoint.depth === maskedCurrent.depth, interpretation: "An unchanged disconnected clique can determine full-block depth even when the target component's conditional depth falls." } },
  };
  if (options.outputDirectory !== null) {
    const output = options.outputDirectory ?? resolve("output/reviewer");
    await mkdir(output, { recursive: true });
    const markdown = reviewerMarkdown(result);
    await Promise.all([writeFile(resolve(output, "review.json"), json(result)), writeFile(resolve(output, "review.md"), markdown), writeFile(resolve(output, "review.html"), reviewerHtml(result))]);
  }
  return result;
}

export type ReviewerResult = Awaited<ReturnType<typeof runReviewer>>;
const witnessText = (layers: number[][]): string => layers.map((nodes, index) => `Layer ${index + 1}: ${nodes.join(", ")}`).join("; ");
function reviewerMarkdown(result: ReviewerResult): string {
  const witnesses = result.blocks.map((block) => {
    const { producer, consumers, native } = block.conditional.roles;
    const models = block.conditional.models.map((model) => '| ' + model.id + ' | ' + witnessText(model.solution.layers) + ' | ' + (model.dependencies.map(edge => edge.source + ' → ' + edge.target).join('; ') || 'none') + ' |').join('\n');
    return '### Slot ' + block.slot + '\n\nProducer: #' + producer + '; consumers: ' + consumers.map(index => '#' + index).join(', ') + '; native transaction: #' + native + '.\n\n| Model | Exact graph-layer witness | Directed dependencies |\n| --- | --- | --- |\n' + models;
  }).join('\n\n');
  const rows = result.blocks.map((block) => `| ${block.slot} | ${block.conditional.models.map((model) => model.solution.depth).join(" | ")} | ${block.fullBlock.currentDeclaredLockDepth} → ${block.fullBlock.conditionalJointDepth} |`).join("\n");
  return `# Velocity conditional graph review\n\n## Public block evidence and conditional graph calculations\n\nRecomputed from ${result.blocks.length} bundled public devnet blocks. No native program execution was performed. Whole-transaction oracle no-op semantics remain unproven.\n\n| Slot | Current declared | Equality only | Payer only | Joint | Full block, conditional |\n| --- | --- | --- | --- | --- | --- |\n${rows}\n\nComputed witnesses for every reviewed block. Numbers identify transaction indexes; only directed dependencies require an earlier layer.\n\n${witnesses}\n\nThe single-cause models preserve masking. The joint result is conditional on both stated hypotheses, retains producer-to-consumer dependencies, and preserves native market conflicts. The producer-erasure comparison is INVALID and excluded from conclusions. A synthetic disconnected-clique control masks the local reduction.\n\n${result.boundaries.map((boundary) => `- ${boundary}`).join("\n")}\n\nThe JSON report contains source hashes, observed roles, public signature checks, exact layer witnesses, retained/removed atoms, and an explicit substitution conservation check. Native evidence hashes in the manifest are reference-only.\n`;
}
function reviewerHtml(result: ReviewerResult): string {
  const escape = (value: string | number): string => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  const rows = result.blocks.map((block) => `<tr><td>${block.slot}</td>${block.conditional.models.map((model) => `<td>${model.solution.depth}</td>`).join("")}<td>${block.fullBlock.currentDeclaredLockDepth} → ${block.fullBlock.conditionalJointDepth}</td></tr>`).join("");
  const witnesses = result.blocks.map((block) => {
    const { producer, consumers, native } = block.conditional.roles;
    const models = block.conditional.models.map((model) => '<tr><td>' + escape(model.id) + '</td><td>' + escape(witnessText(model.solution.layers)) + '</td><td>' + escape(model.dependencies.map(edge => edge.source + ' → ' + edge.target).join('; ') || 'none') + '</td></tr>').join('');
    return '<details class="block-witness" id="witness-' + block.slot + '"><summary>Slot ' + block.slot + ': inspect four model witnesses</summary><p>Producer: #' + producer + '; consumers: ' + consumers.map(index => '#' + index).join(', ') + '; native transaction: #' + native + '.</p><div class="table"><table><thead><tr><th>Model</th><th>Exact graph-layer witness</th><th>Directed dependencies</th></tr></thead><tbody>' + models + '</tbody></table></div></details>';
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Velocity conditional graph review</title><style>body{font:16px/1.5 system-ui;max-width:1000px;margin:auto;padding:24px;color:#192638}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border:1px solid #ccd5df}.table{overflow-x:auto}.boundary{padding:16px;background:#fff1dc;border-left:4px solid #bb761a}a{color:#175aa5}details{margin:16px 0;border:1px solid #ccd5df;padding:12px}summary{cursor:pointer;font-weight:600}</style><h1>Velocity conditional graph review</h1><h2>Public block evidence and conditional graph calculations</h2><p class="boundary">Whole-transaction semantic refinement remains unproven. This command validates bundled public blocks and computes conditional graph layers; it does not execute the deployed program.</p><div class="table"><table><thead><tr><th>Slot</th><th>Current</th><th>Equality only</th><th>Payer only</th><th>Joint</th><th>Full block, conditional</th></tr></thead><tbody>${rows}</tbody></table></div><h2>Computed witnesses for every reviewed block</h2><p>Expand a slot to inspect its four model witnesses and transaction roles. Only directed dependencies require an earlier layer; these are graph-model witnesses.</p>${witnesses}<p>Every depth is computed from explicit constraints with an exact witness. Single-cause models expose masking; the joint model retains producer-to-consumer dependencies and native market conflicts. Producer erasure is an INVALID comparison excluded from conclusions.</p><p>A synthetic unchanged disconnected-clique control ${result.syntheticControls.unchangedDisconnectedClique.masksLocalReduction ? "masks" : "does not mask"} the local reduction.</p><ul>${result.boundaries.map((boundary) => `<li>${escape(boundary)}</li>`).join("")}</ul><p><a href="review.json">Inspect all evidence, atoms, and witnesses (JSON)</a> · <a href="review.md">Read the concise review</a></p></html>\n`;
}
