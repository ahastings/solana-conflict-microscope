import { spawnSync } from "node:child_process";
import { parseReviewerArgs } from "../src/reviewer-options.js";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { reviewCachedBlock, reviewConditionalGraph, reviewerSha256, runReviewer, type ReviewerManifest, type ReviewerResult } from "../src/reviewer.js";
import type { DependencyLayerGraph, DependencyLayerResult } from "../src/dependency-layers.js";

const fixtureDirectory = fileURLToPath(new URL("../fixtures/reviewer/", import.meta.url));
const manifest = JSON.parse(await readFile(join(fixtureDirectory, "manifest.json"), "utf8")) as ReviewerManifest;
const baselinePromise = runReviewer({ fixtureDirectory, outputDirectory: null });
const cachedBlock = async () => JSON.parse(await readFile(join(fixtureDirectory, manifest.cases[0]!.file), "utf8"));

function checkWitness(graph: DependencyLayerGraph, result: DependencyLayerResult): void {
  assert.equal(result.status, "exact");
  assert.deepEqual(result.layers.flat().sort((a, b) => a - b), [...graph.nodes].sort((a, b) => a - b));
  const layerOf = new Map(result.layers.flatMap((layer, index) => layer.map((node) => [node, index] as const)));
  for (const edge of graph.conflicts) assert.notEqual(layerOf.get(edge.source), layerOf.get(edge.target));
  for (const edge of graph.dependencies) assert.ok(layerOf.get(edge.source)! < layerOf.get(edge.target)!);
  assert.equal(result.depth, result.layers.length);
}

test("portable review derives all six component models and preserves hypotheses as unproven", async () => {
  const result = await baselinePromise;
  assert.equal(result.blocks.length, 6);
  assert.equal(result.networkRequests, 0); assert.equal(result.nativeExecutionPerformed, false);
  assert.equal(result.summary.wholeTransactionSemanticRefinementProven, false);
  assert.equal(result.historicalEvidenceReferences.status, "reference-only-not-bundled-or-reexecuted");
  for (const block of result.blocks) {
    assert.deepEqual(block.conditional.models.map((model) => model.solution.depth), [4, 4, 4, 3]);
    assert.equal(block.conditional.currentAtoms.length, 15);
    assert.ok(block.observedEvidence.every((item) => item.publicMessageSignatureVerified && item.payerDeclaredWritableSignerInInstructions && !item.wholeTransactionOracleNoOpProven));
    assert.equal(block.nativeSemantics, "unresolved-preserved-market-conflicts");
    const joint = block.conditional.models.find((model) => model.id === "joint")!;
    assert.equal(joint.retainedAtoms.length, 3); assert.equal(joint.dependencies.length, 2);
    assert.ok(joint.retainedAtoms.every((atom) => atom.source === block.conditional.roles.native || atom.target === block.conditional.roles.native));
    for (const model of block.conditional.models) checkWitness({ nodes: block.conditional.nodes, conflicts: model.conflicts, dependencies: model.dependencies }, model.solution);
    assert.equal(block.fullBlock.currentDeclaredLockDepth, Math.max(...block.fullBlock.components.map((component) => component.solution.depth)));
    assert.equal(block.fullBlock.conditionalJointDepth, Math.max(joint.solution.depth, block.fullBlock.deepestOtherComponentDepth));
    assert.equal(block.fullBlock.substitution.outsideAtomsBeforeSha256, block.fullBlock.substitution.outsideAtomsAfterSha256);
  }
});

test("controls distinguish cause masking, invalid dependency erasure, and unchanged outside bottlenecks", async () => {
  const result = await baselinePromise;
  for (const block of result.blocks) {
    assert.deepEqual(block.conditional.singleCauseMasking, { equalityOnlyChangesDepth: false, payerOnlyChangesDepth: false, jointChangesDepth: true });
    assert.equal(block.conditional.invalidProducerErasure.solution.depth, 2);
    assert.equal(block.conditional.invalidProducerErasure.validity, "INVALID");
    assert.equal(block.conditional.invalidProducerErasure.excludedFromConclusions, true);
  }
  const control = result.syntheticControls.unchangedDisconnectedClique;
  assert.equal(control.dataKind, "synthetic"); assert.equal(control.masksLocalReduction, true);
  assert.equal(control.current.depth, 4); assert.equal(control.conditionalJoint.depth, 4);
});

test("changed graph causes remain preserved and can erase the joint reduction", async () => {
  const original = (await baselinePromise).blocks[0]!.conditional;
  const { producer, consumers, native } = original.roles;
  const changed = reviewConditionalGraph({ nodes: original.nodes, producer, consumers, native, atoms: [...original.currentAtoms, { source: consumers[0]!, target: consumers[1]!, account: "synthetic-extra-consumer-cause" }], oracleAccounts: manifest.oracleAccounts, sharedPayer: manifest.sharedPayer });
  const joint = changed.models.find((model) => model.id === "joint")!;
  assert.equal(joint.solution.depth, 4);
  assert.ok(joint.retainedAtoms.some((atom) => atom.account === "synthetic-extra-consumer-cause"));
  assert.equal(changed.singleCauseMasking.jointChangesDepth, false);
});

test("byte tampering fails its pin before review output is written", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "reviewer-tamper-")), fixtures = join(temporary, "fixtures"), output = join(temporary, "out");
  await cp(fixtureDirectory, fixtures, { recursive: true });
  const file = join(fixtures, manifest.cases[0]!.file), bytes = await readFile(file);
  await writeFile(file, Buffer.concat([bytes, Buffer.from("\n")]));
  await assert.rejects(runReviewer({ fixtureDirectory: fixtures, outputDirectory: output }), /SHA-256 mismatch/);
  await assert.rejects(readdir(output), { code: "ENOENT" });
});

