import { buildCounterfactualModels } from "../src/semantic.js";
import { verifyDeclaredAnalysis } from "../src/verify-analysis.js";
import { firstFitByEdges, improveWaveOrder, reuseWaveWitness } from "../src/wave-order.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { analyzeBlock, buildConflictData, detectProgramBufferWriteSequences, normalizeConflictClass, scheduleWaves, transactionsConflict } from "../src/analyze.js";
import { normalizeBlock } from "../src/normalize.js";
import { htmlReport, writeReports } from "../src/report.js";
import { rankCrossPayerCandidates } from "../src/scanner.js";
import type { NormalizedTransaction, RpcBlock, RpcParsedAccount } from "../src/types.js";

const account = (pubkey: string, writable: boolean, source: "transaction" | "lookupTable" = "transaction", signer = false): RpcParsedAccount => ({ pubkey, signer, writable, source });
const block = (keys: RpcParsedAccount[][], failed = new Set<number>()): RpcBlock => ({
  blockhash: "block", previousBlockhash: "previous", parentSlot: 41,
  transactions: keys.map((accountKeys, i) => ({ transaction: { signatures: [`sig-${i}`], message: { accountKeys } }, meta: { err: failed.has(i) ? { failed: true } : null, fee: 5000, computeUnitsConsumed: 100 + i } })),
});
const txs = (keys: RpcParsedAccount[][]): NormalizedTransaction[] => normalizeBlock(block(keys), 42);
const payer = (address: string): RpcParsedAccount => account(address, true, "transaction", true);
const loadFixture = async (path: string): Promise<{ slot: number; block: unknown; provenance: Record<string, unknown> }> => JSON.parse(await readFile(path, "utf8")) as { slot: number; block: unknown; provenance: Record<string, unknown> };
const loaderBlock = (writes: Array<{ offset: number; length: number; buffer?: string; authority?: string }>): RpcBlock => {
  const result = block(writes.map((write, index) => [payer(`P${index}`), account(write.buffer ?? "BufferA", true), account(write.authority ?? "AuthorityA", false), account("BPFLoaderUpgradeab1e11111111111111111111111", false)]));
  result.transactions.forEach((entry, index) => {
    const write = writes[index]!;
    entry.transaction.message.instructions = [{ programId: "BPFLoaderUpgradeab1e11111111111111111111111", program: "bpf-upgradeable-loader", parsed: { type: "write", info: { account: write.buffer ?? "BufferA", authority: write.authority ?? "AuthorityA", offset: write.offset, bytes: Buffer.alloc(write.length, index + 1).toString("base64") } } }];
  });
  return result;
};

test("read/read access does not conflict", () => assert.deepEqual(transactionsConflict(...txs([[payer("P1"), account("A", false)], [payer("P2"), account("A", false)]]) as [NormalizedTransaction, NormalizedTransaction]), []));
test("read/write access conflicts", () => assert.deepEqual(transactionsConflict(...txs([[payer("P1"), account("A", false)], [payer("P2"), account("A", true)]]) as [NormalizedTransaction, NormalizedTransaction]), ["A"]));
test("write/write access conflicts", () => assert.deepEqual(transactionsConflict(...txs([[payer("P1"), account("A", true)], [payer("P2"), account("A", true)]]) as [NormalizedTransaction, NormalizedTransaction]), ["A"]));
test("multiple shared conflict accounts are labeled", () => assert.deepEqual(transactionsConflict(...txs([[payer("P1"), account("A", true), account("B", false)], [payer("P2"), account("A", false), account("B", true)]]) as [NormalizedTransaction, NormalizedTransaction]), ["A", "B"]));

test("duplicates collapse, writable dominates, and lookup source is preserved", () => {
  const [tx] = txs([[payer("P"), account("A", false), account("A", true, "lookupTable")]]);
  assert.equal(tx?.accounts.length, 2); assert.deepEqual(tx?.writeSet, ["A", "P"]); assert.deepEqual(tx?.staticAccountKeys, ["P", "A"]); assert.deepEqual(tx?.loadedAccountKeys, []);
});

test("failed status remains labeled", () => assert.equal(normalizeBlock(block([[payer("P"), account("ALT", true, "lookupTable")]], new Set([0])), 42)[0]?.status, "failed"));

test("fee-payer-only conflicts are separated", () => {
  const analysis = analyzeBlock(block([[payer("P"), account("A", false)], [payer("P"), account("B", false)]]), 42, "fixture");
  assert.equal(analysis.summary.feePayerOnlyConflictEdgeCount, 1); assert.equal(analysis.conflictEdges[0]?.classification, "fee-payer-only");
});

test("same payer plus shared account conflicts are separated without assuming state", () => {
  const analysis = analyzeBlock(block([[payer("P"), account("S", true)], [payer("P"), account("S", true)]]), 42, "fixture");
  assert.equal(analysis.summary.samePayerSharedAccountConflictEdgeCount, 1); assert.equal(analysis.conflictEdges[0]?.classification, "same-payer-shared-account"); assert.deepEqual(analysis.conflictEdges[0]?.accounts, ["P", "S"]);
});

