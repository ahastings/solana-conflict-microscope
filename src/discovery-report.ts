import type { ArtifactBudgets, DiscoveryCandidate, DiscoveryIndex } from "./discovery-types.js";

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const bytes = (value: string): number => Buffer.byteLength(value, "utf8");

export function serializeDiscoveryIndex(index: DiscoveryIndex): string {
  return JSON.stringify(index, null, 2) + "\n";
}

export function discoverySectionSizes(index: DiscoveryIndex): Record<string, number> {
  return {
    methodology: bytes(JSON.stringify(index.methodology)),
    coverage: bytes(JSON.stringify(index.coverage)),
    candidates: bytes(JSON.stringify(index.candidates)),
    highPriorityCandidateIds: bytes(JSON.stringify(index.highPriorityCandidateIds)),
    infrastructureCandidateIds: bytes(JSON.stringify(index.infrastructureCandidateIds)),
  };
}

export function enforceDiscoveryBudgets(indexJson: string, html: string, index: DiscoveryIndex, budgets: ArtifactBudgets): void {
  const jsonBytes = bytes(indexJson), htmlBytes = bytes(html);
  if (jsonBytes <= budgets.jsonBudgetBytes && htmlBytes <= budgets.htmlBudgetBytes) return;
  const sections = Object.entries(discoverySectionSizes(index)).map(([name, size]) => `${name}=${size}`).join(", ");
  throw new Error(`Discovery artifact size budget exceeded: discovery-index.json=${jsonBytes}/${budgets.jsonBudgetBytes} bytes, discovery-report.html=${htmlBytes}/${budgets.htmlBudgetBytes} bytes; section sizes: ${sections}`);
}

const linkFor = (candidate: DiscoveryCandidate): string | null => candidate.materialization?.status === "materialized" && candidate.materialization.reportPath
  ? candidate.materialization.reportPath.replaceAll("\\", "/")
  : null;

