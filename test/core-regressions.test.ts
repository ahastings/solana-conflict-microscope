import { verifyDeclaredAnalysis } from "../src/verify-analysis.js";
import { buildCounterfactualModels } from "../src/semantic.js";
import assert from "node:assert/strict";
import test from "node:test";
import { analyzeBlock, buildConflictData, detectProgramBufferWriteSequences } from "../src/analyze.js";
import { htmlReport, terminalReport } from "../src/report.js";
import { normalizeBlock } from "../src/normalize.js";
import type { RpcBlock, RpcParsedAccount } from "../src/types.js";

const account = (pubkey: string, writable = false, signer = false): RpcParsedAccount => ({ pubkey, writable, signer, source: "transaction" });
const loader = "BPFLoaderUpgradeab1e11111111111111111111111";

function writes(ranges: Array<[number, number]>): RpcBlock {
  return { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions: ranges.map(([offset, length], index) => ({
    transaction: { signatures: [String(index)], message: {
      accountKeys: [account("P" + index, true, true), account("Buffer", true), account("Authority", false, true), account(loader)],
      instructions: [{ programId: loader, accounts: ["Buffer", "Authority"], parsed: { type: "write", info: { account: "Buffer", authority: "Authority", offset, bytes: Buffer.alloc(length).toString("base64") } } }],
    } }, meta: { err: null, fee: 5000 },
  })) };
}

test("deduplicated access sets retain original outer and inner instruction index resolution", () => {
  const block: RpcBlock = { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions: [{
    transaction: { signatures: ["sig"], message: {
      accountKeys: [account("P", true, true), account("A"), account("A", true), account("B", true), account("Program")],
      instructions: [
        { programIdIndex: 4, accounts: [2, 3], data: "raw" },
        { programId: "Program", accounts: [3], data: "partial" },
      ],
    } },
    rawTransaction: { message: { instructions: [
      { programIdIndex: 4, accounts: [2, 3], data: "raw" },
      { programIdIndex: 4, accounts: [3], data: "partial" },
    ] } },
    meta: { err: null, fee: 5000, innerInstructions: [{ index: 0, instructions: [{ programIdIndex: 4, accounts: [3], data: "inner" }] }] },
    rawInnerInstructions: [{ index: 0, instructions: [{ programIdIndex: 4, accounts: [3], data: "inner" }] }],
  }] };
  const tx = normalizeBlock(block, 2)[0]!;
  assert.deepEqual(tx.accounts.map((item) => item.pubkey), ["P", "A", "B", "Program"]);
  assert.deepEqual(tx.writeSet, ["A", "B", "P"]);
  assert.deepEqual(tx.instructions.map((ix) => ix.programId), ["Program", "Program", "Program"]);
  assert.deepEqual(tx.instructions.map((ix) => ix.accountAddresses), [["A", "B"], ["B"], ["B"]]);
  assert.deepEqual(tx.instructions[1]!.accountIndexes, [3]);
  assert.deepEqual(tx.instructions[2]!.accountIndexes, [3]);
});

test("an instruction referencing a duplicate payer key still blocks payer ablation", () => {
  const block: RpcBlock = { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions: [0, 1].map((index) => ({
    transaction: { signatures: [String(index)], message: {
      accountKeys: [account("P", true, true), account("A" + index), account("P", true, true), account("Program")],
      instructions: [{ programIdIndex: 3, accounts: [2], data: "raw" }],
    } }, meta: { err: null, fee: 5000 },
  })) };
  const analysis = analyzeBlock(block, 2, "fixture");
  const payerModel = analysis.counterfactualModels.find((model) => model.model === "fee-payer-decoupled")!;
  assert.equal(payerModel.payerAblation.status, "blocked-by-instruction-use");
  assert.equal(payerModel.waveBounds.generatedWaveUpperBound, 2);
  assert.equal(analysis.summary.feePayerExcludedAnalyticalWaveCount, 2);
});

test("nested loader writes use union coverage and exact pairwise overlap lengths", () => {
  const [group] = detectProgramBufferWriteSequences(normalizeBlock(writes([[0, 100], [10, 10], [30, 10], [105, 5]]), 2));
  assert.ok(group);
  assert.deepEqual(group.gaps, [{ afterOffset: 99, beforeOffset: 105, byteCount: 5 }]);
  assert.deepEqual(group.overlaps, [
    { firstOffset: 0, secondOffset: 10, byteCount: 10 },
    { firstOffset: 0, secondOffset: 30, byteCount: 10 },
  ]);
});

test("loader overlap accounting includes every intersecting pair and excludes adjacency", () => {
  const [group] = detectProgramBufferWriteSequences(normalizeBlock(writes([[0, 10], [0, 5], [3, 9], [12, 4]]), 2));
  assert.ok(group);
  assert.deepEqual(group.gaps, []);
  assert.deepEqual(group.overlaps, [
    { firstOffset: 0, secondOffset: 0, byteCount: 5 },
    { firstOffset: 0, secondOffset: 3, byteCount: 7 },
    { firstOffset: 0, secondOffset: 3, byteCount: 2 },
  ]);
  assert.equal(group.sequences.at(-1)!.chunkCount, 2);
});

test("empty and unsafe loader ranges do not become byte-coverage evidence", () => {
  const groups = detectProgramBufferWriteSequences(normalizeBlock(writes([[0, 0], [Number.MAX_SAFE_INTEGER, 3], [5, 2]]), 2));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]!.chunks, [{ location: "outer", parentInstructionIndex: null, instructionIndex: 0, transactionStatus: "success", transactionIndex: 2, offset: 5, byteLength: 2, finalCoveredByte: 6 }]);
});

const memo = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
function memoBlock(rawAccounts?: number[]): RpcBlock {
  return { blockhash: "block", previousBlockhash: "previous", parentSlot: 1, transactions: [0, 1].map((index) => ({
    transaction: { signatures: [String(index)], message: {
      accountKeys: [account("P", true, true), account(memo)],
      instructions: [{ programId: memo, program: "spl-memo", parsed: "public memo" }],
    } },
    ...(rawAccounts ? { rawTransaction: { message: { instructions: [{ programIdIndex: 1, accounts: rawAccounts, data: "raw" }] } } } : {}),
    meta: { err: null, fee: 5000 },
  })) };
}

test("parsed-only Memo operands are unknown and cannot prove synthetic-only payer access", () => {
  const analysis = analyzeBlock(memoBlock(), 2, "fixture");
  const payerModel = analysis.counterfactualModels.find((model) => model.model === "fee-payer-decoupled")!;
  assert.match(analysis.transactions[0]!.instructions[0]!.incompleteAccountOperandEvidence!, /operands are unknown/);
  assert.equal(payerModel.payerAblation.status, "blocked-by-incomplete-instruction-evidence");
  assert.equal(payerModel.payerAblation.removedSyntheticPayerAccessCount, 0);
  assert.equal(payerModel.payerAblation.preservedInstructionAccessCount, 0);
  assert.equal(payerModel.payerAblation.preservedUnknownInstructionAccessCount, 2);
  assert.match(payerModel.payerAblation.evidence.join(" "), /absence of a decoded reference is not evidence/);
  assert.equal(payerModel.waveBounds.generatedWaveUpperBound, 2);
  assert.equal(analysis.summary.feePayerExcludedAnalyticalWaveCount, 2);
});