test("cross-payer shared account conflicts are separated without assuming state", () => {
  const analysis = analyzeBlock(block([[payer("P1"), account("S", true)], [payer("P2"), account("S", true)]]), 42, "fixture");
  assert.equal(analysis.summary.crossPayerSharedAccountConflictEdgeCount, 1); assert.equal(analysis.conflictEdges[0]?.classification, "cross-payer-shared-account");
});

test("overlapping causes report non-additive exclusive and overlap counts", () => {
  const data = buildConflictData(txs([[payer("P"), account("S", true)], [payer("P"), account("S", true)]]));
  assert.equal(data.signatures.length, 1); assert.deepEqual(data.signatures[0]?.accounts, ["P", "S"]);
  for (const address of ["P", "S"]) { const stat = data.accounts.find((item) => item.account === address); assert.equal(stat?.uniquePairCoverage, 1); assert.equal(stat?.exclusiveEdgeCount, 0); assert.equal(stat?.overlappingEdgeCount, 1); }
});

test("dominant component counterfactual and pairwise clique bound are valid", () => {
  const analysis = analyzeBlock(block([[payer("P"), account("S", true)], [payer("P"), account("S", true)], [payer("P"), account("S", true)], [payer("Q"), account("I", true)]]), 42, "fixture");
  assert.equal(analysis.summary.waveCount, 3); assert.equal(analysis.summary.feePayerExcludedAnalyticalWaveCount, 3); assert.equal(analysis.summary.dominantComponentExcludedWaveCount, 1);
  assert.equal(analysis.summary.largestPairwiseConflictGroupLowerBound, 3); assert.equal(analysis.summary.largestPairwiseConflictBoundIsExact, true);
  assert.equal(analysis.dominantComponent?.estimatedWaveContext.length, 3); const firstWaveContext = analysis.dominantComponent?.estimatedWaveContext[0]; assert.ok(firstWaveContext); assert.equal(firstWaveContext.maximumTransactionComputeUnits > 0, true);
});

test("every generated wave is internally conflict-free", () => {
  const transactions = txs([[payer("P1"), account("A", true)], [payer("P2"), account("A", false)], [payer("P3"), account("B", true)], [payer("P4"), account("A", true), account("B", false)], [payer("P5"), account("C", false)]]);
  for (const wave of scheduleWaves(transactions)) for (let i = 0; i < wave.length; i++) for (let j = i + 1; j < wave.length; j++) assert.deepEqual(transactionsConflict(transactions[wave[i]!]!, transactions[wave[j]!]!), []);
});

test("instruction evidence preserves parsed and raw outer/inner representations", async () => {
  const fixture = await loadFixture("fixtures/real-devnet-block.json"); const transactions = normalizeBlock(fixture.block, fixture.slot);
  const loaderWrite = transactions.flatMap((tx) => tx.instructions).find((ix) => ix.parsedType === "write");
  assert.equal(loaderWrite?.programLabel, "BPF Upgradeable Loader"); assert.equal(loaderWrite?.decodeStatus, "parsed"); assert.notEqual(loaderWrite?.parsedRepresentation, null); assert.notEqual(loaderWrite?.rawRepresentation, null); assert.equal(loaderWrite?.dataEncoding, "base58");
  assert.equal(transactions.some((tx) => tx.logMessages.length > 0), true); assert.equal(transactions.some((tx) => tx.instructions.some((ix) => ix.location === "inner")), true);
});

test("role inference includes confidence/evidence and unknown accounts are not silently labeled", async () => {
  const fixture = await loadFixture("fixtures/cross-payer-application-state-teaching.json"); const analysis = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
  const shared = analysis.transactions[1]?.accounts.find((item) => item.pubkey === "SharedApplicationState");
  assert.equal(shared?.knownLabel, null); assert.equal(shared?.roles.some((role) => role.role === "state account" && role.confidence === "high" && role.evidence.includes("RPC-decoded")), true);
});

test("instruction decoding falls back without inventing roles", () => {
  const input = block([[payer("P"), account("UnknownState", true), account("UnknownProgram", false)]]);
  input.transactions[0]!.transaction.message.instructions = [{ programId: "UnknownProgram", accounts: ["UnknownState"], data: "abc", stackHeight: 1 }];
  const [tx] = normalizeBlock(input, 42); const unknown = tx?.accounts.find((item) => item.pubkey === "UnknownState");
  assert.equal(tx?.instructions[0]?.decodeStatus, "partially-decoded"); assert.equal(tx?.instructions[0]?.programLabel.startsWith("Unknown program"), true); assert.deepEqual(unknown?.roles, []);
});

