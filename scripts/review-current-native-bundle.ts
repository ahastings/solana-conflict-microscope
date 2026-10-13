import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateNativeRecord } from "./review-native-bundle.js";

export const CURRENT_FIXTURE_SHA256 = "1aaeb343408b1b34676579f961b4fcdda53fa85d1390f5a2b8288ff6df6061ab";
export const CURRENT_ELF_SHA256 = "7fd13697bfc5bbd1dfd85648c28d80ebe8591052ecba7d8b2e00266a95f7a7cb";
const NEXT_TIMESTAMP = "1790243611400000";
const INSTRUCTIONS_SYSVAR = "Sysvar1nstructions1111111111111111111111111";
const CLOCK_SYSVAR = "SysvarC1ock11111111111111111111111111111111";
type BaseFixture = Parameters<typeof validateNativeRecord>[0];
type BaseRecord = Parameters<typeof validateNativeRecord>[1];
type AccountState = BaseFixture["scenarios"][number]["accounts"][number];
export type CurrentFixture = Omit<BaseFixture, "scenarios"> & { scenarios: Array<BaseFixture["scenarios"][number] & { mutations: unknown[] }> };
export type CurrentRecord = BaseRecord & { runtime: BaseRecord["runtime"] & { clockFields: string; clockOtherFields: string; otherRuntimeSysvars: string } };
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function demand(value: unknown, message: string): asserts value { if (!value) throw new Error("Current native record rejected: " + message); }
function canonicalAccounts(accounts: AccountState[]): string {
  return JSON.stringify([...accounts].sort((a, b) => a.address < b.address ? -1 : a.address > b.address ? 1 : 0)
    .map(a => [a.address, a.owner, a.lamports, a.executable, a.rentEpoch, a.dataBase64]));
}
function validateClock(value: unknown): string {
  demand(value !== null && typeof value === "object" && !Array.isArray(value), "full observed Clock is required");
  const clock = value as Record<string, unknown>;
  demand(typeof clock.dataBase64 === "string" && typeof clock.dataSha256 === "string", "Clock bytes/hash are missing");
  const bytes = Buffer.from(clock.dataBase64, "base64");
  demand(bytes.length === 40 && bytes.toString("base64") === clock.dataBase64 && hash(bytes) === clock.dataSha256, "Clock bytes/hash mismatch");
  const fields = ["slot", "epochStartTimestamp", "epoch", "leaderScheduleEpoch", "unixTimestamp"] as const;
  fields.forEach((field, index) => {
    const value = clock[field], decoded = index === 1 || index === 4 ? bytes.readBigInt64LE(index * 8) : bytes.readBigUInt64LE(index * 8);
    demand(typeof value === "number" && Number.isSafeInteger(value) && BigInt(value) === decoded, "Clock field mismatch: " + field);
  });
  return clock.dataSha256;
}
function branchEvidence(logs: string[], mode: "producer" | "equality") {
  demand(Array.isArray(logs) && logs.every(line => typeof line === "string"), "invalid native logs");
  const lines = logs.filter(line => /^Program log: (?:Posting new lazer update\.|Skipping lazer price update\.)/.test(line));
  const timestamps = lines.map(line => {
    const posting = /^Program log: Posting new lazer update\. current ts (\d+) < next_timestamp (\d+)$/.exec(line);
    const skipping = /^Program log: Skipping lazer price update\. next_timestamp (\d+) <= current_timestamp (\d+)$/.exec(line);
    return posting ? { branch: "posting", current: posting[1]!, next: posting[2]! }
      : skipping ? { branch: "skipping", current: skipping[2]!, next: skipping[1]! } : null;
  });
  const passed = timestamps.length === 3 && timestamps.every(item => item !== null && item.next === NEXT_TIMESTAMP
    && (mode === "producer" ? item.branch === "posting" && BigInt(item.current) < BigInt(item.next)
      : item.branch === "skipping" && item.current === NEXT_TIMESTAMP));
  return { passed, expectedNextTimestamp: NEXT_TIMESTAMP, lines, timestamps };
}

