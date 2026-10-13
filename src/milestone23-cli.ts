import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bootstrapMilestone23Plan, loadMilestone23Plan, runMilestone23 } from "./milestone23.js";

interface Arguments { plan: string; offline: boolean; bootstrapPlan: boolean }

function parseArguments(argv: string[]): Arguments {
  const result: Arguments = { plan: "research-plans/velocity-equality-replay-milestone-2.3.json", offline: false, bootstrapPlan: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--plan") {
      const value = argv[index + 1];
      if (!value) throw new Error("--plan requires a path");
      result.plan = value;
      index += 1;
    } else if (argument === "--offline") result.offline = true;
    else if (argument === "--bootstrap-plan") result.bootstrapPlan = true;
    else throw new Error(`Unknown argument ${argument}`);
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const plan = await loadMilestone23Plan(args.plan);
  if (args.bootstrapPlan) {
    const pinned = await bootstrapMilestone23Plan(plan);
    await writeFile(resolve(args.plan), `${JSON.stringify(pinned, null, 2)}\n`);
    console.log(`Pinned Milestone 2.3 plan at ${args.plan}`);
    return;
  }
  const result = await runMilestone23(plan, { offline: args.offline });
  console.log(result.terminalSummary);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