test("raw Memo operands distinguish signer references from an explicit empty account list", () => {
  const known = analyzeBlock(memoBlock([0]), 2, "fixture");
  const knownModel = known.counterfactualModels.find((model) => model.model === "fee-payer-decoupled")!;
  assert.equal(knownModel.payerAblation.status, "blocked-by-instruction-use");
  assert.equal(knownModel.payerAblation.preservedUnknownInstructionAccessCount, undefined);
  assert.equal(known.transactions[0]!.instructions[0]!.incompleteAccountOperandEvidence, undefined);
  const empty = analyzeBlock(memoBlock([]), 2, "fixture");
  const emptyModel = empty.counterfactualModels.find((model) => model.model === "fee-payer-decoupled")!;
  assert.equal(emptyModel.payerAblation.status, "fully-applicable");
  assert.equal(emptyModel.waveBounds.generatedWaveUpperBound, 1);
});

test("unknown inner instruction operands preserve payer access and partial-scope accounting", () => {
  const block = memoBlock([]);
  block.transactions[0]!.meta!.innerInstructions = [{ index: 0, instructions: [{ programId: memo, parsed: "inner memo" }] }];
  const analysis = analyzeBlock(block, 2, "fixture");
  const model = analysis.counterfactualModels.find((item) => item.model === "fee-payer-decoupled")!;
  assert.equal(model.payerAblation.status, "partially-applicable");
  assert.equal(model.payerAblation.removedSyntheticPayerAccessCount, 1);
  assert.equal(model.payerAblation.preservedUnknownInstructionAccessCount, 1);
  assert.match(model.payerAblation.evidence.join(" "), /inner instruction 0/);
});

test("unknown instruction operands cannot rule out an additional buffer touch", () => {
  const block = writes([[0, 4], [4, 4]]);
  block.transactions[0]!.transaction.message.accountKeys.push(account(memo));
  block.transactions[0]!.transaction.message.instructions!.push({ programId: memo, parsed: "memo with unavailable operand list" });
  const analysis = analyzeBlock(block, 2, "fixture");
  const model = analysis.counterfactualModels.find((item) => item.model === "semantic-range-refinement")!;
  assert.equal(model.semanticRefinementEligibility[0]!.eligible, false);
  assert.match(model.semanticRefinementEligibility[0]!.blockingEvidence.join(" "), /unknown account operands/);
  assert.equal(model.waveBounds.generatedWaveUpperBound, 2);
});

test("structured decoded fields never prove exhaustive operands without an explicit list", () => {
  for (const parsed of [{ type: "unknown", info: {} }, { type: "futureOperation", info: { otherAccount: "Other" } }]) {
    const block = memoBlock();
    block.transactions.forEach((entry) => { entry.transaction.message.instructions = [{ programId: "UnknownProgram", parsed }]; });
    const analysis = analyzeBlock(block, 2, "fixture");
    const payerModel = analysis.counterfactualModels.find((model) => model.model === "fee-payer-decoupled")!;
    assert.equal(payerModel.payerAblation.status, "blocked-by-incomplete-instruction-evidence");
    assert.equal(payerModel.waveBounds.generatedWaveUpperBound, 2);
    assert.match(payerModel.payerAblation.evidence.join(" "), /decoded fields do not establish an exhaustive operand list/);
  }
});

test("even a verified loader footprint requires operand coverage before range refinement", () => {
  const block = writes([[0, 4], [4, 4]]);
  for (const entry of block.transactions) {
    const instruction = entry.transaction.message.instructions![0]!;
    if ("programId" in instruction) delete instruction.accounts;
  }
  const analysis = analyzeBlock(block, 2, "fixture");
  assert.equal(analysis.transactions[0]!.instructions[0]!.semanticFootprints![0]!.precision, "exact");
  const model = analysis.counterfactualModels.find((item) => item.model === "semantic-range-refinement")!;
  assert.equal(model.semanticRefinementEligibility[0]!.eligible, false);
  assert.match(model.semanticRefinementEligibility[0]!.blockingEvidence.join(" "), /unknown account operands/);
  assert.equal(model.waveBounds.generatedWaveUpperBound, 2);
});

test("decoded System transfer roles preserve a referenced payer without exhaustive operand evidence", () => {
  const block = memoBlock();
  block.transactions.forEach((entry) => { entry.transaction.message.instructions = [{ programId: "11111111111111111111111111111111", parsed: { type: "transfer", info: { source: "P", destination: "Other", lamports: 1 } } }]; });
  const analysis = analyzeBlock(block, 2, "fixture");
  const model = analysis.counterfactualModels.find((item) => item.model === "fee-payer-decoupled")!;
  assert.equal(model.payerAblation.status, "blocked-by-instruction-use");
  assert.equal(model.payerAblation.preservedInstructionAccessCount, 2);
  assert.equal(model.waveBounds.generatedWaveUpperBound, 2);
});

test("unresolvable raw operands cannot certify payer-removal evidence", () => {
  for (const badIndex of [-1, 2, 0.5, Number.MAX_SAFE_INTEGER, NaN]) {
    const block = memoBlock([badIndex]);
    assert.throws(() => analyzeBlock(block, 2, "fixture"), /Malformed outer instruction 0: instruction account operand/);
  }
});

test("parsed and inner operand lists reject missing addresses and invalid indexes", () => {
  for (const operand of ["AbsentAccount", -1, 2, 0.5]) {
    for (const inner of [false, true]) {
      const block = memoBlock([]);
      const instruction = { programId: memo, accounts: [operand], data: "raw" };
      if (inner) block.transactions[0]!.meta!.innerInstructions = [{ index: 0, instructions: [instruction] }];
      else block.transactions[0]!.transaction.message.instructions = [instruction];
      assert.throws(() => normalizeBlock(block, 2), /instruction account operand does not resolve/);
    }
  }
  const rawInner = memoBlock([]);
  rawInner.transactions[0]!.rawInnerInstructions = [{ index: 0, instructions: [{ programIdIndex: 1, accounts: [2], data: "raw" }] }];
  assert.throws(() => normalizeBlock(rawInner, 2), /Malformed inner instruction 0 \(parent 0\)/);
});

test("compiled program references must resolve even when parsed evidence is available", () => {
  for (const programIdIndex of [-1, 2, 0.5, NaN]) {
    const block = memoBlock([]);
    block.transactions[0]!.rawTransaction!.message.instructions![0]!.programIdIndex = programIdIndex;
    assert.throws(() => normalizeBlock(block, 2), /programIdIndex does not resolve/);
  }
});

