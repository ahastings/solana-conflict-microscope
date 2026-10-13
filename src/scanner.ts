import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { analyzeBlock } from "./analyze.js";
import { publicErrorMessage, publicRpcEndpoint } from "./rpc-provenance.js";
import { fetchParsedBlock } from "./rpc.js";
import type { Analysis } from "./types.js";

export interface ContentionCandidate {
  slot: number; account: string; label: string | null; crossPayerPairCount: number;
  affectedTransactionCount: number; payerCount: number; componentTransactionCount: number;
  provenance: Analysis["provenance"];
  meaningCategory: string; meaningConfidence: string;
}

export function rankCrossPayerCandidates(analyses: Analysis[]): ContentionCandidate[] {
  const candidates: ContentionCandidate[] = [];
  for (const analysis of analyses) for (const stat of analysis.accounts) {
    const crossEdges = analysis.conflictEdges.filter((edge) => edge.classification === "cross-payer-shared-account" && edge.accounts.includes(stat.account));
    if (crossEdges.length === 0) continue;
    const indexes = [...new Set(crossEdges.flatMap((edge) => [edge.source, edge.target]))];
    const component = analysis.componentMeanings.find((item) => item.transactionIndexes.some((index) => indexes.includes(index)));
    candidates.push({ slot: analysis.context.slot, account: stat.account, label: stat.label, crossPayerPairCount: crossEdges.length, affectedTransactionCount: indexes.length, payerCount: new Set(indexes.map((index) => analysis.transactions[index]!.feePayer)).size, componentTransactionCount: component?.transactionIndexes.length ?? indexes.length, provenance: analysis.provenance, meaningCategory: component?.cause.value ?? "unknown", meaningConfidence: component?.cause.confidence ?? "low" });
  }
  return candidates.sort((a, b) => b.crossPayerPairCount - a.crossPayerPairCount || b.payerCount - a.payerCount || b.affectedTransactionCount - a.affectedTransactionCount || a.slot - b.slot || a.account.localeCompare(b.account));
}

const jsonReplacer = (_key: string, value: unknown): unknown => typeof value === "bigint" ? Number(value) : value;
const delay = async (milliseconds: number): Promise<void> => await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function loadFixture(path: string): Promise<Analysis | null> {
  try {
    const fixture = JSON.parse(await readFile(path, "utf8")) as { slot?: unknown; block?: unknown; provenance?: Record<string, unknown> };
    const slot = Number(fixture.slot); if (!Number.isSafeInteger(slot) || fixture.block === undefined) return null;
    const provenance = fixture.provenance ?? {};
    return analyzeBlock(fixture.block, slot, "fixture", { cluster: String(provenance.cluster ?? "unknown"), endpoint: provenance.endpoint == null ? null : String(provenance.endpoint), retrievedAt: provenance.retrievedAt == null ? null : String(provenance.retrievedAt), sourceMode: "scanner-cache", dataKind: provenance.dataKind === "real-network" ? "real-network" : provenance.dataKind === "curated-teaching" ? "curated-teaching" : provenance.dataKind === "synthetic" ? "synthetic" : "unknown" });
  } catch { return null; }
}

async function fixturePaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []); const paths: string[] = [];
  for (const entry of entries) { const path = join(directory, entry.name); if (entry.isDirectory()) paths.push(...await fixturePaths(path)); else if (entry.isFile() && entry.name.endsWith(".json")) paths.push(path); }
  return paths.sort();
}

export interface ScanOptions { startSlot: number; count: number; rpcUrl: string; cacheDir: string; fixtureDir: string; offline: boolean; delayMs?: number }

export async function scanContention(options: ScanOptions): Promise<{ scannedSlots: number[]; failedSlots: Array<{ slot: number; error: string }>; candidates: ContentionCandidate[] }> {
  if (!Number.isSafeInteger(options.startSlot) || options.startSlot < 0) throw new Error("startSlot must be a non-negative safe integer");
  if (!Number.isSafeInteger(options.count) || options.count < 1 || options.count > 500) throw new Error("count must be between 1 and 500");
  await mkdir(options.cacheDir, { recursive: true }); const analyses: Analysis[] = []; const scannedSlots: number[] = []; const failedSlots: Array<{ slot: number; error: string }> = [];
  if (options.offline) {
    const paths = [...await fixturePaths(options.fixtureDir), ...await fixturePaths(options.cacheDir)];
    for (const path of [...new Set(paths)]) { const analysis = await loadFixture(path); if (analysis && analysis.context.slot >= options.startSlot && analysis.context.slot < options.startSlot + options.count) { analyses.push(analysis); scannedSlots.push(analysis.context.slot); } }
  } else {
    for (let slot = options.startSlot; slot < options.startSlot + options.count; slot++) {
      const cachedPath = join(options.cacheDir, `slot-${slot}.json`); const cached = await loadFixture(cachedPath);
      if (cached) { analyses.push(cached); scannedSlots.push(slot); continue; }
      try {
        const block = await fetchParsedBlock(slot, options.rpcUrl); const retrievedAt = new Date().toISOString();
        const fixture = { provenance: { cluster: options.rpcUrl.includes("devnet") ? "devnet" : options.rpcUrl.includes("testnet") ? "testnet" : "mainnet-beta-or-custom", endpoint: publicRpcEndpoint(options.rpcUrl), retrievedAt, sourceMode: "scanner-cache" as const, dataKind: "real-network" as const, request: { method: "getBlock", slot, encodings: ["jsonParsed", "json"] } }, slot, block };
        await writeFile(cachedPath, JSON.stringify(fixture, jsonReplacer, 2) + "\n"); analyses.push(analyzeBlock(block, slot, "rpc", fixture.provenance)); scannedSlots.push(slot);
      } catch (error) { failedSlots.push({ slot, error: publicErrorMessage(error) }); }
      if (slot + 1 < options.startSlot + options.count) await delay(options.delayMs ?? 300);
    }
  }
  const result = { scannedSlots: [...new Set(scannedSlots)].sort((a, b) => a - b), failedSlots, candidates: rankCrossPayerCandidates(analyses) };
  await writeFile(resolve(options.cacheDir, "scan-results.json"), JSON.stringify({ generatedAt: new Date().toISOString(), options: { ...options, rpcUrl: publicRpcEndpoint(options.rpcUrl) }, ...result }, null, 2) + "\n"); return result;
}
