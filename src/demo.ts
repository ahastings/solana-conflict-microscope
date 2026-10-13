import { createHash } from "node:crypto";
import { compareAnalyses, comparisonHtml } from "./compare-analyses.js";
import { acquireRange } from "./range-input.js";
import { analyzeRange } from "./range-analyze.js";
import { writeRangeReports } from "./range-report.js";
import type { RangeAnalysis } from "./range-types.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBlock } from "./analyze.js";
import { writeReports } from "./report.js";
import type { Analysis, Cause, ComponentMeaning, FixtureProvenance } from "./types.js";

interface DemoFixture {
  id: string;
  filename: string;
  title: string;
  description: string;
  dataKind: "real-network" | "curated-teaching";
  cluster: "devnet" | "synthetic";
  cause: Cause;
  crossPayer: boolean;
}

export const DEMO_FIXTURES: readonly DemoFixture[] = [
  {
    id: "real-loader", filename: "real-devnet-block.json", title: "Real devnet: loader buffer writes",
    description: "Explore a captured program upload and the declared locks shared by its decoded buffer writes. The report also compares hypothetical payer and byte-range changes.",
    dataKind: "real-network", cluster: "devnet", cause: "program-buffer writes", crossPayer: false,
  },
  {
    id: "real-funding", filename: "cross-payer-devnet-block.json", title: "Real devnet: cross-payer funding",
    description: "Find transactions with different fee payers that draw from a shared funding source. Different payers alone do not establish independent application work or a safe redesign.",
    dataKind: "real-network", cluster: "devnet", cause: "transfer/funding source", crossPayer: true,
  },
  {
    id: "synthetic-teaching", filename: "cross-payer-application-state-teaching.json", title: "Synthetic teaching: shared application state",
    description: "A deliberately constructed example illustrates application-state contention and supplied evidence for an alternative partitioning. It is not evidence of an observed network opportunity.",
    dataKind: "curated-teaching", cluster: "synthetic", cause: "application state", crossPayer: true,
  },
];

export interface DemoReport {
  fixture: DemoFixture;
  analysis: Analysis;
  findings: ComponentMeaning[];
  reportPath: string;
  analysisPath: string;
}

export interface DemoRangeReport { analysis: RangeAnalysis; reportPath: string; analysisPath: string }

export interface DemoResult {
  rangeReport: DemoRangeReport;
  indexPath: string;
  reports: DemoReport[];
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

async function loadExample(root: string, fixture: DemoFixture): Promise<Omit<DemoReport, "reportPath" | "analysisPath">> {
  const path = join(root, "fixtures", fixture.filename);
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isObject(parsed) || !Number.isSafeInteger(parsed.slot) || Number(parsed.slot) < 0 || !isObject(parsed.block)) {
    throw new Error(`${fixture.filename}: expected a non-negative integer slot and a block object.`);
  }
  const provenance = parsed.provenance;
  if (!isObject(provenance) || provenance.dataKind !== fixture.dataKind || provenance.cluster !== fixture.cluster) {
    throw new Error(`${fixture.filename}: expected ${fixture.dataKind} / ${fixture.cluster} provenance; refusing to mislabel this example.`);
  }
  const normalized: FixtureProvenance = {
    cluster: fixture.cluster, dataKind: fixture.dataKind, sourceMode: "fixture",
    endpoint: typeof provenance.endpoint === "string" ? provenance.endpoint : null,
    retrievedAt: typeof provenance.retrievedAt === "string" ? provenance.retrievedAt : null,
    ...(isObject(provenance.request) ? { request: provenance.request } : {}),
  };
  const analysis = analyzeBlock(parsed.block, Number(parsed.slot), "fixture", normalized);
  const findings = analysis.componentMeanings.filter((finding) => finding.isContentionFinding
    && finding.cause.value === fixture.cause && (!fixture.crossPayer || finding.actorPattern.value === "cross payer"));
  if (findings.length === 0) throw new Error(`${fixture.filename}: the analyzer did not find the ${fixture.cause} example described by the demo.`);
  return { fixture, analysis, findings };
}

function findingHtml(finding: ComponentMeaning): string {
  return `<li><strong>${escapeHtml(finding.cause.value)}</strong> (${escapeHtml(finding.cause.confidence)} confidence)
    <p>${escapeHtml(finding.explanation)}</p>
    <p>Actor pattern: ${escapeHtml(finding.actorPattern.value)}. Actionability: ${escapeHtml(finding.actionability.value)}.</p>
    <details><summary>Evidence behind this finding</summary><ul>${[...finding.cause.evidence, ...finding.actionability.evidence].map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></details></li>`;
}