test("missing metadata and missing err remain unknown rather than failed", () => {
  for (const meta of [undefined, null, {}, { fee: 5000 }]) {
    const block = memoBlock([]);
    for (const entry of block.transactions) Object.assign(entry, { meta });
    const analysis = analyzeBlock(block, 2, "fixture");
    assert.equal(analysis.summary.unknownStatusCount, 2);
    assert.equal(analysis.summary.failureCount, 0);
    assert.equal(analysis.summary.successCount, 0);
    assert.equal(analysis.summary.knownComputeUnitCoverage, 0);
    assert.ok(analysis.transactions.every((tx) => tx.computeUnitsConsumed === null));
    assert.equal(analysis.summary.conflictEdgeCount, 1);
  }
});

test("compute coverage distinguishes an observed zero from missing values", () => {
  const block = memoBlock([]);
  Object.assign(block.transactions[0]!.meta!, { err: null, computeUnitsConsumed: 0n, fee: 0n });
  Object.assign(block.transactions[1]!.meta!, { err: { InstructionError: [0, "InvalidArgument"] } });
  const analysis = analyzeBlock(block, 2, "fixture");
  assert.equal(analysis.summary.successCount, 1);
  assert.equal(analysis.summary.failureCount, 1);
  assert.equal(analysis.summary.unknownStatusCount, 0);
  assert.equal(analysis.summary.knownComputeUnitCoverage, 0.5);
  assert.deepEqual(analysis.transactions.map((tx) => tx.computeUnitsConsumed), [0, null]);
  assert.equal(analysis.transactions[0]!.feeLamports, 0);
});

test("invalid numeric metadata cannot become known compute or fee evidence", () => {
  for (const field of ["computeUnitsConsumed", "fee"]) {
    for (const value of [false, true, "", "100", -1, -1n, 0.5, NaN, Infinity, 9007199254740992n]) {
      const block = memoBlock([]);
      Object.assign(block.transactions[0]!.meta!, { [field]: value });
      assert.throws(() => analyzeBlock(block, 2, "fixture"), /Malformed|safe-integer range/);
    }
  }
  for (const meta of [false, "", [], 1]) {
    const block = memoBlock([]);
    Object.assign(block.transactions[0]!, { meta });
    assert.throws(() => normalizeBlock(block, 2), /meta must be an object or null/);
  }
});

test("duplicate inner groups cannot erase an earlier payer reference", () => {
  for (const raw of [false, true]) {
    const block = memoBlock([]);
    const groups = [
      { index: 0, instructions: [{ programIdIndex: 1, accounts: [0], data: "raw" }] },
      { index: 0, instructions: [] },
    ];
    if (raw) block.transactions[0]!.rawInnerInstructions = groups;
    else block.transactions[0]!.meta!.innerInstructions = groups;
    assert.throws(() => analyzeBlock(block, 2, "fixture"), /duplicate inner instruction parent 0/);
  }
});

test("inner instruction groups must identify an existing outer instruction", () => {
  for (const index of [-1, 1, 0.5, NaN]) {
    for (const raw of [false, true]) {
      const block = memoBlock([]);
      const groups = [{ index, instructions: [] }];
      if (raw) block.transactions[0]!.rawInnerInstructions = groups;
      else block.transactions[0]!.meta!.innerInstructions = groups;
      assert.throws(() => normalizeBlock(block, 2), /invalid inner instruction parent/);
    }
  }
});

test("absent outer instruction lists preserve payer locks, explicit empty lists do not", () => {
  const missing = memoBlock();
  missing.transactions.forEach(entry => { delete entry.transaction.message.instructions; });
  const analysis = analyzeBlock(missing, 2, "fixture");
  assert.equal(analysis.transactions[0]!.instructions.length, 0);
  assert.match(analysis.transactions[0]!.incompleteInstructionEvidence!, /list is unavailable/);
  const model = analysis.counterfactualModels.find(item => item.model === "fee-payer-decoupled")!;
  assert.equal(model.payerAblation.status, "blocked-by-incomplete-instruction-evidence");
  assert.equal(model.payerAblation.removedSyntheticPayerAccessCount, 0);
  assert.equal(model.waveBounds.generatedWaveUpperBound, 2);
  assert.equal(analysis.summary.feePayerExcludedAnalyticalWaveCount, 2);
  assert.match(model.payerAblation.evidence.join(" "), /Outer instruction list is unavailable/);
  for (const raw of [false, true]) {
    const explicit = structuredClone(missing);
    explicit.transactions.forEach(entry => {
      if (raw) entry.rawTransaction = { message: { instructions: [] } };
      else entry.transaction.message.instructions = [];
    });
    const known = analyzeBlock(explicit, 2, "fixture");
    assert.equal(known.transactions[0]!.incompleteInstructionEvidence, undefined);
    assert.equal(known.summary.feePayerExcludedAnalyticalWaveCount, 1);
  }
});

test("account coverage matches independent pair enumeration across mixed access patterns", () => {
  for (let sample = 0; sample < 24; sample++) {
    const block: RpcBlock = { blockhash: "synthetic", previousBlockhash: "synthetic", parentSlot: 0, transactions: Array.from({ length: 12 }, (_, index) => ({
      transaction: { signatures: [String(index)], message: {
        accountKeys: [account("P" + index, true, true), ...Array.from({ length: 7 }, (_, key) => ({ key, mode: (sample * 11 + index * 7 + key * 3 + index * key) % 5 })).filter(item => item.mode !== 0).map(item => account("Shared" + item.key, item.mode < 3))], instructions: [],
      } }, meta: { err: null, fee: 0 },
    })) };
    const transactions = normalizeBlock(block, 1), data = buildConflictData(transactions);
    const pairs: string[][] = [];
    for (let left = 0; left < transactions.length; left++) for (let right = left + 1; right < transactions.length; right++) {
      const causes = transactions[left]!.accounts.filter(a => transactions[right]!.accounts.some(b => b.pubkey === a.pubkey && (a.writable || b.writable))).map(a => a.pubkey);
      if (causes.length) pairs.push(causes);
    }
    assert.equal(data.edges.length, pairs.length);
    for (const stat of data.accounts) {
      const covered = pairs.filter(pair => pair.includes(stat.account));
      assert.equal(stat.uniquePairCoverage, covered.length);
      assert.equal(stat.conflictEdgeCount, covered.length);
      assert.equal(stat.exclusiveEdgeCount, covered.filter(pair => pair.length === 1).length);
      assert.equal(stat.overlappingEdgeCount, covered.filter(pair => pair.length > 1).length);
    }
  }
});

