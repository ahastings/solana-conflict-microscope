import type {
  ProgramFamilyMap,
  SourceabilityIndex,
  VelocityAccountSnapshotArtifact,
  VelocityDossier,
  VelocityInstructionLayout,
  VelocitySignerMessageSummary,
  VelocitySourceManifest,
} from "./milestone20-types.js";

const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]!);
const list = (values: string[]): string => values.map((value) => `<li>${escapeHtml(value)}</li>`).join("");
const codeList = (values: string[]): string => values.map((value) => `<code>${escapeHtml(value)}</code>`).join("<br>");

const sharedCss = `
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#e8eef8;line-height:1.5}
*{box-sizing:border-box;min-width:0}body{margin:0 auto;max-width:1480px;padding:24px;overflow-wrap:anywhere}
header,section{background:#101d30;border:1px solid #2b4262;border-radius:14px;padding:18px;margin:16px 0}
h1{font-size:clamp(1.75rem,5vw,3.1rem);line-height:1.06;margin:.2rem 0}h2{margin-top:0}
.eyebrow{color:#75e6c1;text-transform:uppercase;letter-spacing:.12em;font-weight:750}.muted{color:#a7b8cd}
.decision{border-left:6px solid #f2c86e}.gate{border-left:6px solid #f28a8a}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.metric{background:#081527;border-radius:10px;padding:12px}.metric strong{display:block;color:#75e6c1;font-size:1.55rem}
.table-wrap{max-width:100%;overflow-x:auto;border:1px solid #2b4262;border-radius:10px}
table{border-collapse:collapse;width:100%;min-width:760px}th,td{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #263b58}
th{color:#75e6c1;background:#0a1729;position:sticky;top:0}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.86em;word-break:break-all}
.tag{display:inline-block;padding:4px 9px;border:1px solid #496586;border-radius:999px;margin:2px}
.ladder{display:grid;gap:9px}.rung{display:grid;grid-template-columns:minmax(170px,260px) 1fr;gap:12px;background:#09172a;border-radius:9px;padding:11px}
.warn{background:#2b1f22;border:1px solid #87535b;border-radius:9px;padding:12px}.ok{color:#75e6c1}.paths a{display:block;color:#7ecbff}
@media(max-width:520px){body{padding:10px}header,section{padding:13px}.metrics{grid-template-columns:1fr 1fr}.rung{grid-template-columns:1fr}table{min-width:680px}}
`;