export function discoveryHtmlReport(index: DiscoveryIndex): string {
  const coverage = index.coverage;
  const embedded = JSON.stringify(index.candidates).replaceAll("<", "\\u003c");
  const initialHighPriority = index.highPriorityCandidateIds.length === 0
    ? "<p id=\"negativeState\" class=\"negative\">No high-priority unfamiliar candidate was found.</p>"
    : "<div id=\"highPriorityList\"></div>";
  const materialized = new Map(index.candidates.map((candidate) => [candidate.candidateId, linkFor(candidate)]));
  const initialLinks = JSON.stringify(Object.fromEntries(materialized)).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contention candidate discovery</title><style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#07101d;color:#e8eef7}*{box-sizing:border-box;min-width:0}body{margin:0 auto;max-width:1500px;padding:24px;overflow-wrap:anywhere}h1{margin-bottom:4px}.muted{color:#9fb0c5}.summary,.filters,section{background:#101c2e;border:1px solid #2b405d;border-radius:12px;padding:16px;margin:16px 0}.coverage{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.metric{background:#0a1728;border-radius:8px;padding:10px}.metric strong{display:block;color:#67e8c3;font-size:22px}.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end}.filters label{display:flex;flex-direction:column;gap:4px}.filters .check{flex-direction:row;align-items:center}input{width:100%;background:#07101d;color:#e8eef7;border:1px solid #47617f;border-radius:7px;padding:8px}.candidate{background:#0a1728;border-left:4px solid #67e8c3;border-radius:8px;padding:12px;margin:10px 0}.candidate.infrastructure{border-color:#b8a4ff}.candidate h3{margin:0 0 6px}.tag{display:inline-block;border:1px solid #47617f;border-radius:99px;padding:3px 8px;margin:2px;font-size:12px}.reason{color:#67e8c3}.negative{border:1px dashed #f3ca70;color:#f3ca70;border-radius:8px;padding:16px}a{color:#79c9ff}code{white-space:normal;word-break:break-all}@media(max-width:520px){body{padding:10px}.summary,.filters,section{padding:12px}.coverage{grid-template-columns:1fr 1fr}}
</style></head><body><h1>Candidate Hunt</h1><p class="muted">Compact Stage A discovery index; full transactions, edges, atoms, waves, and supported semantic models live only in separately materialized Stage B reports.</p><div class="summary"><h2>Scan coverage</h2><div class="coverage">${[["Requested",coverage.requested],["Observed",coverage.observed],["Unavailable",coverage.unavailable],["Failed",coverage.failed],["Missing",coverage.missing],["Skipped",coverage.skipped],["Retry attempts",coverage.retryAttempts]].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div><p class="muted">Declared account contention and estimated execution-wave bounds only. This report does not reconstruct a validator's private schedule.</p></div><div class="filters"><label class="check"><input id="cross" type="checkbox"> Cross-payer only</label><label class="check"><input id="recurrence" type="checkbox"> Recurring only</label><label>Program contains<input id="program" type="search" placeholder="program ID"></label><label>Role contains<input id="role" type="search" placeholder="decoded role"></label><label>Minimum depth<input id="depth" type="number" min="0" value="0"></label><label>Minimum known-compute share<input id="compute" type="number" min="0" max="1" step="0.05" value="0"></label></div><section><h2>High-priority unfamiliar candidates</h2>${initialHighPriority}</section><section><h2>Infrastructure and intentional-pattern buckets</h2><p class="muted">Retained for audit and context; bucket membership is not a claim that contention is unimportant or avoidable.</p><div id="infrastructureList"></div></section><script>
const candidates=${embedded},links=${initialLinks},high=document.getElementById('highPriorityList'),infra=document.getElementById('infrastructureList'),negative=document.getElementById('negativeState'),esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),pct=value=>value==null?'unknown':(value*100).toFixed(1)+'%',card=c=>'<article class="candidate '+(c.infrastructureClassification?'infrastructure':'')+'"><h3>'+esc(c.candidateId)+' &middot; tier '+c.priorityTier+'</h3><p><strong>'+c.transactionCount+' tx &middot; '+c.uniqueConflictPairCount+' pairs &middot; depth '+c.componentWaveLowerBound+'-'+c.componentWaveUpperBound+'</strong></p><p>'+c.selectionReasons.map(r=>'<span class="tag reason">'+esc(r)+'</span>').join('')+'</p><p>'+c.decodedAccountRoles.map(r=>'<span class="tag">role: '+esc(r)+'</span>').join('')+c.invokedProgramIds.map(p=>'<span class="tag">program: '+esc(p)+'</span>').join('')+'</p><p class="muted">'+(c.crossPayerParticipation?'cross-payer':'same-payer')+' &middot; recurrence '+c.recurrenceBlockCount+' &middot; known compute '+pct(c.knownComputeUnitShare)+' at '+pct(c.knownComputeCoverage)+' coverage'+(c.infrastructureClassification?' &middot; '+esc(c.infrastructureClassification):'')+'</p>'+(links[c.candidateId]?'<a href="'+esc(links[c.candidateId])+'">Open materialized candidate report</a>':'<span class="muted">No materialized detail report is available.</span>')+'</article>',matches=c=>(!cross.checked||c.crossPayerParticipation)&&(!recurrence.checked||c.recurrenceBlockCount>1)&&(!program.value||c.invokedProgramIds.some(v=>v.toLowerCase().includes(program.value.toLowerCase())))&&(!role.value||c.decodedAccountRoles.some(v=>v.toLowerCase().includes(role.value.toLowerCase())))&&c.componentWaveUpperBound>=Number(depth.value||0)&&(c.knownComputeUnitShare??0)>=Number(compute.value||0);function render(){const visible=candidates.filter(matches),unfamiliar=visible.filter(c=>!c.infrastructureClassification&&c.priorityTier<=2),infrastructure=visible.filter(c=>c.infrastructureClassification);if(high)high.innerHTML=unfamiliar.length?unfamiliar.map(card).join(''):'<p class="negative">No high-priority unfamiliar candidate matches the current filters.</p>';else if(negative)negative.style.display=unfamiliar.length?'none':'block';infra.innerHTML=infrastructure.length?infrastructure.map(card).join(''):'<p class="negative">No infrastructure candidate matches the current filters.</p>'}document.querySelectorAll('input').forEach(input=>input.addEventListener('input',render));render();
</script></body></html>`;
}

export function candidateResearchQueue(index: DiscoveryIndex, limit = 20): string {
  const candidates = index.candidates.filter((candidate) => candidate.infrastructureClassification === null).slice(0, limit);
  const header = `# Candidate research queue\n\nGenerated from the Milestone 1.8 compact discovery index. These are research leads, not redesign or actionability claims.\n\n`;
  if (candidates.length === 0) return `${header}No high-priority unfamiliar candidate was found in the observed sample. Preserve this truthful negative result; no teaching candidate was substituted.\n`;
  return header + candidates.map((candidate, indexValue) => `## ${indexValue + 1}. ${candidate.candidateId}\n\n- Selected because: ${candidate.selectionReasons.join("; ") || "deterministic contextual ranking"}.\n- Current data proves: ${candidate.transactionCount} transactions in representative slot ${candidate.representativeSlot} have ${candidate.uniqueConflictPairCount} declared conflict pairs over shared writable account evidence; component wave bounds are ${candidate.componentWaveLowerBound}-${candidate.componentWaveUpperBound}.\n- Remains unknown: the state-transition meaning and whether participating operations are logically independent.\n- Semantic research target: ${candidate.decodedAccountRoles.join(", ") || candidate.nonFeePayerSharedWritableAccounts.join(", ") || "unknown shared-account role"}.\n- Primary source needed next: the owning program's interface definition and primary program source for the exact instruction/account relationship.\n- Actionability: insufficient evidence until logical independence, verified state-transition semantics, and a concrete alternative state layout or execution rule are established.\n`).join("\n");
}

export function discoveryTerminalSummary(index: DiscoveryIndex): string {
  const unfamiliar = index.candidates.filter((candidate) => candidate.infrastructureClassification === null && candidate.priorityTier <= 2).length;
  const materialized = index.candidates.filter((candidate) => candidate.materialization?.status === "materialized").length;
  return `Discovery ${index.schemaVersion}: ${index.coverage.observed}/${index.coverage.requested} slots observed; ${index.coverage.unavailable} unavailable, ${index.coverage.failed} failed, ${index.coverage.missing} missing, ${index.coverage.skipped} skipped.\nCandidates: ${index.candidateCount}; high-priority unfamiliar: ${unfamiliar}; materialized: ${materialized}.`;
}