/** Rechecks trace evidence and current-case gates; this does not execute the native program. */
export function reviewCurrentNativeRecord(fixture: CurrentFixture, record: CurrentRecord, fixtureHash: string) {
  demand(fixture.elfSha256 === CURRENT_ELF_SHA256, "wrong current executable identity");
  demand(record.runtime.clockFields === "all five observed fields decoded, hash-checked and applied"
    && record.runtime.clockOtherFields === "none: all five fields are captured"
    && record.runtime.otherRuntimeSysvars === "Mollusk defaults", "full Clock/runtime scope metadata changed");
  demand(fixture.scenarios.length === 2 && fixture.transactions.length === 3, "exactly two sequences and three role definitions are required");
  const ids = ["current-observed-order", "current-swapped-consumers"];
  const orders = [["anchor-A", "anchor-B", "anchor-C"], ["anchor-A", "anchor-C", "anchor-B"]];
  demand(new Set(fixture.transactions.map(tx => tx.id)).size === 3 && fixture.transactions.every(tx => orders[0]!.includes(tx.id) && tx.instructions.length === 5), "complete ABC role definitions required");
  let initialState: string | undefined, clockHash: string | undefined;
  for (const [index, scenario] of fixture.scenarios.entries()) {
    demand(scenario.id === ids[index] && JSON.stringify(scenario.order) === JSON.stringify(orders[index]) && scenario.instructionCount === 5, "ABC/ACB complete sequence scope changed");
    demand(Array.isArray(scenario.mutations) && scenario.mutations.length === 0, "ordinary input mutations are forbidden");
    demand(scenario.accounts.length === 14 && new Set(scenario.accounts.map(a => a.address)).size === 14
      && scenario.accounts.every(a => a.address !== INSTRUCTIONS_SYSVAR && a.address !== CLOCK_SYSVAR), "exactly 14 ordinary inputs are required");
    const state = canonicalAccounts(scenario.accounts), currentClockHash = validateClock(scenario.clock);
    demand(initialState === undefined || initialState === state, "ordinary input state differs between orders");
    demand(clockHash === undefined || clockHash === currentClockHash, "observed Clock differs between orders");
    initialState = state; clockHash = currentClockHash;
  }
  const oracles = fixture.transactions[0]!.instructions[3]!.accounts.slice(3).map(a => a.address);
  demand(oracles.length === 3 && new Set(oracles).size === 3 && fixture.transactions.every(tx => tx.instructions[3]!.programId === fixture.programId
    && tx.instructions[4]!.programId === fixture.programId && JSON.stringify(tx.instructions[3]!.accounts.slice(3).map(a => a.address)) === JSON.stringify(oracles)), "shared Post/TWAP oracle roles changed");
  const ordinary = new Set(fixture.scenarios[0]!.accounts.map(a => a.address));
  const traces = validateNativeRecord(fixture, record, fixtureHash);
  const scenarios = traces.map(scenario => {
    const producer = scenario.transactions[0]!;
    const producerLogs = branchEvidence(producer.logs, "producer");
    const producerGate = { passed: producer.success && producer.postChangedAllThreeOracles
        && oracles.every(address => producer.committedChangedAccounts.includes(address)) && producerLogs.passed,
      success: producer.success, postChangedAllThreeOracles: producer.postChangedAllThreeOracles,
      committedOracleChanges: producer.committedChangedAccounts.filter(address => oracles.includes(address)), nativePosting: producerLogs };
    const consumers = scenario.transactions.slice(1).map(tx => {
      const equalityLogs = branchEvidence(tx.logs, "equality");
      const postOrdinaryChanges = tx.instructions[3]?.changedAccounts.filter(address => ordinary.has(address)) ?? null;
      const passed = tx.success && equalityLogs.passed && postOrdinaryChanges?.length === 0 && tx.twapOracleUnchanged === true
        && !tx.committedChangedAccounts.some(address => oracles.includes(address));
      return { id: tx.id, passed, success: tx.success, postOrdinaryChanges, twapOracleUnchanged: tx.twapOracleUnchanged, nativeEquality: equalityLogs };
    });
    return { ...scenario, producerGate, consumerGates: consumers,
      evidenceGatesPassed: scenario.complete && producerGate.passed && consumers.length === 2 && consumers.every(consumer => consumer.passed) };
  });
  const complete = scenarios.every(scenario => scenario.evidenceGatesPassed);
  const finalStates = complete ? record.scenarios.map(scenario => canonicalAccounts(scenario.transactions.at(-1)!.after)) : null;
  const finalOrdinaryAccountsEqual = finalStates ? finalStates[0] === finalStates[1] : null;
  return { schemaVersion: "current-native-bundle-review-1", fixtureSha256: fixtureHash, exactElfSha256: fixture.elfSha256,
    scope: "Recorded local execution on unchanged earlier ordinary account inputs and a later full observed Clock. No historical-prestate, fee-debit, transaction-signature-verification, other bank/sysvar-state, or validator-scheduling claim.",
    ordinaryInputAccountCount: 14, fullObservedClockSha256: clockHash, complete,
    reorderingComparison: { evaluated: complete, finalOrdinaryAccountsEqual, evidenceEstablished: complete && finalOrdinaryAccountsEqual === true,
      finalOrdinaryStateSha256: finalStates?.map(state => hash(state)) ?? null,
      scope: "Full ordinary final-state equality is evaluated only after both complete producer/equality-consumer sequences pass their native-log and committed-byte gates; failed rollback never establishes reordering evidence." }, scenarios };
}

async function main(args = process.argv.slice(2)) {
  if (args.length > 2) throw new Error("Usage: review-current-native-bundle.ts [RECORD.json] [REVIEW.json]");
  const fixturePath = resolve("output/native-current-bundle/fixture.json");
  const recordPath = resolve(args[0] ?? "output/native-current-bundle/execution.json");
  const outputPath = resolve(args[1] ?? "output/native-current-bundle/review.json");
  const fixtureBytes = await readFile(fixturePath), fixtureHash = hash(fixtureBytes);
  demand(fixtureHash === CURRENT_FIXTURE_SHA256, "pinned current fixture hash changed");
  const fixture = JSON.parse(fixtureBytes.toString()) as CurrentFixture;
  const recordBytes = await readFile(recordPath), record = JSON.parse(recordBytes.toString()) as CurrentRecord;
  for (const [file, expected] of [
    ["tools/current-bundle-runtime/src/main.rs", record.harnessSourceSha256],
    ["tools/current-bundle-runtime/Cargo.lock", record.runtime.cargoLockSha256],
    ["cache/native-full-bundle/mollusk/harness/src/lib.rs", record.runtime.runtimeSourceSha256],
  ] as const) demand(hash(await readFile(file)) === expected, "runtime source pin changed: " + file);
  const summary = { ...reviewCurrentNativeRecord(fixture, record, fixtureHash), executionRecordSha256: hash(recordBytes),
    sourcePinsVerified: true, harnessSourceSha256: record.harnessSourceSha256, cargoLockSha256: record.runtime.cargoLockSha256, runtimeSourceSha256: record.runtime.runtimeSourceSha256 };
  await writeFile(outputPath, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ complete: summary.complete, reorderingComparison: summary.reorderingComparison, scenarios: summary.scenarios.map(s => ({ id: s.id, complete: s.complete, evidenceGatesPassed: s.evidenceGatesPassed })) }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
