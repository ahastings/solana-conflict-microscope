// Independent declared-lock certificate checker. No analyzer or graph solver imports.
function requireEvidence(value: unknown, message: string): asserts value {
  if (!value) throw new Error('Analysis verification failed: ' + message);
}
function object(value: unknown, label: string): Record<string, unknown> {
  requireEvidence(value !== null && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  return value as Record<string, unknown>;
}
function array(value: unknown, label: string): unknown[] {
  requireEvidence(Array.isArray(value), label + ' must be an array'); return value;
}
function integer(value: unknown, label: string): number {
  requireEvidence(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, label + ' must be a non-negative safe integer'); return value;
}
function strings(value: unknown, label: string): string[] {
  const values = array(value, label);
  requireEvidence(values.every(item => typeof item === 'string' && item.trim().length > 0), label + ' must contain nonblank strings');
  return values as string[];
}
const equal = (a: string[], b: string[]): boolean => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const pair = (a: number, b: number): string => Math.min(a,b) + ':' + Math.max(a,b);

export function verifyDeclaredAnalysis(value: unknown) {
  const input = object(value, 'analysis'), transactions = array(input.transactions, 'transactions');
  const statuses = { success: 0, failed: 0, unknown: 0 };
  const compute = transactions.map(value => {
    const tx = object(value, 'transaction');
    requireEvidence(tx.status === 'success' || tx.status === 'failed' || tx.status === 'unknown', 'invalid transaction status');
    statuses[tx.status]++;
    return tx.computeUnitsConsumed === null ? null : integer(tx.computeUnitsConsumed, 'transaction compute units');
  });
  const sumCompute = (values: Array<number | null>): number => {
    let total = 0;
    for (const value of values) if (value !== null) {
      requireEvidence(value <= Number.MAX_SAFE_INTEGER - total, 'compute total exceeds safe integer range');
      total += value;
    }
    return total;
  };
  const totalCompute = sumCompute(compute), knownCount = compute.filter(value => value !== null).length;
  const accounts = transactions.map((value, index) => {
    const tx = object(value, 'transaction'); requireEvidence(tx.index === index, 'transaction indexes must match block positions');
    const access = new Map<string, boolean>();
    for (const value of array(tx.accounts, 'accounts')) {
      const account = object(value, 'account');
      requireEvidence(typeof account.pubkey === 'string' && account.pubkey.trim() && typeof account.writable === 'boolean', 'invalid account access');
      requireEvidence(!access.has(account.pubkey), 'duplicate normalized account'); access.set(account.pubkey, account.writable);
    }
    requireEvidence(access.size > 0, 'transaction has no declared accounts');
    requireEvidence(equal(strings(tx.readSet, 'readSet'), [...access].filter(([,write]) => !write).map(([address]) => address)), 'readSet disagrees with accounts');
    requireEvidence(equal(strings(tx.writeSet, 'writeSet'), [...access].filter(([,write]) => write).map(([address]) => address)), 'writeSet disagrees with accounts');
    return access;
  });
  const expected = new Map<string, string[]>();
  for (let left = 0; left < accounts.length; left++) for (let right = left + 1; right < accounts.length; right++) {
    const causes: string[] = [];
    for (const [address, writable] of accounts[left]!) {
      const other = accounts[right]!.get(address);
      if (other !== undefined && (writable || other)) causes.push(address);
    }
    if (causes.length) expected.set(pair(left,right), causes);
  }
  const observed = new Set<string>();
  for (const value of array(input.conflictEdges, 'conflictEdges')) {
    const edge = object(value, 'edge'), source = integer(edge.source, 'edge source'), target = integer(edge.target, 'edge target'), key = pair(source,target);
    requireEvidence(!observed.has(key), 'duplicate conflict pair'); observed.add(key);
    const causes = expected.get(key); requireEvidence(causes !== undefined, 'unexpected conflict pair');
    requireEvidence(equal(strings(edge.accounts, 'edge accounts'), causes), 'conflicting account causes disagree');
  }
  requireEvidence(observed.size === expected.size, 'missing conflict pairs');
  // Reconstruct connectivity from independently derived account conflicts.
  const neighbors = accounts.map(() => new Set<number>());
  for (const key of expected.keys()) {
    const [left, right] = key.split(':').map(Number);
    neighbors[left!]!.add(right!); neighbors[right!]!.add(left!);
  }
  const componentKey = (members: number[]): string => JSON.stringify([...members].sort((a, b) => a - b));
  const expectedComponents = new Set<string>(), visited = new Set<number>();
  for (let start = 0; start < accounts.length; start++) {
    if (visited.has(start)) continue;
    const pending = [start], members: number[] = []; visited.add(start);
    while (pending.length) {
      const node = pending.pop()!; members.push(node);
      for (const peer of neighbors[node]!) if (!visited.has(peer)) { visited.add(peer); pending.push(peer); }
    }
    expectedComponents.add(componentKey(members));
  }
  const componentIds = new Set<number>(), observedComponents = new Set<string>();
  for (const value of array(input.components, 'components')) {
    const component = object(value, 'component'), id = integer(component.id, 'component id');
    requireEvidence(!componentIds.has(id), 'duplicate component id'); componentIds.add(id);
    const members = array(component.transactionIndexes, 'component transactions').map(value => integer(value, 'component transaction'));
    requireEvidence(members.length > 0 && new Set(members).size === members.length, 'empty or duplicate component membership');
    const key = componentKey(members);
    requireEvidence(expectedComponents.has(key) && !observedComponents.has(key), 'component membership disagrees with declared connectivity');
    observedComponents.add(key);
  }
  requireEvidence(observedComponents.size === expectedComponents.size, 'incomplete component coverage');
  const signatures = array(input.contentionSignatures, 'contentionSignatures');
  const signatureGroups = new Set<string>(), signaturePairs = new Set<string>();
  for (const value of signatures) {
    const signature = object(value, 'contention signature'), causes = strings(signature.accounts, 'signature accounts');
    const group = JSON.stringify([...causes].sort()), pairs = array(signature.pairs, 'signature pairs');
    requireEvidence(!signatureGroups.has(group), 'duplicate contention signature account group');signatureGroups.add(group);
    requireEvidence(pairs.length > 0 && signature.edgeCount === pairs.length, 'contention signature edge count disagrees');
    for (const value of pairs) {
      const members = array(value, 'signature pair');requireEvidence(members.length === 2, 'signature pair must have two transactions');
      const key = pair(integer(members[0], 'signature source'),integer(members[1], 'signature target'));
      requireEvidence(!signaturePairs.has(key), 'duplicate pair in contention signatures');signaturePairs.add(key);
      const expectedCauses = expected.get(key);
      requireEvidence(expectedCauses !== undefined && equal(causes,expectedCauses), 'contention signature causes disagree');
    }
  }
  requireEvidence(signaturePairs.size === expected.size, 'contention signatures omit conflict pairs');
  const waves = array(input.waves, 'waves'), positions = new Map<number, number>();
  waves.forEach((value, wave) => {
    const members = array(value, 'wave'); requireEvidence(members.length > 0, 'empty wave');
    for (const value of members) {
      const index = integer(value, 'wave transaction'); requireEvidence(index < transactions.length && !positions.has(index), 'missing, duplicate, or foreign wave transaction'); positions.set(index,wave);
    }
  });
  requireEvidence(positions.size === transactions.length, 'incomplete wave coverage');
  for (const key of expected.keys()) {
    const [source,target] = key.split(':').map(Number); requireEvidence(positions.get(source!) !== positions.get(target!), 'conflicting transactions share a wave');
  }
  const contexts = array(input.waveContext, 'waveContext');
  requireEvidence(contexts.length === waves.length, 'wave context count disagrees');
  let maximumWidth = 0;
  waves.forEach((value, wave) => {
    const members = array(value, 'wave') as number[], context = object(contexts[wave], 'wave context');
    const indexes = array(context.transactionIndexes, 'wave context indexes').map(value => integer(value, 'wave context transaction'));
    requireEvidence(JSON.stringify(indexes) === JSON.stringify(members), 'wave context membership disagrees');
    const values = members.map(index => compute[index]!);
    let maximum = 0, unknown = 0;
    for (const value of values) if (value === null) unknown++; else maximum = Math.max(maximum, value);
    requireEvidence(context.wave === wave && context.transactionCount === members.length, 'wave context identity or count disagrees');
    requireEvidence(context.knownComputeUnitsTotal === sumCompute(values) && context.maximumTransactionComputeUnits === maximum && context.unknownComputeUnitCount === unknown, 'wave compute evidence disagrees');
    maximumWidth = Math.max(maximumWidth, members.length);
  });
  const bounds = object(input.blockWaveBounds, 'blockWaveBounds');
  const witness = array(bounds.cliqueWitness, 'cliqueWitness (regenerate older reports to retain this evidence)').map(value => integer(value, 'clique transaction'));
  requireEvidence(new Set(witness).size === witness.length && witness.every(index => index < transactions.length), 'invalid clique membership');
  for (let i = 0; i < witness.length; i++) for (const other of witness.slice(i+1)) requireEvidence(expected.has(pair(witness[i]!,other)), 'clique pair does not conflict');
  const lower = integer(bounds.cliqueLowerBound, 'lower bound'), upper = integer(bounds.generatedWaveUpperBound, 'upper bound');
  requireEvidence(lower === witness.length && upper === waves.length && lower <= upper, 'bounds disagree with witnesses');
  requireEvidence(bounds.boundsMatch === (lower === upper) && bounds.provenMinimumWaveCount === (lower === upper ? lower : null), 'minimum-count claim disagrees with bounds');
  const summary = object(input.summary, 'summary');
  requireEvidence(summary.componentCount === expectedComponents.size, 'summary component count disagrees');
  requireEvidence(summary.transactionCount === transactions.length && summary.conflictEdgeCount === expected.size && summary.waveCount === waves.length, 'summary counts disagree');
  requireEvidence(summary.successCount === statuses.success && summary.failureCount === statuses.failed && summary.unknownStatusCount === statuses.unknown, 'summary status counts disagree');
  requireEvidence(summary.totalKnownComputeUnits === totalCompute && summary.knownComputeUnitTransactionCount === knownCount && summary.unknownComputeUnitTransactionCount === transactions.length - knownCount, 'summary compute counts or total disagree');
  const coverage = transactions.length === 0 ? 0 : Number((knownCount / transactions.length).toFixed(6));
  requireEvidence(summary.knownComputeUnitCoverage === coverage && summary.maximumWaveWidth === maximumWidth, 'summary compute coverage or wave width disagrees');
  return { status: 'verified' as const, scope: 'declared-block-conflicts-components-wave-bounds-status-and-compute', transactions: transactions.length, conflictPairs: expected.size, connectedComponentCount: expectedComponents.size, contentionSignatureCount: signatures.length, lowerBound: lower, upperBound: upper, provenMinimumWaveCount: lower === upper ? lower : null,
    computeEvidence: { totalKnownComputeUnits: totalCompute, knownTransactionCount: knownCount, unknownTransactionCount: transactions.length - knownCount },
    limitations: 'Checks internal consistency of supplied normalized transactions, connected-component membership, and full-block evidence, not RPC authenticity, component semantic summaries, counterfactual semantics, or validator execution.' };
}
