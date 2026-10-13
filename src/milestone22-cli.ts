import { bootstrapMilestone22Plan, loadMilestone22Plan, runMilestone22 } from "./milestone22.js";

interface Arguments { plan: string; offline: boolean; bootstrapPlan: boolean }

function parseArguments(argv: string[]): Arguments {
  const result: Arguments = { plan: "research-plans/velocity-anchor-bundle-milestone-2.2.json", offline: false, bootstrapPlan: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--plan") {
      const value = argv[index + 1];
      if (!value) throw new Error("--plan requires a path");
      result.plan = value; index += 1;
    } else if (argument === "--offline") result.offline = true;
    else if (argument === "--bootstrap-plan") result.bootstrapPlan = true;
    else throw new Error(`Unknown argument ${argument}`);
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const plan = await loadMilestone22Plan(args.plan);
  if (args.bootstrapPlan) {
    process.stdout.write(`${JSON.stringify(await bootstrapMilestone22Plan(plan), null, 2)}\n`);
    return;
  }
  const result = await runMilestone22(plan, { offline: args.offline });
  console.log(result.terminalSummary);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
