import type { AnchorBundleRole, Milestone22Result } from "./milestone22-types.js";

const e = (value: unknown): string => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const short = (value: string): string => `${value.slice(0, 8)}…${value.slice(-6)}`;

export function milestone22Html(result: Milestone22Result): string {
  const dossier = result.dossier;
  const bundleRows = dossier.bundles.map((bundle) => {
    const ordered = [...bundle.anchors].sort((a, b) => a.transactionIndex - b.transactionIndex);
    return `<tr><td>${bundle.slot}<br><small>component ${bundle.componentId}</small></td><td>${ordered.map((item) => `${e(item.role)} @ ${item.transactionIndex}`).join("<br>")}</td><td><code>${e(short(bundle.decodedMessage.rawSha256))}</code><br>${bundle.decodedMessage.feedCount} feeds · channel ${bundle.decodedMessage.channelId}</td><td>${ordered.map((item) => `<span class="branch ${item.branch}">${e(item.branch)}</span>`).join(" ")}</td><td>${ordered.map((item) => `<code>${e(short(item.updateTwap.marketWritableAccount))}</code>`).join("<br>")}</td></tr>`;
  }).join("");
  const roleCards = dossier.stableRoleDefinition.map((row) => `<div class="metric"><span>${e(row.role)}</span><b>${e(short(row.market))}</b><small>oracle ${e(short(row.oracle))}<br>${row.makerInputs.length ? `${row.makerInputs.length} maker inputs` : "no maker inputs"}</small></div>`).join("");
  const feedRows = dossier.bundles[0]!.decodedMessage.feeds.map((feed) => `<tr><td>${feed.feedId}</td><td><code>${e(feed.oraclePda)}</code><br>bump ${feed.oracleBump}</td><td>${feed.properties.map((property) => `${e(property.name)} = <code>${e(property.value)}</code>`).join("<br>")}</td></tr>`).join("");
  const graphRows = result.conflictAttribution.blocks.map((block) => `<tr><td>${block.slot}</td><td>${block.pairEdges.map((edge) => `${edge.source}–${edge.target}: ${edge.accounts.map(short).join(", ")}`).join("<br>")}</td><td>${block.atomCount}</td><td>${block.waveLowerBound}–${block.waveUpperBound}</td><td>${block.nativeContext.conflicts.map((item) => `${e(item.anchorRole)}: ${e(short(item.accounts[0]!))}`).join("<br>")}</td></tr>`).join("");
  const variants = result.binaryCorrespondence.variants.map((variant) => `<tr><td>${e(variant.variant)}</td><td><code>${e(variant.discriminatorHex)}</code></td><td>${variant.accountCardinalities.join(", ")}</td><td>${variant.instructionNameOffsets.length} name · ${variant.sourcePathOffsets.length} path · ${variant.exactLogFingerprints.map((item) => `${item.count}× ${e(item.value)}`).join("<br>")}</td><td>Level ${variant.evidenceLevel}<br><strong>not Level 5</strong></td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Velocity Anchor bundle semantics · Milestone 2.2</title>
<style>
:root{color-scheme:dark;--bg:#071016;--panel:#0d1d26;--ink:#e9f3f4;--muted:#9cb0b6;--line:#28424b;--mint:#65e0c2;--gold:#f5c46d;--red:#ff837c;--blue:#78bfff}*{box-sizing:border-box}html,body{margin:0;max-width:100%;overflow-x:hidden}body{background:radial-gradient(circle at 85% 0,#173b43 0,#071016 34rem);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}main{width:min(1180px,calc(100% - 30px));margin:auto;padding:38px 0 68px}.hero,.card{border:1px solid var(--line);border-radius:20px;background:linear-gradient(145deg,rgba(15,35,45,.97),rgba(7,23,31,.97));padding:clamp(18px,4vw,34px);box-shadow:0 18px 50px rgba(0,0,0,.2)}.card{margin-top:18px}.eyebrow{color:var(--mint);font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}h1{font-size:clamp(31px,6vw,60px);line-height:1.02;margin:.22em 0}.lede{max-width:900px;color:#c8d8dc;font-size:clamp(17px,2.2vw,22px)}h2{font-size:24px;margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}.metric{min-width:0;padding:14px;border:1px solid var(--line);border-radius:13px;background:#08171f}.metric span,.metric small{display:block;color:var(--muted)}.metric b{display:block;color:var(--mint);overflow-wrap:anywhere}.outcome{color:var(--gold)!important}.boundary{border-left:4px solid var(--gold);padding:12px 15px;background:#19180e;color:#f1e4bd}.table-wrap{max-width:100%;overflow-x:auto;border:1px solid var(--line);border-radius:12px}table{width:100%;min-width:720px;border-collapse:collapse;background:#08171f}th,td{padding:11px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #203943;overflow-wrap:anywhere}th{color:var(--mint);font-size:12px;text-transform:uppercase;letter-spacing:.06em}code{color:#c8f7ee;font:0.86em ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.branch{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-weight:750}.posting{color:var(--mint)}.skipping{color:var(--blue)}strong{color:var(--gold)}ul{padding-left:20px}li+li{margin-top:6px}footer{margin-top:24px;color:var(--muted);overflow-wrap:anywhere}
@media(max-width:700px){main{width:calc(100% - 18px);padding-top:16px}.hero,.card{border-radius:14px;padding:16px}.grid{grid-template-columns:1fr}table{min-width:650px}h2{font-size:21px}}
</style></head><body><main>
<section class="hero"><div class="eyebrow">Solana Conflict Microscope · Milestone 2.2</div><h1>One message. Three Anchor paths.</h1><p class="lede">The same signed Pyth Lazer payload is posted three times per sampled block. The first block-position Anchor transaction emits posting logs; the later two emit equal-timestamp skip logs. That repeated structure is exact. Deployed mutation/no-op truth is not.</p><div class="grid"><div class="metric"><span>Outcome</span><b class="outcome">${e(result.outcome)}</b></div><div class="metric"><span>Repeated bundles</span><b>6 / 6</b><small>18 Anchor + 6 native-context transactions</small></div><div class="metric"><span>Evidence ceiling</span><b>Level 4</b><small>both Anchor variants; Level 5 not reached</small></div></div></section>
<section class="card"><h2>Boundary</h2><p class="boundary">This is observational decomposition and bounded source/binary research. The native five-account path remains unresolved. No decoder, account reflagging, deduplication, semantic counterfactual, optimization, scheduling claim, throughput estimate, wallet, submission, trading, or MEV functionality was added.</p></section>
<section class="card"><h2>Stable A / B / C identities</h2><p>A/B/C are keyed by their market-specific writable account, not transaction ordinal. Their block positions rotate.</p><div class="grid">${roleCards}</div></section>
<section class="card"><h2>Six-block bundle matrix</h2><div class="table-wrap"><table><thead><tr><th>Occurrence</th><th>Block transaction order</th><th>Signed payload</th><th>Observed branch logs</th><th>Distinct TWAP market</th></tr></thead><tbody>${bundleRows}</tbody></table></div><p>${e(result.logBranches.transactionOrderDisclaimer)}</p></section>
<section class="card"><h2>What the signed bytes establish</h2><div class="grid"><div class="metric"><span>Per block</span><b>1 message × 3</b><small>byte-identical, one signer, identical offset references</small></div><div class="metric"><span>Across blocks</span><b>6 distinct hashes</b><small>no cross-block reuse</small></div><div class="metric"><span>Post instruction</span><b>byte-identical × 3</b><small>same discriminator, bytes, accounts and flags in each block</small></div></div><div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Feed ID</th><th>Derived oracle PDA</th><th>Source-confirmed properties</th></tr></thead><tbody>${feedRows}</tbody></table></div><p>No asset symbol is inferred from a numeric feed ID. Confidence is absent from these payloads; price, bid, ask, exponent, and feed-update timestamp are present.</p></section>
<section class="card"><h2>Observed branch pattern</h2><p>Across six first block-position Anchor transactions there are <strong>${result.logBranches.totals.postingLogs} exact posting logs</strong>. Across the twelve later Anchor transactions there are <strong>${result.logBranches.totals.skippingLogs} exact equality-skip logs</strong>. All 18 then emit <code>Instruction: UpdatePerpBidAskTwap</code> and market-specific before-to-after TWAP logs. There are ${result.logBranches.totals.failuresOrEarlyReturns} failures or early-return logs.</p><p>The word “skip” is preserved as an observed log classification; it is not promoted to proof of no mutation.</p></section>
<section class="card"><h2>Anchor-only declared conflict graph</h2><div class="table-wrap"><table><thead><tr><th>Slot</th><th>Three pair edges and causes</th><th>Atoms</th><th>Proven waves</th><th>Native context</th></tr></thead><tbody>${graphRows}</tbody></table></div><p>Every Anchor pair shares the same three writable oracle PDAs and the same writable payer: 4 atoms per pair, 12 per block. Either the oracle set or payer independently preserves the 3-clique. Market accounts do not cause Anchor–Anchor edges. The native transaction contributes one distinct market-account atom to each Anchor path.</p></section>
<section class="card"><h2>Bounded binary/source correspondence</h2><div class="table-wrap"><table><thead><tr><th>Variant</th><th>Discriminator</th><th>Accounts</th><th>Deployed fingerprints</th><th>Ceiling</th></tr></thead><tbody>${variants}</tbody></table></div><p>The exact deployed skip string occurs ${result.binaryCorrespondence.deployedSkipInvestigation.occurrenceCount} time in the established executable. Its <code>next_timestamp &lt;= current_timestamp</code> predicate is complementary to the deployed posting predicate <code>current_timestamp &lt; next_timestamp</code>; those are not contradictory. Public source-family code uses a skip predicate that differs at equality. That is a string/control-version mismatch, and no bounded code reference or exact build resolves it into deployed mutation truth.</p></section>
<section class="card"><h2>Decision</h2><p><strong>${e(result.outcome)}</strong></p><p>The topology, message reuse, byte equivalence, PDA mapping, log branches, and graph attribution are established. Both Anchor variants reach Levels 1–4, but neither reaches source-confirmed deployed mutation semantics (Level 5). A later Anchor-only semantic decoder or counterfactual is therefore not authorized.</p></section>
<footer>${e(result.terminalSummary)} Nothing was pushed.</footer>
</main></body></html>\n`;
}

export function milestone22Markdown(result: Milestone22Result): string {
  const dossier = result.dossier;
  const bundleRows = dossier.bundles.map((bundle) => {
    const ordered = [...bundle.anchors].sort((a, b) => a.transactionIndex - b.transactionIndex);
    return `| ${bundle.slot} / ${bundle.componentId} | ${ordered.map((item) => `${item.role}@${item.transactionIndex}`).join(" → ")} | \`${bundle.decodedMessage.rawSha256}\` | ${ordered.map((item) => item.branch).join(" → ")} | ${ordered.map((item) => `\`${item.updateTwap.marketWritableAccount}\``).join(", ")} |`;
  }).join("\n");
  const roleRows = dossier.stableRoleDefinition.map((row) => `| ${row.role} | \`${row.market}\` | \`${row.oracle}\` | ${row.makerInputs.length ? row.makerInputs.map((item) => `\`${item}\``).join(", ") : "none"} |`).join("\n");
  const feedRows = dossier.bundles[0]!.decodedMessage.feeds.map((feed) => `| ${feed.feedId} | \`${feed.oraclePda}\` | ${feed.oracleBump} | ${feed.properties.map((property) => `${property.name}=\`${property.value}\``).join(", ")} |`).join("\n");
  return `# Velocity Anchor bundle semantics

