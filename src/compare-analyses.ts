import { verifyDeclaredAnalysis } from "./verify-analysis.js";

type Certificate = ReturnType<typeof verifyDeclaredAnalysis>;
interface Side {
  slot: number;
  blockhash: string;
  cluster: string;
  dataKind: string;
  certificate: Certificate;
  success: number;
  failed: number;
  unknown: number;
  maximumWaveWidth: number;
}
export interface ComparisonMetric {
  key: string;
  label: string;
  left: number | null;
  right: number | null;
  delta: number | null;
  note: string;
}
export interface AnalysisComparison {
  scope: "descriptive-comparison-of-verified-declared-block-evidence";
  left: Side;
  right: Side;
  metrics: ComparisonMetric[];
  notices: string[];
  files?: { left: { name: string; sha256: string }; right: { name: string; sha256: string } };
}
function side(value: unknown, label: string): Side {
  try {
    const certificate = verifyDeclaredAnalysis(value);
    const input = value as { context?: { slot?: unknown; blockhash?: unknown }; provenance?: { cluster?: unknown; dataKind?: unknown }; summary: { successCount: number; failureCount: number; unknownStatusCount: number; maximumWaveWidth: number } };
    const context = input.context;
    if (!context || typeof context.slot !== "number" || !Number.isSafeInteger(context.slot) || context.slot < 0 || typeof context.blockhash !== "string" || !context.blockhash.trim()) throw new Error("comparison requires a non-negative safe-integer slot and nonblank blockhash");
    const labelOrUnknown = (value: unknown): string => typeof value === "string" && value.trim() ? value : "unknown";
    return { slot: context.slot, blockhash: context.blockhash, cluster: labelOrUnknown(input.provenance?.cluster), dataKind: labelOrUnknown(input.provenance?.dataKind), certificate, success: input.summary.successCount, failed: input.summary.failureCount, unknown: input.summary.unknownStatusCount, maximumWaveWidth: input.summary.maximumWaveWidth };
  } catch (error) { throw new Error(label + " analysis: " + (error instanceof Error ? error.message : String(error))); }
}