test("existing deployment fixture produces the required generic explanation", async () => {
  const fixture = await loadFixture("fixtures/real-devnet-block.json"); const analysis = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
  assert.equal(analysis.dominantComponent?.transactionIndexes.length, 15); assert.equal(analysis.dominantComponent?.edgeCount, 105); assert.equal(analysis.summary.conflictEdgeCount, 116);
  assert.equal(analysis.dominantComponent?.cliqueLowerBound, 15); assert.equal(analysis.summary.dominantComponentExcludedWaveCount, 3);
  assert.equal(analysis.summary.feePayerOnlyConflictEdgeCount, 6); assert.equal(analysis.summary.samePayerSharedAccountConflictEdgeCount, 110);
  assert.equal(analysis.dominantComponent?.cause.value, "program-buffer writes"); assert.equal(analysis.dominantComponent?.actionability.value, "likely protocol-required or intentional");
  assert.match(analysis.explanations.join(" "), /remaining 30 transactions fit into 3 waves/); assert.match(analysis.explanations.join(" "), /decoded BPF Upgradeable Loader write/);
});

test("structural explanation generalizes to different addresses and shifted indexes", async () => {
  const fixture = await loadFixture("fixtures/cross-payer-application-state-teaching.json"); const first = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
  const altered = JSON.parse(JSON.stringify(fixture.block).replaceAll("SharedApplicationState", "CompletelyDifferentState").replaceAll("PayerAlpha", "ActorOne").replaceAll("PayerBeta", "ActorTwo").replaceAll("PayerGamma", "ActorThree")) as unknown;
  const second = analyzeBlock(altered, fixture.slot + 1, "fixture", fixture.provenance);
  assert.deepEqual(first.dominantComponent?.transactionIndexes, [1, 2, 3]); assert.deepEqual(second.dominantComponent?.transactionIndexes, [1, 2, 3]);
  assert.equal(second.dominantComponent?.cause.value, "application state"); assert.equal(second.dominantComponent?.actorPattern.value, "cross payer"); assert.equal(second.dominantComponent?.actionability.value, "insufficient evidence"); assert.equal(second.dominantComponent?.cliqueLowerBound, 3);
});

test("real scanner fixture stays real evidence without false application-state label", async () => {
  const fixture = await loadFixture("fixtures/cross-payer-devnet-block.json"); const analysis = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
  assert.equal(analysis.provenance.dataKind, "real-network"); assert.equal(analysis.summary.crossPayerSharedAccountConflictEdgeCount, 1);
  const cross = analysis.conflictEdges.find((edge) => edge.classification === "cross-payer-shared-account")!; const meaning = analysis.componentMeanings.find((item) => item.transactionIndexes.includes(cross.source));
  assert.equal(meaning?.cause.value, "transfer/funding source"); assert.equal(meaning?.actionability.value, "insufficient evidence");
});

test("teaching fixture demonstrates cross-payer application state and is labeled teaching", async () => {
  const fixture = await loadFixture("fixtures/cross-payer-application-state-teaching.json"); const analysis = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
  assert.equal(analysis.provenance.dataKind, "curated-teaching"); assert.equal(analysis.summary.crossPayerSharedAccountConflictEdgeCount, 3);
  assert.equal(analysis.dominantComponent?.cause.value, "application state"); assert.equal(analysis.dominantComponent?.cause.confidence, "high"); assert.equal(analysis.dominantComponent?.actionability.value, "insufficient evidence");
  assert.equal(rankCrossPayerCandidates([analysis])[0]?.crossPayerPairCount, 3);
});

test("singleton wording is exact and singleton components are excluded from notable findings", () => {
  const analysis = analyzeBlock(block([[payer("OnlyPayer"), account("ReadOnly", false)]]), 42, "fixture");
  assert.equal(analysis.componentMeanings[0]?.explanation, "This transaction has no declared conflict with another transaction in the analyzed block.");
  assert.equal(analysis.componentMeanings[0]?.isContentionFinding, false); assert.deepEqual(analysis.notableFindings, []);
});

test("singular and plural contention wording is grammatical", () => {
  const one = analyzeBlock(block([[payer("P1"), account("S", true)], [payer("P2"), account("S", true)]]), 42, "fixture");
  assert.match(one.dominantComponent?.explanation ?? "", /2 transactions and 1 unique conflict pair /);
  assert.doesNotMatch(one.dominantComponent?.explanation ?? "", /Component \d+/);
  const many = analyzeBlock(block([[payer("P1"), account("S", true)], [payer("P2"), account("S", true)], [payer("P3"), account("S", true)]]), 42, "fixture");
  assert.match(many.dominantComponent?.explanation ?? "", /3 transactions and 3 unique conflict pairs /);
});

test("legacy serialized conflict labels normalize to truthful shared-account labels", () => {
  assert.equal(normalizeConflictClass("fee-payer-plus-state"), "same-payer-shared-account");
  assert.equal(normalizeConflictClass("cross-payer-shared-state"), "cross-payer-shared-account");
});

