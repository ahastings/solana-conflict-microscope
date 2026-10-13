# Milestone 1.5.1 handoff

Status: Findings Layer and Truthful Labels implemented and verified on 2026-08-27.

## Current behavior

- New structural edge labels are fee-payer-only, same-payer shared account, cross-payer shared account, and other.
- `normalizeConflictClass` maps the two Milestone 1.5 legacy serialized labels to current names.
- Components expose independent `cause`, `actorPattern`, and `actionability` conclusions with confidence and evidence.
- Singleton components use the exact required no-conflict sentence and are excluded from `notableFindings`.
- The block, each nontrivial component, and supported counterfactuals expose clique lower bounds, generated-wave upper bounds, match status, and a proven minimum when equal.
- Program-buffer writes are grouped by decoded buffer and authority, sorted, partitioned into maximal contiguous sequences, and audited for gaps, overlaps, and varying sizes.
- `notableFindings` deduplicates components selected for independent structural, compute, semantic, and actionability reasons.
- Known-CU coverage is explicit so compute rankings can be qualified when data is incomplete.
- The standalone report begins with selectable finding cards and an initialized evidence panel. Selection drives the graph, evidence dimensions, roles, shares, and component waves; the full-block timeline remains separate.
- Curated-teaching and synthetic reports display a sticky, high-contrast "CURATED TEACHING FIXTURE &mdash; NOT OBSERVED NETWORK ACTIVITY" banner.

## Required fixture evidence

Slot 488638500:

- 15 decoded loader writes form one contiguous sequence.
- Each chunk is 916 bytes.
- First offset 633872; last starting offset 646696.
- Total 13740 bytes; final covered byte 647611.
- The component creates 105 of 116 pairs and has a proven 15-wave minimum.

Slot 488638508:

- 17 decoded loader writes form one contiguous sequence.
- Each chunk is 916 bytes.
- First offset 753868; last starting offset 768524.
- Total 15572 bytes; final covered byte 769439.
- A separate notable component contains transactions 29 and 38.
- It has two fee payers, two Airdrop-log transactions, and two decoded 20,000,000-lamport System Program transfers.
- The transfers share one writable source and have different destinations.
- It creates one of 146 conflict pairs, has a proven two-wave minimum, and represents 23.2% of known block CU.
- Cause is transfer/funding source; actor pattern is cross payer; actionability is insufficient evidence. It is not labeled application-state contention.

Teaching fixture:

- Three distinct payers update one decoded application-state account.
- Cause is application state and actor pattern is cross payer.
- Actionability remains insufficient evidence because no logical-independence proof or concrete alternative partitioning is present.
- The prominent teaching banner is visible at the top of the report.

## Verification evidence

`npm run verify`

- Strict TypeScript compilation passed.
- Tests: 35 passed, 0 failed.
- All three analysis JSON files and standalone HTML reports regenerated.
- Original fixture: 45 transactions, 116 pairs, 100% known-CU coverage, proven 15-wave minimum.
- Real cross-payer fixture: 51 transactions, 146 pairs, 100% known-CU coverage, proven 17-wave minimum, two notable findings.
- Teaching fixture: 4 transactions, 3 pairs, 100% known-CU coverage, proven 3-wave minimum.

Additional audits:

- Embedded report JavaScript parses in the test suite.
- Deterministic JSON and HTML comparisons pass after runtime is normalized.
- Source scan found no Unicode replacement or control glyphs after the visual fix.
- Headless Chrome screenshots at `output/cross-payer-real/report-qa.png` and `output/cross-payer-teaching/report-qa.png` were visually inspected.
- The real screenshot visibly shows the 17-write upload card and the separate 2-Airdrop/1-pair/23.2%-CU card.
- The teaching screenshot visibly shows the corrected prominent banner and selected application-state finding.

## Interpretation limits

- Results describe declared account contention, potential parallelism, and analytical wave bounds, not validator scheduling.
- Same payer is an address-level pattern, not verified common ownership.
- Decoded cause confidence does not imply actionability.
- Compute and pair shares are workload context, not wait time, duration, throughput, utilization, or recoverable performance.
- No current component is potentially redesignable because none includes evidence of logical independence plus a concrete alternative account layout.

Stop after Milestone 1.5.1. Nothing should be pushed or published without explicit permission.