/** Compare observations, without inferring causal improvements or matching workloads. */
export function compareAnalyses(leftValue: unknown, rightValue: unknown): AnalysisComparison {
  const left = side(leftValue, "Left"), right = side(rightValue, "Right");
  const metrics: ComparisonMetric[] = [];
  const add = (key: string, label: string, a: number | null, b: number | null, note = "", comparable = true): void => {
    metrics.push({ key, label, left: a, right: b, delta: comparable && a !== null && b !== null ? b - a : null, note });
  };
  const a = left.certificate, b = right.certificate;
  add("transactions", "Transactions", a.transactions, b.transactions);
  add("success", "Recorded successful outcomes", left.success, right.success);
  add("failed", "Recorded failed outcomes", left.failed, right.failed);
  add("unknownStatus", "Unknown outcomes", left.unknown, right.unknown);
  add("conflictPairs", "Declared conflict pairs", a.conflictPairs, b.conflictPairs);
  add("components", "Connected components", a.connectedComponentCount, b.connectedComponentCount, "Includes isolated transactions; this is not a wave count.");
  add("lowerBound", "Clique lower bound", a.lowerBound, b.lowerBound);
  add("upperBound", "Generated wave upper bound", a.upperBound, b.upperBound, "Analytical grouping, not execution time.");
  add("provenMinimum", "Proven minimum waves", a.provenMinimumWaveCount, b.provenMinimumWaveCount, "Unresolved when lower and upper bounds do not match.");
  add("maximumWaveWidth", "Widest generated wave", left.maximumWaveWidth, right.maximumWaveWidth);
  add("knownComputeTransactions", "Transactions with recorded CU", a.computeEvidence.knownTransactionCount, b.computeEvidence.knownTransactionCount);
  add("unknownComputeTransactions", "Transactions with unknown CU", a.computeEvidence.unknownTransactionCount, b.computeEvidence.unknownTransactionCount);
  const completeCompute = a.computeEvidence.unknownTransactionCount === 0 && b.computeEvidence.unknownTransactionCount === 0;
  add("compute", "Known compute subtotal (CU)", a.computeEvidence.totalKnownComputeUnits, b.computeEvidence.totalKnownComputeUnits, completeCompute ? "Both inputs have complete compute coverage. CU is not elapsed time." : "Delta unavailable: at least one input has missing compute. Subtotals are not full-block totals.", completeCompute);
  const notices = ["Differences are right minus left. These are separate supplied observations, not a controlled before/after experiment or proof of a speedup.", "Verification checks internal declared-lock consistency. It does not authenticate provenance, certify semantic explanations or counterfactual safety, or reconstruct validator execution."];
  if (left.cluster !== right.cluster || left.dataKind !== right.dataKind) notices.push("The inputs have different supplied cluster or data-kind labels. Interpret them separately; those labels are not independently authenticated.");
  if (left.slot === right.slot && left.blockhash === right.blockhash) notices.push("Both inputs declare the same slot and blockhash. They are not necessarily byte-identical; compare their file hashes.");
  return { scope: "descriptive-comparison-of-verified-declared-block-evidence", left, right, metrics, notices };
}
const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
export function comparisonHtml(comparison: AnalysisComparison): string {
  const display = (value: number | null): string => value === null ? "Unavailable" : value.toLocaleString("en-US");
  const identity = (label: "left" | "right"): string => {
    const value = comparison[label], file = comparison.files?.[label];
    return `<section><h2>${label === "left" ? "Left" : "Right"} block</h2><p>Slot <strong>${value.slot}</strong> · ${escapeHtml(value.cluster)} · ${escapeHtml(value.dataKind)}</p><p>Blockhash: <code>${escapeHtml(value.blockhash)}</code></p>${file ? `<p>File: ${escapeHtml(file.name)}</p><p>SHA-256: <code>${escapeHtml(file.sha256)}</code></p>` : ""}</section>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Solana block evidence comparison</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#07101d;color:#e7edf7;line-height:1.5}*{box-sizing:border-box;min-width:0}body{max-width:1200px;margin:auto;padding:24px;overflow-wrap:anywhere}h1{line-height:1.15}.identities{display:grid;grid-template-columns:1fr 1fr;gap:14px}section,.table-wrap,details{background:#101c2e;border:1px solid #385270;border-radius:10px;padding:16px;margin:16px 0}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:680px}th,td{padding:12px;text-align:left;border-bottom:1px solid #385270;vertical-align:top}thead th{color:#67e8c3}tbody td:not(:last-child){white-space:nowrap;font-variant-numeric:tabular-nums}td:last-child{max-width:340px}caption{text-align:left;font-weight:700;margin-bottom:12px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}:focus-visible{outline:3px solid #ffcc4d;outline-offset:3px}@media(max-width:640px){body{padding:12px}.identities{grid-template-columns:1fr}}
</style></head><body><h1><span aria-hidden="true" style="display:inline-block;margin-right:.4em">⚖️</span>Compare declared block evidence</h1><p>Two independently checked saved analyses. No RPC connection or server is needed to read this report.</p><ul>${comparison.notices.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul><div class="identities">${identity("left")}${identity("right")}</div><p>On narrow screens, focus the table and use arrow keys to scroll. Unavailable deltas are not zero.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Block metric comparison"><table><caption>Descriptive differences: right minus left</caption><thead><tr><th scope="col">Metric</th><th scope="col">Left</th><th scope="col">Right</th><th scope="col">Difference</th><th scope="col">Interpretation</th></tr></thead><tbody>${comparison.metrics.map(metric => `<tr><th scope="row">${escapeHtml(metric.label)}</th><td>${display(metric.left)}</td><td>${display(metric.right)}</td><td>${metric.delta !== null && metric.delta > 0 ? "+" : ""}${display(metric.delta)}</td><td>${escapeHtml(metric.note)}</td></tr>`).join("")}</tbody></table></div><details><summary>Independent verification certificates</summary><pre>${escapeHtml(JSON.stringify({ left: comparison.left.certificate, right: comparison.right.certificate }, null, 2))}</pre></details></body></html>`;
}
