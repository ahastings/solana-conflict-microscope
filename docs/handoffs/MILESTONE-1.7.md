# Milestone 1.7 handoff

Status: Semantic Lock Footprints and Causal Ablation implemented and verified on 2026-08-27.

Base commit: `143fa53` (Milestone 1.6).

## Current behavior

- Declared Solana account locks remain the baseline and the only model available under current protocol locking.
- Verified decoded BPF Upgradeable Loader `Write` instructions may carry an exact semantic byte-range footprint for the target buffer. Every footprint records the operation type, half-open byte range, coordinate system, prerequisites, confidence, precision, and pinned source evidence.
- Refinement is deliberately all-or-nothing per buffer in the analyzed transaction set. Failed transactions, unknown or mixed instructions, malformed payloads, and any unverified touch fall back to whole-account contention.
- Four deterministic retained-transaction models are produced for supported blocks and components:
  1. current declared-account locks;
  2. fee-payer decoupling;
  3. semantic byte-range refinement;
  4. the joint payer-and-range counterfactual.
- Each model reports clique lower and generated-wave upper bounds, whether they match, retained transaction count, retained known Compute Units, unknown-CU count, availability under current Solana locking, and a conservative interpretation.
- Causal ablation reports the payer and buffer-lock causes, minimal cause sets that change generated depth, and whether the joint model has an interaction not produced by either single-factor ablation.
- Cross-block upload evidence now distinguishes requested-range completeness from lifecycle completeness. Arithmetic aligned chunk indexes are relative to byte zero and are not presented as protocol upload sequence numbers.
- The range report presents the complete four-model matrix, lifecycle evidence, alignment limits, and a prioritized recurring-contention view while retaining the complete raw index in expandable HTML and JSON.

## Primary-source basis

- Agave v4.1.2, commit `182084b82aae88b1b0731540f63bf7416f27773a`, `programs/bpf_loader/src/lib.rs`.
- `solana-loader-v3-interface` v8.1.0, commit `7e9bdc9386b6dcb5d254be23786a7e6ee5521d21`, `loader-v3-interface/src/instruction.rs`.
- Official Solana loader deployment and program execution documentation, accessed 2026-08-27.
- The reviewed loader branch checks the buffer state, authority presence/equality/signature, and bounds, then copies only the supplied bytes into the buffer data slice. It does not resize the account or change buffer metadata or lamports in that branch.
- Therefore disjoint successful writes conditionally commute only as buffer-account state transitions from the same valid prestate. This does not imply that current Solana runtime locks, account versioning, fees, hashing, consensus, or a validator's private schedule operate at byte-range granularity.

Detailed citations, uncertainties, and the runtime-versus-state-transition distinction are in `RESEARCH.md`. ADR-014 through ADR-017 record the design choices.

## Reproducible evidence

The cached devnet range `488638500-488638508` contains 148 directly observed decoded writes across nine observed blocks. They cover 135,568 contiguous bytes from offsets 633872 through 769439, with no internal gap, duplicate, or overlap.

- Requested-range coverage: complete.
- Upload start boundary observed: no.
- Upload end boundary observed: no.
- Lifecycle completeness: `boundaries-unknown`.
- Uniform byte-zero aligned chunk indexes: 692 through 839.
- Current proven depths by slot: 15, 15, 15, 16, 26, 15, 15, 14, 17.
- Fee-payer-only depths: unchanged from current.
- Range-only depths: unchanged from current.
- Joint depths: 3, 4, 10, 2, 6, 3, 3, 1, 3.
- Every model retains every analyzed transaction and all known Compute Units. The depth change is compatibility-model ablation, not transaction removal and not a throughput or wall-clock measurement.

The joint-only reductions show an interaction: removing fee-payer coupling alone or refining the buffer lock alone leaves another shared cause, while applying both changes removes both modeled causes. These are hypothetical semantic counterfactuals and are not supported by current Solana account locking.

## Verification evidence

Exact final command:

`npm run verify`

It performs:

- strict TypeScript compilation;
- the complete deterministic test suite;
- all three single-block fixture analyses;
- offline nine-block range analysis;
- root/versioned handoff validation.

Expected final result after this handoff is installed:

- 53 tests passed, 0 failed.
- Original real fixture: 45 transactions, 116 declared conflict pairs, proven current depth 15.
- Real cross-payer fixture: 51 transactions, 146 declared conflict pairs, proven current depth 17.
- Curated teaching fixture: 4 transactions, 3 declared conflict pairs, proven current depth 3.
- Nine observed cached blocks and the joint depths listed above.
- `HANDOFF.md` and `docs/handoffs/MILESTONE-1.7.md` are byte-identical and pass the stale-header/stop-marker validator.

Additional checks:

- `git diff --check`.
- Repeated offline range generation with byte hashes compared for deterministic JSON and HTML.
- Source audit for fixture-specific slot/address/index logic and prohibited scheduling/performance overclaims.
- Headless Chrome rendered both standalone reports at desktop and narrow widths. Desktop screenshots were visually inspected; a narrow stress render exposed containment weaknesses, so the generated CSS now constrains grid children, long identifiers, wide tables, and tooltips. Chrome's command-line narrow screenshot cropped a larger internal layout rather than providing exact device emulation, so it was not treated as proof of a true 390-pixel viewport.
- Final rendered-DOM checks confirmed an active selected finding, the four-model causal matrix, nine slot controls, initialized technical evidence for slot 488638500, and the proven joint depth of 1 for slot 488638507.
- The in-app browser runtime could not start because its Windows sandbox helper failed while applying deny-read ACLs; the headless Chrome fallback is recorded rather than described as in-app-browser success.

Generated artifacts:

- `output/analysis.json`
- `output/report.html`
- `output/cross-payer-real/analysis.json`
- `output/cross-payer-real/report.html`
- `output/cross-payer-teaching/analysis.json`
- `output/cross-payer-teaching/report.html`
- `output/range-488638500-488638508/range-analysis.json`
- `output/range-488638500-488638508/range-report.html`

## Interpretation limits

- Results describe declared account contention, potential parallelism, and estimated execution waves. They do not reconstruct a validator's exact private schedule.
- Semantic footprints describe verified instruction-level state mutations under explicit prerequisites; they do not change current runtime lock behavior.
- A pair of disjoint successful loader writes is conditionally commutative at the buffer state-transition level only. Transaction-level effects and current runtime behavior remain outside that claim.
- Same payer is an address-level pattern, not proof of common ownership.
- Compute Units are workload context, not duration, waiting time, throughput, utilization, or recoverable performance.
- No wallet, private key, transaction submission, trading, Jito, MEV extraction, private-auction reconstruction, streaming, or hosting capability was added.

## Next milestone

Stop for user review. A later milestone could broaden semantic footprints only for additional instruction families whose exact mutations and prerequisites are established from pinned primary sources, while preserving conservative whole-account fallback.

Stop after Milestone 1.7.
