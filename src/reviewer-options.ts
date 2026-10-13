import { resolve } from "node:path";
import { parseArgs } from "node:util";

export const REVIEWER_USAGE = "Review bundled public Velocity blocks and conditional graph layers. No RPC or native execution.\nOptions: --fixture-dir PATH --output-dir PATH --max-search-states POSITIVE_INTEGER --help";

export function parseReviewerArgs(args: string[]) {
  const { values, tokens } = parseArgs({ args, allowPositionals: false, strict: true, tokens: true, options: {
    "fixture-dir": { type: "string" }, "output-dir": { type: "string" }, "max-search-states": { type: "string" }, help: { type: "boolean", short: "h" },
  } });
  const seen = new Set<string>();
  for (const token of tokens) if (token.kind === "option") {
    if (seen.has(token.name)) throw new Error('Duplicate option --' + token.name);
    seen.add(token.name);
  }
  for (const name of ["fixture-dir", "output-dir", "max-search-states"] as const) {
    if (values[name] !== undefined && !values[name].trim()) throw new Error('--' + name + ' requires a nonempty value');
  }
  const budget = values["max-search-states"];
  const maxSearchStates = budget === undefined ? undefined : Number(budget);
  if (budget !== undefined && (!/^\d+$/.test(budget) || !Number.isSafeInteger(maxSearchStates) || maxSearchStates! < 1)) throw new Error("--max-search-states must be a positive safe integer");
  return { help: values.help ?? false, options: {
    ...(values["fixture-dir"] === undefined ? {} : { fixtureDirectory: resolve(values["fixture-dir"]) }),
    ...(values["output-dir"] === undefined ? {} : { outputDirectory: resolve(values["output-dir"]) }),
    ...(maxSearchStates === undefined ? {} : { maxSearchStates }),
  } };
}
