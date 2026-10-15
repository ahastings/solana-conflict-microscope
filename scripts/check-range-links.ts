import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { acquireRange } from "../src/range-input.js";
import { analyzeRange } from "../src/range-analyze.js";
import { rangeHtmlReport, rangeOverviewCsv } from "../src/range-report.js";

// Narrow adapter for the pinned development browser driver.
interface Locator {
  click(): Promise<void>; press(key: string): Promise<void>; count(): Promise<number>;
  textContent(): Promise<string | null>; getAttribute(name: string): Promise<string | null>;
  first(): Locator;
}
interface Page {
  locator(selector: string): Locator; goto(url: string): Promise<unknown>; reload(): Promise<unknown>; close(): Promise<void>;
  waitForFunction(fn: () => boolean): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  on(event: "pageerror", handler: (error: Error) => void): void;
  route(pattern: RegExp, handler: (route: { abort(): Promise<void> }) => Promise<void>): Promise<void>;
}
interface Browser { newPage(options: { viewport: { width: number; height: number } }): Promise<Page>; close(): Promise<void> }
interface Runtime { chromium: { launch(options: { headless: boolean; executablePath?: string }): Promise<Browser> } }

async function changeHash(page: Page, fragment: string): Promise<void> {
  await page.evaluate(async (hash) => {
    if (location.hash === hash) return;
    await new Promise<void>((resolve) => {
      addEventListener("hashchange", () => resolve(), { once: true });
      location.hash = hash;
    });
  }, fragment);
}