test("payer graph filtering preserves shared causes and respects each endpoint's access", () => {
  for (const samePayer of [false, true]) for (const preserveLeft of [false, true]) for (const preserveRight of [false, true]) for (const sharedCause of [false, true]) {
    const transactions = [0, 1].map(index => {
      const payer = index === 0 || samePayer ? "P" : "Q";
      const preserve = index === 0 ? preserveLeft : preserveRight;
      return { transaction: { signatures: [String(index)], message: {
        accountKeys: [account(payer, true, true), ...(index === 1 && !samePayer ? [account("P")] : []), ...(sharedCause ? [account("Shared", true)] : []), account("Program")],
        instructions: [{ programId: "Program", accounts: preserve ? [payer] : [], data: "raw" }],
      } }, meta: { err: null, fee: 0 } };
    });
    const analysis = analyzeBlock({ blockhash: "synthetic", previousBlockhash: "synthetic", parentSlot: 0, transactions }, 1, "fixture");
    const remainingConflict = sharedCause || (preserveLeft && (!samePayer || preserveRight));
    assert.equal(analysis.feePayerExcludedWaveBounds.cliqueLowerBound, remainingConflict ? 2 : 1);
    assert.equal(analysis.feePayerExcludedWaveBounds.generatedWaveUpperBound, remainingConflict ? 2 : 1);
    assert.equal(analysis.counterfactualModels.find(model => model.model === "fee-payer-decoupled")!.conflictEdgeCount, remainingConflict ? 1 : 0);
  }
});

test("reports expose missing outer lists and represented operand coverage separately", () => {
  const block = memoBlock();
  delete block.transactions[0]!.transaction.message.instructions;
  block.transactions[0]!.meta = null;
  Object.assign(block.transactions[1]!.meta!, { computeUnitsConsumed: 0 });
  const analysis = analyzeBlock(block, 2, "fixture");
  for (const report of [terminalReport(analysis), htmlReport(analysis)]) {
    assert.match(report, /Execution status known: 1\/2 transactions/);
    assert.match(report, /Compute recorded: 1\/2 transactions/);
    assert.match(report, /Outer instruction lists available: 1\/2 transactions/);
    assert.match(report, /Explicit account operands: 0\/1 represented instructions/);
    assert.match(report, /does not prove complete inner-instruction recording/);
  }
  block.transactions.forEach(entry => { entry.transaction.message.instructions = []; });
  assert.match(htmlReport(analyzeBlock(block, 2, "fixture")), /Outer instruction lists available: 2\/2 transactions/);
  assert.match(htmlReport(analyzeBlock(block, 2, "fixture")), /No represented instructions are available for operand coverage/);
});

test("block identity and optional numeric context cannot silently lose precision", () => {
  for (const field of ["parentSlot", "blockHeight", "blockTime"]) {
    for (const value of ["1", false, true, 0.5, NaN, Infinity, 9007199254740992n]) {
      const block = memoBlock([]);
      Object.assign(block, { [field]: value });
      assert.throws(() => analyzeBlock(block, 2, "fixture"), /Malformed|safe-integer range/);
    }
  }
  for (const field of ["parentSlot", "blockHeight"]) {
    const block = memoBlock([]);
    Object.assign(block, { [field]: -1 });
    assert.throws(() => normalizeBlock(block, 2), /non-negative integer/);
  }
  const block = memoBlock([]);
  Object.assign(block, { parentSlot: 0n, blockHeight: 1n, blockTime: -1n });
  const analysis = analyzeBlock(block, 2, "fixture");
  assert.equal(analysis.context.parentSlot, 0);
  assert.equal(analysis.context.blockHeight, 1);
  assert.equal(analysis.context.blockTime, -1);
  Object.assign(block, { blockHeight: null, blockTime: null });
  assert.equal(analyzeBlock(block, 2, "fixture").context.blockTime, null);
  for (const slot of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => normalizeBlock(block, slot), /Malformed slot/);
});

test("single-block upload evidence retains transaction status without claiming final buffer contents", () => {
  const block = writes([[0, 4], [4, 4], [8, 4]]);
  block.transactions[1]!.meta!.err = { InstructionError: [0, "InvalidArgument"] };
  block.transactions[2]!.meta = null;
  const analysis = analyzeBlock(block, 2, "fixture");
  const group = analysis.programBufferWriteGroups[0]!;
  assert.deepEqual(group.chunks.map(chunk => chunk.transactionStatus), ["success", "failed", "unknown"]);
  assert.deepEqual(group.sequences[0]!.chunks, group.chunks);
  assert.equal(group.sequences[0]!.totalBytes, 12);
  for (const report of [terminalReport(analysis), htmlReport(analysis)]) {
    assert.match(report, /1 successful, 1 failed, 1 unknown/);
    assert.match(report, /decoded payloads, not verified final buffer contents/);
  }
});

test("malformed upload Base64 cannot create exact ranges or remove declared conflicts", () => {
  for (const bytes of ["AAAA!AAA=", "AA AA", "AAAA\n", "A", "AAAA=", "AA=", "AA===", "AA==AAAA", "AB==", "AAB=", "____", "----"]) {
    const block = writes([[0, 4], [4, 4]]);
    const ix = block.transactions[0]!.transaction.message.instructions![0]!;
    assert.ok("parsed" in ix && ix.parsed && typeof ix.parsed === "object");
    (ix.parsed!.info as Record<string, unknown>).bytes = bytes;
    const analysis = analyzeBlock(block, 2, "fixture");
    assert.equal(analysis.transactions[0]!.instructions[0]!.semanticFootprints?.length ?? 0, 0, bytes);
    assert.deepEqual(analysis.programBufferWriteGroups[0]!.chunks.map(chunk => chunk.transactionIndex), [1], bytes);
    const refined = analysis.counterfactualModels.find(model => model.model === "semantic-range-refinement")!;
    assert.equal(refined.conflictEdgeCount, analysis.conflictEdges.length, bytes);
    assert.equal(refined.semanticRefinementEligibility[0]!.eligible, false, bytes);
  }
});

test("canonical padded and unpadded upload Base64 retain exact byte ranges", () => {
  for (const [bytes, length] of [["AA==", 1], ["AA", 1], ["AAA=", 2], ["AAA", 2], ["AAAA", 3], ["+/8=", 2]] as const) {
    const block = writes([[5, 4]]);
    const ix = block.transactions[0]!.transaction.message.instructions![0]!;
    assert.ok("parsed" in ix && ix.parsed && typeof ix.parsed === "object");
    (ix.parsed!.info as Record<string, unknown>).bytes = bytes;
    const analysis = analyzeBlock(block, 2, "fixture");
    assert.equal(analysis.programBufferWriteGroups[0]!.chunks[0]!.byteLength, length, bytes);
    assert.equal(analysis.transactions[0]!.instructions[0]!.semanticFootprints![0]!.byteRangeEnd, 5 + length - 1, bytes);
  }
});

