import type { DiscoveryPlan, DiscoveryWindow } from "./discovery-types.js";

export interface ResolveDiscoveryPlanOptions {
  cluster: string;
  rpcUrl: string;
  cacheDir: string;
  outputDir: string;
  resolvedAt: string;
  latest?: boolean;
  latestSlot?: number;
  windowCount?: number;
  windowSize?: number;
  windowStride?: number;
  startSlot?: number;
  endSlot?: number;
  delayMs?: number;
  concurrency?: number;
  maxRetries?: number;
  backoffMs?: number;
  top?: number;
  jsonBudgetBytes?: number;
  htmlBudgetBytes?: number;
  skippedSlots?: number[];
}

const integer = (value: number, name: string, minimum: number, maximum: number): number => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be a safe integer between ${minimum} and ${maximum}`);
  return value;
};

export function resolveDiscoveryPlan(options: ResolveDiscoveryPlanOptions): DiscoveryPlan {
  const latest = options.latest === true;
  const explicit = options.startSlot !== undefined || options.endSlot !== undefined;
  if (latest === explicit) throw new Error("Choose exactly one of --latest or an explicit --start-slot/--end-slot range");
  let windows: DiscoveryWindow[], resolvedLatestSlot: number | null = null;
  if (latest) {
    resolvedLatestSlot = integer(options.latestSlot ?? -1, "latestSlot", 0, Number.MAX_SAFE_INTEGER);
    const count = integer(options.windowCount ?? 5, "windowCount", 1, 20);
    const size = integer(options.windowSize ?? 100, "windowSize", 1, 500);
    const stride = integer(options.windowStride ?? 10_000, "windowStride", size, Number.MAX_SAFE_INTEGER);
    windows = Array.from({ length: count }, (_, index) => {
      const endSlot = resolvedLatestSlot! - index * stride;
      const startSlot = endSlot - size + 1;
      if (startSlot < 0) throw new Error("Resolved latest windows include a negative slot");
      return { startSlot, endSlot };
    }).sort((left, right) => left.startSlot - right.startSlot);
  } else {
    const startSlot = integer(options.startSlot ?? -1, "startSlot", 0, Number.MAX_SAFE_INTEGER);
    const endSlot = integer(options.endSlot ?? -1, "endSlot", startSlot, Number.MAX_SAFE_INTEGER);
    windows = [{ startSlot, endSlot }];
  }
  const requestedSlotCount = windows.reduce((sum, window) => sum + window.endSlot - window.startSlot + 1, 0);
  if (requestedSlotCount > 500) throw new Error("Discovery is bounded to 500 requested slots");
  const skippedSlots = [...new Set(options.skippedSlots ?? [])].sort((a, b) => a - b);
  skippedSlots.forEach((slot) => integer(slot, "skipped slot", 0, Number.MAX_SAFE_INTEGER));
  return {
    schemaVersion: "1.8",
    cluster: options.cluster,
    rpcUrl: options.rpcUrl,
    resolutionMode: latest ? "latest" : "explicit",
    resolvedAt: options.resolvedAt,
    resolvedLatestSlot,
    windows,
    requestedSlotCount,
    cacheDir: options.cacheDir,
    outputDir: options.outputDir,
    options: {
      delayMs: integer(options.delayMs ?? 100, "delayMs", 0, 60_000),
      concurrency: integer(options.concurrency ?? 1, "concurrency", 1, 8),
      maxRetries: integer(options.maxRetries ?? 3, "maxRetries", 0, 8),
      backoffMs: integer(options.backoffMs ?? 500, "backoffMs", 1, 60_000),
      top: integer(options.top ?? 20, "top", 0, 100),
      jsonBudgetBytes: integer(options.jsonBudgetBytes ?? 25 * 1024 * 1024, "jsonBudgetBytes", 1, Number.MAX_SAFE_INTEGER),
      htmlBudgetBytes: integer(options.htmlBudgetBytes ?? 5 * 1024 * 1024, "htmlBudgetBytes", 1, Number.MAX_SAFE_INTEGER),
      skippedSlots,
    },
  };
}

export function slotsInPlan(plan: DiscoveryPlan): number[] {
  return plan.windows.flatMap((window) => Array.from({ length: window.endSlot - window.startSlot + 1 }, (_, index) => window.startSlot + index));
}
