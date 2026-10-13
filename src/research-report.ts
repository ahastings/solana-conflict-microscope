import type { AccountSnapshotArtifact, CandidateDossier, CandidateOccurrence, PayloadLayoutArtifact, SignerMessageSummaryArtifact, SourceManifestArtifact } from "./research-types.js";

const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const list = (values: string[]): string => values.map((value) => `<li>${escapeHtml(value)}</li>`).join("");

export function serializeCandidateDossier(dossier: CandidateDossier): string {
  return JSON.stringify(dossier, null, 2) + "\n";
}

export function serializeCandidateEvidence(occurrences: CandidateOccurrence[]): string {
  return occurrences.map((occurrence) => JSON.stringify(occurrence)).join("\n") + "\n";
}

export function candidateDossierHtml(
  dossier: CandidateDossier,
  payload: PayloadLayoutArtifact,
  signers: SignerMessageSummaryArtifact,
  sources: SourceManifestArtifact,
  snapshots: AccountSnapshotArtifact,
): string {
  const timeline = dossier.recurrenceTimeline.map((item) => `<tr><td>${item.slot}</td><td>${item.componentId}</td><td>${item.transactionCount}</td><td>${item.distinctFeePayerCount}</td><td>${item.conflictEdgeCount}</td><td>${item.conflictAtomCount}</td><td>${escapeHtml(item.waveBounds)}</td><td>${escapeHtml(item.deviations.join("; ") || "none")}</td></tr>`).join("");
  const positions = dossier.accountPositionMatrix.map((position) => `<tr><td>${position.position}</td><td>${position.signer ? "yes" : "no"} / ${position.writable ? "yes" : "no"}</td><td>${position.constantAcrossOccurrences ? "constant" : "rotating"}</td><td>${position.distinctAddressCount}</td><td>${escapeHtml(position.candidateConflictRelation)}</td><td>${escapeHtml(position.currentOwners.join(", ") || "not sampled")}</td><td>${escapeHtml(position.currentDataLengths.join(", ") || "not sampled")}</td><td>${escapeHtml(position.inferredRole)}</td><td>${escapeHtml(position.confidence)}</td></tr>`).join("");
  const signerRows = signers.signers.map((signer) => `<tr><td><code>${escapeHtml(signer.publicKey)}</code></td><td>${signer.signatureCount}</td><td>${signer.occurrenceCount}</td><td>${signer.repeated ? "repeated" : "single"}</td></tr>`).join("");
  const snapshotRows = snapshots.snapshots.map((snapshot) => `<tr><td><code>${escapeHtml(snapshot.address)}</code></td><td>${escapeHtml(snapshot.owner ?? "missing")}</td><td>${snapshot.executable === null ? "unknown" : snapshot.executable ? "yes" : "no"}</td><td>${snapshot.dataLength ?? "unknown"}</td><td>${escapeHtml(snapshot.loaderType)}</td><td><code>${escapeHtml(snapshot.rawDataSha256 ?? "none")}</code></td></tr>`).join("");
  const sourceRows = sources.sources.map((source) => `<tr><td>${escapeHtml(source.title)}</td><td>${escapeHtml(source.classification)}</td><td><a href="${escapeHtml(source.url)}">source</a></td><td><code>${escapeHtml(source.commit ?? source.version)}</code></td><td>${escapeHtml(source.supports.join("; "))}</td><td><code>${escapeHtml(source.contentSha256)}</code></td></tr>`).join("");
  const evidence = dossier.evidenceLadder.map((item) => `<article class="level"><span>${item.level}</span><div><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(item.application)}</p></div></article>`).join("");
  const hypotheses = dossier.hypotheses.map((item) => `<article class="hypothesis"><h3>${escapeHtml(item.statement)} <small>${escapeHtml(item.confidence)} confidence</small></h3><p><strong>Supports:</strong> ${escapeHtml(item.supportingEvidence.join(" "))}</p><p><strong>Missing/contrary:</strong> ${escapeHtml(item.contradictingOrMissingEvidence.join(" "))}</p></article>`).join("");
  const payloadGroups = payload.instructionPayloads.groups.map((group) => `<li>${group.count} payload(s), ${group.byteLength} bytes, discriminator <code>${escapeHtml(group.discriminatorHex)}</code>, ${group.stableByteRanges.length} stable range(s)</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Candidate #1 semantic dossier</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#e8eef8;line-height:1.55}*{box-sizing:border-box;min-width:0}body{margin:0 auto;max-width:1480px;padding:24px;overflow-wrap:anywhere}header,section{background:#101d30;border:1px solid #2b4262;border-radius:14px;padding:18px;margin:16px 0}h1{font-size:clamp(1.8rem,5vw,3.2rem);line-height:1.05;margin:.2rem 0}h2{margin-top:0}.eyebrow{color:#75e6c1;text-transform:uppercase;letter-spacing:.12em;font-weight:700}.muted{color:#a7b8cd}.decision{border-left:6px solid #f2c86e}.gate{border-left:6px solid #f28a8a}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric{background:#081527;border-radius:10px;padding:12px}.metric strong{display:block;color:#75e6c1;font-size:1.6rem}.level{display:grid;grid-template-columns:44px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #263b58}.level>span{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#17385a;color:#75e6c1;font-weight:800}.level h3,.level p{margin:0}.table-wrap{max-width:100%;overflow-x:auto;border:1px solid #2b4262;border-radius:10px}table{border-collapse:collapse;width:100%;min-width:760px}th,td{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #263b58}th{color:#75e6c1;background:#0a1729}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.88em;word-break:break-all}.hypothesis{background:#0a1729;border-left:4px solid #b9a5ff;border-radius:8px;padding:12px;margin:10px 0}.hypothesis h3,.hypothesis p{margin:.25rem 0}small{color:#b9a5ff}a{color:#7ecbff}.tag{display:inline-block;padding:4px 9px;border:1px solid #496586;border-radius:999px;margin:2px}.paths a{display:block}@media(max-width:520px){body{padding:10px}header,section{padding:13px}.metrics{grid-template-columns:1fr 1fr}}
</style></head><body><header><div class="eyebrow">Milestone 1.9 · Evidence-ranked research</div><h1>Candidate #1 identity and semantic dossier</h1><p><code>${escapeHtml(dossier.candidateId)}</code></p><p>${escapeHtml(dossier.executiveFinding)}</p></header>
<section class="decision"><h2>Decision: ${escapeHtml(dossier.decision)}</h2><ul>${list(dossier.decisionBasis)}</ul></section>
<section><h2>Verified recurring structure</h2><div class="metrics"><div class="metric"><span>Exact blocks</span><strong>${dossier.exactIdentity.recurrenceBlockCount}</strong></div><div class="metric"><span>Representative tx</span><strong>${dossier.representative.transactionCount}</strong></div><div class="metric"><span>Conflict edges</span><strong>${dossier.representative.conflictEdgeCount}</strong></div><div class="metric"><span>Conflict atoms</span><strong>${dossier.representative.conflictAtomCount}</strong></div><div class="metric"><span>Proven depth</span><strong>${dossier.representative.waveLowerBound}</strong></div><div class="metric"><span>Structural variants</span><strong>${dossier.variantShapes.length}</strong></div></div><p class="muted">The two-account identity is exact. Partially overlapping account sets are excluded and retained only as related-family evidence.</p><p>${dossier.exactIdentity.accounts.map((account) => `<span class="tag"><code>${escapeHtml(account)}</code></span>`).join("")}</p></section>
<section><h2>Evidence ladder</h2>${evidence}</section>
<section><h2>25-block recurrence timeline</h2><div class="table-wrap"><table><thead><tr><th>Slot</th><th>Component</th><th>Tx</th><th>Payers</th><th>Edges</th><th>Atoms</th><th>Bounds</th><th>Deviation</th></tr></thead><tbody>${timeline}</tbody></table></div></section>
<section><h2>Conflict declaration evidence</h2><p>${dossier.exactConflictEvidence.totalOccurrenceEdges} occurrence-level conflict edges and ${dossier.exactConflictEvidence.totalOccurrenceAtoms} atoms were recomputed. These are declared account-lock relationships; writable flags do not prove mutation.</p></section>
<section><h2>Account-position and role matrix</h2><div class="table-wrap"><table><thead><tr><th>Pos</th><th>Signer / writable</th><th>Recurrence</th><th>Addresses</th><th>Candidate relation</th><th>Current owner</th><th>Current bytes</th><th>Role finding</th><th>Confidence</th></tr></thead><tbody>${positions}</tbody></table></div></section>
<section><h2>Ed25519 signer and covered-message evidence</h2><div class="metrics"><div class="metric"><span>Instructions</span><strong>${signers.ed25519InstructionCount}</strong></div><div class="metric"><span>Signatures</span><strong>${signers.signatureCount}</strong></div><div class="metric"><span>Local checks pass</span><strong>${signers.localVerificationPassCount}</strong></div><div class="metric"><span>Distinct signers</span><strong>${signers.distinctSignerCount}</strong></div><div class="metric"><span>Distinct messages</span><strong>${signers.distinctMessageCount}</strong></div><div class="metric"><span>Malformed</span><strong>${signers.malformedInstructionCount}</strong></div></div><div class="table-wrap"><table><thead><tr><th>Signer public key</th><th>Signatures</th><th>Blocks</th><th>Recurrence</th></tr></thead><tbody>${signerRows}</tbody></table></div><p class="muted">Every offset and covered byte range is preserved in candidate-evidence.ndjson. Real-world signer identity and independence are not inferred.</p></section>
<section><h2>Candidate instruction and program-data layout</h2><ul>${payloadGroups}</ul><p>${payload.instructionPayloads.count} candidate instruction payloads and ${payload.programDataLogs.count} program-data log payloads were decoded and hashed. The neutral layout names are <code>${payload.instructionPayloads.neutralLayout.map((field) => field.name).join("</code>, <code>")}</code>.</p><ul>${list(payload.limitations)}</ul></section>
<section><h2>Current account metadata</h2><p>${escapeHtml(snapshots.limitation)}</p><div class="table-wrap"><table><thead><tr><th>Address</th><th>Owner</th><th>Executable</th><th>Bytes</th><th>Loader type</th><th>Raw-data SHA-256</th></tr></thead><tbody>${snapshotRows}</tbody></table></div></section>
<section><h2>Program identity and source evidence</h2><ul>${list(dossier.programIdentityEvidence)}</ul><div class="table-wrap"><table><thead><tr><th>Source</th><th>Class</th><th>Link</th><th>Version / commit</th><th>Supports</th><th>Content SHA-256</th></tr></thead><tbody>${sourceRows}</tbody></table></div><h3>Source-confirmed semantics</h3><ul>${list(dossier.sourceConfirmedSemantics)}</ul></section>
<section><h2>Supported inference</h2><ul>${list(dossier.supportedInferences)}</ul><h2>Separately labeled hypotheses</h2>${hypotheses}</section>
<section><h2>Unresolved questions</h2><ul>${list(dossier.unresolvedQuestions)}</ul></section>
<section class="gate"><h2>Actionability gate: closed</h2><p>${escapeHtml(dossier.actionabilityGate.reason)}</p><p>No semantic decoder, new candidate counterfactual, redesign conclusion, runtime claim, scheduling claim, or throughput claim is authorized.</p></section>
<section class="paths"><h2>Evidence artifacts</h2><a href="candidate-dossier.json">Candidate dossier JSON</a><a href="candidate-evidence.ndjson">Occurrence evidence NDJSON</a><a href="payload-layout.json">Payload layout</a><a href="signer-message-summary.json">Signer/message summary</a><a href="account-snapshots.json">Current account snapshots</a><a href="source-manifest.json">Source manifest</a></section>
</body></html>`;
}

export function candidateDossierMarkdown(
  dossier: CandidateDossier,
  payload: PayloadLayoutArtifact,
  signers: SignerMessageSummaryArtifact,
  sources: SourceManifestArtifact,
  snapshots: AccountSnapshotArtifact,
): string {
  const timeline = dossier.recurrenceTimeline.map((item) => `| ${item.slot} | ${item.componentId} | ${item.transactionCount} | ${item.distinctFeePayerCount} | ${item.conflictEdgeCount} | ${item.conflictAtomCount} | ${item.waveBounds} | ${item.deviations.join("; ") || "none"} |`).join("\n");
  const positions = dossier.accountPositionMatrix.map((position) => `| ${position.position} | ${position.signer} | ${position.writable} | ${position.constantAcrossOccurrences} | ${position.distinctAddressCount} | ${position.candidateConflictRelation} | ${position.inferredRole} | ${position.confidence} |`).join("\n");
  const sourceList = sources.sources.map((source) => `- [${source.title}](${source.url}) — ${source.classification}; ${source.commit ? `commit \`${source.commit}\`` : source.version}; content SHA-256 \`${source.contentSha256}\`; supports: ${source.supports.join("; ")}.`).join("\n");
  const snapshotList = snapshots.snapshots.map((snapshot) => `- \`${snapshot.address}\`: owner \`${snapshot.owner ?? "missing"}\`, executable ${snapshot.executable ?? "unknown"}, ${snapshot.dataLength ?? "unknown"} bytes, raw-data SHA-256 \`${snapshot.rawDataSha256 ?? "none"}\`.`).join("\n");
  return `# Candidate ff30780de8479976 research dossier

Generated for Milestone 1.9 from the committed candidate manifest and cache-first evidence. This is an analytical and educational report about declared account contention, not a trading system.

## Executive finding

${dossier.executiveFinding}

Decision: \`${dossier.decision}\`.

${dossier.decisionBasis.map((value) => `- ${value}`).join("\n")}

## Evidence ladder

${dossier.evidenceLadder.map((item) => `${item.level}. **${item.label}:** ${item.application}`).join("\n")}

## Exact identity and representative structure

- Candidate: \`${dossier.candidateId}\`.
- Exact shared-account set: ${dossier.exactIdentity.accounts.map((account) => `\`${account}\``).join(" and ")}.
- Revalidated recurrence: ${dossier.exactIdentity.recurrenceBlockCount} blocks; all references revalidated: ${dossier.exactIdentity.allReferencesRevalidated}.
- Representative: slot ${dossier.representative.slot}, component ${dossier.representative.componentId}, ${dossier.representative.transactionCount} transactions, ${dossier.representative.distinctFeePayerCount} fee payers, ${dossier.representative.conflictEdgeCount} edges, ${dossier.representative.conflictAtomCount} atoms, bounds ${dossier.representative.waveLowerBound}-${dossier.representative.waveUpperBound}.
- Across occurrences: ${dossier.exactConflictEvidence.totalOccurrenceEdges} recomputed edges and ${dossier.exactConflictEvidence.totalOccurrenceAtoms} atoms. These are declared-access facts, not proof of mutation.

