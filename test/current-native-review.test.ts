import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { CURRENT_ELF_SHA256, reviewCurrentNativeRecord, type CurrentFixture, type CurrentRecord } from "../scripts/review-current-native-bundle.js";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const account = (address: string, byte = 0) => ({ address, owner: "owner", lamports: "10", executable: false, rentEpoch: "0", dataBase64: Buffer.from([byte]).toString("base64"), dataSha256: hash(Buffer.from([byte])) });
const next = "1790243611400000";
function sample() {
  const bytes = Buffer.alloc(40);
  const clock = { slot: 22, epochStartTimestamp: 10, epoch: 4, leaderScheduleEpoch: 5, unixTimestamp: 1790243614, dataBase64: "", dataSha256: "" };
  [clock.slot, clock.epochStartTimestamp, clock.epoch, clock.leaderScheduleEpoch, clock.unixTimestamp].forEach((value, index) => bytes.writeBigInt64LE(BigInt(value), index * 8));
  clock.dataBase64 = bytes.toString("base64"); clock.dataSha256 = hash(bytes);
  const initial = ["payer", "storage", "o1", "o2", "o3", "mA", "mB", "mC", "a1", "a2", "a3", "a4", "a5", "a6"].map(address => account(address));
  const instructions = Array.from({ length: 5 }, (_, index) => ({ programId: "program", dataHex: "00", accounts: (index === 3
    ? ["payer", "storage", "Sysvar1nstructions1111111111111111111111111", "o1", "o2", "o3"]
    : index === 4 ? initial.map(a => a.address) : []).map(address => ({ address })) }));
  const fixture: CurrentFixture = { schemaVersion: "full-bundle-fixture-1", programId: "program", elfSha256: CURRENT_ELF_SHA256,
    transactions: ["anchor-A", "anchor-B", "anchor-C"].map(id => ({ id, instructions: structuredClone(instructions) })),
    scenarios: [
      { id: "current-observed-order", order: ["anchor-A", "anchor-B", "anchor-C"], instructionCount: 5, mutations: [], clock: structuredClone(clock), accounts: structuredClone(initial) },
      { id: "current-swapped-consumers", order: ["anchor-A", "anchor-C", "anchor-B"], instructionCount: 5, mutations: [], clock: structuredClone(clock), accounts: structuredClone(initial) },
    ] };
  const scenarios = fixture.scenarios.map(scenario => {
    let state = structuredClone(initial);
    const transactions = scenario.order.map(id => {
      const before = structuredClone(state), producer = id === "anchor-A";
      const post = before.map(a => producer && /^o\d$/.test(a.address) ? account(a.address, 1) : a);
      const after = post.map(a => a.address === "m" + id.at(-1)! ? account(a.address, 1) : a);
      const instructionEvents = Array.from({ length: 5 }, (_, index) => [
        { instructionIndex: index, phase: "before" as const, accounts: structuredClone(index <= 3 ? before : post) },
        { instructionIndex: index, phase: "after" as const, accounts: structuredClone(index < 3 ? before : index === 3 ? post : after) },
      ]).flat();
      state = structuredClone(after);
      return { id, instructionCount: 5, success: true, rawResult: "Ok(())", computeUnitsConsumed: 1, before, after: structuredClone(after), instructionEvents,
        logs: Array.from({ length: 3 }, () => producer ? "Program log: Posting new lazer update. current ts 1790243611000000 < next_timestamp " + next
          : "Program log: Skipping lazer price update. next_timestamp " + next + " <= current_timestamp " + next) };
    });
    return { id: scenario.id, clock: structuredClone(scenario.clock), requestedOrder: scenario.order, transactions };
  });
  const record: CurrentRecord = { schemaVersion: "full-bundle-execution-1", fixtureSha256: "fixture", exactElfSha256: CURRENT_ELF_SHA256, harnessSourceSha256: "source",
    runtime: { runtimeSourceSha256: "runtime", cargoLockSha256: "lock", feeDebitsModeled: false, transactionSignaturesVerified: false,
      clockFields: "all five observed fields decoded, hash-checked and applied", clockOtherFields: "none: all five fields are captured", otherRuntimeSysvars: "Mollusk defaults" }, scenarios };
  return { fixture, record };
}
function review(input = sample()) { return reviewCurrentNativeRecord(input.fixture, input.record, "fixture"); }

test("both complete producer/equality sequences establish canonical full ordinary final-state equality", () => {
  const input = sample(); input.record.scenarios[1]!.transactions.at(-1)!.after.reverse();
  const result = review(input);
  assert.equal(result.complete, true);
  assert.equal(result.reorderingComparison.evidenceEstablished, true);
  assert.equal(result.reorderingComparison.finalOrdinaryAccountsEqual, true);
  assert.equal(result.reorderingComparison.finalOrdinaryStateSha256![0], result.reorderingComparison.finalOrdinaryStateSha256![1]);
  assert.equal(result.ordinaryInputAccountCount, 14);
});

