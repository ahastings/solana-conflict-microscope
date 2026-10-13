#!/usr/bin/env node
import { resolve } from "node:path";
import { loadSourceabilityPlan, loadVelocityResearchPlan, runMilestone20 } from "./milestone20.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function usage(): never {
  throw new Error("Usage: npm run research-velocity -- --sourceability-plan FILE --candidate-plan FILE [--offline] [--bootstrap-hashes]");
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help")) usage();
  const sourceabilityPath = valueAfter(args, "--sourceability-plan");
  const candidatePath = valueAfter(args, "--candidate-plan");
  if (!sourceabilityPath || !candidatePath) usage();
  const [sourceabilityPlan, candidatePlan] = await Promise.all([
    loadSourceabilityPlan(resolve(sourceabilityPath)),
    loadVelocityResearchPlan(resolve(candidatePath)),
  ]);
  const result = await runMilestone20(sourceabilityPlan, candidatePlan, {
    offline: args.includes("--offline"),
    bootstrapHashes: args.includes("--bootstrap-hashes"),
  });
  console.log(result.terminalSummary);
  console.log(`Sourceability: ${resolve(sourceabilityPlan.outputDirectory, "sourceability-index.json")}`);
  console.log(`Dossier: ${resolve(candidatePlan.outputDirectory, "candidate-dossier.json")}`);
  console.log(`Report: ${resolve(candidatePlan.outputDirectory, "candidate-dossier.html")}`);
  console.log(`Documentation: ${resolve(candidatePlan.documentationPath)}`);
  if (args.includes("--bootstrap-hashes")) {
    console.log("Observed input hashes:");
    for (const input of result.observedInputHashes) console.log(`${input.sha256}  ${input.path}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
