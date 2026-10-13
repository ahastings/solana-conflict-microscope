import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CURRENT_FIXTURE_SHA256, reviewCurrentNativeRecord, type CurrentFixture, type CurrentRecord } from "./review-current-native-bundle.js";
import type { NativeBundleInstruction } from "../src/native-bundle-fixture.js";

type Fixture = Omit<CurrentFixture, "transactions"> & { provenance: Record<string, unknown>; transactions: { id: string; instructions: NativeBundleInstruction[] }[] };
type Change = { role: string; instructionIndex: number; accountIndex: number; address: string; from: true; to: false };
const ROOT = "output/native-privilege-controls";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const canonicalAccounts = (accounts: CurrentRecord["scenarios"][number]["transactions"][number]["after"]) => JSON.stringify([...accounts].sort((a, b) => a.address < b.address ? -1 : a.address > b.address ? 1 : 0).map(a => [a.address, a.owner, a.lamports, a.executable, a.rentEpoch, a.dataBase64]));
const encode = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const scope = "Unsigned local account-privilege counterfactual. Original outer transaction signatures are provenance references only; fees and submission are not modeled. Ordinary input bytes, all Clock fields, signer bits, instruction programs/data/order/operands and shared payer declaration are unchanged.";

function derive(baseline: Fixture) {
  const oracles = baseline.transactions[0]!.instructions[3]!.accounts.slice(3).map(a => a.address);
  assert.equal(new Set(oracles).size, 3);
  const cases: [string, string[]][] = [["consumers-readonly", ["anchor-B", "anchor-C"]], ["producer-readonly", ["anchor-A"]]];
  const controls = cases.map(([id, roles]) => {
    const fixture = structuredClone(baseline), changes: Change[] = [];
    for (const tx of fixture.transactions) if (roles.includes(tx.id)) {
      for (const [instructionIndex, ix] of tx.instructions.entries()) for (const [accountIndex, a] of ix.accounts.entries()) if (oracles.includes(a.address)) {
        assert.equal(a.writable, true); assert.equal(a.signer, false); a.writable = false;
        changes.push({ role: tx.id, instructionIndex, accountIndex, address: a.address, from: true, to: false });
      }
    }
    assert.equal(changes.length, roles.length * 4);
    // Account bytes, non-oracle privileges and every other field must be recoverable by reversing only these flag edits.
    const reversed = structuredClone(fixture);
    for (const change of changes) reversed.transactions.find(tx => tx.id === change.role)!.instructions[change.instructionIndex]!.accounts[change.accountIndex]!.writable = true;
    assert.deepEqual(reversed, baseline);
    fixture.provenance.privilegeControl = { id, baselineFixtureSha256: CURRENT_FIXTURE_SHA256, changes, scope };
    const bytes = encode(fixture);
    return { id, roles, changes, fixtureSha256: hash(bytes), path: `${ROOT}/fixture-${id}.json`, bytes, fixture };
  });
  return { oracles, controls };
}
async function verifyRuntime(record: CurrentRecord) {
  for (const [file, expected] of [
    ["tools/current-bundle-runtime/src/main.rs", record.harnessSourceSha256],
    ["tools/current-bundle-runtime/Cargo.lock", record.runtime.cargoLockSha256],
    ["cache/native-full-bundle/mollusk/harness/src/lib.rs", record.runtime.runtimeSourceSha256],
  ]) assert.equal(hash(await readFile(file!)), expected, "Runtime source changed: " + file);
}
async function main() {
  const mode = process.argv[2];
  assert(process.argv.length === 3 && (mode === "prepare" || mode === "review"), "Usage: oracle-privilege-controls.ts prepare|review");
  const bytes = await readFile("output/native-current-bundle/fixture.json");
  assert.equal(hash(bytes), CURRENT_FIXTURE_SHA256, "Baseline fixture changed");
  const baseline = JSON.parse(bytes.toString()) as Fixture;
  const { oracles, controls } = derive(baseline);
  if (mode === "prepare") {
    assert.equal(await realpath("output"), resolve("output")); await mkdir(ROOT); assert(!(await lstat(ROOT)).isSymbolicLink());
    for (const control of controls) await writeFile(control.path, control.bytes, { flag: "wx" });
    const manifest = { schemaVersion: "oracle-privilege-controls-1", baselineFixtureSha256: CURRENT_FIXTURE_SHA256, oracleAddresses: oracles,
      controls: controls.map(({ bytes: _bytes, fixture: _fixture, ...control }) => control) };
    await writeFile(`${ROOT}/controls.json`, encode(manifest), { flag: "wx" });
    console.log(JSON.stringify({ controls: controls.map(c => ({ id: c.id, changes: c.changes.length, fixtureSha256: c.fixtureSha256 })) })); return;
  }
  const baselineRecordBytes = await readFile("output/native-current-bundle/execution.json");
  assert.equal(hash(baselineRecordBytes), "ae6fc37e2493e5507e0ea941649b9d5e79d32f27ec443f5189aff9056cef96af");
  const baselineRecord = JSON.parse(baselineRecordBytes.toString()) as CurrentRecord;
  await verifyRuntime(baselineRecord);
  const baselineReview = reviewCurrentNativeRecord(baseline, baselineRecord, CURRENT_FIXTURE_SHA256);
  assert(baselineReview.reorderingComparison.evidenceEstablished, "Successful unmodified baseline required");
  const results = [];
  for (const control of controls) {
    assert.equal(hash(await readFile(control.path)), control.fixtureSha256, "Only the declared writable flags and explicit provenance may change");
    const recordBytes = await readFile(`${ROOT}/execution-${control.id}.json`), record = JSON.parse(recordBytes.toString()) as CurrentRecord;
    await verifyRuntime(record);
    assert.equal(record.harnessSourceSha256, baselineRecord.harnessSourceSha256, "Control uses a different harness");
    const review = reviewCurrentNativeRecord(control.fixture, record, control.fixtureSha256);
    const sequences = record.scenarios.map((scenario, index) => {
      const last = scenario.transactions.at(-1)!;
      const failureIndex = /InstructionError\((\d+),/.exec(last.rawResult)?.[1];
      const errorLogs = last.logs.filter(line => line.includes("AnchorError"));
      return { id: scenario.id, rolesExecuted: scenario.transactions.map(tx => tx.id), complete: review.scenarios[index]!.complete,
        lastRole: last.id, success: last.success, result: last.rawResult, failedInstructionIndex: failureIndex === undefined ? null : Number(failureIndex),
        errorLogs, ed25519CompletedBeforePost: last.instructionEvents.some(event => event.instructionIndex === 3 && event.phase === "before"),
        failureRolledBack: !last.success && review.scenarios[index]!.transactions.at(-1)!.rollback,
        failedPostOrdinaryChanges: review.scenarios[index]!.transactions.at(-1)!.instructions[3]?.ordinaryAccountChanges ?? null,
        successfulProducerBeforeFailure: scenario.transactions.length > 1 && review.scenarios[index]!.producerGate.passed };
    });
    results.push({ id: control.id, changedDeclarations: control.changes, fixtureSha256: control.fixtureSha256, executionRecordSha256: hash(recordBytes),
      complete: review.complete, finalOrdinaryStateMatchesBaseline: review.complete ? record.scenarios.every((scenario, index) => canonicalAccounts(scenario.transactions.at(-1)!.after) === canonicalAccounts(baselineRecord.scenarios[index]!.transactions.at(-1)!.after)) : null, successfulOrderComparison: review.reorderingComparison, sequences });
  }
  const report = { schemaVersion: "oracle-privilege-review-2", baselineFixtureSha256: CURRENT_FIXTURE_SHA256,
    baselineExecutionSha256: hash(baselineRecordBytes), scope,
    runtimeMetadataCaveat: "The unchanged harness emits accountPrivileges='observed transaction-wide privileges'. That label is inaccurate for these controls: the pinned derived fixture declarations are counterfactual. Original execution records remain preserved without alteration.",
    instructionsSysvarCaveat: "Runtime-generated Instructions sysvar account-meta bits necessarily change with the declarations; signed instruction payload bytes remain unchanged.",
    feePayerUnchanged: true, readonlyConsumersEquivalentForThisFixture: results[0]!.complete && results[0]!.successfulOrderComparison.evidenceEstablished && results[0]!.finalOrdinaryStateMatchesBaseline === true,
    limits: "Three oracle declarations are demoted together. This does not identify which individual oracle requires mutability. Failure is program account validation, not demonstrated rejection of an attempted read-only write. No general reordering or execution-wave improvement follows.", results };
  await writeFile(`${ROOT}/review-v2.json`, encode(report), { flag: "wx" });
  console.log(JSON.stringify({ readonlyConsumersEquivalentForThisFixture: report.readonlyConsumersEquivalentForThisFixture, results: results.map(r => ({ id: r.id, complete: r.complete, sequences: r.sequences })) }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });