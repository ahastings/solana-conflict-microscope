import { rangeOverviewCsv, rangeHtmlReport } from "../src/range-report.js";
import type { RangeAnalysis } from "../src/range-types.js";
import { runReviewer } from "../src/reviewer.js";
import type { Analysis, RpcBlock } from "../src/types.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { runDemo } from "../src/demo.js";
import { analyzeBlock } from "../src/analyze.js";
import { writeReports } from "../src/report.js";

// Narrow adapter for an optional, separately installed Playwright runtime.
interface Locator {
  selectOption(value: string): Promise<string[]>;
  fill(value: string): Promise<void>; press(key: string): Promise<void>; click(): Promise<void>; count(): Promise<number>;
  textContent(): Promise<string | null>; inputValue(): Promise<string>; getAttribute(name: string): Promise<string | null>; isDisabled(): Promise<boolean>;
  first(): Locator; last(): Locator; locator(selector: string): Locator;
}
interface Download { suggestedFilename(): string; path(): Promise<string | null>; }
interface Page {
  waitForEvent(event: "download"): Promise<Download>;
  locator(selector: string): Locator;
  getByRole(role: string, options: { name: string; exact: boolean }): Locator;
  goto(url: string): Promise<unknown>; close(): Promise<void>;
  on(event: "pageerror", handler: (error: Error) => void): void;
  route(pattern: RegExp, handler: (route: { abort(): Promise<void> }) => Promise<void>): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
}
interface Browser {
  newPage(options: { viewport: { width: number; height: number } }): Promise<Page>;
  close(): Promise<void>;
}
interface BrowserRuntime { chromium: { launch(options: { headless: boolean; executablePath?: string }): Promise<Browser> } }

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error("Usage: npm run check:browser (no arguments). Optional environment: MICROSCOPE_PLAYWRIGHT_PATH and MICROSCOPE_CHROME_PATH.");
  const require = createRequire(import.meta.url);
  let runtime: BrowserRuntime;
  try { runtime = require(process.env.MICROSCOPE_PLAYWRIGHT_PATH || "playwright") as BrowserRuntime; }
  catch { throw new Error("Optional browser checks require Playwright. Set MICROSCOPE_PLAYWRIGHT_PATH to a separately installed playwright package directory; set MICROSCOPE_CHROME_PATH if using an existing Chrome binary."); }
  await mkdir("output", { recursive: true });
  const output = await mkdtemp(resolve("output/report-browser-"));
  const demo = await runDemo({ outputDir: join(output, "demo") });
  const transactions = Array.from({ length: 112 }, (_, index) => ({
    transaction: { signatures: ["synthetic-signature-" + index], message: {
      accountKeys: [{ pubkey: "SharedPayer", signer: true, writable: true }], instructions: [],
    } }, meta: { err: null, fee: 0, computeUnitsConsumed: index },
  }));
  transactions[0]!.transaction.message.accountKeys.push(...Array.from({ length: 111 }, (_, index) => ({ pubkey: 'ExclusiveRead-' + index, signer: false, writable: false })));
  await writeReports(analyzeBlock({ blockhash: "synthetic", previousBlockhash: "synthetic-previous", parentSlot: 0, transactions }, 1, "fixture", { dataKind: "synthetic" }), join(output, "large"));
  const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
  const mixed: RpcBlock = { blockhash: "mixed", previousBlockhash: "previous", parentSlot: 0, transactions: [0, 1, 2, 3].map(index => ({
    transaction: { signatures: ["upload-" + index], message: {
      accountKeys: [{ pubkey: "UploadPayer", signer: true, writable: true }, { pubkey: "Buffer", signer: false, writable: true }, { pubkey: loader, signer: false, writable: false }],
      instructions: [{ programId: loader, accounts: ["Buffer", "UploadPayer"], parsed: { type: "write", info: { account: "Buffer", authority: "UploadPayer", offset: index * 4, bytes: index === 3 ? "bad!" : "AAAAAA==" } } }],
    } }, meta: index === 2 ? null : { err: index === 1 ? { InstructionError: [0, "InvalidArgument"] } : null, fee: 0 },
  })) };
  const system = "11111111111111111111111111111111";
  mixed.transactions[0]!.transaction.message.accountKeys.push({ pubkey: system, signer: false, writable: false });
  mixed.transactions[0]!.meta!.logMessages = ["Airdrop"];
  for (let count = 0; count < 2; count++) mixed.transactions[0]!.transaction.message.instructions!.push({ programId: system, accounts: ["Buffer", "UploadPayer"], parsed: { type: "transfer", info: { source: "Buffer", destination: "UploadPayer", lamports: 1 } } });
  await writeReports(analyzeBlock(mixed, 1, "fixture", { dataKind: "synthetic" }), join(output, "mixed-upload"));
  const longUpload = structuredClone(mixed);
  for (let index = 0; index < 3; index++) {
    longUpload.transactions[index]!.transaction.message.instructions = Array.from({ length: 112 }, (_, chunk) => chunk).filter(chunk => chunk % 3 === index).map(chunk => ({
      programId: loader, accounts: ["Buffer", "UploadPayer"], parsed: { type: "write", info: { account: "Buffer", authority: "UploadPayer", offset: chunk * 4, bytes: "AAAAAA==" } },
    }));
  }
  const firstUpload = longUpload.transactions[0]!, firstWrite = firstUpload.transaction.message.instructions![0]!;
  firstUpload.transaction.message.instructions![0] = { programId: loader, accounts: [], data: "1" };
  firstUpload.meta!.innerInstructions = [{ index: 0, instructions: [firstWrite] }];
  await writeReports(analyzeBlock(longUpload, 1, "fixture", { dataKind: "synthetic" }), join(output, "long-upload"));
  for (const name of ["empty", "independent"]) {
    const block: RpcBlock = { blockhash: name, previousBlockhash: "previous", parentSlot: 0, transactions: name === "empty" ? [] : Array.from({ length: 112 }, (_, index) => index).map(index => ({
      transaction: { signatures: ["independent-" + index], message: { accountKeys: [{ pubkey: "Payer-" + index, writable: true, signer: true }], instructions: [] } },
      meta: index >= 2 ? null : { err: index === 1 ? "AccountNotFound" : null, fee: 0, computeUnitsConsumed: index === 0 ? 0 : 25 },
    })) };
    await writeReports(analyzeBlock(block, 1, "fixture", { dataKind: "synthetic" }), join(output, name));
  }
  const reviewDirectory = join(output, "reviewer");
  const review = await runReviewer({ outputDirectory: reviewDirectory });
  const rangePath = demo.rangeReport.reportPath;
  const rangeAnalysis = JSON.parse(await readFile(join(dirname(rangePath), "range-analysis.json"), "utf8")) as RangeAnalysis;
  const evidenceRange = structuredClone(rangeAnalysis);
  evidenceRange.crossBlockSequences = [];
  evidenceRange.slots = evidenceRange.slots.slice(0, 3);
  evidenceRange.slots[1]!.analysis = null;
  evidenceRange.slots[1]!.status = "missing";
  evidenceRange.slots[0]!.analysis = analyzeBlock(mixed, evidenceRange.slots[0]!.slot, "fixture");
  const partialCompute = structuredClone(mixed);
  partialCompute.transactions[0]!.meta!.computeUnitsConsumed = 0;
  partialCompute.transactions[1]!.meta!.computeUnitsConsumed = 25;
  evidenceRange.slots[2]!.analysis = analyzeBlock(partialCompute, evidenceRange.slots[2]!.slot, "fixture");
  delete evidenceRange.slots[2]!.analysis!.blockWaveBounds.cliqueWitness;
  evidenceRange.slots[2]!.analysis!.context.parentSlot=evidenceRange.slots[0]!.slot;
  evidenceRange.slots[2]!.analysis!.context.previousBlockhash="deliberate-mismatch";
  const evidenceRangePath = join(output, "range-evidence-states.html");
  await writeFile(evidenceRangePath, rangeHtmlReport(evidenceRange));
  const browser = await runtime.chromium.launch({ headless: true, ...(process.env.MICROSCOPE_CHROME_PATH ? { executablePath: process.env.MICROSCOPE_CHROME_PATH } : {}) });
  const results: Array<{ width: number; report: string; passed: boolean }> = [];
  try {
    for (const width of [1440, 390]) {
      const reviewPath = join(reviewDirectory, 'review.html');
      const reviewPage = await browser.newPage({ viewport: { width, height: 900 } });
      const reviewErrors: string[] = [], reviewNetwork: string[] = [];
      reviewPage.on('pageerror', error => reviewErrors.push(error.message));
      await reviewPage.route(/^https?:/, route => { reviewNetwork.push('unexpected external request'); return route.abort(); });
      await reviewPage.goto(pathToFileURL(reviewPath).href);
      assert.equal(await reviewPage.locator('.block-witness').count(), 6);
      for (const block of review.blocks) {
        const section = reviewPage.locator('#witness-' + block.slot);
        await section.locator('summary').press('Enter');
        assert.equal(await section.getAttribute('open'), '');
        assert.equal(await section.locator('tbody tr').count(), 4);
        assert.equal(await reviewPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const rows = await reviewPage.evaluate(() => Array.from(document.querySelectorAll('.block-witness[open] tbody tr'), row => row.textContent));
        assert.deepEqual(rows, block.conditional.models.map(model => model.id + model.solution.layers.map((nodes, index) => 'Layer ' + (index + 1) + ': ' + nodes.join(', ')).join('; ') + (model.dependencies.map(edge => edge.source + ' → ' + edge.target).join('; ') || 'none')));
        await section.locator('summary').press('Enter');
      }
      assert.equal(await reviewPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(reviewErrors, []); assert.deepEqual(reviewNetwork, []);
      results.push({ width, report: reviewPath, passed: true }); await reviewPage.close();
      const indexPage = await browser.newPage({ viewport: { width, height: 900 } });
      const indexErrors: string[] = [], indexNetwork: string[] = [];
      indexPage.on("pageerror", error => indexErrors.push(error.message));
      await indexPage.route(/^https?:/, route => { indexNetwork.push("unexpected external request"); return route.abort(); });
      await indexPage.goto(pathToFileURL(demo.indexPath).href);
      assert.equal(await indexPage.locator("main article").count(), 5);
      assert.equal(await indexPage.locator(".quick-links a").count(), 6);
      assert.match((await indexPage.locator("#multi-block-upload").textContent())!, /Decoded chunks148/);
      assert.equal(await indexPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await indexPage.getByRole("link", { name: "Open multi-block upload", exact: true }).press("Enter");
      assert.match((await indexPage.locator("#rangeCoverage").textContent())!, /Observed blocks: 9 of 9 requested slots/);
      assert.deepEqual(indexErrors, []); assert.deepEqual(indexNetwork, []);
      results.push({ width, report: demo.indexPath, passed: true }); await indexPage.close();

      for (const report of [...demo.reports.map(item => item.reportPath), join(output, "large/report.html"), join(output, "mixed-upload/report.html"), join(output, "long-upload/report.html"), join(output, "empty/report.html"), join(output, "independent/report.html")]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors: string[] = [], network: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route(/^https?:/, route => { network.push("unexpected external request"); return route.abort(); });
        await page.goto(pathToFileURL(report).href);
        const analysisText = await readFile(join(dirname(report), "analysis.json"), "utf8");
        const analysis = JSON.parse(analysisText) as Analysis;
        assert.equal(await page.locator("#waveMethod").textContent(), analysis.methodology.waveHeuristic);
        const cliqueText = (await page.locator("#blockBounds .clique-witness").first().textContent())!;
        for (const index of analysis.blockWaveBounds.cliqueWitness ?? []) assert.ok(cliqueText.includes("#" + index));
        if (!analysis.transactions.length) assert.match(cliqueText, /transaction set is empty/);
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "Download analysis JSON", exact: true }).press("Enter"),
        ]);
        assert.equal(download.suggestedFilename(), "slot-" + analysis.context.slot + "-analysis.json");
        const downloadPath = await download.path();
        assert.ok(downloadPath, "Local analysis download must be available");
        assert.equal(await readFile(downloadPath, "utf8"), analysisText, "Download must preserve the complete analysis byte for byte");
        const waveLabels = await page.evaluate(() => Array.from(document.querySelectorAll('#timeline .wavebar'), bar => bar.getAttribute('aria-label')));
        assert.deepEqual(waveLabels, analysis.waveContext.map(wave => {
          const label = wave.unknownComputeUnitCount === wave.transactionCount ? 'CU unknown'
            : wave.knownComputeUnitsTotal + ' known CU' + (wave.unknownComputeUnitCount ? ' + ' + wave.unknownComputeUnitCount + ' unknown' : '');
          return 'Estimated wave ' + (wave.wave + 1) + ', ' + wave.transactionCount + ' transactions, ' + label;
        }));
        if (report.includes('mixed-upload')) assert.ok(waveLabels.every(label => label?.endsWith('CU unknown')));
        if (report.includes('independent')) assert.deepEqual(waveLabels, ['Estimated wave 1, 112 transactions, 25 known CU + 110 unknown']);
        if (report.includes('large')) assert.equal(waveLabels[0], 'Estimated wave 1, 1 transactions, 0 known CU');
        if (analysis.waveContext.length) {
          await page.locator('#timeline .wavebar').first().press('Enter');
          assert.equal(await page.locator('#waveInspection h3').textContent(), 'Full block wave 1');
          assert.equal(await page.locator('.wave-transaction').count(), Math.min(50, analysis.waveContext[0]!.transactionCount));
          assert.equal(await page.evaluate(() => document.activeElement?.parentElement?.id), 'waveInspection');
          if (report.includes('independent')) {
            await page.getByRole('button', { name: 'Next wave transactions', exact: true }).press('Enter');
            assert.match((await page.locator('.wave-transaction').first().textContent())!, /#50 · unknown/);
            assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'wave transactions page position');
            await page.getByRole('button', { name: 'Next wave transactions', exact: true }).press('Enter');
            assert.equal(await page.locator('.wave-transaction').count(), 12);
            assert.equal(await page.getByRole('button', { name: 'Next wave transactions', exact: true }).isDisabled(), true);
            await page.locator('.wave-transaction').last().press('Enter');
            assert.equal(await page.locator('#transactionInspection h3').textContent(), 'Transaction #111');
            await page.getByRole('button', { name: 'Previous wave transactions', exact: true }).press('Enter');
            assert.equal(await page.locator('#transactionInspection h3').count(), 0);
          } else {
            await page.locator('.wave-transaction').first().press('Enter');
            assert.equal(await page.locator('#transactionInspection h3').textContent(), 'Transaction #' + analysis.waveContext[0]!.transactionIndexes[0]);
          }
        }
        if (!analysis.notableFindings.length) {
          assert.equal(await page.locator("#selectedTitle").textContent(), analysis.transactions.length ? "No declared contention" : "No transactions in this block");
          assert.equal(await page.evaluate(() => document.getElementById('findingGraph')!.hidden && document.getElementById('findingDetails')!.hidden), true);
          for (const status of ["success", "failed", "unknown"]) {
            await page.locator("#transactionOutcome").selectOption(status);
            const matches = analysis.transactions.filter(tx => tx.status === status);
            assert.equal(await page.locator(".transaction-match").count(), Math.min(50, matches.length));
            if (matches.length) {
              await page.locator(".transaction-match").first().press("Enter");
              assert.equal(await page.locator("#transactionInspection h3").textContent(), "Transaction #" + matches[0]!.index);
              assert.match((await page.locator("#transactionInspection").textContent())!, /No declared account conflicts/);
            }
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          assert.deepEqual(errors, []); assert.deepEqual(network, []);
          results.push({ width, report, passed: true }); await page.close(); continue;
        }
        await page.locator('#componentTimeline .wavebar').first().press('Space');
        assert.equal(await page.locator('#waveInspection h3').textContent(), 'Selected component wave 1');
        await page.locator('.finding').first().press('Enter');
        assert.equal(await page.locator('#waveInspection h3').count(), 0);
        const graphTxLabel = await page.locator('#hypergraph [data-kind="transaction"]').first().getAttribute("aria-label");
        assert.ok(graphTxLabel);
        await page.getByRole("button", { name: graphTxLabel, exact: true }).press("Enter");
        assert.equal(await page.locator("#transactionInspection h3").textContent(), graphTxLabel.replace("Inspect transaction", "Transaction"));
        const graphAccountLabel = await page.locator('#hypergraph [data-kind="account"]').first().getAttribute("aria-label");
        assert.ok(graphAccountLabel);
        await page.getByRole("button", { name: graphAccountLabel, exact: true }).press("Space");
        assert.equal(await page.locator("#transactionQuery").inputValue(), graphAccountLabel.replace("Inspect account ", ""));
        if (report === join(output, "mixed-upload/report.html")) {
          assert.equal(await page.locator(".sequence").count(), 1);
          assert.match((await page.locator("#findingCards").textContent())!, /1 Airdrop-log transaction/);
          assert.doesNotMatch((await page.locator("#findingCards").textContent())!, /2 Airdrop-log transactions/);
          assert.match((await page.locator("body").textContent())!, /transaction #3, outer instruction 0: excluded from upload byte-range evidence/);
          assert.match((await page.locator(".sequence").textContent())!, /1 successful, 1 failed, 1 unknown/);
        }
        const sequence = analysis.programBufferWriteGroups.flatMap(group => group.sequences)[0];
        if (sequence) {
          await page.locator(".inspect-upload").first().press("Enter");
          assert.equal(await page.locator("#uploadSequenceInspection h3").textContent(), "Upload chunks from byte " + sequence.firstOffset);
          assert.equal(await page.locator(".upload-transaction").count(), Math.min(50, sequence.chunkCount));
          assert.equal(await page.evaluate(() => document.activeElement?.parentElement?.id), "uploadSequenceInspection");
          if (sequence.chunkCount > 50) {
            await page.getByRole("button", { name: "Next upload chunks", exact: true }).press("Enter");
            assert.equal(await page.locator(".upload-transaction").first().textContent(), "Inspect transaction #" + sequence.chunks[50]!.transactionIndex);
            assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "upload chunks page position");
            if (sequence.chunkCount === 112) {
              await page.getByRole("button", { name: "Next upload chunks", exact: true }).press("Enter");
              assert.equal(await page.locator(".upload-transaction").count(), 12);
              assert.equal(await page.getByRole("button", { name: "Next upload chunks", exact: true }).isDisabled(), true);
              assert.match((await page.locator("#uploadSequenceInspection tbody tr").last().textContent())!, /4444474$/);
              await page.getByRole("button", { name: "Previous upload chunks", exact: true }).press("Enter");
            }
            await page.getByRole("button", { name: "Previous upload chunks", exact: true }).press("Enter");
          }
          await page.locator(".upload-transaction").first().press("Enter");
          assert.equal(await page.locator("#transactionInspection h3").textContent(), "Transaction #" + sequence.chunks[0]!.transactionIndex);
          const selected = sequence.chunks[0]!;
          assert.equal(await page.locator("#selectedUploadInstruction summary").textContent(), "Selected " + selected.location + " instruction " + selected.instructionIndex + (selected.parentInstructionIndex === null ? "" : " (parent " + selected.parentInstructionIndex + ")"));
          assert.equal(await page.locator("#selectedUploadInstruction").getAttribute("open"), "");
        }
        const hot = analysis.hotWritableAccounts[0]!;
        await page.locator("#hot button").first().press("Enter");
        assert.equal(await page.locator("#transactionQuery").inputValue(), hot.account);
        assert.equal(await page.locator(".transaction-match").count(), Math.min(50, hot.affectedTransactionCount));
        assert.match((await page.locator("#accountInspection").textContent())!, /declared account access/);
        assert.equal(await page.evaluate(() => document.activeElement?.id), "transactionQuery");
        await page.locator("#transactionQuery").fill("#0");
        assert.equal(await page.locator("#accountInspection").textContent(), "");
        assert.equal(await page.locator(".transaction-match").count(), 1);
        await page.locator(".transaction-match").click();
        assert.equal(await page.locator("#transactionInspection h3").textContent(), "Transaction #0");
        await page.locator("#transactionQuery").fill("");
        for (const status of ["success", "failed", "unknown"]) {
          await page.locator("#transactionOutcome").selectOption(status);
          const expected = analysis.transactions.filter(tx => tx.status === status);
          assert.equal(await page.locator(".transaction-match").count(), Math.min(50, expected.length));
          assert.match((await page.locator("#transactionSearchStatus").textContent())!, new RegExp(expected.length + " matching"));
          assert.equal(await page.locator("#transactionInspection").textContent(), "");
          if (expected.length) {
            await page.locator(".transaction-match").first().press("Enter");
            if (status === "failed") assert.deepEqual(JSON.parse((await page.locator("#recordedTransactionError pre").textContent())!), expected[0]!.executionError);
            else assert.equal(await page.locator("#recordedTransactionError").count(), 0);
          }
          await page.locator("#transactionQuery").fill(hot.account);
          assert.equal(await page.locator(".transaction-match").count(), Math.min(50, expected.filter(tx => tx.accounts.some(account => account.pubkey === hot.account)).length));
          const signature = analysis.transactions[0]!.signature;
          if (signature) {
            await page.locator("#transactionQuery").fill(signature);
            assert.equal(await page.locator(".transaction-match").count(), expected.filter(tx => tx.signature?.includes(signature)).length);
          }
          await page.locator("#transactionQuery").fill("#0");
          assert.equal(await page.locator(".transaction-match").count(), analysis.transactions[0]!.status === status ? 1 : 0);
          await page.locator("#transactionQuery").fill("");
        }
        await page.locator("#transactionOutcome").selectOption("any");
        assert.equal(await page.locator(".transaction-match").count(), 0);
        if (report === join(output, "large/report.html")) {
          await page.locator('#transactionQuery').fill('#0');
          await page.locator('.transaction-match').first().press('Enter');
          await page.locator('#declaredAccounts summary').press('Enter');
          assert.equal(await page.locator('.transaction-account').count(), 50);
          assert.equal(await page.locator('.declared-account-table tbody tr').first().textContent(), 'SharedPayerwriteyes');
          await page.getByRole('button', { name: 'Next declared accounts', exact: true }).press('Enter');
          assert.equal(await page.locator('.transaction-account').first().textContent(), 'ExclusiveRead-49');
          assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'declared accounts page position');
          await page.getByRole('button', { name: 'Next declared accounts', exact: true }).press('Enter');
          assert.equal(await page.locator('.transaction-account').count(), 12);
          assert.equal(await page.getByRole('button', { name: 'Next declared accounts', exact: true }).isDisabled(), true);
          assert.equal(await page.locator('.declared-account-table tbody tr').last().textContent(), 'ExclusiveRead-110read-onlyno');
          await page.locator('.transaction-account').last().press('Enter');
          assert.equal(await page.locator('#transactionQuery').inputValue(), 'ExclusiveRead-110');
          assert.match((await page.locator('#accountInspection').textContent())!, /1 readers · 0 writers · 1 transactions/);
          assert.equal(await page.locator('.transaction-match').count(), 1);
          assert.equal(await page.locator('#transactionInspection h3').count(), 0);
          for (const query of ["1", "11", "001", "#11"]) {
            await page.locator("#transactionQuery").fill(query);
            assert.equal(await page.locator(".transaction-match").count(), 1);
            assert.match((await page.locator(".transaction-match").textContent())!, new RegExp("^#" + Number(query.replace("#", "")) + " "));
          }
          await page.locator("#transactionQuery").fill("signature-1");
          assert.equal(await page.locator(".transaction-match").count(), analysis.transactions.filter(tx => tx.signature?.includes("signature-1")).length);

          await page.locator("#transactionQuery").fill("SharedPayer");
          assert.equal(await page.locator(".transaction-match").count(), 50);
          assert.equal(await page.getByRole("button", { name: "Previous matches", exact: true }).isDisabled(), true);
          await page.getByRole("button", { name: "Next matches", exact: true }).press("Enter");
          assert.match((await page.locator(".transaction-match").first().textContent())!, /^#50 /);
          assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "matches page position");
          await page.getByRole("button", { name: "Next matches", exact: true }).press("Enter");
          assert.equal(await page.locator(".transaction-match").count(), 12);
          assert.equal(await page.getByRole("button", { name: "Next matches", exact: true }).isDisabled(), true);
          await page.locator(".transaction-match").last().click();
          assert.equal(await page.locator("#transactionInspection h3").textContent(), "Transaction #111");
          assert.equal(await page.locator("#transactionInspection table:not(.declared-account-table)").count(), 100);
          await page.getByRole("button", { name: "Next conflict pairs", exact: true }).press("Enter");
          assert.equal(await page.locator("#transactionInspection table:not(.declared-account-table)").count(), 11);
          assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "conflict pairs page position");
          assert.equal(await page.getByRole("button", { name: "Next conflict pairs", exact: true }).isDisabled(), true);
          await page.getByRole("button", { name: "Previous conflict pairs", exact: true }).click();
          assert.equal(await page.locator("#transactionInspection table:not(.declared-account-table)").count(), 100);
          await page.locator("#transactionQuery").fill("synthetic-signature-111");
          assert.equal(await page.locator(".transaction-match").count(), 1);
          assert.equal(await page.getByRole("button", { name: "Next matches", exact: true }).count(), 0);
        }
        await page.locator("#transactionQuery").fill("no-match <script>");
        assert.equal(await page.locator(".transaction-match").count(), 0);
        assert.match((await page.locator("#transactionSearchStatus").textContent())!, /^0 matching/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []); assert.deepEqual(network, []);
        results.push({ width, report, passed: true }); await page.close();
      }
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors: string[] = [], network: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, route => { network.push("unexpected external request"); return route.abort(); });
      await page.goto(pathToFileURL(rangePath).href);
      assert.match((await page.locator("#rangeCoverage").textContent())!, /Observed blocks: 9 of 9 requested slots/);
      assert.equal(await page.locator(".slot").count(), 9);
      assert.match((await page.locator("#parentLinks").textContent())!, /8 matched; 0 hash mismatches; 1 parent unavailable; 0 nonpreceding/);
      assert.match((await page.locator("#parentLinks").textContent())!, /0 links bypass earlier observed slots/);
      await page.locator("#parentLinks summary").press("Enter");
      assert.equal(await page.locator("#parentLinks tbody tr").count(), 9);
      await page.locator("#downloadOverviewCsv").press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), "Block-by-block evidence");
      if (width === 390) {
        assert.equal(await page.evaluate(() => {const table=document.querySelector('#blockOverview table')!;return table.scrollWidth>table.clientWidth}),true);
        await page.locator("#blockOverview table").press("ArrowRight");
        const scrolled = await page.evaluate(async () => {
          const table=document.querySelector('#blockOverview table')!, deadline=performance.now()+1000;
          while (table.scrollLeft===0 && performance.now()<deadline) await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
          return table.scrollLeft>0;
        });
        assert.equal(scrolled,true,"Focused overview must scroll using the keyboard");
      }
      await page.locator("#blockOverview table").press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('overview-slot')),true);
      const [overviewDownload] = await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Download block overview CSV",exact:true}).press("Enter")]);
      assert.equal(overviewDownload.suggestedFilename(),"range-488638500-488638508-overview.csv");
      const overviewPath=await overviewDownload.path();assert.ok(overviewPath);
      assert.equal(await readFile(overviewPath,"utf8"),await readFile(join(dirname(rangePath),"range-overview.csv"),"utf8"));
      assert.equal(await readFile(overviewPath,"utf8"),rangeOverviewCsv(rangeAnalysis));
      for (const slot of rangeAnalysis.slots) {
        const row = page.locator('[data-overview-slot="' + slot.slot + '"]'), summary = slot.analysis!.summary;
        const format = (value: number): string => value.toLocaleString("en-US");
        assert.equal(await row.locator('[data-field="transactions"]').textContent(), format(summary.transactionCount));
        assert.equal(await row.locator('[data-field="outcomes"]').textContent(), format(summary.successCount) + ' success · ' + format(summary.failureCount) + ' failed · ' + format(summary.unknownStatusCount) + ' unknown');
        assert.equal(await row.locator('[data-field="compute"]').textContent(), format(summary.totalKnownComputeUnits) + ' known CU · ' + format(summary.unknownComputeUnitTransactionCount) + ' unknown');
        assert.equal(await row.locator('[data-field="conflicts"]').textContent(), format(summary.conflictEdgeCount));
        assert.equal(await row.locator('[data-field="width"]').textContent(), format(summary.maximumWaveWidth));
        const bounds = slot.analysis!.blockWaveBounds;
        assert.equal(await row.locator('[data-field="bounds"]').textContent(), bounds.cliqueLowerBound + '-' + bounds.generatedWaveUpperBound + (bounds.boundsMatch ? ' (proven ' + bounds.provenMinimumWaveCount + ')' : ' (estimated bounds)'));
        await row.locator('.overview-slot').press("Enter");
        assert.equal(await page.evaluate(() => document.activeElement?.id), "slotWaveTitle");
        await page.locator('.slot[data-slot="' + slot.slot + '"]').press("Enter");
        assert.equal(await page.locator("#slotWaveTitle").textContent(), "Slot " + slot.slot + " full-block wave evidence");
        const selectedFinding=rangeAnalysis.crossBlockSequences.find(sequence=>sequence.perBlock.some(block=>block.slot===slot.slot))?.perBlock.find(block=>block.slot===slot.slot);
        assert.deepEqual(JSON.parse((await page.locator("#technical").textContent())!).underlyingFinding,selectedFinding);
        assert.equal(await page.locator("#slotCliqueWitness").textContent(), "Pairwise conflicting transaction indexes: " + slot.analysis!.blockWaveBounds.cliqueWitness!.map(index => "#" + index).join(", ") + ".");
        assert.equal(await page.locator("#slotWaveMethod").textContent(), slot.analysis!.methodology.waveHeuristic);
      }
      await page.locator(".slot").last().click();
      assert.match((await page.locator("#technical").textContent())!, /488638508/);
      await page.locator(".inspect-range-chunks").first().press("Enter");
      assert.equal(await page.locator(".range-chunk").count(), 50);
      assert.equal(await page.evaluate(() => document.activeElement?.id), "rangeChunkTitle");
      await page.getByRole("button", { name: "Next range chunks", exact: true }).press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "rangeChunkPage");
      await page.getByRole("button", { name: "Next range chunks", exact: true }).press("Enter");
      assert.equal(await page.locator(".range-chunk").count(), 48);
      assert.equal(await page.getByRole("button", { name: "Next range chunks", exact: true }).isDisabled(), true);
      const selectedChunkLabel = await page.locator(".range-chunk").last().textContent();
      await page.locator(".range-chunk").last().press("Enter");
      assert.equal(await page.locator("#rangeChunkEvidence h3").textContent(), selectedChunkLabel);
      assert.match((await page.locator("#rangeChunkEvidence pre").textContent())!, /"parsedType": "write"/);
      assert.match((await page.locator("#rangeChunkEvidence pre").textContent())!, /"payloadSha256"/);
      assert.equal(await page.locator("#interactionSlot").textContent(), "Selected slot 488638508");
      await page.getByRole("button", { name: "Previous range chunks", exact: true }).press("Enter");
      assert.equal(await page.locator("#rangeChunkEvidence").textContent(), "");
      assert.equal(await page.locator(".range-chunk").count(), 50);

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []); assert.deepEqual(network, []);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("table")].every(table => table.tabIndex === 0 && Boolean(table.getAttribute("aria-label")))),true);
      results.push({ width, report: rangePath, passed: true });
      await page.goto(pathToFileURL(evidenceRangePath).href);
      assert.match((await page.locator("#parentLinks").textContent())!, /Inconsistent parent references were found/);
      const [partialDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#downloadOverviewCsv").press("Enter")]);
      const partialPath=await partialDownload.path();assert.ok(partialPath);
      assert.equal(await readFile(partialPath,"utf8"),rangeOverviewCsv(evidenceRange));
      assert.equal(await page.locator('#blockOverview [data-field="compute"]').first().textContent(), 'CU unknown (4 transactions)');
      assert.equal(await page.locator('#blockOverview [data-field="compute"]').last().textContent(), '25 known CU · 2 unknown');
      const missingRow = page.locator('[data-overview-slot="' + evidenceRange.slots[1]!.slot + '"]');
      assert.match((await missingRow.textContent())!, /missingBlock evidence unavailable/);
      assert.equal(await missingRow.locator('[data-field]').count(), 0);
      assert.match((await page.locator("#slotCliqueWitness").textContent())!, /Pairwise conflicting transaction indexes: #/);
      await page.locator("#slotCliqueDetails summary").press("Enter");
      assert.equal(await page.locator("#slotCliqueDetails").getAttribute("open"), "");
      await page.locator('.slot[data-slot="' + evidenceRange.slots[1]!.slot + '"]').press("Enter");
      assert.match((await page.locator("#slotWaveBounds").textContent())!, /No stored full-block analysis/);
      assert.equal(await page.locator("#slotCliqueDetails").getAttribute("hidden"), "");
      assert.equal(await page.locator("#slotCliqueWitness").textContent(), "");
      assert.equal(await page.locator("#slotWaveMethod").textContent(), "");
      await page.locator(".slot").last().press("Enter");
      assert.equal(await page.locator("#slotCliqueDetails").getAttribute("hidden"), null);
      assert.match((await page.locator("#slotCliqueWitness").textContent())!, /not stored in this saved analysis/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []); assert.deepEqual(network, []);
      results.push({ width, report: evidenceRangePath, passed: true }); await page.close();
    }
  } finally { await browser.close(); }
  await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(`Passed ${results.length} offline report browser checks. Evidence: ${output}`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