test("excluded upload evidence reports reasons and preserves original instruction fields", () => {
  const cases: Array<[unknown, RegExp]> = [
    [null, /fields are unavailable/],
    [{ account: "Buffer", offset: 0, bytes: "AA==" }, /identifier is unavailable/],
    [{ account: "", authority: "Authority", offset: 0, bytes: "AA==" }, /identifier is blank/],
    [{ account: " \t", authority: "Authority", offset: 0, bytes: "AA==" }, /identifier is blank/],
    [{ account: "Buffer", authority: "", offset: 0, bytes: "AA==" }, /identifier is blank/],
    [{ account: "Buffer", authority: "\n ", offset: 0, bytes: "AA==" }, /identifier is blank/],
    [{ account: "Buffer", authority: "Authority", offset: -1, bytes: "AA==" }, /non-negative safe integer/],
    [{ account: "Buffer", authority: "Authority", offset: 0, bytes: 1 }, /not a Base64 string/],
    [{ account: "Buffer", authority: "Authority", offset: 0, bytes: "" }, /Empty payload/],
    [{ account: "Buffer", authority: "Authority", offset: 0, bytes: "AA!A" }, /not canonical standard Base64/],
    [{ account: "Buffer", authority: "Authority", offset: Number.MAX_SAFE_INTEGER, bytes: "AAA=" }, /end exceeds/],
  ];
  for (const [info, reason] of cases) {
    const block = writes([[0, 4]]), ix = block.transactions[0]!.transaction.message.instructions![0]!;
    assert.ok("parsed" in ix && ix.parsed && typeof ix.parsed === "object");
    ix.parsed.info = info;
    const analysis = analyzeBlock(block, 2, "fixture"), normalized = analysis.transactions[0]!.instructions[0]!;
    assert.match(normalized.uploadEvidenceIssue!, reason);
    assert.deepEqual(normalized.parsedInfo, info);
    assert.deepEqual(normalized.semanticFootprints ?? [], []);
    assert.deepEqual(analysis.programBufferWriteGroups, []);
    for (const report of [terminalReport(analysis), htmlReport(analysis)]) {
      assert.match(report, /Slot 2, transaction #0, outer instruction 0: excluded from upload byte-range evidence/);
      assert.match(report, reason);
    }
  }
});

test("upload diagnostics identify inner instructions without labelling unrelated programs", () => {
  const block = writes([[0, 4]]), tx = block.transactions[0]!;
  const ix = structuredClone(tx.transaction.message.instructions![0]!);
  assert.ok("parsed" in ix && ix.parsed && typeof ix.parsed === "object");
  (ix.parsed.info as Record<string, unknown>).bytes = "bad!";
  tx.meta!.innerInstructions = [{ index: 0, instructions: [ix] }];
  const analysis = analyzeBlock(block, 2, "fixture");
  assert.match(terminalReport(analysis), /inner instruction 0 \(parent 0\): excluded/);
  assert.equal(analysis.transactions[0]!.instructions[0]!.uploadEvidenceIssue, undefined);
  ix.programId = "Authority";
  assert.equal(analyzeBlock(block, 2, "fixture").transactions[0]!.instructions[1]!.uploadEvidenceIssue, undefined);
});

test("single-block chunks distinguish outer and inner writes within one transaction", () => {
  const block = writes([[0, 4], [4, 4], [8, 4]]);
  const tx = block.transactions[0]!, inner0 = block.transactions[1]!.transaction.message.instructions![0]!, inner1 = block.transactions[2]!.transaction.message.instructions![0]!;
  tx.transaction.message.instructions!.push({ programId: loader, accounts: [], data: "1" });
  tx.meta!.innerInstructions = [{ index: 0, instructions: [inner0] }, { index: 1, instructions: [inner1] }];
  block.transactions = [tx];
  const sequence = analyzeBlock(block, 2, "fixture").programBufferWriteGroups[0]!.sequences[0]!;
  assert.equal(sequence.chunkCount, 3);
  assert.deepEqual(sequence.chunks.map(chunk => [chunk.transactionIndex, chunk.location, chunk.parentInstructionIndex, chunk.instructionIndex, chunk.offset]), [[0, "outer", null, 0, 0], [0, "inner", 0, 0, 4], [0, "inner", 1, 0, 8]]);
});

test("normalization preserves recorded failure details without inventing errors for unknown outcomes", () => {
  for (const error of [{ InstructionError: [0, { Custom: 42 }] }, "AccountInUse", { Other: "</script><script>throw Error('untrusted')</script>" }]) {
    const block = writes([[0, 4], [4, 4], [8, 4]]);
    block.transactions[0]!.meta!.err = error;
    block.transactions[2]!.meta = null;
    const analysis = analyzeBlock(block, 2, "fixture");
    assert.deepEqual(analysis.transactions.map(tx => tx.status), ["failed", "success", "unknown"]);
    assert.deepEqual(analysis.transactions[0]!.executionError, error);
    assert.equal("executionError" in analysis.transactions[1]!, false);
    assert.equal("executionError" in analysis.transactions[2]!, false);
    assert.deepEqual(JSON.parse(JSON.stringify(analysis)).transactions[0].executionError, error);
    assert.doesNotMatch(htmlReport(analysis), /<script>throw Error\('untrusted'\)<\/script>/);
  }
});

test("transfer evidence counts transaction outcomes separately from decoded instructions", () => {
  const system = "11111111111111111111111111111111";
  const block: RpcBlock = { blockhash: "transfer", previousBlockhash: "previous", parentSlot: 1, transactions: [0, 1, 2].map(index => ({
    transaction: { signatures: [String(index)], message: {
      accountKeys: [account("P" + index, true, true), account("Source", true), account("Destination", true), account(system)],
      instructions: [0, 1].map(() => ({ programId: system, accounts: ["Source", "Destination"], parsed: { type: "transfer", info: { source: "Source", destination: "Destination", lamports: 10 } } })),
    } }, meta: index === 2 ? null : { err: index === 1 ? { InstructionError: [1, "InvalidArgument"] } : null, fee: 5000, logMessages: ["Airdrop"] },
  })) };
  const analysis = analyzeBlock(block, 2, "fixture"), meaning = analysis.componentMeanings[0]!;
  assert.equal(meaning.cause.value, "transfer/funding source");
  assert.equal(meaning.decodedTransfers.length, 6);
  assert.deepEqual(meaning.decodedTransfers.map(item => item.transactionStatus), ["success", "success", "failed", "failed", "unknown", "unknown"]);
  assert.ok(meaning.decodedTransfers.every(item => item.parentInstructionIndex === null));
  assert.match(meaning.cause.evidence.join(" "), /1 successful, 1 failed, 1 unknown/);
  assert.match(meaning.cause.evidence.join(" "), /specifies 10 lamports/);
  assert.doesNotMatch(meaning.cause.evidence.join(" "), /moves|All 6 participating/);
  block.transactions = block.transactions.slice(0, 2);
  assert.match(analyzeBlock(block, 2, "fixture").componentMeanings[0]!.cause.evidence.join(" "), /Both participating transactions contain an Airdrop log/);
  for (const tx of block.transactions) for (const ix of tx.transaction.message.instructions!) {
    assert.ok("parsed" in ix && ix.parsed && typeof ix.parsed === "object");
    (ix.parsed.info as Record<string, unknown>).lamports = -1;
  }
  assert.equal(analyzeBlock(block, 2, "fixture").componentMeanings[0]!.decodedTransfers.length, 0);
});

test("report embedding restores all evidence after deduplicating the dominant component", async () => {
  const { packReportAnalysis, reportDataHydrationScript } = await import("../src/report-data.js");
  const { runInNewContext } = await import("node:vm");
  const roundTrip = (analysis: ReturnType<typeof analyzeBlock>) => {
    const packed = packReportAnalysis(analysis);
    const restored = JSON.parse(runInNewContext("const reportData=" + JSON.stringify(packed) + ";" + reportDataHydrationScript + "JSON.stringify(a)"));
    assert.deepEqual(restored, JSON.parse(JSON.stringify(analysis)));
    return packed;
  };
  const analysis = analyzeBlock(writes([[0, 4], [4, 4]]), 2, "fixture");
  const original = JSON.stringify(analysis);
  assert.notEqual(roundTrip(analysis).dominantComponentIndex, null);
  assert.equal(JSON.stringify(analysis), original, "report packing must not mutate the analyzer result");
  assert.ok(JSON.stringify(packReportAnalysis(analysis)).length < original.length);
  const independent = structuredClone(analysis);
  independent.dominantComponent = { ...independent.dominantComponent!, explanation: "Separately supplied evidence must remain intact." };
  assert.equal(roundTrip(independent).dominantComponentIndex, null);
  roundTrip(analyzeBlock(writes([]), 2, "fixture"));
});

test("report embedding preserves distinct causal models and retained conflict atoms", async () => {
  const { packReportAnalysis, reportDataHydrationScript } = await import("../src/report-data.js");
  const { runInNewContext } = await import("node:vm");
  const analysis = analyzeBlock(writes([[0, 4], [4, 4]]), 2, "fixture");
  const component = analysis.componentMeanings[0]!;
  component.causalAblation = { ...component.causalAblation, models: structuredClone(component.causalAblation.models) };
  component.causalAblation.models[0]!.label = "Independently supplied model";
  const independentAtoms = analysis.counterfactualModels[0]!;
  independentAtoms.retainedConflictAtoms = independentAtoms.retainedConflictAtoms.slice(1);
  const before = JSON.stringify(analysis), packed = packReportAnalysis(analysis);
  assert.ok(!packed.componentModelReferences.includes(0));
  assert.ok(!packed.retainedAtomReferences.some(reference => reference.componentIndex === null && reference.modelIndex === 0));
  const restored = JSON.parse(runInNewContext("const reportData=" + JSON.stringify(packed) + ";" + reportDataHydrationScript + "JSON.stringify(a)"));
  assert.deepEqual(restored, JSON.parse(before));
  assert.equal(JSON.stringify(analysis), before);
});


test("compute aggregates preserve the safe-integer boundary and reject overflow", () => {
  const block = writes([[0, 4], [4, 4]]);
  block.transactions[0]!.meta!.computeUnitsConsumed = Number.MAX_SAFE_INTEGER - 1;
  block.transactions[1]!.meta!.computeUnitsConsumed = 1;
  const analysis = analyzeBlock(block, 2, "fixture");
  assert.equal(analysis.summary.totalKnownComputeUnits, Number.MAX_SAFE_INTEGER);
  for (const model of analysis.counterfactualModels) assert.equal(model.knownComputeUnitsRetained, Number.MAX_SAFE_INTEGER);
  block.transactions[1]!.meta!.computeUnitsConsumed = 3;
  assert.throws(() => buildCounterfactualModels(normalizeBlock(block, 2)), /Compute Units total exceeds the safe-integer range/);
  assert.throws(() => analyzeBlock(block, 2, "fixture"), /Compute Units total exceeds the safe-integer range/);
});


test("parsed account identities and source provenance reject malformed values", () => {
  for (const patch of [{ pubkey: '' }, { pubkey: '   ' }, { source: 'lookup-table' }, { source: null }, { source: 1 }, { writable: 'false' }, { signer: 1 }]) {
    const block = writes([[0, 4]]);
    block.transactions[0]!.transaction.message.instructions = [];
    Object.assign(block.transactions[0]!.transaction.message.accountKeys[1]!, patch);
    assert.throws(() => normalizeBlock(block, 2), /Malformed block transaction 0: invalid parsed account/, JSON.stringify(patch));
  }
  const block = writes([[0, 4]]);
  delete block.transactions[0]!.transaction.message.accountKeys[0]!.source;
  block.transactions[0]!.transaction.message.accountKeys[1]!.source = 'lookupTable';
  const [tx] = normalizeBlock(block, 2);
  assert.ok(tx!.staticAccountKeys.includes('P0'));
  assert.deepEqual(tx!.loadedAccountKeys, ['Buffer']);
  assert.deepEqual([...tx!.staticAccountKeys, ...tx!.loadedAccountKeys].sort(), tx!.accounts.map(account => account.pubkey).sort());
});


test("malformed signatures and logs fail during normalization, while missing evidence stays absent", () => {
  for (const signatures of ['signature-as-scalar', [123], [''], ['   '], ['valid', null], { 0: 'signature' }]) {
    const block = writes([[0, 4]]);
    Object.assign(block.transactions[0]!.transaction, { signatures });
    assert.throws(() => analyzeBlock(block, 2, 'fixture'), /Malformed block transaction 0: signatures/, JSON.stringify(signatures));
  }
  for (const logMessages of ['log-as-scalar', [123], ['valid', null], { 0: 'log' }]) {
    const block = writes([[0, 4]]);
    Object.assign(block.transactions[0]!.meta!, { logMessages });
    assert.throws(() => analyzeBlock(block, 2, 'fixture'), /Malformed block transaction 0: logMessages/, JSON.stringify(logMessages));
  }
  for (const missing of [undefined, null, []]) {
    const block = writes([[0, 4]]);
    Object.assign(block.transactions[0]!.transaction, { signatures: missing });
    Object.assign(block.transactions[0]!.meta!, { logMessages: missing });
    const analysis = analyzeBlock(block, 2, 'fixture');
    assert.equal(analysis.transactions[0]!.signature, null);
    assert.equal(analysis.transactions[0]!.id, 'slot-2-transaction-0');
    assert.deepEqual(analysis.transactions[0]!.logMessages, []);
  }
});


test("independent exported-analysis verifier rejects tampered conflicts and witnesses", () => {
  const original = analyzeBlock(writes([[0,4],[4,4],[8,4]]),2,'fixture');
  assert.equal(verifyDeclaredAnalysis(original).provenMinimumWaveCount,3);
  assert.equal(verifyDeclaredAnalysis(analyzeBlock(writes([]),2,'fixture')).provenMinimumWaveCount,0);
  const changes: Array<(value: typeof original) => void> = [
    value => { value.conflictEdges.pop(); },
    value => { value.conflictEdges.push(value.conflictEdges[0]!); },
    value => { value.conflictEdges[0]!.accounts = ['NotACause']; },
    value => { value.waves = [[0,1],[2]]; },
    value => { value.waves = [[0],[0],[2]]; },
    value => { value.waves = [[0],[1]]; },
    value => { value.blockWaveBounds.cliqueWitness = [0,0,2]; },
    value => { delete value.blockWaveBounds.cliqueWitness; },
    value => { value.blockWaveBounds.provenMinimumWaveCount = 2; },
    value => { value.summary.conflictEdgeCount = 99; },
    value => { value.contentionSignatures=[]; },
    value => { value.contentionSignatures[0]!.edgeCount++; },
    value => { value.contentionSignatures[0]!.accounts=['WrongAccount']; },
    value => { value.contentionSignatures[0]!.pairs[0]=[0,0]; },
    value => { value.contentionSignatures[0]!.pairs[1]=value.contentionSignatures[0]!.pairs[0]!; },
    value => { const group=value.contentionSignatures[0]!;const removed=group.pairs.pop()!;group.edgeCount--;value.contentionSignatures.push({...group,edgeCount:1,pairs:[removed]}); },
    value => { value.transactions[0]!.readSet = []; },
  ];
  for(const change of changes){const modified=structuredClone(original);change(modified);assert.throws(()=>verifyDeclaredAnalysis(modified),/Analysis verification failed/)}
});


test("export verifier CLI reads evidence without rewriting it and fails on corruption", async () => {
  const { mkdtemp, writeFile, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  const directory = await mkdtemp(join(tmpdir(),'analysis-certificate-')), file = join(directory,'analysis.json');
  const script = fileURLToPath(new URL('../scripts/verify-analysis.ts',import.meta.url));
  const analysis = analyzeBlock(writes([[0,4],[4,4]]),2,'fixture');
  const bytes = JSON.stringify(analysis); await writeFile(file,bytes);
  const valid = spawnSync(process.execPath,['--import','tsx',script,'--analysis',file],{encoding:'utf8'});
  assert.equal(valid.status,0,valid.stderr);assert.equal(JSON.parse(valid.stdout).status,'verified');
  assert.equal(await readFile(file,'utf8'),bytes);
  const { createHash } = await import('node:crypto');
  const marked = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(bytes)]);
  await writeFile(file, marked);
  const bom = spawnSync(process.execPath,['--import','tsx',script,'--analysis',file],{encoding:'utf8'});
  assert.equal(bom.status,0,bom.stderr);
  assert.equal(JSON.parse(bom.stdout).analysisSha256,createHash('sha256').update(marked).digest('hex'));
  assert.notEqual(JSON.parse(bom.stdout).analysisSha256,JSON.parse(valid.stdout).analysisSha256);
  assert.deepEqual(await readFile(file),marked);
  const malformed = '{"padding":"' + 'x'.repeat(20000) + '",}';
  await writeFile(file,malformed);
  const syntax = spawnSync(process.execPath,['--import','tsx',script,'--analysis',file],{encoding:'utf8'});
  assert.notEqual(syntax.status,0);
  assert.equal(syntax.stdout,'');
  assert.ok(syntax.stderr.length < 1000,'Malformed JSON must not dump the entire input line');
  assert.doesNotMatch(syntax.stderr,/\n\s+at |Node\.js v/);
  assert.equal(await readFile(file,'utf8'),malformed);
  analysis.waves = [[0,1]]; await writeFile(file,JSON.stringify(analysis));
  const invalid = spawnSync(process.execPath,['--import','tsx',script,'--analysis',file],{encoding:'utf8'});
  assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/conflicting transactions share a wave/);
  assert.doesNotMatch(invalid.stderr,/\n\s+at |Node\.js v/);
  assert.equal(invalid.stdout,'');
});


