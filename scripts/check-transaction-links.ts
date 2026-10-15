import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeBlock } from "../src/analyze.js";
import { writeReports } from "../src/report.js";
import type { RpcBlock } from "../src/types.js";

// Narrow adapter for the pinned development browser driver.
interface Locator {
  press(key: string): Promise<void>; fill(value: string): Promise<void>;
  selectOption(value: string): Promise<string[]>;
  count(): Promise<number>; textContent(): Promise<string | null>;
  getAttribute(name: string): Promise<string | null>; inputValue(): Promise<string>;
  first(): Locator;
}
interface Page {
  locator(selector: string): Locator;
  goto(url: string): Promise<unknown>; close(): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  waitForFunction(fn: () => boolean): Promise<unknown>;
  on(event: "pageerror", listener: (error: Error) => void): void;
  route(pattern: RegExp, listener: (route: { abort(): Promise<void> }) => Promise<void>): Promise<void>;
  screenshot(options: { path: string; fullPage: boolean }): Promise<Buffer>;
}
interface Browser {
  newPage(options: { viewport: { width: number; height: number } }): Promise<Page>;
  close(): Promise<void>;
}
interface Runtime { chromium: { launch(options: { headless: boolean; executablePath?: string }): Promise<Browser> } }

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error("Usage: tsx scripts/check-transaction-links.ts. Optional environment: MICROSCOPE_PLAYWRIGHT_PATH and MICROSCOPE_CHROME_PATH.");
  const require = createRequire(import.meta.url);
  let runtime: Runtime;
  try { runtime = require(process.env.MICROSCOPE_PLAYWRIGHT_PATH || "playwright-core") as Runtime; }
  catch { throw new Error("Set MICROSCOPE_PLAYWRIGHT_PATH to a separately installed Playwright package; set MICROSCOPE_CHROME_PATH to use an existing Chrome binary."); }
  await mkdir("output", { recursive: true });
  const output = await mkdtemp(resolve("output/transaction-links-browser-"));
  const block: RpcBlock = {
    blockhash: "transaction-link-check", previousBlockhash: "previous", parentSlot: 0,
    transactions: Array.from({ length: 112 }, (_, index) => ({
      transaction: { signatures: ["synthetic-signature-" + index], message: {
        accountKeys: [{ pubkey: index === 0 || index === 11 ? "SharedPayer" : "Payer-" + index, writable: true, signer: true }], instructions: [],
      } },
      meta: index % 3 === 2 ? null : { err: index % 3 === 1 ? "AccountNotFound" : null, fee: 0, computeUnitsConsumed: index },
    })),
  };
  block.transactions[0]!.transaction.message.accountKeys.push(...Array.from({ length: 111 }, (_, index) => ({ pubkey: "ExclusiveRead-" + index, writable: false, signer: false })));
  const analysis = analyzeBlock(block, 1, "fixture", { dataKind: "synthetic" });
  const original = JSON.stringify(analysis);
  await writeReports(analysis, output);
  assert.equal(JSON.stringify(analysis), original, "Report generation preserves the analysis");
  assert.equal(await readFile(join(output, "analysis.json"), "utf8"), JSON.stringify(analysis, null, 2) + "\n");
  await writeReports(analyzeBlock({ ...block, transactions: [] }, 2, "fixture", { dataKind: "synthetic" }), join(output, "empty"));
  const url = pathToFileURL(join(output, "report.html")).href;
  const browser = await runtime.chromium.launch({ headless: true, ...(process.env.MICROSCOPE_CHROME_PATH ? { executablePath: process.env.MICROSCOPE_CHROME_PATH } : {}) });
  const checks: string[] = [];
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors: string[] = [], requests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, async route => { requests.push("Unexpected HTTP request"); await route.abort(); });
      await page.goto(url + "#tx=11");
      assert.equal(await page.locator("#transactionInspection h3").textContent(), "Transaction #11");
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Transaction #11");
      assert.equal(await page.locator(".transaction-permalink").textContent(), "Link to transaction #11");
      assert.equal(await page.locator(".transaction-permalink").getAttribute("href"), "#tx=11");
      assert.equal(await page.locator("#transactionQuery").inputValue(), "");
      assert.equal(await page.locator("#transactionOutcome").inputValue(), "any");
      assert.equal(await page.locator("#transactionLinkStatus").getAttribute("role"), "status");
      assert.match(await page.locator("#transactionLinkStatus").textContent() ?? "", /Transaction #11 selected/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: join(output, width + "-transaction-link.png"), fullPage: true });

      await page.evaluate(() => { location.hash = "#tx=0"; });
      await page.waitForFunction(() => document.querySelector("#transactionInspection h3")?.textContent === "Transaction #0");
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Transaction #0");
      await page.locator(".transaction-permalink").press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), "SUMMARY", "Inspector keeps native keyboard navigation");

      // Existing section links must keep their native URL, focus, and heading.
      for (const id of ["transactionExplorerTitle", "notableFindingsTitle", "findingGraphTitle", "blockTimelineTitle"]) {
        await page.locator('.report-nav a[href="#' + id + '"]').press("Enter");
        assert.equal(await page.evaluate(() => location.hash), "#" + id);
        assert.equal(await page.evaluate(() => document.activeElement?.id), id);
      }

      await page.locator("#transactionQuery").fill("#11");
      await page.locator("#transactionOutcome").selectOption("unknown");
      assert.equal(await page.evaluate(() => location.hash), "#blockTimelineTitle", "Clearing selection preserves section anchors");
      const historyBefore = await page.evaluate(() => history.length);
      await page.locator(".transaction-match").press("Enter");
      assert.equal(await page.evaluate(() => history.length), historyBefore, "Ordinary selection replaces the URL without adding Back entries");
      assert.equal(await page.evaluate(() => location.hash), "#tx=11");
      await page.locator(".transaction-permalink").press("Enter");
      assert.equal(await page.locator("#transactionInspection h3").textContent(), "Transaction #11");
      await page.evaluate(() => { location.hash = "#tx=0"; });
      await page.waitForFunction(() => document.querySelector("#transactionInspection h3")?.textContent === "Transaction #0");
      assert.equal(await page.locator("#transactionQuery").inputValue(), "#11", "Incoming links preserve existing search filters");
      assert.equal(await page.locator("#transactionOutcome").inputValue(), "unknown");
      assert.equal(await page.locator(".transaction-match").count(), 1);
      await page.locator('#declaredAccounts summary').press("Enter");
      await page.locator('#declaredAccounts nav button:last-child').press("Enter");
      assert.match(await page.locator("#declaredAccounts .explorer-page-position").textContent() ?? "", /Showing 51–100 of 112 declared accounts/);
      const historyBeforeClear = await page.evaluate(() => history.length);
      await page.locator(".transaction-account").first().press("Enter");
      assert.equal(await page.evaluate(() => location.hash), "", "Account selection clears the old transaction fragment");
      assert.equal(await page.evaluate(() => history.length), historyBeforeClear, "Clearing selection adds no Back entry");
      assert.equal(await page.locator("#transactionInspection h3").count(), 0);
      for (const control of ["filter", "search", "wave"]) {
        await page.evaluate(() => { location.hash = "#tx=11"; });
        await page.waitForFunction(() => document.querySelector("#transactionInspection h3")?.textContent === "Transaction #11");
        if (control === "filter") await page.locator("#transactionOutcome").selectOption("success");
        else if (control === "search") await page.locator("#transactionQuery").fill("synthetic-signature-");
        else await page.locator("#timeline .wavebar").first().press("Enter");
        assert.equal(await page.evaluate(() => location.hash), "", control + " clears the old transaction fragment");
        assert.equal(await page.locator("#transactionInspection h3").count(), 0, control + " clears the selected inspector");
        assert.match(await page.locator("#transactionLinkStatus").textContent() ?? "", /Select a transaction to get its link/);
      }
      await page.goto(url);
      assert.equal(await page.locator("#transactionInspection h3").count(), 0, "Reopening a cleared URL does not restore a stale transaction");

      await page.evaluate(() => { location.hash = "#tx=999"; });
      await page.waitForFunction(() => document.getElementById("transactionLinkStatus")?.textContent === "Transaction #999 is not present in this block.");
      assert.equal(await page.locator("#transactionInspection h3").count(), 0, "A missing hash target clears stale selection");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "transactionLinkStatus");
      await page.evaluate(() => { location.hash = "#tx=-1"; });
      await page.waitForFunction(() => document.getElementById("transactionLinkStatus")?.textContent?.startsWith("Invalid transaction link.") === true);
      assert.equal(await page.locator("#transactionInspection h3").count(), 0);

      for (const hash of ["#tx", "#tx=", "#tx=-1", "#tx=1.5", "#tx=1e1", "#tx=+1", "#tx=01", "#tx=0xB", "#tx=11&extra=1", "#tx=%31%31", "#tx=9007199254740992", "#tx=<img src=x onerror=alert(1)>", "#tx=%"]) {
        await page.goto(url + hash);
        assert.match(await page.locator("#transactionLinkStatus").textContent() ?? "", /^Invalid transaction link\./, hash);
        assert.equal(await page.locator("#transactionInspection h3").count(), 0, hash);
        assert.equal(await page.locator("#transactionLinkStatus img, #transactionInspection img").count(), 0, "Hashes are never inserted as HTML");
      }
      await page.goto(url + "#tx=9007199254740991");
      assert.equal(await page.locator("#transactionLinkStatus").textContent(), "Transaction #9007199254740991 is not present in this block.");
      await page.goto(pathToFileURL(join(output, "empty/report.html")).href + "#tx=0");
      assert.equal(await page.locator("#transactionLinkStatus").textContent(), "Transaction #0 is not present in this block.");
      await page.goto(url);
      assert.equal(await page.locator("#transactionInspection h3").count(), 0);
      assert.match(await page.locator("#transactionLinkStatus").textContent() ?? "", /Select a transaction to get its link/);
      // Native links still navigate when history replacement is prohibited.
      await page.evaluate(() => { history.replaceState = () => { throw new DOMException("Blocked by embedding policy", "SecurityError"); }; });
      await page.locator("#transactionQuery").fill("#11");
      await page.locator(".transaction-match").press("Enter");
      assert.equal(await page.evaluate(() => location.hash), "");
      await page.locator(".transaction-permalink").press("Enter");
      await page.waitForFunction(() => location.hash === "#tx=11");
      assert.equal(await page.locator("#transactionInspection h3").textContent(), "Transaction #11");
      await page.goto(url);
      // Search and paging still work after the new initialization path.
      await page.locator("#transactionOutcome").selectOption("success");
      assert.equal(await page.locator(".transaction-match").count(), 38);
      await page.locator("#transactionOutcome").selectOption("any");
      await page.locator("#transactionQuery").fill("synthetic-signature-");
      assert.equal(await page.locator(".transaction-match").count(), 50);
      await page.locator("#transactionMatches nav button:last-child").press("Enter");
      assert.match(await page.locator(".transaction-match").first().textContent() ?? "", /^#50 /);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "matches page position");
      assert.deepEqual(errors, []); assert.deepEqual(requests, []);
      checks.push(width + "px: initial/hashchange transaction links, zero/missing/malformed/unsafe indexes, native link and section keyboard navigation, history replacement and stale-fragment clearing, search/filter/account paging, no network/errors");
      await page.close();
    }
  } finally { await browser.close(); }
  await writeFile(join(output, "checks.json"), JSON.stringify({ passed: true, checks }, null, 2) + "\n");
  console.log(JSON.stringify({ output, passed: true, checks }, null, 2));
}

await main();
