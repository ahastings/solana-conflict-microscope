import { parseRangeArgs } from "../src/range-options.js";
import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { parseAnalyzeArgs } from "../src/analyze-options.js";

test("analyze accepts fixture paths with spaces and explicit RPC slot zero", () => {
  assert.deepEqual(parseAnalyzeArgs(["--fixture", "a block.json", "--output-dir", "my reports"]), { help: false, fixture: "a block.json", slot: undefined, rpcUrl: undefined, outputDir: "my reports" });
  assert.deepEqual(parseAnalyzeArgs(["--slot=0", "--rpc-url", "http://localhost:1234"]), { help: false, fixture: undefined, slot: 0, rpcUrl: "http://localhost:1234", outputDir: "output" });
});
test("misspelled options and positional arguments cannot silently select defaults", () => {
  for (const args of [["--slot", "1", "--rpc-urll", "http://localhost"], ["--fixture", "block.json", "--ouput-dir", "reports"], ["--slot", "1", "extra"]]) assert.throws(() => parseAnalyzeArgs(args));
});
test("duplicates and missing or empty values are rejected", () => {
  for (const args of [["--slot", "1", "--slot", "2"], ["--fixture", "a", "--output-dir", "one", "--output-dir", "two"], ["--fixture", "a", "--output-dir"], ["--slot", "1", "--rpc-url", "--output-dir", "x"], ["--fixture="], ["--slot", "1", "--rpc-url="], ["--fixture", "a", "--output-dir="]]) assert.throws(() => parseAnalyzeArgs(args));
});
test("source selection and slot validation remain explicit", () => {
  for (const args of [[], ["--fixture", "a", "--slot", "1"], ["--slot", "-1"], ["--slot", "1.5"], ["--slot", "9007199254740992"], ["--slot", " "]]) assert.throws(() => parseAnalyzeArgs(args));
});
test("help is available without a source", async () => {
  assert.deepEqual(parseAnalyzeArgs(["-h"]), { help: true });
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", "--help"], { timeout: 5000 });
  assert.match(stdout, /Usage: npm run analyze/);
  assert.match(stdout, /declared account contention/);
});
test("fixture slots are not coerced from null, booleans, or strings", async () => {
  const root = await mkdtemp(join(tmpdir(), "microscope-fixture-slot-"));
  try {
    const fixture = join(root, "fixture.json"), output = join(root, "report");
    for (const slot of [null, false, true, "0"]) {
      await writeFile(fixture, JSON.stringify({ slot, block: { blockhash: "synthetic", previousBlockhash: "synthetic", parentSlot: 0, transactions: [] } }));
      await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", "--fixture", fixture, "--output-dir", output], { timeout: 5000 }), /Fixture must contain a non-negative integer slot/);
      await assert.rejects(access(output));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("range options retain explicit cache-only defaults and support zero slots", () => {
  const options = parseRangeArgs(["--start-slot=0", "--end-slot", "2", "--skip-slots", "0, 2", "--cache-dir", "cache folder"]);
  assert.equal(options.help, false);
  if (options.help) return;
  assert.equal(options.startSlot, 0);
  assert.equal(options.endSlot, 2);
  assert.equal(options.offline, false);
  assert.equal(options.fetchMissing, false);
  assert.equal(options.maxRetries, 3);
  assert.equal(options.backoffMs, 500);
  assert.equal(options.cacheDir, "cache folder");
  assert.deepEqual([...options.skippedSlots], [0, 2]);
});

test("range parsing rejects typos, duplicates, positionals, and incomplete values", () => {
  const base = ["--start-slot", "0", "--end-slot", "2"];
  for (const tail of [["--offine"], ["--fetch-mising"], ["--start-slot", "1"], ["--offline", "--offline"], ["extra"], ["--output-dir"], ["--rpc-url="], ["--skip-slots", "0,"], ["--skip-slots", ",1"], ["--skip-slots", " "]]) {
    assert.throws(() => parseRangeArgs([...base, ...tail]));
  }
});

test("range limits and incompatible modes are validated before acquisition", () => {
  for (const args of [[], ["--start-slot", "2", "--end-slot", "1"], ["--start-slot", "0", "--end-slot", "500"], ["--start-slot", " ", "--end-slot", "0"], ["--start-slot", "0", "--end-slot", "1", "--skip-slots", "2"], ["--start-slot", "0", "--end-slot", "1", "--offline", "--fetch-missing"], ["--start-slot", "0", "--end-slot", "1", "--max-retries", "9"]]) {
    assert.throws(() => parseRangeArgs(args));
  }
  assert.equal(parseRangeArgs(["--start-slot", "0", "--end-slot", "499"]).help, false);
});

test("range CLI help is available and malformed commands create no cache", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "src/range-cli.ts", "--help"], { timeout: 5000 });
  assert.match(stdout, /Without --fetch-missing, only cached data is used/);
  const root = await mkdtemp(join(tmpdir(), "microscope-range-options-"));
  try {
    const cache = join(root, "cache"), output = join(root, "reports");
    await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", "src/range-cli.ts", "--start-slot", "0", "--end-slot", "0", "--offine", "--cache-dir", cache, "--output-dir", output], { timeout: 5000 }), /Unknown option/);
    await assert.rejects(access(cache));
    await assert.rejects(access(output));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("fixture envelopes reject nonobjects and missing block objects without creating reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "microscope-fixture-envelope-"));
  try {
    const fixture = join(root, "fixture.json"), output = join(root, "report");
    for (const value of [null, [], false, 3, "text", { slot: 0 }, { slot: 0, block: null }, { slot: 0, block: [] }, { slot: 0, block: "text" }]) {
      await writeFile(fixture, JSON.stringify(value));
      await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", "--fixture", fixture, "--output-dir", output], { timeout: 5000 }), /Fixture must contain a non-negative integer slot and block object/);
      await assert.rejects(access(output));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("analyze accepts a UTF-8 BOM fixture without changing its bytes or evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "microscope-fixture-bom-"));
  try {
    const original = await readFile("fixtures/real-devnet-block.json");
    const fixture = join(root, "with bom.json"), output = join(root, "report");
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]);
    await writeFile(fixture, bytes);
    await promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", "--fixture", fixture, "--output-dir", output], { timeout: 5000 });
    const report = JSON.parse(await readFile(join(output, "analysis.json"), "utf8")) as { context: { slot: number }; summary: { transactionCount: number; conflictEdgeCount: number } };
    assert.equal(report.context.slot, 488638500);
    assert.equal(report.summary.transactionCount, 45);
    assert.equal(report.summary.conflictEdgeCount, 116);
    assert.deepEqual(await readFile(fixture), bytes);
  } finally { await rm(root, { recursive: true, force: true }); }
});