## Recurrence timeline

| Slot | Component | Tx | Payers | Edges | Atoms | Bounds | Deviation |
|---:|---:|---:|---:|---:|---:|:---:|:---|
${timeline}

## Account-position and role matrix

| Position | Signer | Writable | Constant | Distinct | Candidate relation | Role finding | Confidence |
|---:|:---:|:---:|:---:|---:|:---|:---|:---:|
${positions}

Every writable value above is a declared flag. The dossier does not claim that a writable account was actually mutated.

## Ed25519 evidence

- ${signers.ed25519InstructionCount} native Ed25519 instructions contain ${signers.signatureCount} signatures.
- ${signers.localVerificationPassCount} locally reconstructed signature checks pass; ${signers.malformedInstructionCount} layouts are malformed and ${signers.unsupportedReferenceCount} contain unsupported references.
- ${signers.distinctSignerCount} signer public keys and ${signers.distinctMessageCount} deterministic signed-message hashes were observed.
- Same-instruction references: ${signers.sameInstructionReferenceCount}; cross-instruction references: ${signers.crossInstructionReferenceCount}.
- Signer real-world identity and organizational independence are not inferred.

Exact offsets, referenced instruction indexes, byte ranges, public keys, signatures, message bytes, and message hashes are in \`candidate-evidence.ndjson\`.

## Candidate payload and log layout

${payload.instructionPayloads.neutralLayout.map((field) => `- \`${field.name}\` bytes ${field.start}-${field.endExclusive - 1}: ${field.interpretation}`).join("\n")}