test("export verifier checks compute coverage, status counts, and full-block wave context", () => {
  const block = writes([[0,4],[4,4],[8,4]]);
  block.transactions[0]!.meta!.computeUnitsConsumed = 0;
  block.transactions[1]!.meta!.computeUnitsConsumed = 25;
  block.transactions[1]!.meta!.err = { InstructionError: [0, 'InvalidArgument'] };
  block.transactions[2]!.meta = null;
  const original = analyzeBlock(block,2,'fixture');
  assert.deepEqual(verifyDeclaredAnalysis(original).computeEvidence, {totalKnownComputeUnits:25,knownTransactionCount:2,unknownTransactionCount:1});
  const changes: Array<(value: typeof original) => void> = [
    value => { value.summary.totalKnownComputeUnits++; },
    value => { value.summary.knownComputeUnitTransactionCount++; },
    value => { value.summary.unknownComputeUnitTransactionCount++; },
    value => { value.summary.knownComputeUnitCoverage = 1; },
    value => { value.summary.successCount++; },
    value => { value.summary.failureCount++; },
    value => { value.summary.unknownStatusCount++; },
    value => { value.summary.maximumWaveWidth++; },
    value => { value.waveContext.pop(); },
    value => { value.waveContext[0]!.transactionIndexes = [1]; },
    value => { value.waveContext[0]!.wave++; },
    value => { value.waveContext[0]!.transactionCount++; },
    value => { value.waveContext[0]!.knownComputeUnitsTotal++; },
    value => { value.waveContext[0]!.maximumTransactionComputeUnits++; },
    value => { value.waveContext[2]!.unknownComputeUnitCount = 0; },
    value => { value.transactions[0]!.computeUnitsConsumed = -1; },
    value => { value.transactions[0]!.computeUnitsConsumed = 0.5; },
    value => { value.transactions[0]!.computeUnitsConsumed = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.transactions[0]!.computeUnitsConsumed = Number.MAX_SAFE_INTEGER; },
    value => { Object.assign(value.transactions[0]!, {status:'unrecognized'}); },
    value => { Reflect.deleteProperty(value.transactions[0]!, 'computeUnitsConsumed'); },
  ];
  for (const change of changes) { const modified = structuredClone(original); change(modified); assert.throws(() => verifyDeclaredAnalysis(modified), /Analysis verification failed/); }
  block.transactions[1]!.meta!.computeUnitsConsumed = Number.MAX_SAFE_INTEGER;
  assert.equal(verifyDeclaredAnalysis(analyzeBlock(block,2,'fixture')).computeEvidence.totalKnownComputeUnits, Number.MAX_SAFE_INTEGER);
});


