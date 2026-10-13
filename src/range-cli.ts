#!/usr/bin/env node
import { parseRangeArgs, RANGE_USAGE } from "./range-options.js";
import { publicErrorMessage } from "./rpc-provenance.js";
import { resolve } from "node:path";
import { analyzeRange } from "./range-analyze.js";
import { acquireRange } from "./range-input.js";
import { rangeTerminalReport, writeRangeReports } from "./range-report.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseRangeArgs(args);
  if (options.help) { console.log(RANGE_USAGE); return; }
  const cacheDir = resolve(options.cacheDir), outputDir = resolve(options.outputDir);
  const rpcUrl = options.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const analysis = analyzeRange(await acquireRange({ ...options, cacheDir, rpcUrl }));
  await writeRangeReports(analysis, outputDir);
  console.log(rangeTerminalReport(analysis));
  console.log(`\nWrote ${resolve(outputDir, "range-analysis.json")}\nWrote ${resolve(outputDir, "range-report.html")}`);
}

main().catch((error: unknown) => { console.error(publicErrorMessage(error)); process.exitCode = 1; });
