import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { buildNativeBundleFixture, materializeVerifiedNativeElf, NATIVE_BUNDLE_ELF_PATH, prepareNativeBundleFixture, type CapturedBundleBlock, type CapturedBundleSnapshot } from "../src/native-bundle-fixture.js";

// Uses only the portable public block plus conspicuously synthetic account data;
// no historical cache/native execution is needed for these transformation tests.
const cached = JSON.parse(await readFile(new URL("../fixtures/reviewer/slot-489572998.json", import.meta.url), "utf8")) as CapturedBundleBlock;
const PROGRAM = "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P";
const SYSVAR = "Sysvar1nstructions1111111111111111111111111";
const ORACLES = ["2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV", "J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ", "6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH"];
function syntheticSnapshot(): CapturedBundleSnapshot {
  const addresses = [...new Set([1, 2, 3].flatMap((index) => cached.block.transactions[index]!.transaction.message.instructions!.flatMap((instruction) => "accounts" in instruction ? (instruction.accounts as string[]) : [])))].filter((address) => address !== SYSVAR);
  return { retrievedAt: "synthetic-test", endpoint: "synthetic-test", commitment: "synthetic-test", addresses, response: { result: { context: { slot: 490041839 }, value: addresses.map((address, index) => {
    const data = Buffer.alloc(ORACLES.includes(address) ? 48 : 32, index + 1);
    if (ORACLES.includes(address)) { Buffer.from("9f07a1f922517985", "hex").copy(data); data.writeBigUInt64LE(1788031406600000n, 16); }
    return { owner: PROGRAM, executable: false, lamports: "123456789", rentEpoch: "18446744073709551615", data: [data.toString("base64"), "base64"], space: data.length };
  }) } } };
}

test("fixture derives six explicit Clock/order scopes and all observed instructions", () => {
  const fixture = buildNativeBundleFixture(syntheticSnapshot(), cached);
  assert.equal(fixture.provenance.sourcePinsVerified, false);
  assert.equal(fixture.provenance.nativeExecutionPerformed, false);
  assert.equal(fixture.provenance.computeUnitLimit, 200000);
  assert.deepEqual(fixture.transactions.map((transaction) => transaction.instructions.length), [5, 5, 5]);
  assert.deepEqual(fixture.scenarios.map((scenario) => scenario.instructionCount), [5, 4, 4, 5, 5, 5]);
  assert.deepEqual(fixture.scenarios.map((scenario) => scenario.clock), [{ slot: 490041839, unixTimestamp: 1788031407 }, { slot: 0, unixTimestamp: 0 }, { slot: 489572998, unixTimestamp: 1787953586 }, { slot: 489572998, unixTimestamp: 1787953586 }, { slot: 490041839, unixTimestamp: 1788031407 }, { slot: 490041839, unixTimestamp: 1788031407 }]);
  assert.deepEqual(fixture.scenarios[5]!.order, ["anchor-A", "anchor-C", "anchor-B"]);
  assert.equal(fixture.scenarios[0]!.accounts.length, 14);
  assert.ok(fixture.scenarios.every((scenario) => scenario.accounts.every((account) => account.address !== SYSVAR)));
});

test("only oracle bytes16..24 change; market/maker bytes and source metadata survive exactly", () => {
  const snapshot = syntheticSnapshot(), fixture = buildNativeBundleFixture(snapshot, cached), baseline = fixture.scenarios[0]!;
  assert.equal(baseline.mutations.length, 0);
  for (const account of baseline.accounts) {
    const source = snapshot.response.result.value[snapshot.addresses.indexOf(account.address)]!;
    assert.equal(account.dataBase64, source.data[0]); assert.equal(account.owner, source.owner); assert.equal(account.lamports, source.lamports); assert.equal(account.rentEpoch, source.rentEpoch);
  }
  for (const scenario of fixture.scenarios.slice(1)) {
    assert.equal(scenario.mutations.length, 3);
    for (const after of scenario.accounts) {
      const before = baseline.accounts.find((account) => account.address === after.address)!;
      if (!ORACLES.includes(after.address)) assert.deepEqual(after, before);
      else {
        const a = Buffer.from(after.dataBase64, "base64"), b = Buffer.from(before.dataBase64, "base64");
        assert.deepEqual(a.subarray(0, 16), b.subarray(0, 16)); assert.deepEqual(a.subarray(24), b.subarray(24));
        assert.equal(a.readBigUInt64LE(16), 1787953585799999n);
        const mutation = scenario.mutations.find((item) => item.address === after.address)!;
        assert.equal(mutation.originalDataSha256, before.dataSha256); assert.equal(mutation.newDataSha256, after.dataSha256);
        assert.deepEqual(mutation.byteRange, { start: 16, endExclusive: 24 });
      }
    }
  }
});