test("upload sequence IDs cannot alias different buffer-authority tuples", () => {
  const block=writes([[0,4],[4,4],[0,4],[4,4],[0,4],[4,4]]);
  const identities=[['A:B','C'],['A','B:C'],['A%3AB','C']];
  block.transactions.forEach((tx,index)=>{
    const [buffer,authority]=identities[Math.floor(index/2)]!;
    const accounts=tx.transaction.message.accountKeys as RpcParsedAccount[];
    accounts[1]!.pubkey=buffer!;accounts[2]!.pubkey=authority!;
    const ix=tx.transaction.message.instructions![0]!;
    assert.ok('parsed' in ix && ix.parsed && typeof ix.parsed==='object');
    Object.assign(ix.parsed.info as object,{account:buffer,authority});ix.accounts=[buffer!,authority!];
  });
  const analysis=analyzeBlock(block,2,'fixture'),sequences=analysis.programBufferWriteGroups.flatMap(group=>group.sequences);
  assert.equal(sequences.length,3);assert.equal(new Set(sequences.map(sequence=>sequence.id)).size,3);
  for(const component of analysis.componentMeanings){
    const selected=sequences.filter(sequence=>component.programBufferSequenceIds.includes(sequence.id));
    assert.equal(selected.length,1);
    assert.deepEqual(selected[0]!.chunks.map(chunk=>chunk.transactionIndex),component.transactionIndexes);
  }
});

