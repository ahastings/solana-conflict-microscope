export const WAVE_ORDER_LIMITS = { maxWork: 200_000, maxNodes: 1024, maxEdges: 100_000 } as const;
export const WAVE_HEURISTIC_DESCRIPTION = `First-fit in block order supplies the initial grouping. A deterministic saturation-degree ordering (ties by degree, then transaction index) may replace it only with a verified strictly smaller grouping. Optimization is limited to ${WAVE_ORDER_LIMITS.maxWork} counted operations, ${WAVE_ORDER_LIMITS.maxNodes} transactions, and ${WAVE_ORDER_LIMITS.maxEdges} conflict pairs; ties or exhausted limits retain first-fit. Counterfactuals may reuse shorter witnesses after checking complete transaction coverage and every retained conflict. These are graph upper bounds, not measured execution times.`;

/** Try a bounded deterministic coloring; retain the supplied witness on ties or exhaustion. */
export function improveWaveOrder(nodes: number[], edges: ReadonlyArray<{ source: number; target: number }>, baseline: number[][], maxWork: number = WAVE_ORDER_LIMITS.maxWork): number[][] {
  if (!Number.isSafeInteger(maxWork) || maxWork < 0) throw new Error("maxWork must be a non-negative safe integer");
  if (baseline.length <= 2 || nodes.length > WAVE_ORDER_LIMITS.maxNodes || edges.length > WAVE_ORDER_LIMITS.maxEdges) return baseline;
  let work = 0;
  const neighbors = new Map(nodes.map(node => [node, new Set<number>()]));
  for (const { source, target } of edges) {
    if (++work > maxWork) return baseline;
    if (source === target || !neighbors.has(source) || !neighbors.has(target)) return baseline;
    neighbors.get(source)!.add(target); neighbors.get(target)!.add(source);
  }
  const remaining = new Set(nodes), colors = new Map<number, number>();
  const forbidden = new Map(nodes.map(node => [node, new Set<number>()]));
  const waves: number[][] = [];
  while (remaining.size) {
    let selected: number | undefined;
    for (const node of remaining) {
      if (++work > maxWork) return baseline;
      if (selected === undefined || forbidden.get(node)!.size > forbidden.get(selected)!.size ||
        (forbidden.get(node)!.size === forbidden.get(selected)!.size && (neighbors.get(node)!.size > neighbors.get(selected)!.size ||
          (neighbors.get(node)!.size === neighbors.get(selected)!.size && node < selected)))) selected = node;
    }
    const node = selected!; let color = 0;
    while (forbidden.get(node)!.has(color)) { if (++work > maxWork) return baseline; color++; }
    // Adding more vertices cannot reduce the number of colors already used.
    if (color + 1 >= baseline.length) return baseline;
    colors.set(node, color); (waves[color] ??= []).push(node); remaining.delete(node);
    for (const peer of neighbors.get(node)!) {
      if (++work > maxWork) return baseline;
      if (remaining.has(peer)) forbidden.get(peer)!.add(color);
    }
  }
  if (colors.size !== nodes.length || waves.flat().length !== nodes.length) return baseline;
  for (const { source, target } of edges) {
    if (++work > maxWork || colors.get(source) === colors.get(target)) return baseline;
  }
  return waves.map(wave => wave.sort((a, b) => a - b));
}


/** Reuse a shorter witness only after checking complete coverage and every retained edge. */
export function reuseWaveWitness(nodes: number[], edges: ReadonlyArray<{source:number;target:number}>, baseline: number[][], alternatives: number[][][]): number[][] {
  let best = baseline;
  const expected = new Set(nodes);
  for (const candidate of alternatives) {
    if (candidate.length >= best.length || candidate.some(wave => wave.length === 0)) continue;
    const positions = new Map<number, number>(); let valid = true;
    for (let wave = 0; wave < candidate.length; wave++) for (const node of candidate[wave]!) {
      if (!expected.has(node) || positions.has(node)) valid = false;
      positions.set(node, wave);
    }
    if (!valid || positions.size !== expected.size) continue;
    if (edges.some(edge => !positions.has(edge.source) || !positions.has(edge.target) || positions.get(edge.source) === positions.get(edge.target))) continue;
    best = candidate;
  }
  return best;
}


/** First-fit in the supplied node order, using only assigned conflict neighbors.
 * Callers supply unique nodes and a loop-free graph over those nodes.
 */
export function firstFitByEdges(nodes: number[], edges: ReadonlyArray<{source:number;target:number}>): number[][] {
  const neighbors = new Map(nodes.map(node => [node, new Set<number>()]));
  for (const {source,target} of edges) {
    neighbors.get(source)!.add(target); neighbors.get(target)!.add(source);
  }
  const assigned = new Map<number, number>(), waves: number[][] = [];
  for (const node of nodes) {
    const forbidden = new Set<number>();
    for (const peer of neighbors.get(node)!) {
      const wave = assigned.get(peer);
      if (wave !== undefined) forbidden.add(wave);
    }
    let wave = 0;
    while (forbidden.has(wave)) wave++;
    assigned.set(node,wave); (waves[wave] ??= []).push(node);
  }
  return waves;
}