function indexHtml(reports: DemoReport[], range: RangeAnalysis): string {
  const cards = reports.map(({ fixture, analysis, findings }) => {
    const summary = analysis.summary;
    const teaching = fixture.dataKind === "curated-teaching";
    return `<article id="${fixture.id}">
      <p class="badge ${teaching ? "teaching" : "real"}">${teaching ? "SYNTHETIC TEACHING FIXTURE — NOT OBSERVED NETWORK ACTIVITY" : "REAL NETWORK DATA — CAPTURED DEVNET FIXTURE"}</p>
      <h2>${demoIcon(fixture.id)}${escapeHtml(fixture.title)}</h2><p>${escapeHtml(fixture.description)}</p>
      <p class="muted">${teaching ? "Teaching slot identifier" : "Captured slot"}: ${analysis.context.slot} · Provenance: ${escapeHtml(analysis.provenance.dataKind)} / ${escapeHtml(analysis.provenance.cluster)}${!teaching && analysis.provenance.retrievedAt ? ` · Retrieved ${escapeHtml(analysis.provenance.retrievedAt)}` : ""}</p>
      <dl><div><dt>Transactions</dt><dd>${summary.transactionCount}</dd></div><div><dt>Declared conflict pairs</dt><dd>${summary.conflictEdgeCount}</dd></div><div><dt>Cross-payer shared-account pairs</dt><dd>${summary.crossPayerSharedAccountConflictEdgeCount}</dd></div><div><dt>Estimated execution waves</dt><dd>${summary.waveCount}</dd></div></dl>
      <p class="muted">Full-block wave bounds: ${analysis.blockWaveBounds.cliqueLowerBound}–${analysis.blockWaveBounds.generatedWaveUpperBound}. Known Compute Units coverage: ${summary.knownComputeUnitTransactionCount}/${summary.transactionCount} transactions. Compute Units measure work, not elapsed time.</p>
      <h3>What the analyzer found</h3><ul class="findings">${findings.map(findingHtml).join("")}</ul>
      <p class="links"><a href="${fixture.id}/report.html">${demoIcon(fixture.id)}Open interactive report</a><a href="${fixture.id}/analysis.json">View analysis JSON</a></p>
      <p class="muted source">Shipped input: <code>fixtures/${escapeHtml(fixture.filename)}</code></p>
    </article>`;
  }).join("\n");
  const rangeCard = `<article id="multi-block-upload"><p class="badge real">REAL NETWORK DATA — CAPTURED DEVNET FIXTURES</p><h2><span aria-hidden="true" style="display:inline-block;margin-right:.4em">🧵</span>Real devnet: upload across nine blocks</h2><p>Follow decoded payload chunks across slots. Inspect byte coverage, gaps, overlaps, transaction outcomes, and exact instruction evidence. Byte coverage does not establish final buffer contents or a complete upload lifecycle.</p><p class="muted">Captured slots: ${range.provenance.requestedStartSlot}–${range.provenance.requestedEndSlot}</p><dl><div><dt>Observed blocks</dt><dd>${range.provenance.observedSlots.length}</dd></div><div><dt>Decoded chunks</dt><dd>${range.crossBlockSequences.reduce((sum, sequence) => sum + sequence.observedChunkCount, 0)}</dd></div><div><dt>Upload sequences</dt><dd>${range.crossBlockSequences.length}</dd></div></dl><p class="links"><a href="multi-block-upload/range-report.html"><span aria-hidden="true" style="display:inline-block;margin-right:.4em">🧵</span>Open multi-block report</a><a href="multi-block-upload/range-analysis.json">View range analysis JSON</a></p><p class="muted source">Shipped inputs: <code>fixtures/loader-range/</code></p></article>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Solana Conflict Microscope — offline demo</title>
<style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#07101d;color:#e7edf7;line-height:1.55}*{box-sizing:border-box}body{max-width:1100px;margin:auto;padding:28px 20px;overflow-wrap:anywhere}h1{line-height:1.15;font-size:clamp(2rem,5vw,3.25rem);margin:12px 0}h2{margin-top:8px;line-height:1.25}h3{font-size:1rem}.eyebrow{color:#67e8c3;letter-spacing:.1em;font-size:.8rem;font-weight:700}.lead{font-size:1.15rem;max-width:850px}article,.guide{background:#101c2e;border:1px solid #293d58;border-radius:14px;padding:24px;margin:24px 0}.guide{border-color:#42658e}.muted{color:#aabbce;font-size:.9rem}.badge{font-weight:750;font-size:.75rem;letter-spacing:.025em}.real{color:#67e8c3}.teaching{background:#ffcc4d;color:#211600;border-radius:6px;padding:10px}dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:24px 0}dl div{padding:12px;background:#07101d;border-radius:8px}dt{font-size:.85rem;color:#aabbce}dd{font-size:1.75rem;font-weight:750;margin:6px 0 0;color:#67e8c3}.findings{padding-left:22px}.findings>li{margin:16px 0}li p{margin:8px 0}details{background:#091525;padding:10px;border-radius:8px}summary{cursor:pointer}a{color:#8ed8ff;text-underline-offset:.2em}a:focus-visible,summary:focus-visible{outline:3px solid #ffcc4d;outline-offset:4px}.links{display:flex;flex-wrap:wrap;gap:12px 24px}.links a{padding:8px 0;font-weight:650}code{font-size:.9rem}.source{margin-bottom:0}@media(max-width:680px){dl{grid-template-columns:repeat(2,minmax(0,1fr))}article,.guide{padding:18px}body{padding:18px 12px}}
.quick-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0}.quick-links a{display:flex;align-items:center;min-height:44px;padding:10px 14px;border:1px solid #42658e;border-radius:8px;background:#122b40;font-size:.9rem;font-weight:700;text-decoration:none}.quick-links a:hover{background:#193c54}.quick-links .synthetic{border-color:#b79443;color:#ffda7b}.skip-link{position:absolute;top:8px;left:12px;z-index:100;transform:translateY(-200%);padding:10px 14px;background:#ffcc4d;color:#211600;border-radius:6px;font-weight:700}.skip-link:focus{transform:translateY(0)}@media(max-width:680px){.quick-links{grid-template-columns:1fr;gap:8px}.quick-links a{padding:8px 12px}}
</style></head><body>
<a class="skip-link" href="#report-examples">Skip to example findings</a>
<header><p class="eyebrow">SOLANA CONFLICT MICROSCOPE · OFFLINE DEMO</p><h1>See which declared accounts connect transactions.</h1>
<p class="lead">Explore declared account contention, potential parallelism, and estimated execution waves using the fixtures shipped with this project.</p>
<nav class="quick-links" aria-label="Open a demo report"><a href="real-loader/report.html"><span aria-hidden="true" style="display:inline-block;margin-right:.4em">📤</span>Open real upload</a><a href="real-funding/report.html"><span aria-hidden="true" style="display:inline-block;margin-right:.4em">🤝</span>Open cross-payer funding</a><a class="synthetic" href="synthetic-teaching/report.html"><span aria-hidden="true" style="display:inline-block;margin-right:.4em">🧪</span>Open synthetic teaching</a><a href="multi-block-upload/range-report.html"><span aria-hidden="true" style="display:inline-block;margin-right:.4em">🧵</span>Open multi-block upload</a><a href="comparison/comparison.html"><span aria-hidden="true" style="display:inline-block;margin-right:.4em">⚖️</span>Compare captured blocks</a></nav>
<p>These reports are generated locally from saved inputs. No RPC connection, wallet, research cache, or local web server is needed.</p></header>
<section class="guide"><h2>Start with the evidence</h2><ol><li>Open a report and select a notable finding.</li><li>Follow its shared accounts to the participating transactions and decoded evidence.</li><li>Compare the component with the full-block wave context before interpreting a counterfactual.</li></ol>
<p>Waves are conflict-free analytical groupings, not a reconstruction of a validator's exact private schedule. Matching wave bounds establish a minimum only within this declared-lock model; they do not measure runtime, speedup, or profitability.</p>
<p>Semantic counterfactuals are hypothetical finer-grained execution rules. A safe redesign requires additional program and state evidence. The real captures are devnet examples, not a representative mainnet sample.</p></section>
<main id="report-examples" tabindex="-1">${cards}${rangeCard}<article id="comparison"><h2><span aria-hidden="true" style="display:inline-block;margin-right:.4em">⚖️</span>Compare two captured blocks</h2><p>Compare the upload and funding examples side by side: transaction outcomes, declared conflict pairs, connected components, wave bounds, and recorded compute. These are different workloads, so their differences do not establish a performance improvement.</p><p class="links"><a href="comparison/comparison.html"><span aria-hidden="true" style="display:inline-block;margin-right:.4em">⚖️</span>Open block comparison</a><a href="comparison/comparison.json">View comparison JSON</a></p></article></main>
<footer class="muted"><p>All displayed counts and findings come from this run of the analyzer. Open the JSON beside each report to inspect its provenance, methodology, and full evidence.</p></footer>
</body></html>\n`;
}

