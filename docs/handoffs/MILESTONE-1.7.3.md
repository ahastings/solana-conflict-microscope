# Milestone 1.7.3 handoff

Status: Interaction Taxonomy and Empty-State Truth implemented and verified on 2026-08-28.

Base commit: 67141d1 (Milestone 1.7.2).

## Current behavior

- Declared Solana account locks remain the authoritative baseline. Semantic counterfactuals remain hypothetical graph transformations.
- Same-pair cause overlap and joint-only generated-wave depth reduction are independent outputs.
- The four presentation classes are same-pair masking plus joint-only reduction, separate-bottleneck joint-only reduction, same-pair overlap without reduction, and no supported interaction.
- Each interaction record exposes overlap count, individual and joint depth reductions, Joint removed atoms, eliminated edges, masked surviving edges, and residual conflict edges.
- Joint contribution rows use model-derived values. A surviving unsupported third-account cause remains visible as a masked and residual edge.
- Residual wording follows the selected Joint full-block conflict-edge count.
- Static range HTML starts with a neutral state. No-sequence, no-supported-cause, and no-joint-only states do not retain a stale positive heading.
- Default selection prioritizes joint-only reduction, full-block reduction, component reduction, current component depth, earliest slot, and sequence order.
- Primary 1.7.3 JSON and prose use block-order terminology. Deprecated 1.7.2 chronological-named fields remain serialized as compatibility aliases.

## Preserved baseline

The cached devnet range 488638500-488638508 still contains 148 directly observed decoded loader writes and 135,568 observed bytes.

- Current full-block depths: 15, 15, 15, 16, 26, 15, 15, 14, 17.
- Payer-only depths: unchanged from current.
- Range-only depths: unchanged from current.
- Joint full-block depths: 3, 4, 10, 2, 6, 3, 3, 1, 3.
- Every model retains all analyzed transactions and known Compute Units.

Slot 488638504 remains 26 upload transactions, 325 edges, and 650 current atoms. Each individual supported transformation removes 325 atoms and eliminates no edge because the other supported cause masks every pair. The Joint model removes 650 atoms, eliminates 325 upload edges, changes the upload component from depth 26 to 1 and the full block from 26 to 6, and retains all 71 transactions and 646,522 known Compute Units. Other modeled full-block conflicts still remain.

Slot 488638507 has Joint full-block depth 1 and zero Joint full-block conflict edges. The report states: No other modeled full-block conflicts remain under this counterfactual.

## Verification evidence

The final verification command is:

npm run verify

It performs strict TypeScript compilation, the deterministic suite, three standalone fixture analyses, offline nine-block range analysis, and current handoff validation.

Expected results:

- 77 tests passed, 0 failed.
- Range schema version 1.7.3.
- Original real fixture: 45 transactions, 116 declared conflict pairs, proven current depth 15.
- Real cross-payer fixture: 51 transactions, 146 declared conflict pairs, proven current depth 17.
- Curated teaching fixture: 4 transactions, 3 declared conflict pairs, proven current depth 3.
- Nine observed cached blocks and the preserved depths above.
- HANDOFF.md and docs/handoffs/MILESTONE-1.7.3.md are byte-identical.

Additional completion checks include git diff --check, repeat SHA-256 hashes for all eight generated JSON/HTML artifacts, fixture-number audits, hardcoding scans, and runtime/scheduling overclaim scans.

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
- Interaction categories are properties of two defined graph transformations and do not establish runtime causality.
- The supported cause universe is not real-world causal exhaustiveness.
- Atom removal, edge elimination, and wave-depth reduction remain distinct.
- Transaction order in the block is not arrival, scheduling, or execution chronology.
- Compute Units are workload context, not duration, waiting time, throughput, utilization, or recoverable performance.
- No wallet, private key, transaction submission, trading, Jito, MEV extraction, private-auction reconstruction, streaming, or hosting capability was added.

Stop after Milestone 1.7.3.