The corpus contains ${payload.instructionPayloads.count} candidate instruction payloads and ${payload.programDataLogs.count} program-data log payloads. Raw bytes and hashes are retained in \`payload-layout.json\`. No unsupported denomination, asset, side, or market meaning is assigned.

## Current account snapshots

${snapshots.limitation}

${snapshotList}

ProgramData inspection found ${snapshots.programDataInspection.embeddedPathLeads.length} bounded embedded Rust path leads. Their executable-bytes SHA-256 is \`${snapshots.programDataInspection.executableBytesSha256}\`. They are structural leads, not an authoritative program identity.

## Program identity and sources

${dossier.programIdentityEvidence.map((value) => `- ${value}`).join("\n")}

${sourceList}

### Source-confirmed semantics

${dossier.sourceConfirmedSemantics.map((value) => `- ${value}`).join("\n")}

### Supported inference

${dossier.supportedInferences.map((value) => `- ${value}`).join("\n")}

### Separately labeled hypotheses

${dossier.hypotheses.map((hypothesis) => `- **${hypothesis.statement}** Confidence: ${hypothesis.confidence}. Supports: ${hypothesis.supportingEvidence.join(" ")} Missing or contrary: ${hypothesis.contradictingOrMissingEvidence.join(" ")}`).join("\n")}

## Unresolved questions

${dossier.unresolvedQuestions.map((value) => `- ${value}`).join("\n")}

## Actionability gate

Closed. ${dossier.actionabilityGate.reason}

No semantic decoder or new counterfactual was added. No exact validator schedule, runtime causality, throughput recovery, historical account state, signer independence, or redesignability is claimed.
`;
}
