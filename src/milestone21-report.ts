import type { Milestone21Input, Milestone21Result, VariantCorrespondenceRow } from "./milestone21-types.js";

const escapeHtml = (value: unknown): string => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function variants(result: Milestone21Result): VariantCorrespondenceRow[] {
  return (result.variantCorrespondence as { variants: VariantCorrespondenceRow[] }).variants;
}

function continuityEvidence(result: Milestone21Result): Record<string, boolean> {
  return (result.deploymentHistory as { continuityEvidence: Record<string, boolean> }).continuityEvidence;
}

function structuralDiffs(result: Milestone21Result): Array<{ candidate: string; observedCount: number; sourceMinimumCount: number; systemProgramMismatch: boolean; structurallyCompatible: boolean; conclusion: string }> {
  return (result.fingerprintMatrix as { structuralDiffs: Array<{ candidate: string; observedCount: number; sourceMinimumCount: number; systemProgramMismatch: boolean; structurallyCompatible: boolean; conclusion: string }> }).structuralDiffs;
}

function buildRows(result: Milestone21Result): Array<{ sourceRepository: string; commit: string; command: string; status: string; resultingBinarySha256: string | null; executableLength: number | null; deterministicRepeatStatus: string; comparison: string }> {
  return (result.buildAttempts as { attempts: Array<{ sourceRepository: string; commit: string; command: string; status: string; resultingBinarySha256: string | null; executableLength: number | null; deterministicRepeatStatus: string; comparison: string }> }).attempts;
}

function inputRows(inputs: Milestone21Input[]): string {
  return inputs.map((input) => `<tr><td><code>${escapeHtml(input.path)}</code></td><td><code>${escapeHtml(input.sha256)}</code></td><td>${escapeHtml(input.purpose)}</td></tr>`).join("");
}

