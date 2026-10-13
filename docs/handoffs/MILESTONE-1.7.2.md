# Milestone 1.7.2 handoff

Status: Conflict-Atom Attribution and Ordering Truth implemented and verified on 2026-08-28.

Base commit: ef0b039 (Milestone 1.7.1).

## Current behavior

- Declared Solana account locks remain the baseline and the only model available under current protocol locking.
- A conflict atom is one transaction A, transaction B, and conflicting account triple. Every model retains deterministic conflict edges and atoms, current and removed atoms, retained atoms, eliminated edges, and edges that survive because another account cause remains.
- Edge count and cause-atom count are separate. One transaction-pair edge can carry multiple account causes.
- Fee-payer role coupling is present only when role-preserving payer ablation removes at least one payer conflict atom. Instruction-preserved payer access is not attributed to the payer role.
- Verified loader-buffer whole-account locking is present only when semantic range refinement removes at least one buffer conflict atom. Overlapping ranges and scope-ineligible touches do not establish this cause.
- Supported cause universe, present causes, transformation applicability, removed atoms, eliminated edges, masked surviving edges, wave-depth effects, and minimal supported cause sets are separate outputs.
- Minimal supported cause sets remain reserved for transformations that reduce the generated wave upper bound.
- Byte coverage is evaluated after sorting by offset. Chronological block-order monotonicity, inversion counts, offset-sorted chunk indexes, and transaction-ordered chunk indexes are reported independently.

## Preserved baseline

The cached devnet range 488638500-488638508 still contains 148 directly observed decoded loader writes across nine observed blocks.

- Current full-block depths: 15, 15, 15, 16, 26, 15, 15, 14, 17.
- Payer-only depths: unchanged from current.
- Range-only depths: unchanged from current.
- Joint full-block depths: 3, 4, 10, 2, 6, 3, 3, 1, 3.
- Every model retains all analyzed transactions and known Compute Units.

## Slot 488638504 evidence

Generic analysis derives:

- 26 upload transactions;
- 325 conflicting transaction-pair edges;
- two current account causes per pair;
- 650 current conflict atoms;
- payer-only removal of 325 payer atoms, with 0 edges eliminated alone and 325 edges masked by buffer atoms;
- range-only removal of 325 buffer atoms, with 0 edges eliminated alone and 325 edges masked by payer atoms;
- joint removal of all 650 upload atoms and elimination of all 325 upload edges;
- upload component depth 26 to 1;
- full-block depth 26 to 6;
- all 71 transactions and all 646,522 known Compute Units retained.

The report card says: Two causes overlap on the same 325 transaction pairs.

The same block has contiguous byte coverage after sorting by offset, but chronological offsets are not monotonic. Transactions 17, 18, and 19 begin at offsets 689748, 699824, and 695244. The 26-chunk block sequence contains 31 pairwise offset-order inversions. This is descriptive block-order evidence, not arrival order, scheduler order, or runtime parallelism.

## Verification evidence

The final verification command is:

npm run verify

It performs strict TypeScript compilation, the deterministic test suite, all three standalone fixture analyses, the offline nine-block range analysis, and root/versioned handoff validation.

Expected results:

- 67 tests passed, 0 failed.
- Range schema version 1.7.2.
- Original real fixture: 45 transactions, 116 declared conflict pairs, proven current depth 15.
- Real cross-payer fixture: 51 transactions, 146 declared conflict pairs, proven current depth 17.
- Curated teaching fixture: 4 transactions, 3 declared conflict pairs, proven current depth 3.
- Nine observed cached blocks, 148 decoded writes, and the preserved depths listed above.
- HANDOFF.md and docs/handoffs/MILESTONE-1.7.2.md are byte-identical and pass the current-header/base/stop-marker validator.

Additional checks include git diff --check, repeated offline generation with JSON and HTML SHA-256 comparison, fixture-specific literal audits, and scheduling/performance overclaim audits.

The preferred browser-control runtime could not start because its Windows sandbox helper failed while applying deny-read ACLs. An isolated local Playwright fallback rendered desktop and true 390-pixel views. The measured 390-pixel page had innerWidth 390, document scroll width 390, and body scroll width 390. Rendered-page assertions confirmed the default slot, the exact cause-contribution rows, all depth and retention metrics, 646,522 formatting, the ordering statement and 31 inversions, and the expandable 36-row matrix.

## Generated artifacts

- output/analysis.json
- output/report.html
- output/cross-payer-real/analysis.json
- output/cross-payer-real/report.html
- output/cross-payer-teaching/analysis.json
- output/cross-payer-teaching/report.html
- output/range-488638500-488638508/range-analysis.json
- output/range-488638500-488638508/range-report.html
- Desktop and true-390 visual-QA screenshots alongside the range reports.

## Interpretation limits

- Results describe declared account contention, potential parallelism, and estimated execution waves. They do not reconstruct a validator's exact private schedule.
- The two-cause universe is complete only for the two supported graph transformations; it is not real-world causal exhaustiveness.
- Atom removal does not imply edge elimination, and edge elimination does not by itself imply a wave-depth reduction.
- Transaction order is block-order evidence only, not proof of arrival, scheduling, execution, or runtime parallelism.
- Semantic footprints do not change current runtime lock behavior.
- Compute Units are workload context, not duration, waiting time, throughput, utilization, or recoverable performance.
- No wallet, private key, transaction submission, trading, Jito, MEV extraction, private-auction reconstruction, streaming, or hosting capability was added.

## Next milestone

Stop for user review. Do not add semantic instruction families or begin another milestone without a new request.

Stop after Milestone 1.7.2.