test("failed producer rollbacks with equal final bytes never establish reordering evidence", () => {
  const input = sample();
  for (const scenario of input.record.scenarios) {
    scenario.transactions.splice(1); const producer = scenario.transactions[0]!;
    producer.success = false; producer.rawResult = "Err(InstructionError(4, Custom(1)))"; producer.after = structuredClone(producer.before);
  }
  const result = review(input);
  assert.equal(result.scenarios[0]!.transactions[0]!.postChangedAllThreeOracles, true);
  assert.equal(result.scenarios[0]!.producerGate.passed, false);
  assert.equal(result.complete, false);
  assert.equal(result.reorderingComparison.evaluated, false);
  assert.equal(result.reorderingComparison.finalOrdinaryAccountsEqual, null);
});

test("a failed equality consumer is valid incomplete evidence even with unchanged Post and rollback", () => {
  const input = sample(), scenario = input.record.scenarios[0]!;
  scenario.transactions.splice(2); const consumer = scenario.transactions[1]!;
  consumer.success = false; consumer.rawResult = "Err(InstructionError(4, Custom(1)))"; consumer.after = structuredClone(consumer.before);
  const result = review(input);
  assert.equal(result.scenarios[0]!.producerGate.passed, true);
  assert.equal(result.scenarios[0]!.consumerGates[0]!.nativeEquality.passed, true);
  assert.equal(result.scenarios[0]!.consumerGates[0]!.passed, false);
  assert.equal(result.reorderingComparison.finalOrdinaryAccountsEqual, null);
});

test("old-message skip branches, missing logs, and wrong target timestamps cannot pass native branch gates", () => {
  const oldMessage = sample(); oldMessage.record.scenarios[0]!.transactions[1]!.logs = Array(3).fill("Program log: Skipping lazer price update. next_timestamp " + next + " <= current_timestamp 1790243611400001");
  assert.equal(review(oldMessage).scenarios[0]!.consumerGates[0]!.passed, false);
  const missing = sample(); missing.record.scenarios[0]!.transactions[0]!.logs.pop();
  assert.equal(review(missing).scenarios[0]!.producerGate.passed, false);
  const wrongTimestamp = sample(); wrongTimestamp.record.scenarios[0]!.transactions[0]!.logs = Array(3).fill("Program log: Posting new lazer update. current ts 1 < next_timestamp 2");
  assert.equal(review(wrongTimestamp).scenarios[0]!.producerGate.passed, false);
});

test("a Post ordinary mutation reverted during TWAP still blocks equality-consumer evidence", () => {
  const input = sample(), consumer = input.record.scenarios[0]!.transactions[1]!;
  for (const event of [consumer.instructionEvents[7]!, consumer.instructionEvents[8]!]) event.accounts = event.accounts.map(a => a.address === "storage" ? account("storage", 2) : a);
  const result = review(input);
  assert.deepEqual(result.scenarios[0]!.consumerGates[0]!.postOrdinaryChanges, ["storage"]);
  assert.equal(result.scenarios[0]!.consumerGates[0]!.passed, false);
  assert.equal(result.reorderingComparison.evaluated, false);
});

test("a TWAP oracle mutation blocks equality despite unchanged Post bytes", () => {
  const input = sample(), consumer = input.record.scenarios[0]!.transactions[2]!;
  consumer.after = consumer.after.map(a => a.address === "o1" ? account("o1", 2) : a);
  consumer.instructionEvents[9]!.accounts = structuredClone(consumer.after);
  const result = review(input);
  assert.deepEqual(result.scenarios[0]!.consumerGates[1]!.postOrdinaryChanges, []);
  assert.equal(result.scenarios[0]!.consumerGates[1]!.twapOracleUnchanged, false);
  assert.equal(result.reorderingComparison.evidenceEstablished, false);
});

test("full successful role gates do not imply equality of all final ordinary state", () => {
  const input = sample(), last = input.record.scenarios[1]!.transactions[2]!;
  last.after = last.after.map(a => a.address === "mB" ? { ...a, lamports: "11" } : a);
  last.instructionEvents[9]!.accounts = structuredClone(last.after);
  const result = review(input);
  assert.equal(result.complete, true);
  assert.equal(result.reorderingComparison.evaluated, true);
  assert.equal(result.reorderingComparison.finalOrdinaryAccountsEqual, false);
  assert.equal(result.reorderingComparison.evidenceEstablished, false);
});

test("full Clock hashes/fields, runtime scope, unmodified inputs and executable identity are enforced", () => {
  for (const field of ["slot", "epochStartTimestamp", "epoch", "leaderScheduleEpoch", "unixTimestamp"]) {
    const input = sample(); (input.fixture.scenarios[0]!.clock as Record<string, unknown>)[field] = 0;
    assert.throws(() => review(input), /Clock field mismatch/);
  }
  const bytes = sample(); (bytes.fixture.scenarios[0]!.clock as Record<string, unknown>).dataBase64 = "AA==";
  assert.throws(() => review(bytes), /Clock bytes\/hash mismatch/);
  const scope = sample(); scope.record.runtime.clockOtherFields = "defaults";
  assert.throws(() => review(scope), /Clock\/runtime scope/);
  const mutated = sample(); mutated.fixture.scenarios[0]!.mutations.push({ field: "timestamp" });
  assert.throws(() => review(mutated), /mutations are forbidden/);
  const elf = sample(); elf.fixture.elfSha256 = "wrong";
  assert.throws(() => review(elf), /executable identity/);
});
