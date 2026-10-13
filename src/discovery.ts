import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { publicErrorMessage, publicRpcEndpoint, rpcUrlHasOmittedParts } from "./rpc-provenance.js";
import { analyzeBlock } from "./analyze.js";
import { compactCandidatesForAnalysis, rankCandidates } from "./discovery-index.js";
import { slotsInPlan } from "./discovery-plan.js";
import { candidateResearchQueue, discoveryHtmlReport, discoveryTerminalSummary, enforceDiscoveryBudgets, serializeDiscoveryIndex } from "./discovery-report.js";
import type { DiscoveryCandidate, DiscoveryIndex, DiscoveryPlan, DiscoverySlotRecord, InfrastructureClassification } from "./discovery-types.js";
import { acquireRange } from "./range-input.js";
import { htmlReport } from "./report.js";
import type { FixtureProvenance } from "./types.js";

type FetchBlock = (slot: number, rpcUrl: string) => Promise<unknown | null>;
type Delay = (milliseconds: number) => Promise<void>;

export interface RunDiscoveryOptions {
  offline: boolean;
  fetchBlock?: FetchBlock;
  delay?: Delay;
  now?: () => string;
}

const wait: Delay = async (milliseconds) => await new Promise((done) => setTimeout(done, milliseconds));
const relativeSlash = (from: string, to: string): string => relative(from, to).replaceAll("\\", "/");

async function readFailure(path: string, slot: number): Promise<DiscoverySlotRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as DiscoverySlotRecord;
    return parsed.slot === slot && parsed.status === "failed" ? { ...parsed, error: parsed.error === null ? null : publicErrorMessage(parsed.error) } : null;
  } catch { return null; }
}

