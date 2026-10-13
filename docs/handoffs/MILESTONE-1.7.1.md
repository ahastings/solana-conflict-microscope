# Milestone 1.7.1 handoff

Status: Role-Preserving Ablation and Interaction Surface implemented and verified on 2026-08-28.

Base commit: `b920b9d` (Milestone 1.7).

## Current behavior

- Declared Solana account locks remain the baseline and the only model available under current protocol locking.
- Fee-payer ablation removes only the synthetic fee-debit access. If the same address is an operand of any normalized outer or inner instruction, that declared instruction access is preserved.
- Each payer counterfactual reports whether it is fully applicable, partially applicable, or blocked by instruction use, with removed and preserved access counts.
- Semantic range refinement is precomputed for every candidate buffer over the analyzed scope. Failed transactions, unverified or mixed touches, lifecycle or authority mutation, resize-like operations, or incomplete prerequisites block refinement for that buffer and preserve whole-account locking.
- The supported cause universe contains exactly two modeled causes: fee-payer role coupling and verified loader-buffer whole-account locking. Results describe a minimal supported cause set, not an exhaustive real-world causal account.
- Reports place a prominent `Joint-only interaction detected` card above the detailed matrix. The full four-model matrix remains available in expandable technical details.
- When no modeled conflict edge remains, the output says: `No conflict edges remain in this model; one wave is sufficient.`

## Preserved Milestone 1.7 evidence

The cached devnet range `488638500-488638508` still contains 148 directly observed decoded writes across nine observed blocks.

- Current proven depths by slot: 15, 15, 15, 16, 26, 15, 15, 14, 17.
- Fee-payer-only depths: unchanged from current.
- Range-only depths: unchanged from current.
- Joint full-block depths: 3, 4, 10, 2, 6, 3, 3, 1, 3.
- Transaction and known Compute Unit totals are retained in every model.

For slot `488638504`, the selected upload component changes from depth 26 to 1 only under the joint counterfactual. The full block changes from depth 26 to 6 while retaining 71 transactions and 646,522 known Compute Units.

The report explanation is deliberately bounded: Neither modeled change helps alone because the other lock cause remains. Applying both hypothetical changes removes both modeled causes from the upload component. Other block conflicts still remain.

## Verification evidence

The final verification command is:

`npm run verify`

It performs strict TypeScript compilation, the deterministic test suite, all three standalone fixture analyses, the offline nine-block range analysis, and root/versioned handoff validation.

Expected results:

- 61 tests passed, 0 failed.
- Original real fixture: 45 transactions, 116 declared conflict pairs, proven current depth 15.
- Real cross-payer fixture: 51 transactions, 146 declared conflict pairs, proven current depth 17.
- Curated teaching fixture: 4 transactions, 3 declared conflict pairs, proven current depth 3.
- Nine observed cached blocks, 148 decoded writes, and the preserved joint full-block depths listed above.
- `HANDOFF.md` and `docs/handoffs/MILESTONE-1.7.1.md` are byte-identical and pass the current-header/base/stop-marker validator.

Additional checks include `git diff --check`, repeated offline generation with JSON and HTML hash comparison, and source audits for fixture-specific identifiers and prohibited scheduling or performance overclaims.

Headless Chrome rendered the standalone and range reports at desktop and narrow widths. Visual inspection confirmed that the interaction card is prominent, defaults to slot `488638504`, remains readable at the narrow width, and exposes the complete 36-row matrix in expandable details. Rendered-DOM checks cover the selected slot, depth values, retained transaction and Compute Unit totals, supported cause set, exact bounded explanation, and matrix row count. The in-app browser runtime could not start because its Windows sandbox helper failed while applying deny-read ACLs; this headless Chrome fallback is recorded rather than described as in-app-browser success.

## Generated artifacts

- `output/analysis.json`
- `output/report.html`
- `output/cross-payer-real/analysis.json`
- `output/cross-payer-real/report.html`
- `output/cross-payer-teaching/analysis.json`
- `output/cross-payer-teaching/report.html`
- `output/range-488638500-488638508/range-analysis.json`
- `output/range-488638500-488638508/range-report.html`
- Desktop and narrow visual-QA screenshots alongside the generated reports.

## Interpretation limits

- Results describe declared account contention, potential parallelism, and estimated execution waves. They do not reconstruct a validator's exact private schedule.
- The two-cause universe is the complete supported cause universe for this milestone only; it is not a claim that all real contention causes have been identified.
- Semantic footprints describe verified instruction-level state mutations under explicit prerequisites; they do not change current runtime lock behavior.
- Same payer is an address-level pattern, not proof of common ownership.
- Compute Units are workload context, not duration, waiting time, throughput, utilization, or recoverable performance.
- No wallet, private key, transaction submission, trading, Jito, MEV extraction, private-auction reconstruction, streaming, or hosting capability was added.

## Next milestone

Stop for user review. Do not broaden the semantic instruction-family surface or begin another milestone without a new request.

Stop after Milestone 1.7.1.