test("matching wave bounds prove the minimum and unmatched bounds remain estimated", () => {
  const exact = analyzeBlock(block([[payer("P1"), account("S", true)], [payer("P2"), account("S", true)]]), 42, "fixture");
  assert.deepEqual(exact.dominantComponent?.waveBounds, { cliqueWitness: [0, 1], cliqueLowerBound: 2, generatedWaveUpperBound: 2, boundsMatch: true, provenMinimumWaveCount: 2, lowerBoundEvidence: "A verified clique contains 2 pairwise-conflicting transactions.", upperBoundEvidence: "A generated conflict-free grouping uses 2 waves." });
  const cycle = analyzeBlock(block([
    [payer("P0"), account("E01", true), account("E40", true)],
    [payer("P1"), account("E01", true), account("E12", true)],
    [payer("P2"), account("E12", true), account("E23", true)],
    [payer("P3"), account("E23", true), account("E34", true)],
    [payer("P4"), account("E34", true), account("E40", true)],
  ]), 42, "fixture");
  assert.equal(cycle.dominantComponent?.waveBounds.cliqueLowerBound, 2); assert.equal(cycle.dominantComponent?.waveBounds.generatedWaveUpperBound, 3);
  assert.equal(cycle.dominantComponent?.waveBounds.boundsMatch, false); assert.equal(cycle.dominantComponent?.waveBounds.provenMinimumWaveCount, null); assert.match(cycle.dominantComponent?.explanation ?? "", /remains estimated/);
});

test("loader detector sorts shuffled writes and reports contiguous uniform sequences generically", () => {
  const transactions = normalizeBlock(loaderBlock([{ offset: 118, length: 9 }, { offset: 100, length: 9 }, { offset: 109, length: 9 }]), 42);
  const [group] = detectProgramBufferWriteSequences(transactions); const [sequence] = group?.sequences ?? [];
  assert.equal(sequence?.chunkCount, 3); assert.equal(sequence?.chunkSizeMode, "uniform"); assert.deepEqual(sequence?.chunkSizes, [9]);
  assert.equal(sequence?.firstOffset, 100); assert.equal(sequence?.lastStartingOffset, 118); assert.equal(sequence?.finalCoveredByte, 126); assert.equal(sequence?.totalBytes, 27);
  assert.deepEqual(sequence?.chunks.map((chunk) => chunk.transactionIndex), [1, 2, 0]);
});

test("loader detector separates authorities and reports gaps, overlaps, and varying sizes", () => {
  const transactions = normalizeBlock(loaderBlock([
    { offset: 0, length: 3 }, { offset: 3, length: 5 }, { offset: 20, length: 4 },
    { offset: 22, length: 3 }, { offset: 0, length: 2, authority: "AuthorityB" },
  ]), 42);
  const groups = detectProgramBufferWriteSequences(transactions), first = groups.find((group) => group.authority === "AuthorityA"), second = groups.find((group) => group.authority === "AuthorityB");
  assert.equal(groups.length, 2); assert.equal(first?.sequences[0]?.chunkSizeMode, "varying"); assert.deepEqual(first?.sequences[0]?.chunkSizes, [3, 5]);
  assert.equal(first?.gaps[0]?.byteCount, 12); assert.equal(first?.overlaps[0]?.byteCount, 2); assert.equal(second?.chunks.length, 1);
});

test("real deployment fixtures derive exact contiguous write sequences", async () => {
  const expected = [
    ["fixtures/real-devnet-block.json", 15, 633872, 646696, 647611, 13740],
    ["fixtures/cross-payer-devnet-block.json", 17, 753868, 768524, 769439, 15572],
  ] as const;
  for (const [path, count, first, last, finalByte, total] of expected) {
    const fixture = await loadFixture(path), analysis = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
    const sequence = analysis.programBufferWriteGroups.flatMap((group) => group.sequences).find((item) => item.chunkCount === count);
    assert.ok(sequence); assert.deepEqual(sequence.chunkSizes, [916]); assert.equal(sequence.firstOffset, first); assert.equal(sequence.lastStartingOffset, last); assert.equal(sequence.finalCoveredByte, finalByte); assert.equal(sequence.totalBytes, total);
  }
});

test("real cross-payer finding derives two-airdrop shared funding-source evidence and stays visible", async () => {
  const fixture = await loadFixture("fixtures/cross-payer-devnet-block.json"), analysis = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
  const meaning = analysis.componentMeanings.find((item) => item.transactionIndexes.includes(29) && item.transactionIndexes.includes(38));
  assert.ok(meaning); assert.deepEqual(meaning.transactionIndexes, [29, 38]); assert.equal(meaning.payerCount, 2); assert.equal(meaning.edgeCount, 1);
  assert.equal(meaning.cause.value, "transfer/funding source"); assert.equal(meaning.actorPattern.value, "cross payer"); assert.equal(meaning.actionability.value, "insufficient evidence");
  assert.equal(meaning.decodedTransfers.length, 2); assert.equal(meaning.decodedTransfers.every((item) => item.hasAirdropLog && item.lamports === 20_000_000), true);
  assert.match(meaning.cause.evidence.join(" "), /Both participating transactions contain an Airdrop log/);
  assert.equal(new Set(meaning.decodedTransfers.map((item) => item.source)).size, 1); assert.equal(new Set(meaning.decodedTransfers.map((item) => item.destination)).size, 2);
  assert.equal(meaning.waveBounds.provenMinimumWaveCount, 2); assert.ok(Math.abs((meaning.knownComputeUnitShare ?? 0) - 0.232) < 0.002);
  const finding = analysis.notableFindings.find((item) => item.componentId === meaning.componentId); assert.ok(finding?.reasons.includes("cross-payer component"));
  assert.equal(analysis.notableFindings.filter((item) => item.componentId === meaning.componentId).length, 1);
});

