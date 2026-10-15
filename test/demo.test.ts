import { verifyDemoArtifacts } from "../src/verify-demo.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyzeBlock } from "../src/analyze.js";
import { DEMO_FIXTURES, runDemo } from "../src/demo.js";
import type { Analysis, FixtureProvenance } from "../src/types.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

async function fixtureOnlyRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "microscope-demo-"));
  await mkdir(join(root, "fixtures"));
  await Promise.all(DEMO_FIXTURES.map((fixture) => copyFile(join(repositoryRoot, "fixtures", fixture.filename), join(root, "fixtures", fixture.filename))));
  await cp(join(repositoryRoot, "fixtures", "loader-range"), join(root, "fixtures", "loader-range"), { recursive: true });
  return root;
}

test("offline demo runs with only shipped fixtures, produces linked reports, and derives its findings from analysis", async (t) => {
  const root = await fixtureOnlyRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("The offline demo must not use network access"); });
  assert.deepEqual(await readdir(root), ["fixtures"]);
  const result = await runDemo({ repositoryRoot: root });
  assert.equal(result.indexPath, join(root, "output", "demo", "index.html"));
  const html = await readFile(result.indexPath, "utf8");
  assert.equal(result.reports.length, 3);
  assert.equal(result.rangeReport.analysis.provenance.observedSlots.length, 9);
  assert.equal(result.rangeReport.analysis.crossBlockSequences[0]!.observedChunkCount, 148);
  assert.match(html, /Open multi-block upload/);
  for (const report of result.reports) {
    const fixture = JSON.parse(await readFile(join(root, "fixtures", report.fixture.filename), "utf8")) as { slot: number; block: unknown; provenance: FixtureProvenance };
    const expected = analyzeBlock(fixture.block, fixture.slot, "fixture", { ...fixture.provenance, sourceMode: "fixture" });
    const saved = JSON.parse(await readFile(report.analysisPath, "utf8")) as Analysis;
    const card = html.split(`<article id="${report.fixture.id}">`)[1]!.split("</article>")[0]!;
    assert.deepEqual(saved, expected);
    assert.ok(report.findings.length > 0);
    for (const finding of report.findings) {
      assert.ok(card.includes(escapeHtml(finding.explanation)));
      assert.ok(card.includes(escapeHtml(finding.actionability.value)));
    }
    assert.ok(card.includes(`<dd>${expected.summary.transactionCount}</dd>`));
    assert.ok(card.includes(`<dd>${expected.summary.conflictEdgeCount}</dd>`));
    const reportHtml = await readFile(report.reportPath, "utf8");
    assert.ok(reportHtml.includes("Solana Conflict Microscope"));
    assert.equal(reportHtml.includes("CURATED TEACHING FIXTURE"), report.fixture.dataKind === "curated-teaching");
  }
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);
  assert.equal(hrefs.length, 18);
  for (const href of hrefs) {
    if (href.startsWith("#")) { assert.ok(html.includes(`id="${href.slice(1)}"`)); continue; }
    assert.ok(!href.includes("\\"), "HTML links use portable forward slashes");
    assert.ok((await readFile(resolve(dirname(result.indexPath), href))).length > 0);
  }
  const navigation = html.match(/<nav class="quick-links"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(navigation);
  assert.ok(html.indexOf(navigation) < html.indexOf('<section class="guide">'), "Direct report links appear before the detailed explanation");
  assert.match(navigation.replace(new RegExp("<span[^>]*>[^<]*</span>", "g"), ""), /href="real-loader\/report.html">Open real upload/);
  assert.match(navigation.replace(new RegExp("<span[^>]*>[^<]*</span>", "g"), ""), /href="real-funding\/report.html">Open cross-payer funding/);
  assert.match(navigation.replace(new RegExp("<span[^>]*>[^<]*</span>", "g"), ""), /href="synthetic-teaching\/report.html">Open synthetic teaching/);
  assert.match(html, /<main id="report-examples" tabindex="-1">/);
  assert.match(html, /SYNTHETIC TEACHING FIXTURE — NOT OBSERVED NETWORK ACTIVITY/);
  assert.match(html, /Real devnet: cross-payer funding/);
  assert.match(html, /insufficient evidence/);
  assert.match(html, /not a reconstruction of a validator's exact private schedule/);
  assert.equal((await readdir(root)).includes("cache"), false);
  assert.equal(fetch.mock.callCount(), 0);
});

