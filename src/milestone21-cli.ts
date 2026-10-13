import { loadMilestone21Plan, runMilestone21 } from "./milestone21.js";

interface Arguments { plan: string; offline: boolean; bootstrapHashes: boolean }

function parseArguments(argv: string[]): Arguments {
  const result: Arguments = { plan: "research-plans/velocity-binary-milestone-2.1.json", offline: false, bootstrapHashes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--plan") {
      const value = argv[index + 1];
      if (!value) throw new Error("--plan requires a path");
      result.plan = value;
      index += 1;
    } else if (argument === "--offline") result.offline = true;
    else if (argument === "--bootstrap-hashes") result.bootstrapHashes = true;
    else throw new Error(`Unknown argument ${argument}`);
  }
  if (result.offline && result.bootstrapHashes) throw new Error("--bootstrap-hashes is only valid during online cache acquisition");
  return result;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const plan = await loadMilestone21Plan(args.plan);
  const result = await runMilestone21(plan, { offline: args.offline, bootstrapHashes: args.bootstrapHashes });
  console.log(result.terminalSummary);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