Milestone 2.2 characterizes only the three strongly corresponding Anchor paths in each exact Candidate #3 occurrence. The unresolved five-account native discriminator-2 transaction is retained only as graph context.

## Outcome

**${result.outcome}**

All six occurrences contain one signed 149-byte Pyth Lazer message repeated byte-for-byte in three Anchor transactions. The first Anchor transaction by block position emits three posting logs; the later two emit three exact equal-timestamp skip logs. The PostPyth instruction bytes and six-account list are identical within each block. The separate UpdatePerpBidAskTwap instruction is an identical eight-byte discriminator wrapper targeting three distinct market/oracle paths.

This exact repeated-update structure does not establish deployed no-op or mutation semantics. Both Anchor variants reach evidence Level 4, not Level 5. No semantic decoder, counterfactual, account-layout change, deduplication, lock-footprint change, speedup calculation, scheduler claim, transaction submission, wallet/key handling, trading, Jito, or MEV feature is authorized or implemented.

## Stable role convention

A/B/C are stable market-identity labels. They are not first/second/third execution labels.

| Role | Market-specific writable account | Oracle-specific writable account | Maker inputs |
|:--|:--|:--|:--|
${roleRows}

The block transaction order rotates across the six observations. “Order” below means only index order in the block response, never arrival, scheduling, validator execution order, or a private schedule.