test("demo refuses a real-network label on a synthetic fixture before writing reports", async (t) => {
  const root = await fixtureOnlyRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "fixtures", "cross-payer-application-state-teaching.json");
  const fixture = JSON.parse(await readFile(path, "utf8")) as { provenance: { dataKind: string } };
  fixture.provenance.dataKind = "real-network";
  await writeFile(path, JSON.stringify(fixture));
  await assert.rejects(runDemo({ repositoryRoot: root }), /refusing to mislabel/);
  assert.deepEqual(await readdir(root), ["fixtures"]);
});

test("demo refuses a described finding that is absent from the analyzer result", async (t) => {
  const root = await fixtureOnlyRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "fixtures", "real-devnet-block.json");
  const fixture = JSON.parse(await readFile(path, "utf8")) as { block: { transactions: unknown[] } };
  fixture.block.transactions = [];
  await writeFile(path, JSON.stringify(fixture));
  await assert.rejects(runDemo({ repositoryRoot: root }), /analyzer did not find the program-buffer writes/);
  assert.deepEqual(await readdir(root), ["fixtures"]);
});

test("demo output is deterministic and supports a path containing spaces", async (t) => {
  const root = await fixtureOnlyRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await runDemo({ repositoryRoot: root, outputDir: "first run" });
  const second = await runDemo({ repositoryRoot: root, outputDir: "second run" });
  assert.deepEqual(await readFile(first.indexPath), await readFile(second.indexPath));
  assert.deepEqual(await readFile(first.rangeReport.reportPath), await readFile(second.rangeReport.reportPath));
  assert.deepEqual(await readFile(first.rangeReport.analysisPath), await readFile(second.rangeReport.analysisPath));
  for (let index = 0; index < first.reports.length; index++) {
    assert.deepEqual(await readFile(first.reports[index]!.analysisPath), await readFile(second.reports[index]!.analysisPath));
    assert.deepEqual(await readFile(first.reports[index]!.reportPath), await readFile(second.reports[index]!.reportPath));
  }
});

test("demo CLI works outside the repository and prints paths; invalid flags fail clearly", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "microscope-demo-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runner = [join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs"), join(repositoryRoot, "scripts", "demo.ts")];
  const result = spawnSync(process.execPath, [...runner, "--output-dir", "report with spaces"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const indexPath = join(root, "report with spaces", "index.html");
  assert.ok(result.stdout.includes(indexPath));
  assert.match(result.stdout, /file:\/\//);
  assert.match(await readFile(indexPath, "utf8"), /offline demo/);
  const invalid = spawnSync(process.execPath, [...runner, "--rpc-url", "https://example.invalid"], { cwd: root, encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Usage: npm run demo/);
});

test("demo summary changes with the fixture instead of repeating stored metrics", async (t) => {
  const root = await fixtureOnlyRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "fixtures", "cross-payer-application-state-teaching.json");
  const fixture = JSON.parse(await readFile(path, "utf8")) as { block: { transactions: unknown[] } };
  const originalCount = fixture.block.transactions.length;
  fixture.block.transactions.shift(); // Remove the independent transaction; retain the shared-state finding.
  await writeFile(path, JSON.stringify(fixture));
  const result = await runDemo({ repositoryRoot: root });
  const report = result.reports.find((item) => item.fixture.id === "synthetic-teaching")!;
  assert.equal(report.analysis.summary.transactionCount, originalCount - 1);
  const html = await readFile(result.indexPath, "utf8");
  const card = html.split('<article id="synthetic-teaching">')[1]!.split("</article>")[0]!;
  assert.ok(card.includes(`<dt>Transactions</dt><dd>${originalCount - 1}</dd>`));
  assert.ok(!card.includes(`<dt>Transactions</dt><dd>${originalCount}</dd>`));
});
test("demo rejects missing range evidence and incorrect range provenance before writing reports", async (t) => {
  const root = await fixtureOnlyRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "fixtures", "loader-range", "slot-488638500.json");
  const bytes = await readFile(path, "utf8");
  await rm(path);
  await assert.rejects(runDemo({ repositoryRoot: root }), /requires all nine shipped blocks/);
  assert.deepEqual(await readdir(root), ["fixtures"]);
  const fixture = JSON.parse(bytes);
  fixture.provenance.dataKind = "synthetic";
  await writeFile(path, JSON.stringify(fixture));
  await assert.rejects(runDemo({ repositoryRoot: root }), /refusing to mislabel/);
  assert.deepEqual(await readdir(root), ["fixtures"]);
});


