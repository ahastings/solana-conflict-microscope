import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EXPECTED_ELF_SHA256, MILESTONE_24_OUTCOME, runMilestone24 } from "../src/milestone24.js";

const plan = "research-plans/velocity-equality-dependency-milestone-2.4.json";

test("Milestone 2.4 preserves six observed components and the frozen evidence boundary", async () => {
  const out = await mkdtemp(join(tmpdir(), "m24-"));
  const result = await runMilestone24(plan, out, true);
  assert.equal(result.model.outcome, MILESTONE_24_OUTCOME);
  assert.equal(result.model.evidenceBoundary.executableSha256, EXPECTED_ELF_SHA256);
  assert.equal(result.model.evidenceBoundary.timestampField, "[16,24)");
  assert.equal(result.model.components.length, 6);
  assert.ok(result.model.components.every((component) => component.equalityConsumerTransactionIndexes.length === 2));
});

test("four valid models independently expose masking and exact joint depth", async () => {
  const out = await mkdtemp(join(tmpdir(), "m24-"));
  const result = await runMilestone24(plan, out, true);
  for (const component of result.model.components) {
    assert.deepEqual(component.models.map((model) => model.model), ["current-declared-locks", "equality-aware-oracle", "payer-decoupled", "joint-equality-aware-plus-payer-decoupled"]);
    assert.deepEqual(component.models.map((model) => model.depth.value), [4, 4, 4, 3]);
    assert.equal(component.models[1]!.oracleAtomsReclassified, 9);
    assert.equal(component.models[1]!.survivingSymmetricConflictEdges.length, 6);
    assert.equal(component.models[1]!.survivingDirectedDependencies.length, 2);
    assert.equal(component.models[2]!.feePayerAtomsRemoved, 3);
    assert.equal(component.models[3]!.survivingSymmetricConflictEdges.length, 3);
    assert.equal(component.models[3]!.survivingDirectedDependencies.length, 2);
    assert.equal(component.nativeNode.preservedMarketRelationships.length, 3);
  }
});

test("full-component conflict atoms are conserved and support every surviving symmetric edge", async () => {
  const out = await mkdtemp(join(tmpdir(), "m24-"));
  const result = await runMilestone24(plan, out, true);
  const expected = [
    { model: "current-declared-locks", oracle: 9, feePayer: 3, nativeMarket: 3, retained: 15 },
    { model: "equality-aware-oracle", oracle: 0, feePayer: 3, nativeMarket: 3, retained: 6 },
    { model: "payer-decoupled", oracle: 9, feePayer: 0, nativeMarket: 3, retained: 12 },
    { model: "joint-equality-aware-plus-payer-decoupled", oracle: 0, feePayer: 0, nativeMarket: 3, retained: 3 },
  ];
  const pairKey = (source: number, target: number) => `${Math.min(source, target)}:${Math.max(source, target)}`;
  for (const component of result.model.components) {
    for (const [index, model] of component.models.entries()) {
      const counts = expected[index]!;
      assert.equal(model.model, counts.model);
      assert.equal(model.anchorConflictAtomCount, 12);
      assert.equal(model.fullComponentConflictAtomCount, 15);
      assert.equal(model.startingConflictAtomCount, 15);
      assert.equal(model.startingConflictAtomCount - model.oracleAtomsReclassified - model.feePayerAtomsRemoved, model.retainedSymmetricConflictAtomCount);
      assert.equal(model.retainedSymmetricConflictAtomCount, counts.retained);
      assert.deepEqual(model.retainedConflictAtomCounts, { oracle: counts.oracle, feePayer: counts.feePayer, nativeMarket: counts.nativeMarket });
      assert.equal(model.retainedConflictAtoms.length, counts.retained);
      const retainedPairs = new Set(model.retainedConflictAtoms.map((atom) => pairKey(atom.source, atom.target)));
      assert.ok(model.survivingSymmetricConflictEdges.every((edge) => retainedPairs.has(edge.pair)));
    }
    const nativeIndex = component.nativeNode.transactionIndex;
    const nativeAtoms = component.models[0]!.retainedConflictAtoms.filter((atom) => atom.cause === "native-market");
    assert.equal(nativeAtoms.length, 3);
    assert.ok(nativeAtoms.every((atom) => atom.source === nativeIndex && atom.kind === "preserved-native-market-declared-lock-conflict"));
    assert.deepEqual(new Set(nativeAtoms.map((atom) => atom.target)), new Set([component.observedProducerTransactionIndex, ...component.equalityConsumerTransactionIndexes]));
    assert.deepEqual(nativeAtoms.map((atom) => atom.account).sort(), component.nativeNode.preservedMarketRelationships.flatMap((edge) => edge.accounts).sort());
  }
});

test("every Anchor pair has atom accounting and producer dependencies are never erased", async () => {
  const out = await mkdtemp(join(tmpdir(), "m24-"));
  const result = await runMilestone24(plan, out, true);
  for (const component of result.model.components) {
    assert.equal(component.anchorPairs.length, 3);
    assert.ok(component.anchorPairs.every((pair) => pair.currentAtoms.length === 4 && pair.oracleAtomsReclassified === 3 && pair.feePayerAtomRemovedInPayerCounterfactual === 1));
    assert.equal(component.anchorPairs.filter((pair) => pair.producerConsumerDependencyReclassified).length, 2);
    assert.equal(component.invalidNegativeControl.validity, "INVALID");
    assert.equal(component.invalidNegativeControl.fullComponentConflictAtomCount, 15);
    assert.equal(component.invalidNegativeControl.retainedConflictAtomCounts.nativeMarket, 3);
    assert.equal(component.invalidNegativeControl.retainedConflictAtoms.filter((atom) => atom.cause === "native-market").length, 3);
  }
});

test("Milestone 2.4 artifacts regenerate byte-identically and use bounded terminology", async () => {
  const one = await mkdtemp(join(tmpdir(), "m24-a-"));
  const two = await mkdtemp(join(tmpdir(), "m24-b-"));
  await runMilestone24(plan, one, true); await runMilestone24(plan, two, true);
  for (const name of ["velocity-equality-dependency-model.json", "velocity-joint-causal-ablation.json", "velocity-dependency-layer-summary.json", "velocity-equality-dependency-report.html"]) assert.deepEqual(await readFile(join(one, name)), await readFile(join(two, name)));
  const html = await readFile(join(one, "velocity-equality-dependency-report.html"), "utf8");
  for (const term of ["DECLARED LOCK CONFLICT", "SEMANTIC READ/NO-OP", "DIRECTED STATE DEPENDENCY", "FEE-PAYER COUNTERFACTUAL", "not validator scheduling", "INVALID"]) assert.match(html, new RegExp(term.replace("/", "\\/"), "i"));
  assert.doesNotMatch(html, /achieves? (a )?(speedup|higher TPS)|transactions may execute concurrently from the same prestate/i);
});

test("Milestone 2.4 remains cache-only", async () => {
  await assert.rejects(runMilestone24(plan, await mkdtemp(join(tmpdir(), "m24-")), false), /cache-only/);
});