async function main(): Promise<void> {
  const require = createRequire(import.meta.url);
  const runtime = require(process.env.MICROSCOPE_PLAYWRIGHT_PATH || "playwright-core") as Runtime;
  const analysis = analyzeRange(await acquireRange({ startSlot: 488638500, endSlot: 488638508,
    cacheDir: resolve("fixtures/loader-range"), rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false }));
  const exactAnalysis = JSON.stringify(analysis), exactCsv = rangeOverviewCsv(analysis);
  const sequence = analysis.crossBlockSequences[0]!;
  assert.ok(sequence.chunks.length > 100, "Fixture must exercise chunk pagination");
  await mkdir("output", { recursive: true });
  const output = await mkdtemp(resolve("output/range-links-"));
  const report = join(output, "range-report.html"), stateReport = join(output, "range-states.html");
  await writeFile(report, rangeHtmlReport(analysis));
  assert.equal(JSON.stringify(analysis), exactAnalysis, "HTML must leave analysis evidence unchanged");
  assert.equal(rangeOverviewCsv(analysis), exactCsv, "HTML must leave CSV values unchanged");
  const states = structuredClone(analysis);
  states.crossBlockSequences = [];
  states.slots[0]!.status = "missing"; states.slots[0]!.analysis = null;
  states.slots[1]!.status = "unavailable"; states.slots[1]!.analysis = null;
  await writeFile(stateReport, rangeHtmlReport(states));
  const browser = await runtime.chromium.launch({ headless: true,
    ...(process.env.MICROSCOPE_CHROME_PATH ? { executablePath: process.env.MICROSCOPE_CHROME_PATH } : {}) });
  const results: Array<{ width: number; passed: boolean }> = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors: string[] = [], network: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, route => { network.push("external request"); return route.abort(); });
      const slot = analysis.slots.at(-1)!.slot, base = pathToFileURL(report).href;
      await page.goto(base + "#slot=" + slot);
      const slotTitle = "Slot " + slot + " full-block wave evidence";
      assert.equal(await page.locator("#slotWaveTitle").textContent(), slotTitle);
      assert.equal(await page.evaluate(() => document.activeElement?.id), "slotWaveTitle");
      assert.equal(await page.locator("#rangeSlotLink").getAttribute("href"), "#slot=" + slot);
      await page.reload();
      assert.equal(await page.locator("#slotWaveTitle").textContent(), slotTitle);

      const chunkIndex = 101, chunk = sequence.chunks[chunkIndex]!;
      await page.goto(base + "#chunk=0:" + chunkIndex);
      const expectedTitle = "Slot " + chunk.slot + ", transaction #" + chunk.transactionIndex;
      assert.equal(await page.locator("#rangeChunkEvidence h3").textContent(), expectedTitle);
      assert.equal(await page.locator("#rangeChunkLink").getAttribute("href"), "#chunk=0:101");
      assert.match((await page.locator("#rangeChunkPage").textContent())!, /^Showing 101–148 of 148 chunks$/);
      const evidence = JSON.parse((await page.locator("#rangeChunkEvidence pre").textContent())!) as { offset: number; instructionIndex: number };
      assert.equal(evidence.offset, chunk.offset); assert.equal(evidence.instructionIndex, chunk.instructionIndex);
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), "H3");
      await page.reload();
      assert.equal(await page.locator("#rangeChunkEvidence h3").textContent(), expectedTitle);
      await changeHash(page, "#chunk=0:0");
      assert.equal(await page.locator("#rangeChunkLink").getAttribute("href"), "#chunk=0:0");
      assert.equal(await page.locator(".range-chunk").count(), 50);
      await page.locator("#rangeSlotLink").press("Enter");
      await page.waitForFunction(() => document.getElementById("rangeChunkInspector")!.hidden);
      assert.equal(await page.locator("#rangeChunkInspector").getAttribute("hidden"), "");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "slotWaveTitle");

      const historyLength = await page.evaluate(() => history.length);
      await page.locator(".slot").first().click();
      assert.equal(await page.evaluate(() => location.hash), "#slot=" + analysis.slots[0]!.slot);
      assert.equal(await page.evaluate(() => history.length), historyLength);
      await page.locator(".inspect-range-chunks").first().click();
      await page.locator(".range-chunk").first().click();
      assert.equal(await page.evaluate(() => location.hash), "#chunk=0:0");
      assert.equal(await page.evaluate(() => history.length), historyLength);

      const selected = await page.locator("#technical").textContent();
      for (const invalid of ["#slot=0", "#slot=-1", "#slot=1.5", "#slot=9007199254740992", "#slot=%3Cimg%20src=x%3E", "#slot=488638500&chunk=0:0", "#chunk=99:0", "#chunk=0:9999", "#chunk=0:-1", "#chunk=0:1.5", "#chunk=9007199254740992:0", "#chunk=0:", "#slot", "#chunk="]) {
        await changeHash(page, invalid);
        assert.equal(await page.locator("#rangeLinkStatus").getAttribute("hidden"), null, invalid);
        assert.equal(await page.locator("#technical").textContent(), selected, invalid);
        assert.equal(await page.evaluate(() => document.activeElement?.id), "rangeLinkStatus", invalid);
      }
      for (const id of ["coverageTitle", "blockOverviewTitle", "uploadTimelineTitle", "recurringTitle"]) {
        await page.locator('.range-nav a[href="#' + id + '"]').press("Enter");
        await page.waitForFunction(() => document.getElementById("rangeLinkStatus")!.hidden);
        assert.equal(await page.evaluate(() => location.hash), "#" + id);
        assert.equal(await page.evaluate(() => document.activeElement?.id), id);
        assert.equal(await page.locator("#rangeLinkStatus").getAttribute("hidden"), "");
      }
      await page.goto(base + "#coverageTitle");
      await page.reload();
      assert.equal(await page.evaluate(() => location.hash), "#coverageTitle");
      assert.equal(await page.locator("#rangeChunkInspector").getAttribute("hidden"), "");
      for (const [index, state] of [[0, "missing"], [1, "unavailable"]] as const) {
        await page.goto(pathToFileURL(stateReport).href + "#slot=" + states.slots[index]!.slot);
        assert.match((await page.locator("#slotWaveBounds").textContent())!, new RegExp("Observation status: " + state));
        assert.equal(await page.locator("#slotCliqueDetails").getAttribute("hidden"), "");
        assert.equal(await page.locator("#rangeLinkStatus").getAttribute("hidden"), "");
      }
      await changeHash(page, "#chunk=0:0");
      assert.match((await page.locator("#rangeLinkStatus").textContent())!, /outside the saved report/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []); assert.deepEqual(network, []);
      results.push({ width, passed: true }); await page.close();
    }
  } finally { await browser.close(); }
  await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
  assert.equal(await readFile(report, "utf8"), rangeHtmlReport(analysis));
  console.log(`Passed range evidence links at desktop and mobile widths. Evidence: ${output}`);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
