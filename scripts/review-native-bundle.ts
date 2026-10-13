import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface AccountState { address: string; owner: string; lamports: string; executable: boolean; rentEpoch: string; dataBase64: string; dataSha256: string; dataLength?: number }
interface Event { instructionIndex: number; phase: "before" | "after"; accounts: AccountState[] }
interface Transaction { id: string; instructionCount: number; success: boolean; rawResult: string; computeUnitsConsumed: number; logs: string[]; before: AccountState[]; after: AccountState[]; instructionEvents: Event[] }
interface Scenario { id: string; clock: unknown; requestedOrder: string[]; transactions: Transaction[] }
interface Fixture { schemaVersion: string; programId: string; elfSha256: string; transactions: { id: string; instructions: { programId: string; dataHex: string; accounts: { address: string }[] }[] }[]; scenarios: { id: string; clock: unknown; accounts: AccountState[]; order: string[]; instructionCount: number }[] }
interface RecordFile { schemaVersion: string; fixtureSha256: string; exactElfSha256: string; harnessSourceSha256: string; runtime: { runtimeSourceSha256: string; cargoLockSha256: string; feeDebitsModeled: boolean; transactionSignaturesVerified: boolean }; scenarios: Scenario[] }
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function demand(value: unknown, message: string): asserts value { if (!value) throw new Error("Native record rejected: " + message); }
const state = (a: AccountState) => [a.owner, a.lamports, a.executable, a.rentEpoch, a.dataBase64];
function accounts(values: AccountState[]): Map<string, AccountState> {
  demand(Array.isArray(values), "missing accounts");
  const result = new Map<string, AccountState>();
  for (const a of values) {
    demand(typeof a.address === "string" && !result.has(a.address), "duplicate/missing account address");
    demand(typeof a.owner === "string" && typeof a.executable === "boolean" && /^\d+$/.test(a.lamports) && /^\d+$/.test(a.rentEpoch), "invalid account metadata");
    demand(typeof a.dataBase64 === "string", "missing full account bytes");
    const data = Buffer.from(a.dataBase64, "base64");
    demand(data.toString("base64") === a.dataBase64 && hash(data) === a.dataSha256, "account bytes/hash mismatch at " + a.address);
    demand(a.dataLength === undefined || a.dataLength === data.length, "account length mismatch");
    result.set(a.address, a);
  }
  return result;
}
function sameAccounts(a: Map<string, AccountState>, b: Map<string, AccountState>, label: string): void {
  demand(a.size === b.size, label + ": account count changed");
  for (const [key, value] of a) demand(b.has(key) && equal(state(value), state(b.get(key)!)), label + ": changed account " + key);
}
function differences(a: Map<string, AccountState>, b: Map<string, AccountState>): string[] {
  demand(a.size === b.size && [...a.keys()].every(key => b.has(key)), "trace account identity changed");
  return [...a].filter(([key, value]) => !equal(state(value), state(b.get(key)!))).map(([key]) => key);
}

