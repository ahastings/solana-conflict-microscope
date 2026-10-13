#!/usr/bin/env node
import { publicErrorMessage } from "./rpc-provenance.js";
import { resolve } from "node:path";
import { loadDiscoveryPlan, runDiscovery } from "./discovery.js";
import { resolveDiscoveryPlan } from "./discovery-plan.js";
import { fetchConfirmedSlot } from "./rpc.js";

const DEFAULT_RPC: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

function valueAfter(args: string[], flag: string): string | undefined { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; }
function numberAfter(args: string[], flag: string): number | undefined { const value = valueAfter(args, flag); return value === undefined ? undefined : Number(value); }
function usage(): never {
  throw new Error("Usage: npm run discover-contention -- (--latest [--window-count 5 --window-size 100 --window-stride 10000] | --start-slot N --end-slot N | --plan FILE) [--cluster devnet] [--rpc-url URL] [--cache-dir DIR] [--output-dir DIR] [--top 20] [--delay-ms 100] [--concurrency 1] [--max-retries 3] [--backoff-ms 500] [--offline]");
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help")) usage();
  const offline = args.includes("--offline"), planPath = valueAfter(args, "--plan");
  let plan;
  if (planPath) {
    plan = await loadDiscoveryPlan(resolve(planPath));
    if (!offline) {
      const rpcOverride = valueAfter(args, "--rpc-url") ?? process.env.SOLANA_RPC_URL;
      if (rpcOverride) plan = { ...plan, rpcUrl: rpcOverride, rpcUrlRequiresOverride: false };
    }
    if (!offline && args.includes("--latest")) throw new Error("A concrete --plan cannot be combined with --latest");
  } else {
    const cluster = valueAfter(args, "--cluster") ?? "devnet";
    const rpcUrl = valueAfter(args, "--rpc-url") ?? process.env.SOLANA_RPC_URL ?? DEFAULT_RPC[cluster];
    if (!rpcUrl) throw new Error(`No default RPC endpoint is known for cluster ${cluster}; pass --rpc-url`);
    const latest = args.includes("--latest");
    if (offline && latest) throw new Error("Offline latest replay requires --plan so resolved windows are reused exactly");
    const latestSlot = latest ? await fetchConfirmedSlot(rpcUrl) : undefined;
    const skipText = valueAfter(args, "--skip-slots");
    plan = resolveDiscoveryPlan({
      cluster,
      rpcUrl,
      cacheDir: resolve(valueAfter(args, "--cache-dir") ?? `cache/discovery-${cluster}`),
      outputDir: resolve(valueAfter(args, "--output-dir") ?? `output/discovery-${cluster}`),
      resolvedAt: new Date().toISOString(),
      latest,
      ...(latestSlot === undefined ? {} : { latestSlot }),
      ...(numberAfter(args, "--window-count") === undefined ? {} : { windowCount: numberAfter(args, "--window-count")! }),
      ...(numberAfter(args, "--window-size") === undefined ? {} : { windowSize: numberAfter(args, "--window-size")! }),
      ...(numberAfter(args, "--window-stride") === undefined ? {} : { windowStride: numberAfter(args, "--window-stride")! }),
      ...(numberAfter(args, "--start-slot") === undefined ? {} : { startSlot: numberAfter(args, "--start-slot")! }),
      ...(numberAfter(args, "--end-slot") === undefined ? {} : { endSlot: numberAfter(args, "--end-slot")! }),
      ...(numberAfter(args, "--delay-ms") === undefined ? {} : { delayMs: numberAfter(args, "--delay-ms")! }),
      ...(numberAfter(args, "--concurrency") === undefined ? {} : { concurrency: numberAfter(args, "--concurrency")! }),
      ...(numberAfter(args, "--max-retries") === undefined ? {} : { maxRetries: numberAfter(args, "--max-retries")! }),
      ...(numberAfter(args, "--backoff-ms") === undefined ? {} : { backoffMs: numberAfter(args, "--backoff-ms")! }),
      ...(numberAfter(args, "--top") === undefined ? {} : { top: numberAfter(args, "--top")! }),
      ...(numberAfter(args, "--json-budget-bytes") === undefined ? {} : { jsonBudgetBytes: numberAfter(args, "--json-budget-bytes")! }),
      ...(numberAfter(args, "--html-budget-bytes") === undefined ? {} : { htmlBudgetBytes: numberAfter(args, "--html-budget-bytes")! }),
      skippedSlots: skipText ? skipText.split(",").filter(Boolean).map(Number) : [],
    });
  }
  const result = await runDiscovery(plan, { offline });
  console.log(result.terminalSummary);
  console.log(`Plan: ${resolve(plan.outputDir, "discovery-plan.json")}\nIndex: ${resolve(plan.outputDir, "discovery-index.json")}\nReport: ${resolve(plan.outputDir, "discovery-report.html")}\nResearch queue: ${resolve(plan.outputDir, "candidate-research-queue.md")}`);
}

main().catch((error: unknown) => { console.error(publicErrorMessage(error)); process.exitCode = 1; });
