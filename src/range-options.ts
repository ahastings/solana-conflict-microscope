import { parseArgs } from "node:util";

export const RANGE_USAGE = `Usage: npm run analyze-range -- --start-slot N --end-slot N [options]
  --offline                 Read cached data only
  --fetch-missing           Fetch absent blocks using public, read-only RPC
  --rpc-url URL             RPC endpoint (or SOLANA_RPC_URL)
  --cache-dir DIR           Cache directory (default: cache/contention)
  --output-dir DIR          Report directory (default: output/range)
  --skip-slots N,N          Explicit slots within the requested range
  --max-retries N           Rate-limit retries, 0–8 (default: 3)
  --backoff-ms N            Initial retry delay (default: 500)
  --help, -h                Show this help
Ranges are limited to 500 slots. Without --fetch-missing, only cached data is used.
--offline and --fetch-missing cannot be combined.`;

export function parseRangeArgs(args: string[]) {
  const { values, tokens } = parseArgs({ args, strict: true, allowPositionals: false, tokens: true, options: {
    "start-slot": { type: "string" }, "end-slot": { type: "string" }, "rpc-url": { type: "string" },
    "cache-dir": { type: "string" }, "output-dir": { type: "string" }, "skip-slots": { type: "string" },
    "max-retries": { type: "string" }, "backoff-ms": { type: "string" },
    offline: { type: "boolean" }, "fetch-missing": { type: "boolean" }, help: { type: "boolean", short: "h" },
  } });
  const seen = new Set<string>();
  for (const token of tokens) if (token.kind === "option") {
    if (seen.has(token.name)) throw new Error(`Duplicate option --${token.name}`);
    seen.add(token.name);
  }
  for (const [name, value] of Object.entries(values)) if (typeof value === "string" && !value.length) throw new Error(`--${name} requires a nonempty value`);
  if (values.help) return { help: true as const };
  const integer = (text: string | undefined, name: string, fallback?: number): number => {
    if (text === undefined && fallback !== undefined) return fallback;
    const value = Number(text);
    if (!text?.trim() || !Number.isSafeInteger(value) || value < 0) throw new Error(`--${name} must be a non-negative safe integer`);
    return value;
  };
  const startSlot = integer(values["start-slot"], "start-slot"), endSlot = integer(values["end-slot"], "end-slot");
  if (endSlot < startSlot || endSlot - startSlot >= 500) throw new Error("Range must contain 1–500 slots with end-slot >= start-slot");
  const offline = values.offline ?? false, fetchMissing = values["fetch-missing"] ?? false;
  if (offline && fetchMissing) throw new Error("--offline cannot be combined with --fetch-missing");
  const maxRetries = integer(values["max-retries"], "max-retries", 3), backoffMs = integer(values["backoff-ms"], "backoff-ms", 500);
  if (maxRetries > 8) throw new Error("--max-retries must be between 0 and 8");
  const skippedSlots = new Set<number>();
  if (values["skip-slots"] !== undefined) for (const part of values["skip-slots"].split(",")) {
    const slot = integer(part, "skip-slots");
    if (slot < startSlot || slot > endSlot) throw new Error("--skip-slots entries must lie within the requested range");
    skippedSlots.add(slot);
  }
  return { help: false as const, startSlot, endSlot, offline, fetchMissing, skippedSlots, maxRetries, backoffMs,
    cacheDir: values["cache-dir"] ?? "cache/contention", outputDir: values["output-dir"] ?? "output/range", rpcUrl: values["rpc-url"] };
}