test("re-pinning changed graph bytes cannot bypass transaction identity and topology gates", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "reviewer-topology-")), fixtures = join(temporary, "fixtures");
  await cp(fixtureDirectory, fixtures, { recursive: true });
  const editedManifest = structuredClone(manifest), specification = editedManifest.cases[0]!, cached = await cachedBlock();
  for (const role of specification.consumers) cached.block.transactions[role.transactionIndex].transaction.message.accountKeys.push({ pubkey: "synthetic-extra-consumer-cause", signer: false, writable: true, source: "transaction" });
  const bytes = `${JSON.stringify(cached, null, 2)}\n`;
  await writeFile(join(fixtures, specification.file), bytes);
  specification.sha256 = reviewerSha256(bytes);
  await writeFile(join(fixtures, "manifest.json"), `${JSON.stringify(editedManifest, null, 2)}\n`);
  await assert.rejects(runReviewer({ fixtureDirectory: fixtures, outputDirectory: null }), /native market\/unknown conflict causes changed/);
});

test("misassigned signatures, equality logs, and instruction bytes fail closed", async () => {
  const specification = manifest.cases[0]!;
  const wrongIdentity = structuredClone(specification);
  wrongIdentity.producer.signature = specification.consumers[0]!.signature;
  const wrongIdentityBlock = await cachedBlock();
  assert.throws(() => reviewCachedBlock(wrongIdentityBlock, wrongIdentity, manifest));
  function invalidCheck(mutate: (cached: any) => void): Promise<void> {
    return cachedBlock().then((cached) => { mutate(cached); assert.throws(() => reviewCachedBlock(cached, specification, manifest)); });
  }
  await invalidCheck((cached) => { cached.block.transactions[specification.consumers[0]!.transactionIndex].meta.logMessages = []; });
  await invalidCheck((cached) => { cached.block.transactions[specification.producer.transactionIndex].rawTransaction.message.instructions[3].data = "11111111"; });
  await invalidCheck((cached) => { cached.block.transactions[specification.producer.transactionIndex].transaction.message.accountKeys[0].writable = false; });
});

test("review runs with only copied fixtures from a separate cwd and emits deterministic reports", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "reviewer-portable-")), fixtures = join(temporary, "fixtures"), output = join(temporary, "report");
  await cp(fixtureDirectory, fixtures, { recursive: true });
  const previousDirectory = process.cwd();
  let result: ReviewerResult;
  try {
    process.chdir(temporary);
    result = await runReviewer({ fixtureDirectory: fixtures, outputDirectory: output });
  } finally { process.chdir(previousDirectory); }
  assert.deepEqual(result!, await baselinePromise);
  const names = ["review.json", "review.html", "review.md"], before = await Promise.all(names.map((name) => readFile(join(output, name))));
  await runReviewer({ fixtureDirectory: fixtures, outputDirectory: output });
  const after = await Promise.all(names.map((name) => readFile(join(output, name))));
  assert.deepEqual(after, before);
  assert.match(before[1]!.toString(), /Whole-transaction semantic refinement remains unproven/);
  assert.match(before[2]!.toString(), /No native program execution was performed/);
  assert.equal(resolve(previousDirectory), process.cwd());
});


test("reviewer options reject ambiguity and malformed search budgets", () => {
  assert.deepEqual(parseReviewerArgs([]), { help: false, options: {} });
  assert.equal(parseReviewerArgs(['-h']).help, true);
  assert.equal(parseReviewerArgs(['--max-search-states=1']).options.maxSearchStates, 1);
  assert.equal(parseReviewerArgs(['--fixture-dir', 'a folder']).options.fixtureDirectory, resolve('a folder'));
  assert.equal(parseReviewerArgs(['--max-search-states', String(Number.MAX_SAFE_INTEGER)]).options.maxSearchStates, Number.MAX_SAFE_INTEGER);
  for (const args of [
    ['--output-dir', 'a', '--output-dir', 'b'], ['--fixture-dir=a', '--fixture-dir=b'],
    ['--help', '-h'], ['--help', '--unknown'], ['unexpected'], ['--output-dir'], ['--fixture-dir', '--help'],
    ['--output-dir='], ['--fixture-dir', '   '], ['--max-search-states', ''],
  ]) assert.throws(() => parseReviewerArgs(args), Error, JSON.stringify(args));
  for (const budget of ['0', '-1', '1.5', '1e3', 'NaN', 'Infinity', '9007199254740992', '9'.repeat(400)]) {
    assert.throws(() => parseReviewerArgs(['--max-search-states=' + budget]), /positive safe integer/, budget);
  }
});

test("reviewer rejects invalid API budgets before reading evidence", async () => {
  for (const maxSearchStates of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(runReviewer({ fixtureDirectory: 'nonexistent-review-fixtures', outputDirectory: null, maxSearchStates }), /maxSearchStates must be a positive safe integer/);
  }
});


test("reviewer CLI rejects invalid options before output creation", async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'reviewer-options-')), output = join(temporary, 'report');
  const script = fileURLToPath(new URL('../scripts/review-case.ts', import.meta.url));
  for (const extra of [['--max-search-states', '9007199254740992'], ['--output-dir', output]]) {
    const child = spawnSync(process.execPath, ['--import', 'tsx', script, '--fixture-dir', join(temporary, 'missing-fixtures'), '--output-dir', output, ...extra], { encoding: 'utf8' });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /positive safe integer|Duplicate option --output-dir/);
    assert.doesNotMatch(child.stderr, /ENOENT/);
    await assert.rejects(readdir(output), { code: 'ENOENT' });
  }
});