async function acquireDiscoverySlot(plan: DiscoveryPlan, slot: number, options: RunDiscoveryOptions): Promise<{ record: DiscoverySlotRecord; candidates: DiscoveryCandidate[] }> {
  const failurePath = join(plan.cacheDir, `slot-${slot}.discovery-status.json`);
  if (options.offline) {
    const successfulCachePath = join(plan.cacheDir, `slot-${slot}.json`);
    let successfulCachePresent = false;
    try { await readFile(successfulCachePath, "utf8"); successfulCachePresent = true; } catch { /* continue to the persisted failure state */ }
    if (!successfulCachePresent) {
      const cachedFailure = await readFailure(failurePath, slot);
      if (cachedFailure) return { record: { ...cachedFailure, source: "cache", attempts: 0, cachePath: failurePath.replaceAll("\\", "/") }, candidates: [] };
    }
  }
  const acquired = await acquireRange({
    startSlot: slot,
    endSlot: slot,
    cacheDir: plan.cacheDir,
    rpcUrl: plan.rpcUrl,
    offline: options.offline,
    fetchMissing: !options.offline,
    skippedSlots: new Set(plan.options.skippedSlots),
    maxRetries: plan.options.maxRetries,
    backoffMs: plan.options.backoffMs,
    ...(options.fetchBlock ? { fetchBlock: options.fetchBlock } : {}),
    ...(options.delay ? { delay: options.delay } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const slotRecord = acquired.slots[0]!;
  const cachePath = slotRecord.cachePath === null ? null : join(plan.cacheDir, slotRecord.cachePath).replaceAll("\\", "/");
  const record: DiscoverySlotRecord = { slot, status: slotRecord.status, source: slotRecord.source, attempts: slotRecord.attempts, cachePath, error: slotRecord.error };
  if (record.status === "failed" && !options.offline) await writeFile(failurePath, JSON.stringify(record, null, 2) + "\n");
  const candidates = slotRecord.analysis && cachePath ? compactCandidatesForAnalysis(slotRecord.analysis, plan.cluster, cachePath) : [];
  return { record, candidates };
}

const INFRASTRUCTURE_BUCKETS: InfrastructureClassification[] = ["vote-activity", "loader-deployment", "pure-same-payer-repetition", "system-funding", "known-program-or-sysvar", "fee-payer-only"];

function buildIndex(plan: DiscoveryPlan, slots: DiscoverySlotRecord[], candidates: DiscoveryCandidate[]): DiscoveryIndex {
  const ranked = rankCandidates(candidates);
  const count = (status: DiscoverySlotRecord["status"]): number => slots.filter((record) => record.status === status).length;
  return {
    schemaVersion: "1.8",
    generatedAt: plan.resolvedAt,
    planPath: "discovery-plan.json",
    methodology: {
      stageA: "Each observed block is analyzed into compact component evidence and discarded before the next bounded batch; complete normalized transactions, instruction payloads, edges, atoms, waves, and counterfactual models are excluded from this index.",
      stageB: "Only the deterministically ranked top K candidates are regenerated from cached source blocks into separate complete JSON and HTML artifacts.",
      conflictRule: "Two transactions conflict when they share an account and at least one declares it writable.",
      scheduleDisclaimer: "Wave bounds describe declared account contention and potential parallelism; they do not reconstruct a validator's exact private schedule.",
      actionabilityDisclaimer: "Candidate ranking is a research queue, not evidence that an account layout is redesignable or that runtime throughput will improve.",
    },
    coverage: {
      requested: slots.length,
      observed: count("observed"),
      skipped: count("skipped"),
      missing: count("missing"),
      unavailable: count("unavailable"),
      failed: count("failed"),
      retryAttempts: slots.reduce((sum, record) => sum + Math.max(0, record.attempts - 1), 0),
      slots,
    },
    candidateCount: ranked.length,
    highPriorityCandidateIds: ranked.filter((candidate) => candidate.infrastructureClassification === null && candidate.priorityTier <= 2).map((candidate) => candidate.candidateId),
    infrastructureCandidateIds: Object.fromEntries(INFRASTRUCTURE_BUCKETS.map((bucket) => [bucket, ranked.filter((candidate) => candidate.infrastructureClassification === bucket).map((candidate) => candidate.candidateId)])) as Record<InfrastructureClassification, string[]>,
    candidates: ranked,
  };
}

function cacheProvenance(value: unknown, cluster: string): FixtureProvenance {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    cluster: String(item.cluster ?? cluster),
    endpoint: item.endpoint == null ? null : String(item.endpoint),
    retrievedAt: item.retrievedAt == null ? null : String(item.retrievedAt),
    sourceMode: "scanner-cache",
    dataKind: item.dataKind === "real-network" || item.dataKind === "curated-teaching" || item.dataKind === "synthetic" ? item.dataKind : "unknown",
    ...(item.request && typeof item.request === "object" ? { request: item.request as Record<string, unknown> } : {}),
  };
}

export async function materializeTopCandidates(index: DiscoveryIndex, plan: DiscoveryPlan): Promise<void> {
  const selected = index.candidates.slice(0, plan.options.top);
  for (let position = 0; position < selected.length; position++) {
    const candidate = selected[position]!, rank = position + 1;
    const directoryName = `${String(rank).padStart(3, "0")}-${candidate.candidateId}`;
    const outputDirectory = join(plan.outputDir, "candidates", directoryName);
    const expectedName = `slot-${candidate.representativeSlot}.json`;
    const sourcePath = candidate.sourceCachePaths.find((path) => basename(path) === expectedName) ?? candidate.sourceCachePaths.find(Boolean);
    if (!sourcePath) {
      candidate.materialization = { rank, status: "missing-source", analysisPath: null, reportPath: null, error: "Candidate has no source cache path." };
      continue;
    }
    try {
      const absoluteSource = resolve(sourcePath), parsed = JSON.parse(await readFile(absoluteSource, "utf8")) as { slot?: unknown; block?: unknown; provenance?: unknown };
      if (Number(parsed.slot) !== candidate.representativeSlot || parsed.block === undefined) throw new Error("Candidate source cache is missing the representative block.");
      const analysis = analyzeBlock(parsed.block, candidate.representativeSlot, "fixture", cacheProvenance(parsed.provenance, candidate.cluster));
      await mkdir(outputDirectory, { recursive: true });
      const analysisPath = join(outputDirectory, "analysis.json"), reportPath = join(outputDirectory, "report.html");
      await Promise.all([writeFile(analysisPath, JSON.stringify(analysis, null, 2) + "\n"), writeFile(reportPath, htmlReport(analysis))]);
      candidate.materialization = { rank, status: "materialized", analysisPath: relativeSlash(plan.outputDir, analysisPath), reportPath: relativeSlash(plan.outputDir, reportPath), error: null };
    } catch (error) {
      candidate.materialization = { rank, status: /ENOENT|missing the representative block/i.test(error instanceof Error ? error.message : String(error)) ? "missing-source" : "failed", analysisPath: null, reportPath: null, error: publicErrorMessage(error) };
    }
  }
}

export async function runDiscovery(plan: DiscoveryPlan, options: RunDiscoveryOptions): Promise<{ index: DiscoveryIndex; terminalSummary: string }> {
  if (!options.offline && plan.rpcUrlRequiresOverride) throw new Error("This saved plan omits RPC connection details. Supply --rpc-url or SOLANA_RPC_URL for online replay.");
  await Promise.all([mkdir(plan.cacheDir, { recursive: true }), mkdir(plan.outputDir, { recursive: true })]);
  await writeFile(join(plan.outputDir, "discovery-plan.json"), JSON.stringify({ ...plan, rpcUrl: publicRpcEndpoint(plan.rpcUrl) ?? "", ...(plan.rpcUrlRequiresOverride || rpcUrlHasOmittedParts(plan.rpcUrl) ? { rpcUrlRequiresOverride: true } : {}) }, null, 2) + "\n");
  const delay = options.delay ?? wait, requestedSlots = slotsInPlan(plan), slotRecords: DiscoverySlotRecord[] = [], compactRecords: DiscoveryCandidate[] = [];
  for (let offset = 0; offset < requestedSlots.length; offset += plan.options.concurrency) {
    const batch = requestedSlots.slice(offset, offset + plan.options.concurrency);
    const results = await Promise.all(batch.map(async (slot) => await acquireDiscoverySlot(plan, slot, options)));
    for (const result of results) { slotRecords.push(result.record); compactRecords.push(...result.candidates); }
    if (!options.offline && results.some((result) => result.record.source === "rpc") && offset + batch.length < requestedSlots.length && plan.options.delayMs > 0) await delay(plan.options.delayMs);
  }
  slotRecords.sort((left, right) => left.slot - right.slot);
  let index = buildIndex(plan, slotRecords, compactRecords);
  await materializeTopCandidates(index, plan);
  index = { ...index, candidates: [...index.candidates] };
  const indexJson = serializeDiscoveryIndex(index), html = discoveryHtmlReport(index);
  enforceDiscoveryBudgets(indexJson, html, index, { jsonBudgetBytes: plan.options.jsonBudgetBytes, htmlBudgetBytes: plan.options.htmlBudgetBytes });
  await Promise.all([
    writeFile(join(plan.outputDir, "discovery-index.json"), indexJson),
    writeFile(join(plan.outputDir, "discovery-report.html"), html),
    writeFile(join(plan.outputDir, "candidate-research-queue.md"), candidateResearchQueue(index, plan.options.top)),
  ]);
  return { index, terminalSummary: discoveryTerminalSummary(index) };
}

export async function loadDiscoveryPlan(path: string): Promise<DiscoveryPlan> {
  const plan = JSON.parse(await readFile(path, "utf8")) as DiscoveryPlan;
  if (plan.schemaVersion !== "1.8" || !Array.isArray(plan.windows)) throw new Error("Discovery plan must use schema 1.8 and contain concrete windows");
  return plan;
}
