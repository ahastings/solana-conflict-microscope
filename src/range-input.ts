import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { publicErrorMessage, publicRpcEndpoint } from "./rpc-provenance.js";
import { analyzeBlock } from "./analyze.js";
import { BlockUnavailableError, fetchParsedBlock } from "./rpc.js";
import type { RangeProvenance, RangeSlotRecord, SlotStatus } from "./range-types.js";
import type { FixtureProvenance } from "./types.js";

type FetchBlock = (slot: number, rpcUrl: string) => Promise<unknown | null>;
type Delay = (milliseconds: number) => Promise<void>;

export interface RangeInputOptions {
  startSlot: number; endSlot: number; cacheDir: string; rpcUrl: string;
  offline: boolean; fetchMissing: boolean; skippedSlots?: Set<number>;
  maxRetries?: number; backoffMs?: number; fetchBlock?: FetchBlock; delay?: Delay; now?: () => string;
}

export interface AcquiredRange { slots: RangeSlotRecord[]; provenance: RangeProvenance }

const wait: Delay = async (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds));
const clusterFor = (url: string): string => url.includes("devnet") ? "devnet" : url.includes("testnet") ? "testnet" : "mainnet-beta-or-custom";
const isRateLimit = (error: unknown): boolean => /429|rate.?limit|too many requests/i.test(error instanceof Error ? error.message : String(error));
const cacheJson = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
  if (typeof item !== "bigint") return item;
  const numeric = Number(item);
  return Number.isSafeInteger(numeric) ? numeric : String(item);
}, 2) + "\n";

function normalizedProvenance(value: unknown, fallbackSource: FixtureProvenance["sourceMode"]): FixtureProvenance {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sourceMode = item.sourceMode === "fixture" || item.sourceMode === "rpc" || item.sourceMode === "scanner-cache" || item.sourceMode === "range-cache" ? item.sourceMode : fallbackSource;
  const dataKind = item.dataKind === "real-network" || item.dataKind === "curated-teaching" || item.dataKind === "synthetic" ? item.dataKind : "unknown";
  return { cluster: String(item.cluster ?? "unknown"), endpoint: publicRpcEndpoint(item.endpoint == null ? null : String(item.endpoint)), retrievedAt: item.retrievedAt == null ? null : String(item.retrievedAt), sourceMode, dataKind, ...(item.request && typeof item.request === "object" ? { request: item.request as Record<string, unknown> } : {}) };
}

async function loadObserved(path: string, slot: number): Promise<{ analysis: RangeSlotRecord["analysis"]; provenance: FixtureProvenance } | { error: string } | null> {
  try {
    const fixture = JSON.parse(await readFile(path, "utf8")) as { slot?: unknown; block?: unknown; provenance?: unknown };
    if (fixture.slot !== slot || fixture.block === undefined) throw new Error("Cached block must contain the requested numeric slot and a block object");
    const provenance = normalizedProvenance(fixture.provenance, "range-cache");
    return { analysis: analyzeBlock(fixture.block, slot, "fixture", provenance), provenance };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    return { error: publicErrorMessage(error) };
  }
}

interface StatusSidecar { slot: number; status: Exclude<SlotStatus, "observed" | "missing" | "failed">; error: string | null; retrievedAt: string; endpoint: string | null }

async function loadSidecar(path: string, slot: number): Promise<StatusSidecar | { failure: string } | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<StatusSidecar>;
    if (value.slot !== slot || (value.status !== "unavailable" && value.status !== "skipped") || typeof value.retrievedAt !== "string") throw new Error("Cached slot status must match the requested numeric slot and contain a supported status and retrieval time");
    return { slot, status: value.status, error: value.error == null ? null : publicErrorMessage(value.error), retrievedAt: value.retrievedAt, endpoint: publicRpcEndpoint(value.endpoint == null ? null : String(value.endpoint)) };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    return { failure: publicErrorMessage(error) };
  }
}