test("contention signatures preserve account arrays containing separator characters", () => {
  const names = [['A\u0000B'],['A\u0000B'],['A','B'],['A','B']];
  const block: RpcBlock = {blockhash:'test',previousBlockhash:'previous',parentSlot:0,transactions:names.map((shared,index)=>({
    transaction:{signatures:['sig-'+index],message:{accountKeys:[account('Payer-'+index,true,true),...shared.map(name=>account(name,true))],instructions:[]}},meta:{err:null,fee:0},
  }))};
  const analysis=analyzeBlock(block,1,'fixture');
  assert.equal(analysis.conflictEdges.length,2);
  assert.equal(analysis.contentionSignatures.length,2);
  assert.equal(verifyDeclaredAnalysis(analysis).status,"verified");
  for(const signature of analysis.contentionSignatures){
    assert.equal(signature.edgeCount,1);
    const [source,target]=signature.pairs[0]!;
    const edge=analysis.conflictEdges.find(edge=>edge.source===source && edge.target===target)!;
    assert.deepEqual(signature.accounts,edge.accounts);
  }
  assert.ok(analysis.contentionSignatures.some(signature=>signature.accounts.length===1 && signature.accounts[0]==='A\u0000B'));
  assert.ok(analysis.contentionSignatures.some(signature=>signature.accounts.length===2));
});

test("independent verification rejects contradictory or duplicated declared access evidence", () => {
  const original = analyzeBlock(writes([[0, 4], [4, 4]]), 2, "fixture");
  const changes: Array<(value: typeof original) => void> = [
    value => { const tx = value.transactions[0]!; tx.accounts.push({ ...tx.accounts[0]! }); },
    value => { const tx = value.transactions[0]!; tx.readSet.push(tx.readSet[0]!); },
    value => { const tx = value.transactions[0]!; tx.writeSet.push(tx.writeSet[0]!); },
    value => { const tx = value.transactions[0]!; tx.readSet.push(tx.writeSet[0]!); },
    value => { const tx = value.transactions[0]!; tx.writeSet.push(tx.readSet[0]!); },
    value => { value.transactions[0]!.accounts.pop(); },
    value => { value.transactions[0]!.accounts[0]!.pubkey = " "; },
    value => { const account = value.transactions[0]!.accounts[0]!; account.writable = !account.writable; },
  ];
  for (const change of changes) {
    const modified = structuredClone(original);
    change(modified);
    assert.throws(() => verifyDeclaredAnalysis(modified), /Analysis verification failed/);
  }
  // Array order carries no meaning for access sets, unlike transaction positions.
  const reordered = structuredClone(original);
  for (const tx of reordered.transactions) {
    tx.accounts.reverse();
    tx.readSet.reverse();
    tx.writeSet.reverse();
  }
  assert.deepEqual(verifyDeclaredAnalysis(reordered), verifyDeclaredAnalysis(original));
});

test("independent wave certificates distinguish empty, unresolved, and proven minima", () => {
  const empty = analyzeBlock(writes([]), 2, "fixture");
  assert.equal(verifyDeclaredAnalysis(empty).provenMinimumWaveCount, 0);
  const phantomWave = structuredClone(empty);
  phantomWave.waves = [[]];
  assert.throws(() => verifyDeclaredAnalysis(phantomWave), /empty wave/);

  const nonempty = analyzeBlock(writes([[0, 4], [4, 4]]), 2, "fixture");
  const weaker = structuredClone(nonempty);
  // A valid but nonmaximal witness supplies only a lower bound, not an exact minimum.
  weaker.blockWaveBounds.cliqueWitness = [0];
  weaker.blockWaveBounds.cliqueLowerBound = 1;
  weaker.blockWaveBounds.boundsMatch = false;
  weaker.blockWaveBounds.provenMinimumWaveCount = null;
  const certificate = verifyDeclaredAnalysis(weaker);
  assert.equal(certificate.lowerBound, 1);
  assert.equal(certificate.upperBound, 2);
  assert.equal(certificate.provenMinimumWaveCount, null);
  weaker.blockWaveBounds.provenMinimumWaveCount = 1;
  assert.throws(() => verifyDeclaredAnalysis(weaker), /minimum-count claim disagrees/);

  const falseZero = structuredClone(nonempty);
  falseZero.blockWaveBounds.cliqueWitness = [];
  falseZero.blockWaveBounds.cliqueLowerBound = 0;
  falseZero.blockWaveBounds.boundsMatch = true;
  falseZero.blockWaveBounds.provenMinimumWaveCount = 0;
  assert.throws(() => verifyDeclaredAnalysis(falseZero), /minimum-count claim disagrees/);
});

test("independent verification checks connected components without trusting reported groups", () => {
  const block = writes([[0, 4], [4, 4]]);
  block.transactions.push({ transaction: { signatures: ["isolated"], message: { accountKeys: [account("IsolatedPayer", true, true)], instructions: [] } }, meta: { err: null, fee: 0 } });
  const original = analyzeBlock(block, 2, "fixture");
  assert.deepEqual(original.components.map(component => component.transactionIndexes), [[0, 1], [2]]);
  const mutations: Array<(value: typeof original) => void> = [
    value => { value.components = [{ id: 0, transactionIndexes: [0] }, { id: 1, transactionIndexes: [1] }, { id: 2, transactionIndexes: [2] }]; value.summary.componentCount = 3; },
    value => { value.components = [{ id: 0, transactionIndexes: [0, 1, 2] }]; value.summary.componentCount = 1; },
    value => { value.components[0]!.transactionIndexes.push(1); },
    value => { value.components[1]!.id = value.components[0]!.id; },
    value => { value.components.pop(); value.summary.componentCount = 1; },
    value => { value.summary.componentCount = 3; },
    value => { value.components[1]!.transactionIndexes = [3]; },
  ];
  for (const change of mutations) {
    const changed = structuredClone(original); change(changed);
    assert.throws(() => verifyDeclaredAnalysis(changed), /Analysis verification failed/);
  }
  const reordered = structuredClone(original);
  reordered.components.reverse();
  reordered.components.forEach(component => component.transactionIndexes.reverse());
  assert.deepEqual(verifyDeclaredAnalysis(reordered), verifyDeclaredAnalysis(original));
});
