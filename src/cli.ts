#!/usr/bin/env node
import { parseJsonFileText } from "./json-text.js";
import { ANALYZE_USAGE, parseAnalyzeArgs } from "./analyze-options.js";
import { readFile } from "node:fs/promises";
import { publicErrorMessage } from "./rpc-provenance.js";
import { resolve } from "node:path";
import { analyzeBlock } from "./analyze.js";
import { writeReports, terminalReport } from "./report.js";
import { fetchParsedBlock } from "./rpc.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseAnalyzeArgs(args);
  if (options.help) { console.log(ANALYZE_USAGE); return; }
  const fixture = options.fixture;
  const outputDir = resolve(options.outputDir); let block: unknown; let slot: number; let source: "fixture" | "rpc";
  let provenance: Record<string, unknown> | undefined;
  if (fixture) {
    const text = await readFile(resolve(fixture), "utf8");
    const parsed = parseJsonFileText(text);
    const invalidFixture = "Fixture must contain a non-negative integer slot and block object";
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(invalidFixture);
    const envelope = parsed as Record<string, unknown>;
    if (typeof envelope.slot !== "number" || !Number.isSafeInteger(envelope.slot) || envelope.slot < 0 ||
        envelope.block === null || typeof envelope.block !== "object" || Array.isArray(envelope.block)) throw new Error(invalidFixture);
    slot = envelope.slot;
    block = envelope.block;
    provenance = envelope.provenance as Record<string, unknown> | undefined;
    source = "fixture";
  }
  else { slot = options.slot!; if (!Number.isSafeInteger(slot) || slot < 0) throw new Error("--slot must be a non-negative safe integer"); const rpcUrl = options.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com"; block = await fetchParsedBlock(slot, rpcUrl); source = "rpc"; }
  const normalizedProvenance = provenance ? { cluster: String(provenance.cluster ?? "unknown"), endpoint: provenance.endpoint == null ? null : String(provenance.endpoint), retrievedAt: provenance.retrievedAt == null ? null : String(provenance.retrievedAt), sourceMode: "fixture" as const, dataKind: (provenance.dataKind === "real-network" || provenance.dataKind === "curated-teaching" || provenance.dataKind === "synthetic" ? provenance.dataKind : "unknown") as "real-network" | "curated-teaching" | "synthetic" | "unknown", ...(provenance.request && typeof provenance.request === "object" ? { request: provenance.request as Record<string, unknown> } : {}) } : source === "rpc" ? { cluster: "custom-rpc", endpoint: options.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", retrievedAt: new Date().toISOString(), sourceMode: "rpc" as const, dataKind: "real-network" as const } : undefined;
  const analysis = analyzeBlock(block, slot, source, normalizedProvenance); await writeReports(analysis, outputDir); console.log(terminalReport(analysis)); console.log(`\nWrote ${resolve(outputDir, "analysis.json")}\nWrote ${resolve(outputDir, "report.html")}`);
}

main().catch((error: unknown) => { console.error(publicErrorMessage(error)); process.exitCode = 1; });