export function milestone21Html(result: Milestone21Result, inputs: Milestone21Input[]): string {
  const programData = result.programData as Record<string, unknown>;
  const executable = result.executable as { payloadLength: number; payloadSha256: string; header: Record<string, unknown>; stringExtraction: { count: number; outputSha256: string }; symbolExtraction: { count: number } };
  const sections = result.sectionManifest as { sections: Array<{ name: string; typeName: string; offset: number; size: number; sha256: string }>; relocationSections: unknown[] };
  const continuity = continuityEvidence(result);
  const variantRows = variants(result).map((variant) => `<tr>
    <td><strong>${escapeHtml(variant.observedVariant)}</strong><br><code>${escapeHtml(variant.observedDiscriminator)}</code></td>
    <td>${variant.observedAccountCardinality}</td><td><code>${escapeHtml(variant.candidateSourceCommit ?? "none")}</code></td>
    <td>${escapeHtml(variant.sourceComparisonCondition ?? "n/a")}</td><td>${escapeHtml(variant.buildResult)}</td>
    <td><span class="pill ${escapeHtml(variant.confidence)}">${escapeHtml(variant.confidence)}</span></td>
    <td>${variant.remainingContradictions.map((item) => escapeHtml(item)).join("<br>")}</td>
  </tr>`).join("");
  const diffRows = structuralDiffs(result).map((diff) => `<tr><td>${escapeHtml(diff.candidate)}</td><td>${diff.observedCount}</td><td>${diff.sourceMinimumCount}</td><td>${diff.systemProgramMismatch ? "yes" : "no"}</td><td>${diff.structurallyCompatible ? "yes" : "no"}</td><td>${escapeHtml(diff.conclusion)}</td></tr>`).join("");
  const builds = buildRows(result).map((build) => `<tr><td>${escapeHtml(build.sourceRepository)}<br><code>${escapeHtml(build.commit)}</code></td><td><code>${escapeHtml(build.command)}</code></td><td>${escapeHtml(build.status)}</td><td>${escapeHtml(build.deterministicRepeatStatus)}</td><td>${escapeHtml(build.comparison)}</td></tr>`).join("");
  const sectionRows = sections.sections.map((section) => `<tr><td>${escapeHtml(section.name || "[unnamed]")}</td><td>${escapeHtml(section.typeName)}</td><td>${section.offset}</td><td>${section.size}</td><td><code>${escapeHtml(section.sha256)}</code></td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Velocity deployed-binary correspondence · Milestone 2.1</title>
<style>
:root{color-scheme:dark;--bg:#071019;--panel:#0d1b27;--ink:#e8f2f5;--muted:#9db0b8;--line:#29404d;--cyan:#63d9d4;--gold:#f2bf61;--red:#ff8178;--green:#7fe0a1}
*{box-sizing:border-box}html,body{margin:0;max-width:100%;overflow-x:hidden}body{font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:radial-gradient(circle at top right,#153246 0,#071019 36rem);color:var(--ink)}
main{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:42px 0 70px}.eyebrow{color:var(--cyan);letter-spacing:.13em;text-transform:uppercase;font-size:12px;font-weight:750}h1{font-size:clamp(30px,6vw,58px);line-height:1.03;margin:.25em 0}.lede{font-size:clamp(17px,2.3vw,22px);max-width:850px;color:#c9d7dc}.hero,.card{background:linear-gradient(135deg,rgba(18,39,54,.96),rgba(9,25,36,.96));border:1px solid var(--line);border-radius:20px;padding:clamp(18px,4vw,34px);box-shadow:0 18px 55px rgba(0,0,0,.24)}.hero{margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:24px}.metric{border:1px solid var(--line);background:#08151f;border-radius:14px;padding:16px;min-width:0}.metric b{display:block;color:var(--cyan);overflow-wrap:anywhere}.metric span{color:var(--muted);font-size:13px}.card{margin:18px 0}h2{font-size:24px;margin:0 0 12px}h3{color:var(--gold)}p,li,td,th{overflow-wrap:anywhere}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.88em;overflow-wrap:anywhere;color:#c5f5ef}.table-wrap{width:100%;overflow-x:auto;border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%;min-width:720px;background:#08151f}th,td{padding:11px 12px;border-bottom:1px solid #203744;text-align:left;vertical-align:top}th{color:var(--cyan);font-size:12px;text-transform:uppercase;letter-spacing:.06em}.pill{display:inline-block;padding:3px 9px;border-radius:999px;border:1px solid var(--line);font-weight:700}.pill.strong{color:var(--green)}.pill.unresolved{color:var(--red)}.pill.source-family-only{color:var(--gold)}.caution{border-left:4px solid var(--gold);padding:12px 16px;background:#18180e;color:#f1e3bd}.checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.check{background:#08151f;border:1px solid var(--line);border-radius:10px;padding:10px}.yes{color:var(--green)}footer{color:var(--muted);margin-top:28px;overflow-wrap:anywhere}
@media(max-width:760px){main{width:min(100% - 20px,1180px);padding-top:20px}.grid,.checks{grid-template-columns:1fr}.hero,.card{border-radius:14px;padding:17px}table{min-width:660px}}
</style></head><body><main>
<section class="hero"><div class="eyebrow">Solana Conflict Microscope · Milestone 2.1</div><h1>Velocity deployed-binary archaeology</h1>
<p class="lede">The sampled executable is temporally established, but no public commit was reproduced to the exact binary. Two Anchor variants have strong historical-source correspondence; the successful five-account native opcode-2 branch remains unresolved.</p>
<div class="grid"><div class="metric"><span>Overall outcome</span><b>${escapeHtml(result.overallOutcome)}</b></div><div class="metric"><span>Continuity</span><b>${escapeHtml(result.continuity)}</b></div><div class="metric"><span>Executable SHA-256</span><b>${escapeHtml(executable.payloadSha256)}</b></div></div></section>

<section class="card"><h2>Boundary</h2><p class="caution">This is source/deployment correspondence evidence. It does not establish deployed mutation semantics, a semantic decoder, runtime scheduling, safe parallel execution, throughput recovery, or a validator’s private schedule. Declared account contention remains the tool’s subject.</p></section>

<section class="card"><h2>Temporal executable continuity</h2><div class="checks">${Object.entries(continuity).map(([key,value])=>`<div class="check"><span class="${value?"yes":""}">${value?"✓":"✕"}</span> ${escapeHtml(key)}</div>`).join("")}</div>
<p>The ProgramData slot is interpreted from pinned Agave loader source as the last deploy, upgrade, or extend mutation slot. The decoded upgrade at slot <code>${escapeHtml(programData.lastMutationSlot)}</code>, complete ProgramData signature history, absence of a later ProgramData reference, sample ordering, and later snapshot context establish continuity; address equality alone was not used.</p></section>

<section class="card"><h2>Exact deployed payload</h2><div class="grid"><div class="metric"><span>ProgramData bytes</span><b>${escapeHtml(programData.rawProgramDataLength)}</b></div><div class="metric"><span>Executable bytes</span><b>${executable.payloadLength}</b></div><div class="metric"><span>Extracted strings</span><b>${executable.stringExtraction.count}</b></div></div>
<p>Raw ProgramData SHA-256: <code>${escapeHtml(programData.rawProgramDataSha256)}</code><br>Executable payload SHA-256: <code>${escapeHtml(executable.payloadSha256)}</code><br>Strings artifact SHA-256: <code>${escapeHtml(executable.stringExtraction.outputSha256)}</code>. Symbols recovered: ${executable.symbolExtraction.count}; relocation sections: ${sections.relocationSections.length}.</p>
<div class="table-wrap"><table><thead><tr><th>Section</th><th>Type</th><th>Offset</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>${sectionRows}</tbody></table></div></section>

<section class="card"><h2>Per-variant correspondence</h2><div class="table-wrap"><table><thead><tr><th>Observed variant</th><th>Accounts</th><th>Source commit</th><th>Source comparison</th><th>Build</th><th>Confidence</th><th>Contradictions</th></tr></thead><tbody>${variantRows}</tbody></table></div>
<p>The two Anchor rows are version-correspondence findings only. Exact deployed field mutation remains unknown for every row.</p></section>

<section class="card"><h2>Five-account native branch</h2><div class="table-wrap"><table><thead><tr><th>Candidate</th><th>Observed</th><th>Source min.</th><th>System mismatch</th><th>Compatible</th><th>Conclusion</th></tr></thead><tbody>${diffRows}</tbody></table></div>
<p>The observed position 4 is <code>FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY</code>, a writable Velocity-owned account. It is not accepted as the System Program.</p></section>

<section class="card"><h2>Historical fingerprint</h2><ul><li>The public Velocity lineage has the exact program ID and <code>programs/velocity</code> paths embedded in the deployed ELF.</li><li>The observed and binary-embedded posting log uses <code>current ts &lt; next_timestamp</code>.</li><li>The deployed skip log uses <code>next_timestamp &lt;= current_timestamp</code>; no inspected official public version contains that exact equality form.</li><li>Public Velocity code exposes native opcodes 0 and 1; public Drift code adds opcode 2 with a contradictory six-account contract.</li><li>The official SDK tarball’s velocity-v1 surface contains client/generated interface material, but no on-chain Rust or deployable binary/build metadata.</li></ul></section>

<section class="card"><h2>Build attempts</h2><div class="table-wrap"><table><thead><tr><th>Source</th><th>Command</th><th>Status</th><th>Repeat</th><th>Comparison</th></tr></thead><tbody>${builds}</tbody></table></div><p>No exact binary match was claimed.</p></section>

<section class="card"><h2>Pinned inputs</h2><div class="table-wrap"><table><thead><tr><th>Path</th><th>SHA-256</th><th>Purpose</th></tr></thead><tbody>${inputRows(inputs)}</tbody></table></div></section>

<footer>${escapeHtml(result.terminalSummary)} Nothing was pushed.</footer>
</main></body></html>\n`;
}

export function milestone21Markdown(result: Milestone21Result, inputs: Milestone21Input[]): string {
  const programData = result.programData as Record<string, unknown>;
  const executable = result.executable as { payloadLength: number; payloadSha256: string; stringExtraction: { count: number; outputSha256: string }; symbolExtraction: { count: number } };
  const deployment = result.deploymentHistory as { lastMutationSlot: number; snapshotContextSlot: number; sampleSlots: number[]; loaderSemantics: { pinnedRepository: string; tag: string; commit: string; interpretation: string; caution: string }; deploymentTransaction: { signature: string | null; status: string; parsedAccounts: Record<string, unknown> | null }; programDataHistoryScope: string; conclusion: string };
  const variantTable = variants(result).map((variant) => `| ${variant.observedVariant} | \`${variant.observedDiscriminator}\` | ${variant.observedAccountCardinality} | \`${variant.candidateSourceCommit ?? "none"}\` | ${variant.sourceComparisonCondition ?? "n/a"} | ${variant.buildResult} | **${variant.confidence}** | ${variant.remainingContradictions.join(" ")} |`).join("\n");
  const inputTable = inputs.map((input) => `| \`${input.path}\` | \`${input.sha256}\` | ${input.purpose} |`).join("\n");
  const diffs = structuralDiffs(result).map((diff) => `| ${diff.candidate} | ${diff.observedCount} | ${diff.sourceMinimumCount} | ${diff.systemProgramMismatch ? "yes" : "no"} | ${diff.structurallyCompatible ? "yes" : "no"} | ${diff.conclusion} |`).join("\n");
  const builds = buildRows(result).map((build) => `| ${build.sourceRepository} | \`${build.commit}\` | \`${build.command}\` | ${build.status} | ${build.deterministicRepeatStatus} | ${build.comparison} |`).join("\n");
  return `# Velocity deployed-binary correspondence

Milestone 2.1 asks one narrow question: can the exact Velocity executable that processed Candidate #3 be reproducibly connected to public historical source?

## Outcome

**${result.overallOutcome}**

Temporal result: **${result.continuity}**.

The exact current executable is established as the executable in force at all six Candidate #3 slots. No authoritative public commit was built to a byte-identical executable. The two Anchor variants have compelling historical-source correspondence, while the native discriminator-2 variant remains unresolved and contradictory. This outcome does **not** authorize a general semantic decoder. A later study, if any, must be narrowly variant-specific.

This work does not add a semantic decoder, semantic footprint, counterfactual model, runtime scheduling claim, throughput claim, redesign claim, transaction submission, wallet/key handling, trading, or MEV/Jito functionality.

## Exact executable

- Program: \`${programData.programId}\`
- ProgramData: \`${programData.programDataAddress}\`
- ProgramData header length: ${programData.headerLength} bytes
- Raw ProgramData length / SHA-256: ${programData.rawProgramDataLength} / \`${programData.rawProgramDataSha256}\`
- Executable payload length / SHA-256: ${executable.payloadLength} / \`${executable.payloadSha256}\`
- ELF validation: passed (ELF64, little endian, Solana SBF machine 263)
- Deterministic strings: ${executable.stringExtraction.count}; artifact SHA-256 \`${executable.stringExtraction.outputSha256}\`
- ELF symbols recovered: ${executable.symbolExtraction.count}

ProgramData decoding treats the bytes as the upgradeable-loader bincode variant: 4-byte little-endian tag, 8-byte slot, 1-byte authority option, optional 32-byte authority, then the complete executable payload. No trailing bytes are trimmed.

## Temporal executable continuity

Pinned loader: [Anza Agave ${deployment.loaderSemantics.tag}](${deployment.loaderSemantics.pinnedRepository}/tree/${deployment.loaderSemantics.commit}) at \`${deployment.loaderSemantics.commit}\`.

${deployment.loaderSemantics.interpretation}

- ProgramData last executable-mutation slot: ${deployment.lastMutationSlot}
- Candidate slots: ${deployment.sampleSlots.join(", ")}
- Current cached snapshot context: ${deployment.snapshotContextSlot}
- Deployment transaction: \`${deployment.deploymentTransaction.signature}\` (${deployment.deploymentTransaction.status})
- Decoded loader accounts: \`${JSON.stringify(deployment.deploymentTransaction.parsedAccounts)}\`
- History scope: ${deployment.programDataHistoryScope}

${deployment.loaderSemantics.caution}

${deployment.conclusion}

## Official history inspected

- [velocity-exchange/protocol-v2](https://github.com/velocity-exchange/protocol-v2), all locally reachable branches/tags and full relevant Git history.
- The official Drift lineage and SDK release commit \`0ae3e3b1db782a6765c3525b3dec38ad4d9d3a62\` for \`v2.163.0-beta.0\`.
- The public Velocity rebrand at \`6b993baf684df723f6072ffd09e5de48dde877dd\` and strongest reachable pre-deployment Velocity candidate \`f7df335599c194bc759cebf682a11bcad6bd5ed2\`.
- The official SDK/velocity-v1 repository metadata plus the \`@velocity-exchange/sdk@0.17.0\` npm tarball.

The current public velocity-v1 Git URL was unavailable. Its official npm tarball is a client/generated SDK and IDL surface: it contains no on-chain Rust, deployable SBF binary, Cargo/Anchor build metadata, published program-binary hash, or exact protocol-v2 deployment mapping.

## Historical source findings

- \`de32add525919791b38218ecb59ee506e16a9b3f\` introduced the public Lazer feed-update timestamp form using \`next_timestamp < current_timestamp\` and the exact posting log \`Posting new lazer update. current ts {} < next_timestamp {}\`.
- \`ffd10b2bd6a009e66aaaf42bb065387ccc1c72c8\` introduced Drift native discriminator 2 as \`handle_set_oracle_cache_entries_native\`, requiring at least six accounts in this order: admin, state, cache0, cache1, System Program, rent.
- \`6b993baf684df723f6072ffd09e5de48dde877dd\` renamed the source tree to \`programs/velocity\` and declared the exact \`vELoC…\` program ID, but this public Velocity dispatcher exposes only native opcodes 0 and 1.
- \`3f148f8b477e4176e11e0660adb0e67dd5163d3b\` hardened the public Velocity native paths; it still does not add opcode 2.
- \`f7df335599c194bc759cebf682a11bcad6bd5ed2\` matches the deployed ELF’s Velocity source paths, exact program ID, Anchor instruction names, and posting string. It does not contain the deployed \`<=\` skip fingerprint or a native opcode-2 route.
- The only reachable post-candidate tag containing that branch was \`docker-swift-v0.1.13\` at \`ff80ed4d2d92c04804c0d8d3be1eca63eb521f43\`.

The exact observed success log uses \`Skipping lazer price update. next_timestamp {} <= current_timestamp {}\`. None of the inspected official public versions contains that exact equality form. Exact string correspondence is version evidence, not proof of a complete binary mapping.

## Five-account native structural diff

| Candidate | Observed count | Source minimum | System Program mismatch | Compatible | Conclusion |
|:--|--:|--:|:--:|:--:|:--|
${diffs}

Observed position 4 is \`FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY\`, writable and currently Velocity-owned. It is not called or accepted as the System Program.

## Variant correspondence

| Variant | Discriminator | Accounts | Candidate source | Source comparison | Build | Confidence | Remaining contradictions |
|:--|:--|--:|:--|:--|:--|:--|:--|
${variantTable}

The Anchor findings are correspondence findings only. No exact deployed field mutation is promoted for any variant.

## Build attempts

| Source | Commit | Exact command | Status | Deterministic repeat | Comparison |
|:--|:--|:--|:--|:--|:--|
${builds}

The public Velocity build metadata pins Rust 1.91.1, Solana 2.3.11, Anchor 1.0.0, \`solana-verify\` 0.5.0, and image \`solanafoundation/solana-verifiable-build:3.1.14\`; its devnet recipe strips default features and enables \`no-entrypoint\`. This host had no usable Docker, Podman, WSL VM, Solana CLI, Anchor, Cargo/Rust, or \`solana-verify\`, so the exact candidate build was unavailable. No exact binary match is claimed.

## Pinned cache provenance

| Input | SHA-256 | Purpose |
|:--|:--|:--|
${inputTable}

Offline replay: \`npm run research-velocity-binary -- --plan research-plans/velocity-binary-milestone-2.1.json --offline\`.

## Durable boundary

The milestone stops at **variant-level-strong-correspondence**. It does not reopen the native branch, and it does not generalize the Anchor correspondence into deployed mutation semantics. Candidate #1 remains \`black-box-structure-only\`, Candidate #2 remains \`deferred-not-rejected\`, Candidate #3’s six occurrences and discovery rank remain unchanged, and all prior sourceability/discovery evidence remains preserved.
`;
}