export function milestone20SourceabilityHtml(index: SourceabilityIndex, familyMap: ProgramFamilyMap): string {
  const familyRows = familyMap.families.map((family) => `<tr>
<td>${family.researchPriority}</td><td><strong>${escapeHtml(family.label)}</strong><br><code>${escapeHtml(family.familyId)}</code></td>
<td>${codeList(family.identifyingProgramIds)}</td><td>${escapeHtml(family.sourceabilityOutcome)}</td>
<td>${escapeHtml(family.versionDeploymentCorrespondence)}</td><td>${family.discoveryRanks.join(", ")}</td>
<td>${escapeHtml(family.researchPriorityReasons.join(" "))}</td></tr>`).join("");
  const candidateRows = index.candidates.map((candidate) => `<tr>
<td>${candidate.discoveryRank}</td><td><code>${escapeHtml(candidate.candidateId)}</code><br>${escapeHtml(candidate.disposition)}</td>
<td><code>${escapeHtml(candidate.programFamilyId)}</code></td><td>${candidate.recurrenceCount}</td><td>${candidate.payerCount}</td>
<td>${candidate.depth.lowerBound}-${candidate.depth.upperBound}</td><td>${candidate.knownComputeContext.qualifiedShare ?? "unknown"} / ${candidate.knownComputeContext.coverage}</td>
<td>${candidate.sharedWritableAccountCount}</td><td>${escapeHtml(candidate.sourceabilityOutcome)}</td><td>${candidate.researchPriority}</td></tr>`).join("");
  const ladder = index.evidenceLadder.map((item) => `<div class="rung"><strong>${escapeHtml(item.state)}</strong><span>${escapeHtml(item.meaning)}</span></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Milestone 2.0 sourceability triage</title><style>${sharedCss}</style></head><body>
<header><div class="eyebrow">Milestone 2.0 · Research priority</div><h1>Sourceability triage</h1><p>${escapeHtml(index.purpose)}</p><p class="muted">Analytical and educational evidence only. Discovery rank remains unchanged.</p></header>
<section><h2>Coverage</h2><div class="metrics"><div class="metric"><span>High-priority leads</span><strong>${index.coverage.candidateCount}</strong></div><div class="metric"><span>Program families</span><strong>${index.coverage.familyCount}</strong></div><div class="metric"><span>Mapped once</span><strong>yes</strong></div></div></section>
<section><h2>Evidence ladder</h2><div class="ladder">${ladder}</div></section>
<section><h2>Program-family research order</h2><div class="table-wrap"><table><thead><tr><th>Priority</th><th>Family</th><th>Identifying IDs</th><th>Sourceability</th><th>Deployment correspondence</th><th>Discovery ranks</th><th>Reasons</th></tr></thead><tbody>${familyRows}</tbody></table></div></section>
<section><h2>Candidate #2: deferred, not rejected</h2><ul>${list(index.candidateTwoFinding.preservedFacts)}</ul><p class="warn">The bounded triage found no exact authoritative mutation-level source path. This is a sourceability limitation, not a demotion of contention significance.</p></section>
<section><h2>All 19 candidates</h2><div class="table-wrap"><table><thead><tr><th>Discovery rank</th><th>Candidate</th><th>Family</th><th>Blocks</th><th>Payers</th><th>Depth</th><th>Compute share / coverage</th><th>Shared writable</th><th>State</th><th>Research priority</th></tr></thead><tbody>${candidateRows}</tbody></table></div></section>
<section class="gate"><h2>Interpretation boundary</h2><p>Sourceability answers which strong lead currently has enough public evidence for bounded semantic research. It does not replace discovery rank, prove mutation, claim redesignability, estimate throughput, or reconstruct a validator's exact private schedule.</p></section>
</body></html>`;
}

export function milestone20CandidateHtml(
  dossier: VelocityDossier,
  layout: VelocityInstructionLayout,
  signers: VelocitySignerMessageSummary,
  sources: VelocitySourceManifest,
  snapshots: VelocityAccountSnapshotArtifact,
): string {
  const timeline = dossier.recurrenceTimeline.map((item) => `<tr><td>${item.slot}</td><td>${item.componentId}</td><td>${item.transactionIndexes.join(", ")}</td><td>${item.status}</td><td>${item.payers}</td><td>${item.edges}</td><td>${item.atoms}</td><td>${item.waveBounds}</td><td>${item.knownComputeUnits}</td><td>${escapeHtml(item.deviations.join("; ") || "none")}</td></tr>`).join("");
  const instructionRows = layout.groups.map((group) => `<tr><td><strong>${escapeHtml(group.observedVariant)}</strong></td><td>${escapeHtml(group.encoding)}</td><td><code>${escapeHtml(group.discriminatorHex ?? "none")}</code></td><td>${group.byteLength}</td><td>${group.count}</td><td>${group.slots.join(", ")}</td><td>${escapeHtml(group.observedLogNames.join(", ") || "none")}</td><td>${escapeHtml(group.sourceFamilyComparison)}</td></tr>`).join("");
  const roleRows = layout.accountRoleMatrix.map((row) => `<tr><td>${escapeHtml(row.observedVariant)}</td><td>${row.position}</td><td>${row.signer ? "yes" : "no"} / ${row.writable ? "yes" : "no"}</td><td>${row.addressRecurrence.map((item) => `<code>${escapeHtml(item.address)}</code> ×${item.count}`).join("<br>")}</td><td>${escapeHtml(row.sourceConstraintName ?? "unknown")}</td><td>${escapeHtml(row.sourceFamilyRole ?? "unknown")}</td><td>${escapeHtml(row.sourceFamilyMutation ?? "none identified")}</td><td><strong>unknown</strong></td><td>${escapeHtml(row.scope)}</td></tr>`).join("");
  const sourceRows = sources.sources.map((source) => `<tr><td>${escapeHtml(source.title)}</td><td>${escapeHtml(source.classification)}</td><td><a href="${escapeHtml(source.url)}">source</a></td><td><code>${escapeHtml(source.commit ?? source.release ?? "access snapshot")}</code></td><td>${source.exactProgramIdMatch ? "yes" : "no"}</td><td><code>${source.contentSha256}</code></td><td>${escapeHtml(source.supports.join("; "))}</td></tr>`).join("");
  const snapshotsRows = snapshots.snapshots.map((snapshot) => `<tr><td><code>${escapeHtml(snapshot.address)}</code></td><td>${escapeHtml(snapshot.requestedAs)}</td><td><code>${escapeHtml(snapshot.owner ?? "missing")}</code></td><td>${snapshot.executable ?? "unknown"}</td><td>${snapshot.dataLength ?? "unknown"}</td><td><code>${escapeHtml(snapshot.rawDataSha256 ?? "none")}</code></td></tr>`).join("");
  const sharedAnswers = dossier.mutationTrace.sharedWritableAnswers.map((item) => `<article class="warn"><code>${escapeHtml(item.address)}</code><p>${escapeHtml(item.answer)}</p></article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Candidate 043c938568ad5e15 dossier</title><style>${sharedCss}</style></head><body>
<header><div class="eyebrow">Milestone 2.0 · Velocity semantic dossier</div><h1>Candidate #3 identity and bounded semantics</h1><p><code>${escapeHtml(dossier.candidateId)}</code></p><p>${escapeHtml(dossier.executiveFinding)}</p><p class="muted">Declared account contention, potential parallelism, and estimated execution waves only.</p></header>
<section class="decision"><h2>Decision: ${escapeHtml(dossier.decision)}</h2><ul>${list(dossier.decisionBasis)}</ul></section>
<section><h2>Exact recurring structure</h2><div class="metrics"><div class="metric"><span>Exact blocks</span><strong>6</strong></div><div class="metric"><span>Tx / block</span><strong>4</strong></div><div class="metric"><span>Edges / block</span><strong>6</strong></div><div class="metric"><span>Atoms / block</span><strong>15</strong></div><div class="metric"><span>Proven depth</span><strong>4</strong></div><div class="metric"><span>Compute coverage</span><strong>100%</strong></div></div><p>${dossier.exactIdentity.accounts.map((account) => `<span class="tag"><code>${escapeHtml(account)}</code></span>`).join("")}</p></section>
<section><h2>Six exact occurrences</h2><div class="table-wrap"><table><thead><tr><th>Slot</th><th>Component</th><th>Tx indexes</th><th>Status</th><th>Payers</th><th>Edges</th><th>Atoms</th><th>Bounds</th><th>Known CU</th><th>Deviation</th></tr></thead><tbody>${timeline}</tbody></table></div></section>
<section><h2>Authoritative identity</h2><p class="ok">Official Velocity documentation names <code>${escapeHtml(dossier.velocityIdentity.programId)}</code> for devnet and mainnet.</p><ul>${list(dossier.velocityIdentity.evidence)}</ul></section>
<section class="warn"><h2>Deployed source correspondence: ${escapeHtml(dossier.sourceCorrespondence.state)}</h2><p>ProgramData <code>${escapeHtml(dossier.sourceCorrespondence.programDataAddress)}</code>; current last-deploy slot ${escapeHtml(dossier.sourceCorrespondence.currentLastDeploySlot)}; executable SHA-256 <code>${escapeHtml(dossier.sourceCorrespondence.currentExecutableSha256)}</code>.</p><ul>${list(dossier.sourceCorrespondence.reasons)}</ul></section>
<section><h2>Observed instruction layout</h2><div class="table-wrap"><table><thead><tr><th>Variant</th><th>Encoding</th><th>Discriminator</th><th>Bytes</th><th>Count</th><th>Slots</th><th>Logs</th><th>Source-family comparison</th></tr></thead><tbody>${instructionRows}</tbody></table></div><p class="warn">${escapeHtml(layout.nativeVariantMismatch.interpretation)}</p></section>
<section><h2>Account-role matrix</h2><p class="muted">Every signer/writable flag is observed. Constraint names and mutations are source-family comparisons; the deployed role and mutation column remains unknown.</p><div class="table-wrap"><table><thead><tr><th>Variant</th><th>Pos</th><th>Signer / writable</th><th>Addresses</th><th>Source-family constraint</th><th>Source-family role</th><th>Source-family mutation</th><th>Deployed mutation</th><th>Scope</th></tr></thead><tbody>${roleRows}</tbody></table></div></section>
<section><h2>What causes each shared writable account?</h2>${sharedAnswers}</section>
<section><h2>Ed25519 structure</h2><div class="metrics"><div class="metric"><span>Instructions</span><strong>${signers.ed25519InstructionCount}</strong></div><div class="metric"><span>Signatures</span><strong>${signers.signatureCount}</strong></div><div class="metric"><span>Local checks pass</span><strong>${signers.localVerificationPassCount}</strong></div><div class="metric"><span>Cross-ix refs</span><strong>${signers.crossInstructionReferenceCount}</strong></div><div class="metric"><span>Signers</span><strong>${signers.distinctSignerCount}</strong></div><div class="metric"><span>Messages</span><strong>${signers.distinctMessageCount}</strong></div></div><p>${escapeHtml(signers.interpretation)}</p></section>
<section><h2>Source-family mutation trace</h2><ul>${list(dossier.mutationTrace.sourceFamilyOnlyFindings)}</ul><p class="warn">Exact deployed mutation established: no.</p></section>
<section class="gate"><h2>Semantic independence: cannot be established</h2><ul>${list(dossier.semanticIndependence.reasons)}</ul><h3>Non-claims</h3><ul>${list(dossier.semanticIndependence.nonClaims)}</ul></section>
<section><h2>Current account snapshots</h2><p>${escapeHtml(snapshots.limitation)}</p><div class="table-wrap"><table><thead><tr><th>Address</th><th>Scope</th><th>Owner</th><th>Executable</th><th>Bytes</th><th>Raw SHA-256</th></tr></thead><tbody>${snapshotsRows}</tbody></table></div></section>
<section><h2>Pinned source evidence</h2><div class="table-wrap"><table><thead><tr><th>Source</th><th>Class</th><th>Link</th><th>Commit / release</th><th>Exact ID</th><th>Content SHA-256</th><th>Supports</th></tr></thead><tbody>${sourceRows}</tbody></table></div></section>
<section class="gate"><h2>Actionability gate: closed</h2><p>${escapeHtml(dossier.actionabilityGate.reason)}</p><p>No semantic decoder, semantic counterfactual, runtime redesign, scheduling claim, or throughput claim is authorized.</p></section>
<section class="paths"><h2>Compact evidence</h2><a href="candidate-dossier.json">Candidate dossier JSON</a><a href="candidate-evidence.ndjson">Six-occurrence evidence NDJSON</a><a href="instruction-layout.json">Instruction and account-role layout</a><a href="signer-message-summary.json">Signer/message summary</a><a href="account-snapshots.json">Current account snapshots</a><a href="source-manifest.json">Source manifest</a><a href="../sourceability/sourceability-index.json">Sourceability index</a></section>
</body></html>`;
}

export function milestone20CandidateMarkdown(
  dossier: VelocityDossier,
  layout: VelocityInstructionLayout,
  signers: VelocitySignerMessageSummary,
  sources: VelocitySourceManifest,
  snapshots: VelocityAccountSnapshotArtifact,
): string {
  const timeline = dossier.recurrenceTimeline.map((item) => `| ${item.slot} | ${item.componentId} | ${item.transactionIndexes.join(", ")} | ${item.status} | ${item.payers} | ${item.edges} | ${item.atoms} | ${item.waveBounds} | ${item.knownComputeUnits} | ${item.deviations.join("; ") || "none"} |`).join("\n");
  const instructions = layout.groups.map((group) => `| ${group.observedVariant} | ${group.encoding} | \`${group.discriminatorHex ?? "none"}\` | ${group.byteLength} | ${group.count} | ${group.sourceFamilyVariant ?? "none"} | ${group.sourceFamilyComparison} |`).join("\n");
  const roles = layout.accountRoleMatrix.map((row) => `| ${row.observedVariant} | ${row.position} | ${row.signer} / ${row.writable} | ${row.sourceConstraintName ?? "unknown"} | ${row.sourceFamilyRole ?? "unknown"} | ${row.sourceFamilyMutation ?? "none"} | unknown | ${row.scope} |`).join("\n");
  const sourceList = sources.sources.map((source) => `- [${source.title}](${source.url}) — ${source.classification}; ${source.commit ? `commit \`${source.commit}\`` : source.release ?? "access snapshot"}; exact-ID match ${source.exactProgramIdMatch}; content SHA-256 \`${source.contentSha256}\`; supports: ${source.supports.join("; ")}; does not support: ${source.doesNotSupport.join("; ")}.`).join("\n");
  const snapshotList = snapshots.snapshots.map((snapshot) => `- \`${snapshot.address}\`: scope ${snapshot.requestedAs}, owner \`${snapshot.owner ?? "missing"}\`, executable ${snapshot.executable ?? "unknown"}, ${snapshot.dataLength ?? "unknown"} bytes, raw SHA-256 \`${snapshot.rawDataSha256 ?? "none"}\`.`).join("\n");
  return `# Candidate 043c938568ad5e15 research dossier

Milestone 2.0 performs bounded public, read-only research into declared account contention. It is analytical and educational; it does not submit transactions, operate wallets, implement trading, or reconstruct a validator's exact private schedule.

## Executive finding

${dossier.executiveFinding}

Decision: \`${dossier.decision}\`.

${dossier.decisionBasis.map((item) => `- ${item}`).join("\n")}

## Exact identity and representative structure

- Candidate: \`${dossier.candidateId}\`.
- Exact non-fee-payer shared writable account set: ${dossier.exactIdentity.accounts.map((account) => `\`${account}\``).join(", ")}.
- Six references independently revalidated: ${dossier.exactIdentity.allReferencesRevalidated}; partial identity matches rejected: ${dossier.exactIdentity.partialMatchesRejected}.
- Representative slot ${dossier.representative.slot}, component ${dossier.representative.componentId}: ${dossier.representative.transactionCount} transactions, ${dossier.representative.distinctPayerCount} payers, ${dossier.representative.conflictEdgeCount} edges, ${dossier.representative.conflictAtomCount} atoms, bounds ${dossier.representative.waveLowerBound}-${dossier.representative.waveUpperBound}, ${dossier.representative.knownComputeUnits} known Compute Units, coverage ${dossier.representative.knownComputeCoverage}.

