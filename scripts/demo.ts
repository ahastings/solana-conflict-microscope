#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runDemo } from "../src/demo.js";

const usage = "Usage: npm run demo -- [--output-dir DIR]\nReplays the shipped fixtures offline and writes output/demo/index.html by default.";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) { console.log(usage); return; }
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--output-dir" || !args[1] || args[1].startsWith("--"))) {
    throw new Error(usage);
  }
  const result = await runDemo(args[1] ? { outputDir: resolve(args[1]) } : {});
  console.log("Offline demo complete: 2 single-block devnet examples, 1 nine-block devnet upload, and 1 synthetic teaching example.");
  console.log(`\nStart here: ${result.indexPath}\nOpen in a browser: ${pathToFileURL(result.indexPath).href}`);
  for (const report of result.reports) console.log(`\n${report.fixture.title}\n  Report: ${report.reportPath}\n  JSON:   ${report.analysisPath}`);
  console.log(`\nReal devnet: multi-block upload\n  Report: ${result.rangeReport.reportPath}\n  JSON:   ${result.rangeReport.analysisPath}`);
  console.log("\nThese are declared account contention estimates, not a validator's exact private schedule.");
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