const demoIcon = (id: string): string => {
  const symbol: Record<string, string> = { "real-loader": "📤", "real-funding": "🤝", "synthetic-teaching": "🧪", "multi-block-upload": "🧵", comparison: "⚖️" };
  return '<span aria-hidden="true" style="display:inline-block;margin-right:.4em">' + (symbol[id] ?? "") + "</span>";
};

async function addDemoNavigation(reportPath: string, exampleId: string): Promise<void> {
  const html = await readFile(reportPath, "utf8");
  if (!html.includes("<body>")) throw new Error("Demo report is missing its body element.");
  const navigation = '<nav aria-label="Demo navigation" style="margin:12px 0"><a href="../index.html#' + escapeHtml(exampleId) + '" style="display:inline-flex;align-items:center;min-height:44px;padding:8px 14px;border:1px solid #42658e;border-radius:8px;color:#8ed8ff;background:#122b40"><span aria-hidden="true" style="display:inline-block;margin-right:.4em">🏠</span>Back to demo</a></nav>';
  await writeFile(reportPath, html.replace("<body>", "<body>" + navigation).replace("<h1>", "<h1>" + (exampleId === "comparison" ? "" : demoIcon(exampleId))), "utf8");
}

/** Replays only versioned fixtures; this entry point never reads the research cache or uses RPC. */
export async function runDemo(options: { repositoryRoot?: string; outputDir?: string } = {}): Promise<DemoResult> {
  const root = resolve(options.repositoryRoot ?? fileURLToPath(new URL("../", import.meta.url)));
  const outputDir = resolve(root, options.outputDir ?? "output/demo");
  // Validate and analyze every example before writing, so a mislabeled input cannot produce a fresh demo index.
  const examples = await Promise.all(DEMO_FIXTURES.map((fixture) => loadExample(root, fixture)));
  const acquired = await acquireRange({ startSlot: 488638500, endSlot: 488638508, cacheDir: join(root, "fixtures", "loader-range"), rpcUrl: "http://127.0.0.1:1", offline: true, fetchMissing: false });
  if (acquired.slots.some(slot => slot.status !== "observed")) throw new Error("Demo range requires all nine shipped blocks; missing or invalid evidence cannot produce a complete example.");
  if (acquired.slots.some(slot => slot.analysis?.provenance.dataKind !== "real-network" || slot.analysis.provenance.cluster !== "devnet")) throw new Error("Demo range requires real-network / devnet provenance; refusing to mislabel this example.");
  const rangeAnalysis = analyzeRange(acquired);
  if (!rangeAnalysis.crossBlockSequences.length) throw new Error("Demo range contains no decoded upload sequence.");
  const reports: DemoReport[] = [];
  for (const example of examples) {
    const directory = join(outputDir, example.fixture.id);
    await writeReports(example.analysis, directory);
    await addDemoNavigation(join(directory, "report.html"), example.fixture.id);
    reports.push({ ...example, reportPath: join(directory, "report.html"), analysisPath: join(directory, "analysis.json") });
  }
  const rangeDirectory = join(outputDir, "multi-block-upload");
  await writeRangeReports(rangeAnalysis, rangeDirectory);
  await addDemoNavigation(join(rangeDirectory, "range-report.html"), "multi-block-upload");
  const rangeReport = { analysis: rangeAnalysis, reportPath: join(rangeDirectory, "range-report.html"), analysisPath: join(rangeDirectory, "range-analysis.json") };
  const left = reports.find(report => report.fixture.id === "real-loader")!;
  const right = reports.find(report => report.fixture.id === "real-funding")!;
  const comparison = compareAnalyses(left.analysis, right.analysis);
  const fileIdentity = async (report: DemoReport) => ({ name: report.fixture.id + "/analysis.json", sha256: createHash("sha256").update(await readFile(report.analysisPath)).digest("hex") });
  comparison.files = { left: await fileIdentity(left), right: await fileIdentity(right) };
  const comparisonDir = join(outputDir, "comparison");
  await mkdir(comparisonDir, { recursive: true });
  await writeFile(join(comparisonDir, "comparison.json"), JSON.stringify(comparison, null, 2) + "\n", "utf8");
  await writeFile(join(comparisonDir, "comparison.html"), comparisonHtml(comparison), "utf8");
  await addDemoNavigation(join(comparisonDir, "comparison.html"), "comparison");
  const indexPath = join(outputDir, "index.html");
  await mkdir(outputDir, { recursive: true });
  await writeFile(indexPath, indexHtml(reports, rangeAnalysis), "utf8");
  return { indexPath, reports, rangeReport };
}
