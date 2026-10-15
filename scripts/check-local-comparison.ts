import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeBlock } from "../src/analyze.js";
import { compareAnalyses, type AnalysisComparison } from "../src/compare-analyses.js";

type Upload = string | { name: string; mimeType: string; buffer: Buffer };
interface Locator {
  setInputFiles(file: Upload): Promise<void>; click(): Promise<void>;
  waitFor(options: { state: "visible" | "hidden" }): Promise<void>;
  textContent(): Promise<string | null>; getAttribute(name: string): Promise<string | null>;
  count(): Promise<number>;
  scrollIntoViewIfNeeded(): Promise<void>;
}
interface Download { saveAs(path: string): Promise<void>; failure(): Promise<string | null> }
interface Page {
  locator(selector: string): Locator;
  frameLocator(selector: string): { locator(selector: string): Locator };
  goto(url: string): Promise<unknown>; close(): Promise<void>;
  on(event: "pageerror", listener: (error: Error) => void): void;
  route(pattern: RegExp, listener: (route: { request(): { url(): string }; abort(): Promise<void> }) => Promise<void>): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  screenshot(options: { path: string; fullPage: boolean }): Promise<Buffer>;
  waitForFunction(fn: () => boolean): Promise<unknown>;
  waitForTimeout(milliseconds: number): Promise<void>;
  waitForEvent(event: "download"): Promise<Download>;
}
interface Browser {
  newPage(options: { viewport: { width: number; height: number } }): Promise<Page>;
  close(): Promise<void>;
}
interface Runtime { chromium: { launch(options: { headless: boolean; executablePath?: string; downloadsPath: string }): Promise<Browser> } }
const root = fileURLToPath(new URL("../", import.meta.url));
const parse = (bytes: Buffer): unknown => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const upload = (name: string, value: unknown): Upload => ({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error("Usage: tsx scripts/check-local-comparison.ts (run npm run demo first)");
  const require = createRequire(import.meta.url);
  let runtime: Runtime;
  try { runtime = require(process.env.MICROSCOPE_PLAYWRIGHT_PATH || "playwright-core") as Runtime; }
  catch { throw new Error("Browser checks require the playwright-core dev dependency. Run npm ci or set MICROSCOPE_PLAYWRIGHT_PATH to another installed Playwright module."); }
  const pagePath = join(root, "output/demo/comparison/local.html");
  await access(pagePath);
  await mkdir(join(root, "output"), { recursive: true });
  const evidence = await mkdtemp(join(root, "output/local-comparison-browser-"));
  const leftOriginal = await readFile(join(root, "output/demo/real-loader/analysis.json"));
  const rightBytes = await readFile(join(root, "output/demo/real-funding/analysis.json"));
  const leftBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), leftOriginal]);
  const leftPath = join(evidence, "left-with-bom.json"), rightPath = join(evidence, "right.json");
  await writeFile(leftPath, leftBytes); await writeFile(rightPath, rightBytes);
  const expected = compareAnalyses(parse(leftBytes), parse(rightBytes));
  expected.files = { left: { name: "left-with-bom.json", sha256: hash(leftBytes) }, right: { name: "right.json", sha256: hash(rightBytes) } };
  const browser = await runtime.chromium.launch({ headless: true, downloadsPath: evidence, ...(process.env.MICROSCOPE_CHROME_PATH ? { executablePath: process.env.MICROSCOPE_CHROME_PATH } : {}) });
  const checks: string[] = [];
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors: string[] = [], network: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:\/\//, async route => { network.push(route.request().url()); await route.abort(); });
      await page.goto(pathToFileURL(pagePath).href);
      assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content") ?? "", /connect-src 'none'/);
      assert.equal(await page.evaluate(async () => {
        try { await fetch("https://example.invalid/csp-probe"); return false; } catch { return true; }
      }), true, "The page policy blocks network access");
      await page.evaluate(() => {
        const tracked = window as typeof window & { comparisonWorkers?: number }; tracked.comparisonWorkers = 0;
        window.Worker = new Proxy(window.Worker, { construct(target, argumentsList) {
          tracked.comparisonWorkers!++; return Reflect.construct(target, argumentsList);
        } });
      });
      if (width === 390) await page.screenshot({ path: join(evidence, "mobile-initial.png"), fullPage: true });
      assert.equal(await page.evaluate(() => ["leftFile", "rightFile"].every(id => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        return input?.type === "file" && Array.from(input.labels ?? []).some(label => Boolean(label.textContent?.trim()));
      })), true, "Both native file inputs have accessible labels");
      assert.equal(await page.locator("#comparisonStatus").getAttribute("role"), "status");
      assert.equal(await page.locator("#resultFrame").getAttribute("sandbox"), "");
      const select = async (left: Upload, right: Upload): Promise<void> => {
        await page.locator("#leftFile").setInputFiles(left); await page.locator("#rightFile").setInputFiles(right);
      };
      const compare = async (): Promise<void> => { await page.locator("#compareFiles").click(); await page.locator("#resultArea").waitFor({ state: "visible" }); };
      const download = async (id: string, filename: string): Promise<Buffer> => {
        const pending = page.waitForEvent("download"); await page.locator(id).click();
        const path = join(evidence, width + "-" + filename), result = await pending;
        try { await result.saveAs(path); } catch { throw new Error(filename + " download failed: " + await result.failure()); }
        return readFile(path);
      };
      const cleared = async (): Promise<void> => {
        await page.locator("#resultArea").waitFor({ state: "hidden" });
        for (const id of ["#downloadComparisonJson", "#downloadComparisonHtml"]) assert.equal(await page.locator(id).getAttribute("href"), null, "Stale download URLs are removed");
      };
      const reject = async (right: Upload, pattern: RegExp): Promise<void> => {
        await select(leftPath, right); await page.locator("#compareFiles").click();
        await page.waitForFunction(() => {
          const button = document.getElementById("compareFiles") as HTMLButtonElement;
          const cancel = document.getElementById("cancelCompare") as HTMLButtonElement;
          const status = document.getElementById("comparisonStatus")?.textContent ?? "";
          return !button.disabled && cancel.hidden && Boolean(status) && !/ready|choose|reading|verifying/i.test(status);
        });
        assert.match(await page.locator("#comparisonStatus").textContent() ?? "", pattern); await cleared();
      };
      await select(leftPath, rightPath); await compare();
      await page.frameLocator("#resultFrame").locator("table").waitFor({ state: "visible" });
      if (width === 390) {
        await page.locator("#resultFrame").scrollIntoViewIfNeeded();
        await page.frameLocator("#resultFrame").locator("body").waitFor({ state: "visible" });
        await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        await page.screenshot({ path: join(evidence, "mobile-result-viewport.png"), fullPage: false });
        await page.screenshot({ path: join(evidence, "mobile-success.png"), fullPage: true });
      }
      const saved = parse(await download("#downloadComparisonJson", "comparison.json")) as AnalysisComparison;
      assert.deepEqual(saved, expected, "Browser and Node compare the same verified evidence and original bytes");
      assert.match((await download("#downloadComparisonHtml", "comparison.html")).toString("utf8"), /Compare declared block evidence/);
      await page.locator("#rightFile").setInputFiles(upload("raw-block.json", { blockhash: "raw", transactions: [] })); await cleared();
      const corrupt = parse(rightBytes) as { summary: { transactionCount: number } }; corrupt.summary.transactionCount++;
      await reject(upload("corrupt.json", corrupt), /right/i);
      await reject(upload("raw-block.json", { blockhash: "raw", transactions: [] }), /right/i);
      const workersBeforeSizeCheck = await page.evaluate(() => (window as typeof window & { comparisonWorkers: number }).comparisonWorkers);
      await reject({ name: "too-large.json", mimeType: "application/json", buffer: Buffer.alloc(16 * 1024 * 1024 + 1) }, /16 MiB/);
      assert.equal(await page.evaluate(() => (window as typeof window & { comparisonWorkers: number }).comparisonWorkers), workersBeforeSizeCheck, "Oversize input is denied before creating a worker");
      await reject(upload("too-many-transactions.json", { transactions: Array.from({ length: 5001 }, () => ({})) }), /5,000 transactions/);
      const normalized = (index: number, addresses: string[]) => ({ index, status: "unknown", computeUnitsConsumed: null,
        accounts: addresses.map((pubkey, account) => ({ pubkey, writable: account === 0 })), readSet: addresses.slice(1), writeSet: addresses.slice(0, 1) });
      // These inputs meet normalized transaction shape, but omit graph evidence. Reject before reconstructing it.
      await reject(upload("shared-writers.json", { transactions: Array.from({ length: 1100 }, (_, index) => normalized(index, ["SharedWriter"])), conflictEdges: [] }), /500,000 potential shared-account causes/);
      await reject(upload("verification-work.json", { transactions: Array.from({ length: 2000 }, (_, index) => normalized(index, Array.from({ length: 11 }, (_, account) => "Distinct-" + index + "-" + account))), conflictEdges: [] }), /20,000,000 account lookups/);
      await reject({ name: "malformed.json", mimeType: "application/json", buffer: Buffer.from('{"privateLabel":"secret",}') }, /right/i);
      assert.doesNotMatch(await page.locator("#comparisonStatus").textContent() ?? "", /privateLabel|secret/);
      const one = (compute: number | null) => analyzeBlock({ blockhash: "one", previousBlockhash: "parent", parentSlot: 0, transactions: [{ transaction: { signatures: ["one"], message: { accountKeys: [{ pubkey: "payer", signer: true, writable: true }], instructions: [] } }, meta: compute === null ? null : { err: null, fee: 0, computeUnitsConsumed: compute } }] }, 1, "fixture");
      await select(upload("zero.json", one(0)), upload("missing.json", one(null))); await compare();
      const partial = parse(await download("#downloadComparisonJson", "missing-compute.json")) as AnalysisComparison;
      assert.equal(partial.metrics.find(metric => metric.key === "compute")!.delta, null);
      assert.match(await page.frameLocator("#resultFrame").locator("body").textContent() ?? "", /Unavailable/);
      const hostile = one(0); hostile.provenance.cluster = '<img src="https://example.invalid/a" onerror="alert(1)">';
      hostile.context.blockhash = "</script><script>alert(1)</script>";
      await select(upload('<img src=x onerror=alert(1)>.json', hostile), upload("clean.json", one(1))); await compare();
      assert.equal(await page.frameLocator("#resultFrame").locator("img,script").count(), 0, "Uploaded labels cannot create active markup");
      assert.ok((await page.frameLocator("#resultFrame").locator("body").textContent() ?? "").includes(hostile.provenance.cluster));
      const escapedHtml = (await download("#downloadComparisonHtml", "escaped.html")).toString("utf8");
      assert.ok(escapedHtml.includes("&lt;img")); assert.ok(!escapedHtml.includes('<img src="https://example.invalid'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Page fits the viewport");
      await select(leftPath, rightPath);
      await page.evaluate(() => {
        (document.getElementById("compareFiles") as HTMLButtonElement).click();
        const right = document.getElementById("rightFile") as HTMLInputElement;
        right.value = ""; right.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await cleared(); await page.waitForTimeout(300); await cleared();
      assert.match(await page.locator("#comparisonStatus").textContent() ?? "", /choose/i);
      await select(leftPath, rightPath);
      await page.evaluate(() => {
        (document.getElementById("compareFiles") as HTMLButtonElement).click();
        const cancel = document.getElementById("cancelCompare") as HTMLButtonElement;
        if (cancel.hidden || cancel.disabled) throw new Error("Cancel must be available as soon as comparison starts");
        cancel.click();
      });
      await cleared(); await page.waitForTimeout(300); await cleared();
      assert.match(await page.locator("#comparisonStatus").textContent() ?? "", /cancel/i);
      assert.deepEqual(network, [], "Comparison makes no external requests"); assert.deepEqual(errors, [], "No browser script errors");
      checks.push(width + "px: labelled inputs, BOM/hash parity, JSON/HTML downloads, invalid evidence, file/transaction/conflict/work limits, unavailable CU, escaped labels, stale-result clearing, selection/read race, cancellation, viewport, offline");
      await page.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(await readFile(leftPath), leftBytes); assert.deepEqual(await readFile(rightPath), rightBytes);
  await writeFile(join(evidence, "checks.json"), JSON.stringify(checks, null, 2) + "\n");
  console.log(checks.join("\n") + "\nEvidence: " + resolve(evidence));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