export async function acquireRange(options: RangeInputOptions): Promise<AcquiredRange> {
  const count = options.endSlot - options.startSlot + 1;
  if (!Number.isSafeInteger(options.startSlot) || !Number.isSafeInteger(options.endSlot) || options.startSlot < 0 || options.endSlot < options.startSlot) throw new Error("Range slots must be non-negative safe integers with endSlot >= startSlot");
  if (count > 500) throw new Error("Range analysis is bounded to 500 slots");
  if (options.offline && options.fetchMissing) throw new Error("Offline range analysis cannot fetch missing blocks");
  await mkdir(options.cacheDir, { recursive: true });
  const fetcher = options.fetchBlock ?? fetchParsedBlock, delay = options.delay ?? wait, now = options.now ?? (() => new Date().toISOString());
  const maxRetries = options.maxRetries ?? 3, backoffMs = options.backoffMs ?? 500;
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 8) throw new Error("maxRetries must be between 0 and 8");
  const slots: RangeSlotRecord[] = [], provenances: FixtureProvenance[] = [], retrievalTimes: string[] = [], skipped = options.skippedSlots ?? new Set<number>();
  let cacheCount = 0, rpcCount = 0;
  for (let slot = options.startSlot; slot <= options.endSlot; slot++) {
    const cachePath = join(options.cacheDir, `slot-${slot}.json`), sidecarPath = join(options.cacheDir, `slot-${slot}.status.json`);
    if (skipped.has(slot)) {
      const existing = await loadSidecar(sidecarPath, slot);
      if (existing && "failure" in existing) {
        slots.push({ slot, status: "failed", source: "cache", attempts: 0, cachePath: basename(sidecarPath), error: existing.failure, analysis: null }); continue;
      }
      if (existing?.status === "skipped") {
        retrievalTimes.push(existing.retrievedAt); slots.push({ slot, status: "skipped", source: "cache", attempts: 0, cachePath: basename(sidecarPath), error: existing.error, analysis: null }); continue;
      }
      const retrievedAt = now(), sidecar: StatusSidecar = { slot, status: "skipped", error: null, retrievedAt, endpoint: null };
      await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
      retrievalTimes.push(retrievedAt); slots.push({ slot, status: "skipped", source: "cache", attempts: 0, cachePath: basename(sidecarPath), error: null, analysis: null }); continue;
    }
    const cached = await loadObserved(cachePath, slot);
    if (cached && "error" in cached) {
      slots.push({ slot, status: "failed", source: "cache", attempts: 0, cachePath: basename(cachePath), error: cached.error, analysis: null }); continue;
    }
    if (cached) {
      cacheCount++; provenances.push(cached.provenance); if (cached.provenance.retrievedAt) retrievalTimes.push(cached.provenance.retrievedAt);
      slots.push({ slot, status: "observed", source: "cache", attempts: 0, cachePath: basename(cachePath), error: null, analysis: cached.analysis }); continue;
    }
    const sidecar = await loadSidecar(sidecarPath, slot);
    if (sidecar && "failure" in sidecar) {
      slots.push({ slot, status: "failed", source: "cache", attempts: 0, cachePath: basename(sidecarPath), error: sidecar.failure, analysis: null }); continue;
    }
    if (sidecar) {
      retrievalTimes.push(sidecar.retrievedAt); slots.push({ slot, status: sidecar.status, source: "cache", attempts: 0, cachePath: basename(sidecarPath), error: sidecar.error, analysis: null }); continue;
    }
    if (options.offline || !options.fetchMissing) {
      slots.push({ slot, status: "missing", source: "none", attempts: 0, cachePath: null, error: "No cached block was available.", analysis: null }); continue;
    }
    let attempts = 0, finalError: unknown = null, completed = false;
    while (attempts <= maxRetries && !completed) {
      attempts++;
      try {
        const block = await fetcher(slot, options.rpcUrl);
        if (block === null) throw new BlockUnavailableError(slot);
        const retrievedAt = now();
        const provenance: FixtureProvenance = { cluster: clusterFor(options.rpcUrl), endpoint: publicRpcEndpoint(options.rpcUrl), retrievedAt, sourceMode: "range-cache", dataKind: "real-network", request: { method: "getBlock", slot, encodings: ["jsonParsed", "json"] } };
        const serializedCache = cacheJson({ provenance, slot, block });
        const cachedBlock = (JSON.parse(serializedCache) as { block: unknown }).block;
        const analysis = analyzeBlock(cachedBlock, slot, "rpc", provenance);
        await writeFile(cachePath, serializedCache);
        provenances.push(provenance); retrievalTimes.push(retrievedAt); rpcCount++;
        slots.push({ slot, status: "observed", source: "rpc", attempts, cachePath: basename(cachePath), error: null, analysis }); completed = true;
      } catch (error) {
        finalError = error;
        if (error instanceof BlockUnavailableError || /no block for slot/i.test(error instanceof Error ? error.message : String(error))) {
          const retrievedAt = now(), status: StatusSidecar = { slot, status: "unavailable", error: publicErrorMessage(error), retrievedAt, endpoint: publicRpcEndpoint(options.rpcUrl) };
          await writeFile(sidecarPath, JSON.stringify(status, null, 2) + "\n"); retrievalTimes.push(retrievedAt);
          slots.push({ slot, status: "unavailable", source: "rpc", attempts, cachePath: basename(sidecarPath), error: status.error, analysis: null }); completed = true;
        } else if (attempts <= maxRetries && isRateLimit(error)) await delay(Math.min(10_000, backoffMs * 2 ** (attempts - 1)));
        else {
          slots.push({ slot, status: "failed", source: "rpc", attempts, cachePath: null, error: publicErrorMessage(error), analysis: null }); completed = true;
        }
      }
    }
    if (!completed) slots.push({ slot, status: "failed", source: "rpc", attempts, cachePath: null, error: publicErrorMessage(finalError), analysis: null });
  }
  const values = (status: SlotStatus): number[] => slots.filter((record) => record.status === status).map((record) => record.slot);
  const sourceMode = rpcCount > 0 ? (cacheCount > 0 ? "cache+rpc" : "rpc") : options.offline ? "offline-cache" : "cache-only";
  const uniqueProvenances = [...new Map(provenances.map((item) => [JSON.stringify(item), item])).values()];
  return { slots, provenance: { endpoint: options.offline ? null : publicRpcEndpoint(options.rpcUrl), cluster: uniqueProvenances.find((item) => item.cluster !== "unknown")?.cluster ?? clusterFor(options.rpcUrl), requestedStartSlot: options.startSlot, requestedEndSlot: options.endSlot, observedSlots: values("observed"), missingSlots: values("missing"), unavailableSlots: values("unavailable"), failedSlots: values("failed"), skippedSlots: values("skipped"), retrievalTime: retrievalTimes.sort().at(-1) ?? null, sourceMode, sourceProvenance: uniqueProvenances } };
}
