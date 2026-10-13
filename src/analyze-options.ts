import { parseArgs } from "node:util";

export const ANALYZE_USAGE = "Usage: npm run analyze -- (--fixture FILE | --slot NUMBER) [--rpc-url URL] [--output-dir DIR]\n       npm run analyze -- --help\nAnalyzes public, read-only block data. Reports describe declared account contention and estimated execution waves.";

export function parseAnalyzeArgs(args: string[]) {
  const { values, tokens } = parseArgs({ args, allowPositionals: false, strict: true, tokens: true, options: {
    fixture: { type: "string" }, slot: { type: "string" }, "rpc-url": { type: "string" }, "output-dir": { type: "string" }, help: { type: "boolean", short: "h" },
  } });
  const seen = new Set<string>();
  for (const token of tokens) if (token.kind === "option") {
    if (seen.has(token.name)) throw new Error(`Duplicate option --${token.name}`);
    seen.add(token.name);
  }
  for (const name of ["fixture", "slot", "rpc-url", "output-dir"] as const) {
    if (values[name] !== undefined && values[name].length === 0) throw new Error(`--${name} requires a nonempty value`);
  }
  if (values.help) return { help: true as const };
  if ((values.fixture === undefined) === (values.slot === undefined)) throw new Error(ANALYZE_USAGE);
  const slot = values.slot === undefined ? undefined : Number(values.slot);
  if (slot !== undefined && (!values.slot!.trim() || !Number.isSafeInteger(slot) || slot < 0)) throw new Error("--slot must be a non-negative safe integer");
  return { help: false as const, fixture: values.fixture, slot, rpcUrl: values["rpc-url"], outputDir: values["output-dir"] ?? "output" };
}