/** Checks recorded bytes and trace continuity; this is not another native execution. */
export function validateNativeRecord(fixture: Fixture, record: RecordFile, fixtureHash: string) {
  demand(fixture.schemaVersion === "full-bundle-fixture-1" && record.schemaVersion === "full-bundle-execution-1", "schema changed");
  demand(record.fixtureSha256 === fixtureHash && record.exactElfSha256 === fixture.elfSha256, "fixture/ELF identity changed");
  demand(record.runtime.feeDebitsModeled === false && record.runtime.transactionSignaturesVerified === false, "execution scope changed");
  demand(record.scenarios.length === fixture.scenarios.length, "scenario count changed");
  const oracleAddresses = fixture.transactions[0]!.instructions[3]!.accounts.slice(3).map(a => a.address);
  demand(oracleAddresses.length === 3, "oracle roles incomplete");
  return record.scenarios.map((scenario, scenarioIndex) => {
    const expected = fixture.scenarios[scenarioIndex]!;
    demand(scenario.id === expected.id && equal(scenario.clock, expected.clock) && equal(scenario.requestedOrder, expected.order), "scenario identity changed");
    demand(scenario.transactions.length > 0 && scenario.transactions.length <= expected.order.length, "missing/excess transactions");
    let previous = accounts(expected.accounts);
    const transactions = scenario.transactions.map((tx, txIndex) => {
      demand(tx.id === expected.order[txIndex] && tx.instructionCount === expected.instructionCount, "instruction sequence changed");
      demand(typeof tx.success === "boolean" && tx.success === (tx.rawResult === "Ok(())"), "result success disagrees");
      demand(tx.success || txIndex === scenario.transactions.length - 1, "continued a failed sequence");
      demand(tx.success || scenario.transactions.length === txIndex + 1, "failed sequence accounting");
      const before = accounts(tx.before), after = accounts(tx.after);
      sameAccounts(previous, before, "transaction continuity");
      const definition = fixture.transactions.find(t => t.id === tx.id);
      demand(definition, "unknown transaction");
      const required = new Set(definition.instructions.slice(0, tx.instructionCount).flatMap(ix => ix.accounts.map(a => a.address)).filter(a => a !== "Sysvar1nstructions1111111111111111111111111"));
      for (const key of required) demand(before.has(key), "missing required input account " + key);
      const events = tx.instructionEvents;
      demand(events.length > 0 && events.length % 2 === 0 && events.length <= tx.instructionCount * 2, "invalid trace size");
      demand(!tx.success || events.length === tx.instructionCount * 2, "successful bundle did not trace every instruction");
      const instructions = [];
      let priorTrace: Map<string, AccountState> | undefined;
      for (let i = 0; i < events.length / 2; i++) {
        const start = events[2 * i]!, end = events[2 * i + 1]!;
        demand(start.instructionIndex === i && end.instructionIndex === i && start.phase === "before" && end.phase === "after", "trace order changed");
        const a = accounts(start.accounts), b = accounts(end.accounts);
        for (const key of required) {
          demand(a.has(key) && b.has(key), "trace omits required account " + key);
          const source = priorTrace ?? before;
          demand(equal(state(source.get(key)!), state(a.get(key)!)), "instruction continuity changed " + key);
        }
        const changed = differences(a, b);
        const oracleChanges = changed.filter(key => oracleAddresses.includes(key));
        instructions.push({ index: i, programId: definition.instructions[i]!.programId, changedAccounts: changed, runtimeManagedChanges: changed.filter(key => key === "Sysvar1nstructions1111111111111111111111111"), ordinaryAccountChanges: changed.filter(key => required.has(key)), oracleChanges });
        priorTrace = b;
      }
      if (tx.success) {
        for (const key of required) demand(equal(state(priorTrace!.get(key)!), state(after.get(key)!)), "committed output differs from final instruction");
        for (const key of before.keys()) if (!required.has(key)) demand(equal(state(before.get(key)!), state(after.get(key)!)), "unused supplied account changed");
      } else sameAccounts(before, after, "failed transaction must roll back");
      previous = after;
      return { id: tx.id, success: tx.success, result: tx.rawResult, computeUnitsConsumed: tx.computeUnitsConsumed,
        committedChangedAccounts: differences(before, after), instructions,
        postChangedAllThreeOracles: instructions[3]?.oracleChanges.length === 3,
        twapOracleUnchanged: tx.success && tx.instructionCount === 5 ? instructions[4]!.oracleChanges.length === 0 : null,
        rollback: !tx.success, logs: tx.logs };
    });
    demand(!scenario.transactions.at(-1)!.success || scenario.transactions.length === expected.order.length, "successful sequence truncated");
    return { id: scenario.id, clock: scenario.clock, complete: transactions.length === expected.order.length && transactions.every(tx => tx.success), transactions };
  });
}

async function main() {
  const fixturePath = resolve(process.argv[2] ?? "output/native-full-bundle/fixture.json");
  const recordPath = resolve(process.argv[3] ?? "output/native-full-bundle/execution.json");
  const outputPath = resolve(process.argv[4] ?? "output/native-full-bundle/review.json");
  const fixtureBytes = await readFile(fixturePath);
  const fixture = JSON.parse(fixtureBytes.toString()) as Fixture;
  const recordBytes = await readFile(recordPath);
  const record = JSON.parse(recordBytes.toString()) as RecordFile;
  for (const [file, expected] of [
    ["tools/full-bundle-runtime/src/main.rs", record.harnessSourceSha256],
    ["tools/full-bundle-runtime/Cargo.lock", record.runtime.cargoLockSha256],
    ["cache/native-full-bundle/mollusk/harness/src/lib.rs", record.runtime.runtimeSourceSha256],
  ]) demand(hash(await readFile(file!)) === expected, "runtime source pin changed: " + file);
  const scenarios = validateNativeRecord(fixture, record, hash(fixtureBytes));
  const summary = { schemaVersion: "full-bundle-review-1", executionRecordSha256: hash(recordBytes), fixtureSha256: hash(fixtureBytes),
    scope: "Fresh local execution on an explicitly constructed later snapshot. No historical replay, transaction fees, transaction signature verification, or validator scheduling claim.",
    gates: {
      successfulPostWriteControl: scenarios.some(s => s.id === "timestamp-mutated-post-write-control" && s.complete && s.transactions[0]?.postChangedAllThreeOracles),
      successfulFullProducerSequence: scenarios.some(s => s.complete && s.transactions.length === 3 && s.transactions[0]?.postChangedAllThreeOracles),
      oldMessageOrderComparison: (() => {
        const a = record.scenarios.find(s => s.id === "timestamp-mutated-full-snapshot-clock");
        const b = record.scenarios.find(s => s.id === "timestamp-mutated-full-snapshot-clock-swapped-consumers");
        return { scope: "constructed snapshot-Clock cases; inspect producer-write gate before treating these roles as producer/equality consumers", finalOrdinaryAccountsEqual: Boolean(a && b && equal(a.transactions.at(-1)?.after, b.transactions.at(-1)?.after)) };
      })(),
    }, scenarios };
  await writeFile(outputPath, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(scenarios.map(s => ({ id: s.id, complete: s.complete, transactions: s.transactions.map(t => ({ id: t.id, success: t.success, result: t.result, postWrites: t.postChangedAllThreeOracles, twapOracleUnchanged: t.twapOracleUnchanged })) })), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
