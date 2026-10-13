/** A finite mathematical model, not a validator scheduling or execution model. */
export interface LayerConstraint {
  source: number;
  target: number;
}

export interface DependencyLayerGraph {
  nodes: readonly number[];
  conflicts: readonly LayerConstraint[];
  dependencies: readonly LayerConstraint[];
}

interface LayerResultBase {
  /** A checked feasible witness, including when the search budget is exhausted. */
  layers: number[][];
  lowerBound: number;
  upperBound: number;
  searchStates: number;
}

export type DependencyLayerResult =
  | (LayerResultBase & { status: "exact"; depth: number })
  | (LayerResultBase & { status: "inconclusive"; depth: null; reason: "search-budget-exhausted" });

export const MAX_DEPENDENCY_LAYER_NODES = 12;
const DEFAULT_SEARCH_STATES = 250_000;

/**
 * Minimize layers subject to symmetric conflicts (different layers) and directed
 * dependencies (source strictly earlier). Reject malformed/infeasible inputs;
 * never promote an exhausted search's feasible upper bound to an exact result.
 */
export function solveDependencyLayers(
  graph: DependencyLayerGraph,
  options: { maxSearchStates?: number } = {},
): DependencyLayerResult {
  const limit = options.maxSearchStates ?? DEFAULT_SEARCH_STATES;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("maxSearchStates must be a positive safe integer");
  const nodes = [...graph.nodes].sort((a, b) => a - b);
  if (nodes.some((node) => !Number.isSafeInteger(node) || node < 0)) throw new Error("Node IDs must be nonnegative safe integers");
  if (new Set(nodes).size !== nodes.length) throw new Error("Duplicate node ID");
  if (nodes.length > MAX_DEPENDENCY_LAYER_NODES) throw new Error(`At most ${MAX_DEPENDENCY_LAYER_NODES} nodes are supported`);
  const indexes = new Map(nodes.map((node, index) => [node, index]));
  const conflicts = nodes.map(() => new Set<number>());
  const predecessors = nodes.map(() => new Set<number>());
  const successors = nodes.map(() => new Set<number>());
  const distinct = nodes.map(() => new Set<number>());
  for (const [kind, constraints] of [["conflict", graph.conflicts], ["dependency", graph.dependencies]] as const) {
    for (const constraint of constraints) {
      const source = indexes.get(constraint.source), target = indexes.get(constraint.target);
      if (source === undefined || target === undefined) throw new Error(`Unknown node in ${kind}`);
      if (source === target) throw new Error(`Self ${kind} cannot be layered`);
      distinct[source]!.add(target); distinct[target]!.add(source);
      if (kind === "conflict") {
        conflicts[source]!.add(target); conflicts[target]!.add(source);
      } else {
        successors[source]!.add(target); predecessors[target]!.add(source);
      }
    }
  }
  // Numeric tie-breaking makes the witness independent of input order.
  const order: number[] = [], remaining = nodes.map((_, index) => index);
  while (remaining.length > 0) {
    const selected = remaining.findIndex((node) => [...predecessors[node]!].every((parent) => order.includes(parent)));
    if (selected < 0) throw new Error("Directed dependency cycle cannot be layered");
    order.push(remaining.splice(selected, 1)[0]!);
  }
  if (nodes.length === 0) return { status: "exact", depth: 0, layers: [], lowerBound: 0, upperBound: 0, searchStates: 0 };

  const earliest = nodes.map(() => 0), tail = nodes.map(() => 0);
  for (const node of order) earliest[node] = Math.max(0, ...[...predecessors[node]!].map((parent) => earliest[parent]! + 1));
  for (const node of [...order].reverse()) tail[node] = Math.max(0, ...[...successors[node]!].map((child) => tail[child]! + 1));
  // Every directed pair also needs distinct layers. Enumerating <= 4096 subsets
  // gives an independent clique lower bound; path length respects direction.
  let lowerBound = Math.max(...earliest) + 1;
  for (let mask = 1; mask < 2 ** nodes.length; mask += 1) {
    const subset = nodes.flatMap((_, index) => (mask & (1 << index)) !== 0 ? [index] : []);
    if (subset.length > lowerBound && subset.every((node, i) => subset.slice(i + 1).every((other) => distinct[node]!.has(other)))) lowerBound = subset.length;
  }
  const greedy = nodes.map(() => -1);
  for (const node of order) {
    let layer = Math.max(0, ...[...predecessors[node]!].map((parent) => greedy[parent]! + 1));
    const forbidden = new Set([...conflicts[node]!].map((other) => greedy[other]));
    while (forbidden.has(layer)) layer += 1;
    greedy[node] = layer;
  }
  const upperBound = Math.max(...greedy) + 1;
  const witness = (assignment: number[]): number[][] => {
    const layers = Array.from({ length: Math.max(...assignment) + 1 }, () => [] as number[]);
    nodes.forEach((node, index) => layers[assignment[index]!]!.push(node));
    return layers;
  };
  const greedyLayers = witness(greedy);
  let searchStates = 0;
  for (let depth = lowerBound; depth < upperBound; depth += 1) {
    const assignment = nodes.map(() => -1);
    let exhausted = false;
    const search = (position: number): boolean => {
      if (searchStates >= limit) { exhausted = true; return false; }
      searchStates += 1;
      if (position === order.length) return true;
      const node = order[position]!;
      const first = Math.max(earliest[node]!, ...[...predecessors[node]!].map((parent) => assignment[parent]! + 1));
      const last = depth - 1 - tail[node]!;
      const forbidden = new Set([...conflicts[node]!].map((other) => assignment[other]));
      for (let layer = first; layer <= last; layer += 1) {
        if (forbidden.has(layer)) continue;
        assignment[node] = layer;
        if (search(position + 1)) return true;
        assignment[node] = -1;
        if (exhausted) return false;
      }
      return false;
    };
    if (search(0)) return { status: "exact", depth, layers: witness(assignment), lowerBound: depth, upperBound: depth, searchStates };
    if (exhausted) return { status: "inconclusive", depth: null, reason: "search-budget-exhausted", layers: greedyLayers, lowerBound: depth, upperBound, searchStates };
    lowerBound = depth + 1;
  }
  return { status: "exact", depth: upperBound, layers: greedyLayers, lowerBound, upperBound, searchStates };
}