test("notable findings deduplicate reasons while preserving smaller semantic components", async () => {
  const fixture = await loadFixture("fixtures/cross-payer-devnet-block.json"), analysis = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
  assert.equal(new Set(analysis.notableFindings.map((item) => item.componentId)).size, analysis.notableFindings.length);
  assert.equal(analysis.notableFindings.some((item) => item.reasons.includes("deepest serialization") && item.reasons.includes("program-buffer upload")), true);
  assert.equal(analysis.notableFindings.some((item) => item.reasons.includes("cross-payer component")), true);
});

test("potential redesignability requires explicit independence and alternative-partition evidence", () => {
  const input = block([[payer("P1"), account("State", true), account("App", false)], [payer("P2"), account("State", true), account("App", false)]]);
  input.transactions.forEach((entry) => { entry.transaction.message.instructions = [{ programId: "App", program: "teaching-app", parsed: { type: "update", info: { stateAccount: "State", logicalIndependenceEvidence: "Each update targets a different user record.", alternativeAccountPartitioning: "Use one writable state account per user record." } } }]; });
  const analysis = analyzeBlock(input, 42, "fixture", { dataKind: "synthetic" });
  assert.equal(analysis.dominantComponent?.cause.value, "application state"); assert.equal(analysis.dominantComponent?.actionability.value, "potentially redesignable");
  assert.equal(analysis.notableFindings.some((item) => item.reasons.includes("potentially redesignable")), true);
  assert.match(htmlReport(analysis), /Potentially redesignable findings/);
});

test("known-compute coverage qualifies incomplete rankings", () => {
  const input = block([[payer("P1"), account("A", true)], [payer("P2"), account("A", true)], [payer("P3"), account("B", true)], [payer("P4"), account("B", true)]]);
  if (input.transactions[3]?.meta) delete input.transactions[3].meta.computeUnitsConsumed;
  const analysis = analyzeBlock(input, 42, "fixture");
  assert.equal(analysis.summary.knownComputeUnitCoverage, 0.75); assert.equal(analysis.summary.unknownComputeUnitTransactionCount, 1);
  assert.equal(analysis.componentMeanings.some((meaning) => meaning.unknownComputeUnitCount === 1), true);
  assert.match(htmlReport(analysis), /Known-compute rankings are incomplete/);
});

test("teaching report uses a prominent immutable provenance banner", async () => {
  const fixture = await loadFixture("fixtures/cross-payer-application-state-teaching.json"), analysis = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance), html = htmlReport(analysis);
  assert.match(html, /class="banner">CURATED TEACHING FIXTURE &mdash; NOT OBSERVED NETWORK ACTIVITY/);
  assert.match(html, /position:sticky/);
});

test("analysis JSON model and HTML report are byte-deterministic", async () => {
  const fixture = await loadFixture("fixtures/cross-payer-application-state-teaching.json"); const a = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance); const b = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.equal(htmlReport(a), htmlReport(b));
});

test("malformed or incomplete RPC data fails clearly", () => {
  assert.throws(() => analyzeBlock({}, 42, "fixture"), /Malformed block/); assert.throws(() => analyzeBlock({ blockhash: "x", previousBlockhash: "y", parentSlot: 1, transactions: [{}] }, 42, "fixture"), /transaction 0/);
});

test("offline fixture writes JSON and standalone meaning-layer HTML", async () => {
  const fixture = await loadFixture("fixtures/cross-payer-application-state-teaching.json"); const output = join("output", "test"); await rm(output, { recursive: true, force: true }); await writeReports(analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance), output);
  const html = await readFile(join(output, "report.html"), "utf8"); assert.match(html, /Notable findings/); assert.match(html, /Selected account-to-transaction structure/); assert.match(html, /Full block wave timeline/); assert.match(html, /Secondary raw conflict graph/);
  for (const required of ["function selectFinding", "selectedExplanation", "dimensions", "componentBounds", "componentTimeline", "hypergraph", "roles", "metrics", "details"]) assert.match(html, new RegExp(required));
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]; assert.ok(script); assert.doesNotThrow(() => new Function(script));
});