| Slot | Component | Tx indexes | Status | Payers | Edges | Atoms | Bounds | Known CU | Deviation |
|---:|---:|:---|:---|---:|---:|---:|:---:|---:|:---|
${timeline}

## Authoritative Velocity identity

${dossier.velocityIdentity.evidence.map((item) => `- ${item}`).join("\n")}

The exact program ID is \`${dossier.velocityIdentity.programId}\`.

## Deployed-code correspondence

Classification: **${dossier.sourceCorrespondence.state}**.

- ProgramData: \`${dossier.sourceCorrespondence.programDataAddress}\`.
- Current last-deploy slot: ${dossier.sourceCorrespondence.currentLastDeploySlot}.
- Current executable SHA-256: \`${dossier.sourceCorrespondence.currentExecutableSha256}\`.

${dossier.sourceCorrespondence.reasons.map((item) => `- ${item}`).join("\n")}

Current metadata is not historical state for the sampled slots.

## Exact observed instruction path

| Observed variant | Encoding | Discriminator | Bytes | Count | Source-family variant | Finding |
|:---|:---|:---|---:|---:|:---|:---|
${instructions}

${layout.nativeVariantMismatch.interpretation}

The two Anchor discriminator hashes and emitted names identify the observed names, but exact deployed handler/source correspondence is not established. The native-prefix branch is intentionally left as an observed variant because the pinned handler's account contract disagrees.

## Account-role matrix

| Variant | Position | Signer / writable | Source-family constraint | Source-family role | Source-family mutation | Deployed mutation | Scope |
|:---|---:|:---:|:---|:---|:---|:---|:---|
${roles}

Declared writable, source-required writable, source-family mutation, inferred role, and deployed source-confirmed mutation are separate fields. Every deployed mutation remains \`unknown\`.

## Shared writable transition answers

${dossier.mutationTrace.sharedWritableAnswers.map((item) => `- \`${item.address}\`: ${item.answer}`).join("\n")}

