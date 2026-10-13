import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateNativeRecord } from "../scripts/review-native-bundle.js";

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function sample(success = true) {
  const account = (address: string, byte = 0) => ({ address, owner: "owner", lamports: "10", executable: false, rentEpoch: "0", dataBase64: Buffer.from([byte]).toString("base64"), dataSha256: hash(Buffer.from([byte])) });
  const before = ["payer", "storage", "o1", "o2", "o3"].map(key => account(key));
  const post = before.map(a => a.address.startsWith("o") ? account(a.address, 1) : a);
  const instructions = Array.from({ length: 5 }, (_, i) => ({ programId: "program", dataHex: "00", accounts: i === 3 ? ["payer", "storage", "Sysvar1nstructions1111111111111111111111111", "o1", "o2", "o3"].map(address => ({ address })) : [] }));
  const events = instructions.flatMap((_, i) => [
    { instructionIndex: i, phase: "before" as const, accounts: i <= 3 ? before : post },
    { instructionIndex: i, phase: "after" as const, accounts: i < 3 ? before : post },
  ]);
  const fixture = { schemaVersion: "full-bundle-fixture-1", programId: "program", elfSha256: "elf", transactions: [{ id: "A", instructions }], scenarios: [{ id: "constructed", clock: { slot: 2, unixTimestamp: 2 }, accounts: before, order: ["A"], instructionCount: 5 }] };
  const record = { schemaVersion: "full-bundle-execution-1", fixtureSha256: "fixture", exactElfSha256: "elf", harnessSourceSha256: "source", runtime: { runtimeSourceSha256: "runtime", cargoLockSha256: "lock", feeDebitsModeled: false, transactionSignaturesVerified: false }, scenarios: [{ id: "constructed", clock: { slot: 2, unixTimestamp: 2 }, requestedOrder: ["A"], transactions: [{ id: "A", instructionCount: 5, success, rawResult: success ? "Ok(())" : "Err(InstructionError(4, Custom(1)))", computeUnitsConsumed: 1, logs: [], before, after: success ? post : before, instructionEvents: events }] }] };
  return JSON.parse(JSON.stringify({ fixture, record })) as { fixture: typeof fixture; record: typeof record };
}
test("native record distinguishes intermediate Post writes from failed atomic output", () => {
  const { fixture, record } = sample(false);
  const [result] = validateNativeRecord(fixture, record, "fixture");
  assert.equal(result!.complete, false);
  assert.equal(result!.transactions[0]!.postChangedAllThreeOracles, true);
  assert.equal(result!.transactions[0]!.twapOracleUnchanged, null);
  assert.deepEqual(result!.transactions[0]!.committedChangedAccounts, []);
});
test("native record requires full successful instruction coverage", () => {
  const { fixture, record } = sample();
  assert.equal(validateNativeRecord(fixture, record, "fixture")[0]!.complete, true);
  record.scenarios[0]!.transactions[0]!.instructionEvents.splice(8);
  assert.throws(() => validateNativeRecord(fixture, record, "fixture"), /every instruction/);
});
test("native record independently hashes full account bytes", () => {
  const { fixture, record } = sample();
  record.scenarios[0]!.transactions[0]!.after[2]!.dataBase64 = "Ag==";
  assert.throws(() => validateNativeRecord(fixture, record, "fixture"), /bytes\/hash mismatch/);
});
test("native record rejects an output that violates rollback", () => {
  const { fixture, record } = sample(false);
  const tx = record.scenarios[0]!.transactions[0]!;
  tx.after = structuredClone(tx.instructionEvents.at(-1)!.accounts);
  assert.throws(() => validateNativeRecord(fixture, record, "fixture"), /roll back/);
});
test("native record detects an omitted required account in a trace", () => {
  const { fixture, record } = sample();
  record.scenarios[0]!.transactions[0]!.instructionEvents[0]!.accounts.pop();
  assert.throws(() => validateNativeRecord(fixture, record, "fixture"), /omits required/);
});
test("native record reports a TWAP oracle mutation instead of accepting Post-only equality", () => {
  const { fixture, record } = sample();
  const tx = record.scenarios[0]!.transactions[0]!;
  const end = tx.instructionEvents.at(-1)!.accounts.map(a => a.address === "o1" ? { ...a, dataBase64: "Ag==", dataSha256: hash(Buffer.from([2])) } : a);
  tx.instructionEvents.at(-1)!.accounts = end;
  tx.after = structuredClone(end);
  assert.equal(validateNativeRecord(fixture, record, "fixture")[0]!.transactions[0]!.twapOracleUnchanged, false);
});