test("offline CLI and scanner run without network access", async () => {
  const cliOutput = join("output", "cli-test"); const scanOutput = join("output", "scanner-test"); await rm(cliOutput, { recursive: true, force: true }); await rm(scanOutput, { recursive: true, force: true });
  const env = { ...process.env, SOLANA_RPC_URL: "http://127.0.0.1:1" };
  const cli = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--fixture", "fixtures/cross-payer-application-state-teaching.json", "--output-dir", cliOutput], { encoding: "utf8", env }); assert.equal(cli.status, 0, cli.stderr); assert.match(cli.stdout, /Cross-payer shared account: 3/);
  const scanner = spawnSync(process.execPath, ["--import", "tsx", "scripts/find-contention.ts", "--start-slot", "1500000", "--count", "1", "--offline", "--fixture-dir", "fixtures", "--cache-dir", scanOutput], { encoding: "utf8", env }); assert.equal(scanner.status, 0, scanner.stderr); assert.match(scanner.stdout, /3 cross-payer pairs/);
});


// Enumerate color assignments independently of the production greedy scheduler.
// Every labeled simple graph through five vertices is realized with one account
// per edge; a shared read-only account adds a deliberate non-conflicting overlap.
test("declared-lock wave bounds hold against every graph through five transactions", () => {
  type Pair = [number, number];
  const exactMinimum = (nodes: number[], edges: Pair[]): number => {
    if (!nodes.length) return 0;
    const colors = new Map<number, number>();
    const assign = (position: number, limit: number): boolean => {
      if (position === nodes.length) return true;
      const node = nodes[position]!;
      for (let color = 0; color < limit; color++) {
        if (edges.some(([a, b]) => a === node && colors.get(b) === color || b === node && colors.get(a) === color)) continue;
        colors.set(node, color);
        if (assign(position + 1, limit)) return true;
        colors.delete(node);
      }
      return false;
    };
    for (let limit = 1; limit <= nodes.length; limit++) {
      colors.clear();
      if (assign(0, limit)) return limit;
    }
    throw new Error("No coloring found");
  };
  const largestClique = (nodes: number[], edges: Pair[]): number => {
    let maximum = 0;
    for (let mask = 1; mask < 2 ** nodes.length; mask++) {
      const subset = nodes.filter((_, index) => mask & (1 << index));
      if (subset.every((a, i) => subset.slice(i + 1).every(b => edges.some(([x, y]) => x === a && y === b || x === b && y === a)))) maximum = Math.max(maximum, subset.length);
    }
    return maximum;
  };
  let cases = 0, unresolved = 0;
  for (let size = 0; size <= 5; size++) {
    const nodes = Array.from({ length: size }, (_, index) => index);
    const pairs: Pair[] = nodes.flatMap(a => nodes.filter(b => b > a).map(b => [a, b] as Pair));
    for (let mask = 0; mask < 2 ** pairs.length; mask++) {
      const edges = pairs.filter((_, index) => mask & (1 << index));
      for (const order of [nodes, [...nodes].reverse()]) {
        const expected: number[][] = [];
        for (const node of order) {
          let wave = expected.find(items => items.every(other => !edges.some(([a,b]) => a === node && b === other || b === node && a === other)));
          if (!wave) { wave = []; expected.push(wave); }
          wave.push(node);
        }
        assert.deepEqual(firstFitByEdges(order, edges.map(([source,target]) => ({source,target}))), expected);
      }
      const keys = nodes.map(node => [payer('Payer-' + node), account('SharedReadOnly', false)]);
      edges.forEach(([a, b], index) => {
        // Alternate write/write, write/read, and read/write evidence.
        keys[a]!.push(account('Edge-' + a + '-' + b, index % 3 !== 2));
        keys[b]!.push(account('Edge-' + a + '-' + b, index % 3 !== 1));
      });
      const input = block(keys);
      for (const entry of input.transactions) entry.transaction.message.instructions = [];
      const analysis = analyzeBlock(input, 42, "fixture");
      const context = 'size=' + size + ', mask=' + mask;
      const certificate = verifyDeclaredAnalysis(analysis);
      assert.equal(certificate.status, 'verified', context);
      // Independent transitive closure checks the certificate's connected-component count.
      const reachable = nodes.map(a => nodes.map(b => a === b || edges.some(([left, right]) => left === a && right === b || left === b && right === a)));
      for (const via of nodes) for (const left of nodes) for (const right of nodes) {
        reachable[left]![right] ||= reachable[left]![via]! && reachable[via]![right]!;
      }
      const componentCount = nodes.filter(node => !nodes.some(earlier => earlier < node && reachable[node]![earlier])).length;
      assert.equal(certificate.connectedComponentCount, componentCount, context);
      assert.deepEqual(analysis.conflictEdges.map(edge => [edge.source, edge.target]), edges, context);
      const priorGreedyWitness = (scope: number[], subset: Pair[]): number[] => {
        if (!scope.length) return [];
        if (subset.length === scope.length*(scope.length-1)/2) return [...scope].sort((a,b)=>a-b);
        const neighbors = new Map(scope.map(node=>[node,new Set<number>()]));
        for (const [a,b] of subset) {neighbors.get(a)!.add(b);neighbors.get(b)!.add(a)}
        const order = [...scope].sort((a,b)=>neighbors.get(b)!.size-neighbors.get(a)!.size||a-b);
        let best = [scope[0]!];
        for (const start of order) {
          const clique = [start];
          for (const candidate of order) if (!clique.includes(candidate) && clique.every(member=>neighbors.get(member)!.has(candidate))) clique.push(candidate);
          if (clique.length>best.length) best=clique;
        }
        return best.sort((a,b)=>a-b);
      };
      const check = (scope: number[], waves: number[][], bounds: typeof analysis.blockWaveBounds): void => {
        const subset = edges.filter(([a, b]) => scope.includes(a) && scope.includes(b));
        const optimum = exactMinimum(scope, subset);
        assert.deepEqual(waves.flat().sort((a, b) => a - b), [...scope].sort((a, b) => a - b), context);
        assert.ok(waves.every(wave => wave.length > 0 && !subset.some(([a, b]) => wave.includes(a) && wave.includes(b))), context);
        assert.equal(bounds.generatedWaveUpperBound, waves.length, context);
        const witness = bounds.cliqueWitness;
        assert.ok(witness, context);
        assert.deepEqual(witness, priorGreedyWitness(scope, subset), context);
        assert.equal(witness.length, bounds.cliqueLowerBound, context);
        assert.equal(new Set(witness).size, witness.length, context);
        assert.ok(witness.every(node => scope.includes(node)), context);
        for (let i = 0; i < witness.length; i++) for (const peer of witness.slice(i + 1)) assert.ok(subset.some(([a,b]) => a === witness[i] && b === peer || b === witness[i] && a === peer), context);
        assert.ok(bounds.cliqueLowerBound <= largestClique(scope, subset), context);
        assert.ok(bounds.cliqueLowerBound <= optimum && optimum <= bounds.generatedWaveUpperBound, context);
        assert.equal(bounds.boundsMatch, bounds.cliqueLowerBound === bounds.generatedWaveUpperBound, context);
        assert.equal(bounds.provenMinimumWaveCount, bounds.boundsMatch ? optimum : null, context);
      };
      check(nodes, analysis.waves, analysis.blockWaveBounds);
      if (!analysis.blockWaveBounds.boundsMatch) unresolved++;
      for (const model of analysis.counterfactualModels) {
        assert.deepEqual(model.conflictEdges.map(edge => [edge.source, edge.target]), edges, context);
        check(nodes, model.waves, model.waveBounds);
      }
      for (const component of analysis.componentMeanings) {
        check(component.transactionIndexes, component.estimatedWaveContext.map(wave => wave.transactionIndexes), component.waveBounds);
      }
      cases++;
    }
  }
  assert.equal(cases, 1100);
  assert.ok(unresolved > 0, "The corpus must include bounds that do not prove the minimum");
});