## Ed25519 evidence

- ${signers.ed25519InstructionCount} Ed25519 instructions and ${signers.signatureCount} signatures.
- ${signers.localVerificationPassCount} local verification passes.
- ${signers.sameInstructionReferenceCount} same-instruction and ${signers.crossInstructionReferenceCount} cross-instruction byte references.
- ${signers.distinctSignerCount} distinct signer keys and ${signers.distinctMessageCount} distinct covered-message hashes.
- ${signers.interpretation}

## Source-family mutation trace

${dossier.mutationTrace.sourceFamilyOnlyFindings.map((item) => `- ${item}`).join("\n")}

These findings are not source-confirmed deployed transitions.

## Semantic independence

Outcome: \`${dossier.semanticIndependence.outcome}\`.

${dossier.semanticIndependence.reasons.map((item) => `- ${item}`).join("\n")}

Narrow non-claims:

${dossier.semanticIndependence.nonClaims.map((item) => `- ${item}`).join("\n")}

No semantic footprint, decoder, counterfactual model, or redesign was implemented.

## Current account snapshots

${snapshots.limitation}

${snapshotList}

## Source manifest

${sourceList}

## Actionability gate

Closed. ${dossier.actionabilityGate.reason}

No runtime scheduling, validator behavior, throughput recovery, production deployment, monitoring, or trading claim follows from this dossier.
`;
}