test("missing ordinary accounts and mismatched oracle metadata are rejected", () => {
  const missing = syntheticSnapshot(); missing.response.result.value[0] = null;
  assert.throws(() => buildNativeBundleFixture(missing, cached), /missing ordinary account/);
  const changed = syntheticSnapshot(); changed.response.result.value[changed.addresses.indexOf(ORACLES[0]!)]!.owner = "11111111111111111111111111111111";
  assert.throws(() => buildNativeBundleFixture(changed, cached), /oracle owner/);
});

test("identity, instruction-byte disagreement, and compute budget changes fail closed", () => {
  const wrong = structuredClone(cached); wrong.block.transactions[1]!.transaction.signatures[0] = "wrong";
  assert.throws(() => buildNativeBundleFixture(syntheticSnapshot(), wrong), /identity/);
  const changed = structuredClone(cached); changed.block.transactions[1]!.rawTransaction!.message.instructions![3]!.data = "11111";
  assert.throws(() => buildNativeBundleFixture(syntheticSnapshot(), changed), /instruction identity/);
  const budget = structuredClone(cached); const instructions = budget.block.transactions[1]!.transaction.message.instructions!;
  instructions[0]!.data = "11111"; budget.block.transactions[1]!.rawTransaction!.message.instructions![0]!.data = "11111";
  assert.throws(() => buildNativeBundleFixture(syntheticSnapshot(), budget), /compute-unit limit/);
});

test("production preparation rejects unpinned bytes before creating output", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "native-bundle-pins-")), path = join(temporary, "bad.json"), output = join(temporary, "fixture.json");
  await writeFile(path, "{}\n");
  await assert.rejects(prepareNativeBundleFixture({ snapshotPath: path, blockPath: path, planPath: path, outputPath: output }), /SHA-256 mismatch/);
  await assert.rejects(readFile(output), { code: "ENOENT" });
});

const syntheticElf = Buffer.from("synthetic file-copy test bytes; not an executable ELF");
const syntheticElfHash = createHash("sha256").update(syntheticElf).digest("hex");
async function elfWorkspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "native-elf-copy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("verified ELF materialization creates the Rust-required path from absent directories", async (t) => {
  const root = await elfWorkspace(t);
  const result = await materializeVerifiedNativeElf(syntheticElf, syntheticElfHash, root);
  assert.deepEqual(result, { path: join(root, NATIVE_BUNDLE_ELF_PATH), status: "created" });
  assert.deepEqual(await readFile(result.path), syntheticElf);
});

test("verified ELF materialization reuses identical bytes without rewriting the file", async (t) => {
  const root = await elfWorkspace(t), path = join(root, NATIVE_BUNDLE_ELF_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, syntheticElf);
  const oldTime = new Date("2000-01-01T00:00:00Z");
  await utimes(path, oldTime, oldTime);
  const before = await stat(path);
  const result = await materializeVerifiedNativeElf(syntheticElf, syntheticElfHash, root);
  assert.equal(result.status, "reused");
  assert.equal((await stat(path)).mtimeMs, before.mtimeMs);
  assert.deepEqual(await readFile(path), syntheticElf);
});

test("verified ELF materialization refuses different existing bytes without overwriting them", async (t) => {
  const root = await elfWorkspace(t), path = join(root, NATIVE_BUNDLE_ELF_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "preserve this unrelated content");
  await assert.rejects(materializeVerifiedNativeElf(syntheticElf, syntheticElfHash, root), /existing ELF differs.*refusing to overwrite/);
  assert.equal(await readFile(path, "utf8"), "preserve this unrelated content");
});

test("unverified ELF bytes fail before creating a cache directory", async (t) => {
  const root = await elfWorkspace(t);
  await assert.rejects(materializeVerifiedNativeElf(Buffer.from("altered"), syntheticElfHash, root), /expected SHA-256/);
  assert.deepEqual(await readdir(root), []);
});

test("ELF materialization rejects an ancestor junction before writing outside the workspace", async (t) => {
  const base = await elfWorkspace(t), root = join(base, "workspace"), outside = join(base, "outside");
  await mkdir(root); await mkdir(outside);
  try { await symlink(outside, join(root, "cache"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(code ?? "")) { t.skip(`Directory links unavailable (${code})`); return; }
    throw error;
  }
  await assert.rejects(materializeVerifiedNativeElf(syntheticElf, syntheticElfHash, root), /refusing linked output path/);
  assert.deepEqual(await readdir(outside), []);
});