test("bounded wave improvement tightens a crown graph and preserves fallback witnesses", () => {
  const nodes = [0, 1, 2, 3, 4, 5], edges: Array<{source:number;target:number}> = [];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) edges.push({source: 2*a, target: 2*b+1});
  const baseline = [[0,1],[2,3],[4,5]], frozen = JSON.stringify(baseline);
  assert.equal(improveWaveOrder(nodes, edges, baseline).length, 2);
  assert.equal(JSON.stringify(baseline), frozen);
  for (const limit of [0, 1, 10]) assert.equal(improveWaveOrder(nodes, edges, baseline, limit), baseline);
  assert.equal(improveWaveOrder(Array.from({length:1025}, (_,i)=>i), edges, baseline), baseline);
  const triangle = [[0],[1],[2]];
  assert.equal(improveWaveOrder([0,1,2], [{source:0,target:1},{source:1,target:2},{source:0,target:2}], triangle), triangle);
  const optimum = [[0,2,4],[1,3,5]];
  assert.equal(improveWaveOrder(nodes, edges, optimum), optimum);
  const keys = nodes.map(node => [payer('P'+node), ...edges.filter(edge=>edge.source===node||edge.target===node).map(edge=>account('E'+edge.source+'-'+edge.target,true))]);
  const input = block(keys); for (const tx of input.transactions) tx.transaction.message.instructions=[];
  const result = analyzeBlock(input,42,'fixture');
  assert.equal(result.blockWaveBounds.provenMinimumWaveCount,2);
  assert.deepEqual(result.waves, scheduleWaves(normalizeBlock(input,42)));
  assert.ok(result.counterfactualModels.every(model=>model.waveBounds.provenMinimumWaveCount===2));
});


