#!/usr/bin/env node
import { resolve } from "node:path";
import { loadCandidateResearchPlan, runCandidateResearch } from "./candidate-research.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function usage(): never {
  throw new Error("Usage: npm run research-candidate -- --plan FILE [--offline] [--bootstrap-hashes]");
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help")) usage();
  const planPath = valueAfter(args, "--plan");
  if (!planPath) usage();
  const plan = await loadCandidateResearchPlan(resolve(planPath));
  const result = await runCandidateResearch(plan, { offline: args.includes("--offline"), bootstrapHashes: args.includes("--bootstrap-hashes") });
  console.log(result.terminalSummary);
  console.log(`Dossier: ${resolve(plan.outputDirectory, "candidate-dossier.json")}`);
  console.log(`Report: ${resolve(plan.outputDirectory, "candidate-dossier.html")}`);
  console.log(`Documentation: ${resolve(plan.documentationPath)}`);
  if (args.includes("--bootstrap-hashes")) {
    console.log("Observed input hashes:");
    for (const input of result.observedInputHashes) console.log(`${input.sha256}  ${input.path}`);
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