## Six exact bundles

| Slot / component | Anchor roles in block order | Signed-message SHA-256 | Observed log path | Distinct TWAP markets |
|:--|:--|:--|:--|:--|
${bundleRows}

Every Anchor transaction succeeds, uses payer \`GhMUe97fqJEb9QFNfM6N3BbEy4SD2VmeyjUVFBcXuV6V\`, places Ed25519 at index 2, PostPythLazerOracleUpdate at index 3, and UpdatePerpBidAskTwap at index 4. The transaction signatures differ. The Anchor fee payer does not differ, so cross-fee-payer reuse is not observed.

## Signed-message and instruction equivalence

- Ed25519 signatures: 18/18 locally valid.
- Signer key: \`${result.messageReuse.signerPublicKey}\` (identity/organization not inferred).
- Distinct signed messages: 6, exactly one per block and exactly three copies per block.
- Cross-block message reuse: none.
- Ed25519 reference layout: one 16-byte Ed25519 instruction referring into instruction 3 at signature bytes 16–80, public-key bytes 80–112, and signed-message bytes 114–263; identical in all 18 transactions.
- PostPyth: all six blocks classify \`byte-identical-update\` across their three Anchor transactions. Complete bytes, discriminator, accounts, order, signer/writable flags, Instructions sysvar, storage account, and oracle set are identical.
- UpdatePerpBidAskTwap: the eight instruction bytes are identical in all 18 transactions; account wrappers differ by market, oracle, and optional maker inputs.

## Pyth-maintained structural decoding

The maintained Pyth Lazer Rust protocol is pinned at commit \`${dossier.inputProvenance.sourceBlobs.find((item) => item.repositoryUrl.includes("pyth-lazer-public"))?.commit}\`. Its little-endian schema establishes magic \`2479346549\`, timestamp, channel ID, feed count, u32 feed IDs, property discriminants, and property encodings including FeedUpdateTimestamp. The Velocity source-family establishes the PDA seed \`pyth_lazer\` with the exact Velocity program ID.

| Numeric feed ID | Derived oracle PDA | Bump | Source-confirmed fields in the observed message |
|--:|:--|--:|:--|
${feedRows}

The decoded feed order maps exactly to PostPyth remaining-account positions 3, 4, and 5. Every message consumes all 149 signed bytes without trailing data. Channel ID 3 is fixed-rate 200 ms. Asset names are not inferred from numeric feed IDs. These payloads include price, best bid, best ask, exponent, and feed-update timestamp; they do not include the confidence property.

## Exact observed log branches

- Posting logs: ${result.logBranches.totals.postingLogs} (3 per first block-position Anchor transaction).
- Equality-skip logs: ${result.logBranches.totals.skippingLogs} (3 per later Anchor transaction).
- \`Instruction: UpdatePerpBidAskTwap\` logs: ${result.logBranches.totals.updateTwapInstructionLogs}.
- Failure/early-return logs: ${result.logBranches.totals.failuresOrEarlyReturns}.

All relevant Velocity log lines are preserved verbatim and in order in \`log-branch-matrix.json\`. The exact “skip” wording is observed branch evidence, not proof that no account bytes changed.

## Anchor-only conflict attribution

Each three-Anchor subgraph is a clique with 3 edges, 12 atoms, and proven current-lock wave bounds 3–3. Every pair shares four writable causes: the same three oracle PDAs plus the shared writable payer. The oracle set alone preserves all three pair edges; the payer also independently preserves all three. The distinct TWAP market accounts do not cause Anchor–Anchor edges.

The unresolved native transaction adds one atom to each Anchor transaction through that Anchor role’s market account (3 native atoms per full component). It remains excluded from semantic promotion. The authoritative four-transaction components remain unchanged at 6 edges, 15 atoms, and wave bounds 4–4.

## Deployed binary and source-family evidence

Executable SHA-256 remains \`${result.binaryCorrespondence.executableSha256}\` with \`sample-binary-continuity-established\`.

For both Anchor variants the established executable contains the Anchor discriminator bytes, instruction name, embedded Velocity source path, and exact relevant log fingerprints. The bounded analysis does not find a symbol/relocation/code reference proving the handler branch, and no exact reproducible build exists. The variants therefore reach:

1. observed declarations and logs;
2. deterministic message/PDA decoding;
3. strong deployed-binary fingerprints;
4. historical source-family behavior;
5. **not reached** — source-confirmed deployed mutation semantics.

The exact deployed skip string occurs ${result.binaryCorrespondence.deployedSkipInvestigation.occurrenceCount} time. Deployed \`next_timestamp <= current_timestamp\` is the logical complement of deployed positive \`current_timestamp < next_timestamp\`, so those two formulations are not contradictory. Public source-family code instead skips on \`next_timestamp < current_timestamp\`; it differs at equality and would admit the equality case that the deployed observations skip. This is a string-version and control-condition mismatch at equality. It is not promoted to a broader semantic mismatch without an exact build or code reference.

## Repeated-update semantic limit

The observed structure establishes:

- one signed message is presented three times per block;
- the same three derived oracle PDAs are writable targets each time;
- the first block-position Anchor path emits posting logs;
- later paths emit equal-timestamp skip logs; and
- all three separately target distinct market state for UpdatePerpBidAskTwap.

It does not establish whether later PostPyth invocations are deployed no-ops, overwrite identical state, or have another state-dependent effect. The public handler's continue-before-write branch is source-family evidence only and differs at the equality edge that matters here. UpdatePerpBidAskTwap's exact deployed field mutations likewise remain unpromoted despite before-to-after logs and strong source/binary correspondence.

## Artifacts

- \`output/research/velocity-anchor-bundle/anchor-bundle-dossier.json\`
- \`output/research/velocity-anchor-bundle/anchor-bundle-report.html\`
- \`output/research/velocity-anchor-bundle/message-reuse-matrix.json\`
- \`output/research/velocity-anchor-bundle/instruction-equivalence.json\`
- \`output/research/velocity-anchor-bundle/log-branch-matrix.json\`
- \`output/research/velocity-anchor-bundle/anchor-conflict-attribution.json\`
- \`output/research/velocity-anchor-bundle/anchor-binary-correspondence.json\`
- \`output/research/velocity-anchor-bundle/anchor-semantic-evidence.json\`

All inputs and source blobs are commit/path/hash pinned in \`research-plans/velocity-anchor-bundle-milestone-2.2.json\`. Offline replay performs zero network requests.
`;
}