test("counterfactuals reuse valid witnesses instead of worsening after conflict removal", () => {
  const payers = ["P9","P8","P3","P9","P7","P0","P1","P2","P3","P1","P7","P2","P0","P9","P2","P9","P10","P6","P6","P6","P7","P9","P1","P4"];
  const edges = [[0,1],[0,2],[0,4],[0,10],[0,12],[0,13],[0,16],[0,17],[0,20],[0,23],[1,2],[1,3],[1,15],[1,18],[1,22],[2,4],[2,6],[2,8],[2,13],[2,14],[2,15],[2,21],[2,22],[3,5],[3,6],[3,7],[3,9],[3,12],[3,17],[3,18],[3,21],[3,22],[4,7],[4,8],[4,10],[4,11],[4,16],[4,21],[4,23],[5,8],[5,9],[5,12],[5,15],[5,16],[5,17],[5,18],[6,7],[6,9],[6,11],[6,15],[6,16],[6,20],[6,23],[7,9],[7,11],[7,13],[7,15],[7,19],[7,22],[8,9],[8,13],[8,14],[8,15],[8,16],[9,14],[9,19],[9,20],[9,21],[9,23],[10,15],[10,16],[11,12],[11,15],[11,17],[11,21],[12,17],[12,18],[13,14],[13,20],[14,15],[14,18],[14,21],[15,19],[15,20],[15,22],[16,19],[16,23],[17,23],[18,19],[18,21],[18,22],[19,21],[20,21],[20,22],[22,23]];
  const keys = payers.map((address,index) => [payer(address), ...edges.filter(pair=>pair.includes(index)).map(([a,b])=>account('E'+a+'-'+b,true))]);
  const input = block(keys); for (const tx of input.transactions) tx.transaction.message.instructions=[];
  const result = analyzeBlock(input,42,'fixture');
  assert.equal(result.waves.length,5);
  assert.deepEqual(result.counterfactualModels.map(model=>model.waves.length),[5,5,5,5]);
  assert.ok(result.summary.feePayerExcludedAnalyticalWaveCount <= result.summary.waveCount);
  for (const model of result.counterfactualModels) {
    assert.deepEqual(model.waves.flat().sort((a,b)=>a-b),payers.map((_,index)=>index));
    for (const wave of model.waves) assert.ok(!model.conflictEdges.some(edge=>wave.includes(edge.source)&&wave.includes(edge.target)));
    assert.ok(model.generatedWaveDepthReduction >= 0);
  }
});

test("witness reuse rejects incomplete, duplicate, foreign and conflicting groupings", () => {
  const baseline=[[0],[1],[2]], edges=[{source:0,target:1}];
  for (const invalid of [[[0,1],[2]], [[0],[2]], [[0,2],[2]], [[0,2],[3]], [[],[0,1,2]]]) assert.equal(reuseWaveWitness([0,1,2],edges,baseline,[invalid]),baseline);
  const valid=[[0,2],[1]];
  assert.equal(reuseWaveWitness([0,1,2],edges,baseline,[valid]),valid);
});


test("edge-indexed first-fit preserves noncontiguous node order and large sparse waves", () => {
  assert.deepEqual(firstFitByEdges([40,7,99,3], [{source:7,target:40},{source:3,target:99}]), [[40,99],[7,3]]);
  const nodes = Array.from({length:12000}, (_,index) => index*3);
  assert.deepEqual(firstFitByEdges(nodes, []), [nodes]);
  const edges = nodes.slice(1).map((target,index) => ({source:nodes[index]!,target}));
  assert.deepEqual(firstFitByEdges(nodes, edges), [nodes.filter((_,index) => index%2===0),nodes.filter((_,index) => index%2===1)]);
});


test("indexed counterfactual conflicts match exhaustive mixed-access pairs and input order", () => {
  let state = 481516;
  const next = (): number => { state = (Math.imul(state,1664525)+1013904223)>>>0; return state; };
  for (let sample = 0; sample < 80; sample++) {
    const keys = Array.from({length:12}, (_,index) => {
      const accesses = [payer('Payer-'+index),account('SharedReadOnly',false)];
      for (let key = 0; key < 9; key++) { const choice = (next()>>>16)%4; if (choice) accesses.push(account('Mixed-'+key, choice===3)); }
      return accesses;
    });
    const input = block(keys);
    for (const tx of input.transactions) tx.transaction.message.instructions = [];
    const transactions = normalizeBlock(input,42);
    transactions.forEach((tx,index) => {tx.index = index*7+2;});
    if (sample%2) transactions.reverse();
    const expected = [];
    for (let left = 0; left < transactions.length; left++) for (let right = left+1; right < transactions.length; right++) {
      const a = transactions[left]!, b = transactions[right]!, accounts = transactionsConflict(a,b);
      if (accounts.length) expected.push({source:a.index,target:b.index,accounts,classification:'other'});
    }
    const models = buildCounterfactualModels(transactions);
    assert.deepEqual(models[0]!.conflictEdges, expected, 'sample '+sample);
    // Unique payers and no semantic footprints mean all four models retain the same pairs.
    for (const model of models) assert.deepEqual(model.conflictEdges, expected, 'sample '+sample+', model '+model.model);
  }
});
