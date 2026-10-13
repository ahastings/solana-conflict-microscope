import assert from "node:assert/strict";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import { compareAnalyses, comparisonHtml } from "../src/compare-analyses.js";
import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const analysis = (slot: number, compute: Array<number | null>) => analyzeBlock({ blockhash: "block-" + slot, previousBlockhash: "parent", parentSlot: Math.max(0, slot - 1), transactions: compute.map((cu, index) => ({ transaction: { signatures: ["tx-" + index], message: { accountKeys: [{ pubkey: "payer-" + index, signer: true, writable: true }], instructions: [] } }, meta: cu === null ? null : { err: null, fee: 0, computeUnitsConsumed: cu } })) }, slot, "fixture");

test("saved comparisons compute signed descriptive deltas without mutating inputs", () => {
  const left = analysis(10, [10, 10]), right = analysis(20, [30]);
  const snapshots = JSON.stringify([left, right]);
  const result = compareAnalyses(left, right);
  assert.equal(result.metrics.find(row => row.key === "transactions")!.delta, -1);
  assert.equal(result.metrics.find(row => row.key === "compute")!.delta, 10);
  assert.equal(result.metrics.find(row => row.key === "components")!.delta, -1);
  assert.equal(result.metrics.find(row => row.key === "upperBound")!.delta, 0);
  assert.equal(JSON.stringify([left, right]), snapshots);
  assert.match(result.notices.join(" "), /not a controlled before\/after/);
});

test("incomplete compute and unresolved minima never become zero deltas", () => {
  const left = analysis(10, [0]), right = analysis(20, [null]);
  const result = compareAnalyses(left, right), compute = result.metrics.find(row => row.key === "compute")!;
  assert.equal(compute.left, 0); assert.equal(compute.right, 0); assert.equal(compute.delta, null);
  assert.match(compute.note, /missing compute/);
  right.blockWaveBounds.cliqueWitness = [];
  right.blockWaveBounds.cliqueLowerBound = 0;
  right.blockWaveBounds.boundsMatch = false;
  right.blockWaveBounds.provenMinimumWaveCount = null;
  assert.equal(compareAnalyses(left, right).metrics.find(row => row.key === "provenMinimum")!.delta, null);
  assert.equal(compareAnalyses(analysis(1, []), analysis(2, [])).metrics.find(row => row.key === "compute")!.delta, 0);
});

test("comparison rejects corrupt evidence and invalid block identity before reporting", () => {
  const left = analysis(10, [1]), right = analysis(20, [1]);
  right.summary.transactionCount++;
  assert.throws(() => compareAnalyses(left, right), /Right analysis: Analysis verification failed/);
  const invalid = analysis(10, [1]); invalid.context.slot = -1;
  assert.throws(() => compareAnalyses(invalid, left), /Left analysis: comparison requires/);
});

test("comparison labels source differences and escapes supplied HTML", () => {
  const left = analysis(10, [1]), right = analysis(10, [1]);
  left.provenance.cluster = '<img src=x onerror="alert(1)">';
  right.provenance.cluster = "devnet";
  const result = compareAnalyses(left, right), html = comparisonHtml(result);
  assert.match(result.notices.join(" "), /different supplied cluster/);
  assert.match(result.notices.join(" "), /same slot and blockhash/);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<script'));
});

test("comparison CLI preserves original input hashes and refuses overwrites and invalid inputs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "microscope-compare-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const left = join(root, "left.json"), right = join(root, "right.json"), output = join(root, "new report");
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(analysis(10, [10, 10])))]);
  await writeFile(left, bytes); await writeFile(right, JSON.stringify(analysis(20, [30])));
  const script = resolve("scripts/compare-analyses.ts");
  const run = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", script, ...args], { encoding: "utf8" });
  const args = ["--left", left, "--right", right, "--output-dir", output];
  const success = run(args); assert.equal(success.status, 0, success.stderr);
  const savedBytes = await readFile(join(output, "comparison.json"));
  const saved = JSON.parse(savedBytes.toString("utf8"));
  assert.equal(saved.files.left.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(saved.files.left.name, "left.json");
  assert.deepEqual(await readFile(left), bytes);
  assert.ok((await readFile(join(output, "comparison.html"), "utf8")).includes("Compare declared block evidence"));
  const repeat = run(args); assert.notEqual(repeat.status, 0); assert.match(repeat.stderr, /already exists/);
  assert.deepEqual(await readFile(join(output, "comparison.json")), savedBytes);
  const invalidOutput = join(root, "invalid-output");
  for (const invalid of [[], ["--left", left], [...args, "--right", right], [...args, "--unknown"], ["--left", left, "--right", right, "--output-dir", " "]]) assert.notEqual(run(invalid).status, 0);
  await writeFile(right, JSON.stringify({}));
  const corrupt = run(["--left", left, "--right", right, "--output-dir", invalidOutput]);
  assert.notEqual(corrupt.status, 0); assert.match(corrupt.stderr, /Right analysis/);
  await assert.rejects(access(invalidOutput));
  assert.equal(run(["--help"]).status, 0);
});
