import assert from "node:assert/strict";
import test from "node:test";
import { solveDependencyLayers, type DependencyLayerGraph, type DependencyLayerResult } from "../src/dependency-layers.js";

const pairs = (nodes: number[]) => nodes.flatMap((source, index) => nodes.slice(index + 1).map((target) => ({ source, target })));
const joint: DependencyLayerGraph = {
  nodes: [1, 2, 3, 24],
  conflicts: [1, 2, 3].map((target) => ({ source: 24, target })),
  dependencies: [2, 3].map((target) => ({ source: 1, target })),
};

function checkWitness(graph: DependencyLayerGraph, result: DependencyLayerResult): void {
  assert.deepEqual(result.layers.flat().sort((a, b) => a - b), [...graph.nodes].sort((a, b) => a - b));
  assert.ok(result.layers.every((layer) => layer.length > 0));
  const layerOf = new Map(result.layers.flatMap((layer, index) => layer.map((node) => [node, index] as const)));
  for (const edge of graph.conflicts) assert.notEqual(layerOf.get(edge.source), layerOf.get(edge.target));
  for (const edge of graph.dependencies) assert.ok(layerOf.get(edge.source)! < layerOf.get(edge.target)!);
  assert.equal(result.upperBound, result.layers.length);
  if (result.status === "exact") assert.equal(result.depth, result.lowerBound);
}

test("mixed layering computes a clique and the conditional producer/consumers/native witness", () => {
  const clique = { nodes: [...joint.nodes], conflicts: pairs([...joint.nodes]), dependencies: [] };
  const current = solveDependencyLayers(clique), conditional = solveDependencyLayers(joint);
  assert.equal(current.depth, 4); assert.equal(conditional.depth, 3);
  checkWitness(clique, current); checkWitness(joint, conditional);
  assert.ok(conditional.layers.some((layer) => layer.includes(2) && layer.includes(3)));
});

test("equality-only payer constraints and payer-only oracle constraints each mask the reduction", () => {
  const anchorClique = pairs([1, 2, 3]);
  for (const dependencies of [joint.dependencies, []]) {
    const graph = { ...joint, conflicts: [...joint.conflicts, ...anchorClique], dependencies };
    const result = solveDependencyLayers(graph);
    assert.equal(result.status, "exact"); assert.equal(result.depth, 4); checkWitness(graph, result);
  }
});

test("changed topology changes the result, and dropping producer dependencies is a distinct invalid semantic control", () => {
  const withoutNative = { nodes: [1, 2, 3], conflicts: [], dependencies: joint.dependencies };
  const consumerConflict = { ...joint, conflicts: [...joint.conflicts, { source: 2, target: 3 }] };
  const erasedDependencies = { ...joint, dependencies: [] };
  for (const [graph, depth] of [[withoutNative, 2], [consumerConflict, 4], [erasedDependencies, 2]] as const) {
    const result = solveDependencyLayers(graph); assert.equal(result.depth, depth); checkWitness(graph, result);
  }
});

test("directed paths are ordered rather than merely colored", () => {
  const graph = { nodes: [8, 3, 5, 1], conflicts: [], dependencies: [{ source: 8, target: 3 }, { source: 3, target: 5 }, { source: 5, target: 1 }] };
  const result = solveDependencyLayers(graph);
  assert.equal(result.depth, 4); assert.deepEqual(result.layers, [[8], [3], [5], [1]]); checkWitness(graph, result);
});

test("empty, isolated, duplicate constraints, and reordered inputs have deterministic witnesses", () => {
  assert.deepEqual(solveDependencyLayers({ nodes: [], conflicts: [], dependencies: [] }), { status: "exact", depth: 0, layers: [], lowerBound: 0, upperBound: 0, searchStates: 0 });
  const isolated = { nodes: [7, 4], conflicts: [], dependencies: [] };
  assert.deepEqual(solveDependencyLayers(isolated).layers, [[4, 7]]);
  const reordered = { nodes: [...joint.nodes].reverse(), conflicts: [...joint.conflicts].reverse().concat(joint.conflicts), dependencies: [...joint.dependencies].reverse().concat(joint.dependencies) };
  assert.deepEqual(solveDependencyLayers(reordered), solveDependencyLayers(joint));
});

test("cycles and invalid constraints fail closed", () => {
  for (const graph of [
    { ...joint, nodes: [1, 1, 2, 3, 24] },
    { ...joint, conflicts: [{ source: 1, target: 99 }] },
    { ...joint, dependencies: [{ source: 99, target: 1 }] },
    { ...joint, conflicts: [{ source: 1, target: 1 }] },
    { ...joint, dependencies: [{ source: 1, target: 1 }] },
    { ...joint, dependencies: [{ source: 1, target: 2 }, { source: 2, target: 3 }, { source: 3, target: 1 }] },
    { nodes: [-1], conflicts: [], dependencies: [] },
    { nodes: [NaN], conflicts: [], dependencies: [] },
    { nodes: Array.from({ length: 13 }, (_, i) => i), conflicts: [], dependencies: [] },
  ]) assert.throws(() => solveDependencyLayers(graph));
  assert.throws(() => solveDependencyLayers(joint, { maxSearchStates: 0 }));
});

test("an odd cycle requires search; exhausting its budget never asserts exactness", () => {
  const cycle = { nodes: [0, 1, 2, 3, 4], conflicts: [0, 1, 2, 3, 4].map((source) => ({ source, target: (source + 1) % 5 })), dependencies: [] };
  const exact = solveDependencyLayers(cycle), limited = solveDependencyLayers(cycle, { maxSearchStates: 1 });
  assert.equal(exact.status, "exact"); assert.equal(exact.depth, 3); assert.ok(exact.searchStates > 0);
  assert.equal(limited.status, "inconclusive"); assert.equal(limited.depth, null);
  assert.equal(limited.lowerBound, 2); assert.equal(limited.upperBound, 3); assert.equal(limited.searchStates, 1);
  checkWitness(cycle, exact); checkWitness(cycle, limited);
});

// A separate brute-force oracle checks every conflict graph on four vertices,
// with several acyclic precedence patterns, including incompatible color orders.
test("finite solver agrees with independent exhaustive assignment enumeration", () => {
  const nodes = [0, 1, 2, 3], edges = pairs(nodes);
  const patterns = [[], [{ source: 3, target: 0 }], [{ source: 0, target: 1 }, { source: 2, target: 3 }], [{ source: 2, target: 0 }, { source: 0, target: 3 }]];
  for (let mask = 0; mask < 2 ** edges.length; mask += 1) {
    for (const dependencies of patterns) {
      const graph = { nodes, conflicts: edges.filter((_, i) => (mask & (1 << i)) !== 0), dependencies };
      let expected = 4;
      for (let code = 0; code < 4 ** 4; code += 1) {
        const assignment = nodes.map((_, index) => Math.floor(code / 4 ** index) % 4);
        if (graph.conflicts.every((edge) => assignment[edge.source] !== assignment[edge.target]) && dependencies.every((edge) => assignment[edge.source]! < assignment[edge.target]!)) expected = Math.min(expected, Math.max(...assignment) + 1);
      }
      const result = solveDependencyLayers(graph);
      assert.equal(result.depth, expected, JSON.stringify(graph)); checkWitness(graph, result);
    }
  }
});