test("saved demo verification checks all twelve blocks and rejects changed range evidence", async (t) => {
  const root=await fixtureOnlyRoot();t.after(()=>rm(root,{recursive:true,force:true}));
  t.mock.method(globalThis,'fetch',()=>{throw new Error('Verification must remain offline')});
  const demo=await runDemo({repositoryRoot:root}),directory=dirname(demo.indexPath);
  const certificate=await verifyDemoArtifacts(directory);
  assert.equal(certificate.verifiedBlockAnalyses,12);
  assert.equal(certificate.range.blocks.length,9);
  const file=demo.rangeReport.analysisPath,bytes=await readFile(file,'utf8');
  assert.equal(certificate.range.blocks.every(block=>block.verification.status==='verified'),true);
  const range=JSON.parse(bytes);range.slots[1].slot=range.slots[0].slot;
  await writeFile(file,JSON.stringify(range));
  await assert.rejects(verifyDemoArtifacts(directory),/slot identity/);
  const corrupt=JSON.parse(bytes);corrupt.slots[0].analysis.conflictEdges.pop();
  const corruptBytes=JSON.stringify(corrupt);await writeFile(file,corruptBytes);
  await assert.rejects(verifyDemoArtifacts(directory),/missing conflict pairs/);
  assert.equal(await readFile(file,'utf8'),corruptBytes);
});

test("demo verification CLI reports malformed input without dumping it or a stack", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "microscope-demo-errors-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "real-loader"));
  const file = join(root, "real-loader", "analysis.json");
  const malformed = '{"padding":"' + 'x'.repeat(20000) + '",}';
  await writeFile(file, malformed);
  const script = join(repositoryRoot, "scripts", "verify-demo.ts");
  for (const args of [["--demo-dir", root], ["--unknown"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", script, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.length < 1000);
    assert.doesNotMatch(result.stderr, /\n\s+at |Node\.js v/);
  }
  assert.equal(await readFile(file, "utf8"), malformed);
});


test("saved demo comparison verification rejects altered deltas and stale source hashes without rewriting evidence", async (t) => {
  const root = await fixtureOnlyRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const demo = await runDemo({ repositoryRoot: root });
  const directory = dirname(demo.indexPath);
  const file = join(directory, "comparison", "comparison.json");
  const original = await readFile(file, "utf8");
  assert.equal((await verifyDemoArtifacts(directory)).comparison.status, "verified");
  const changed = JSON.parse(original);
  changed.metrics[0].delta += 1;
  const changedBytes = JSON.stringify(changed);
  await writeFile(file, changedBytes);
  await assert.rejects(verifyDemoArtifacts(directory), /saved comparison does not match/);
  assert.equal(await readFile(file, "utf8"), changedBytes);
  await writeFile(file, original);
  const source = demo.reports[0]!.analysisPath;
  await writeFile(source, (await readFile(source, "utf8")) + " ");
  await assert.rejects(verifyDemoArtifacts(directory), /original file hashes/);
});
