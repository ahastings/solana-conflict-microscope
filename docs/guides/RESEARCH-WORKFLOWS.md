# Historical research workflows

These commands document the imported research baseline. Run them from the project root. They require ignored, hash-pinned caches and generated artifacts that are not part of the portable source preview. The opening Milestone 2.2 summary below is historical; later evidence is recorded in docs/handoffs/MILESTONE-2.3.md through MILESTONE-3.0.md.

# Solana Conflict Microscope

A read-only local analyzer for declared Solana account contention. Milestone 2.2 proves the repeated three-transaction Velocity Anchor-bundle structure in all six Candidate #3 observations: one locally verified Pyth Lazer message is copied into three byte-identical Post instructions, the first block-position Anchor path emits posting logs, and the later two emit equal-timestamp skip logs while targeting three distinct TWAP markets. The outcome is `repeated-update-structure-established-semantics-incomplete`: both Anchor variants reach evidence Level 4, not source-confirmed deployed mutation semantics. The five-account native path remains unresolved and excluded.

It does not reconstruct validator scheduling, measure transaction wait time, or claim recoverable performance. It is not a trading system.

## Requirements and setup

- Node.js 20 or newer
- npm

```bash
npm ci
npm run verify
```

`npm run verify` performs strict TypeScript compilation, runs all tests, generates the three single-block reports, and replays the cached nine-block range, committed 500-slot discovery plan, Candidate #1 dossier, Milestone 2.0 sourceability/Candidate #3 dossier, Milestone 2.1 binary archaeology, and Milestone 2.2 Anchor-bundle research without network access. It finishes by validating byte-identical root and versioned handoffs.

## Discover contention candidates

```bash
npm run discover-contention -- --cluster devnet --latest --window-count 5 --window-size 100 --window-stride 10000 --cache-dir cache/discovery-devnet --output-dir output/discovery-devnet --top 20
```

`--latest` is resolved once. The concrete windows are written to `discovery-plan.json`, successful dual-encoding block responses are cached, and each block is reduced to compact component evidence before the next bounded batch. The discovery index does not embed complete normalized transactions, instruction payloads, conflict edges/atoms, waves, or counterfactual models.

Useful options include `--rpc-url`, `--delay-ms`, `--concurrency`, `--max-retries`, `--backoff-ms`, `--skip-slots`, `--json-budget-bytes`, and `--html-budget-bytes`. An explicit `--start-slot`/`--end-slot` range is supported. The scan is capped at 500 requested slots and never submits a transaction.

Replay an already-resolved plan without network access:

```bash
npm run discover-contention -- --plan discovery-plans/milestone-1.8-devnet.json --offline
```

Stage A writes `discovery-plan.json`, `discovery-index.json`, `discovery-report.html`, and `candidate-research-queue.md`. Stage B writes complete `analysis.json` and `report.html` files only under the top-K candidate directories. Ranking uses exposed reason tags and deterministic tiers/tie-breakers; likely vote, loader, same-payer repetition, System funding, known program/sysvar, and fee-payer-only patterns remain visible in separate infrastructure buckets.

The required Milestone 1.8 devnet run observed all 500 requested slots in five 100-slot windows, found 70 compact candidates, placed 19 unfamiliar candidates in priority tiers 1-2, and materialized 20 top candidates. These are research leads. None is labeled redesignable without verified logical independence, state-transition semantics, and a concrete alternative layout or execution rule.

## Research candidate #1

```bash
npm run research-candidate -- --plan research-plans/candidate-ff30780de8479976.json --offline
```

The committed manifest pins the exact two-account identity, all 25 recurrence slots, discovery references, cached block/source/snapshot paths, provenance, structural expectations, and SHA-256 hashes. Offline replay independently resolves the exact candidate in every referenced cached block and writes seven compact artifacts under `output/research/candidate-ff30780de8479976/`, plus `docs/research/CANDIDATE-FF30780DE8479976.md`.

The current evidence-based outcome is `black-box-structure-only`: 25/25 exact references, 59 candidate transactions, 118 deterministically decoded and locally verified Ed25519 signatures, four observed structural component variants, one 35-byte BQsAJ instruction layout, and three 120-byte program-data log groups. No authoritative public source identifies the exact program or establishes its shared-account mutations. Current account snapshots are explicitly current-at-context-slot evidence, not historical state. No semantic decoder, commutativity finding, redesign conclusion, or new counterfactual follows from this dossier.

## Triage sourceability and research Candidate #3

```bash
npm run research-velocity -- --sourceability-plan research-plans/sourceability-milestone-2.0.json --candidate-plan research-plans/candidate-043c938568ad5e15.json --offline
```

The sourceability plan groups all 19 high-priority unfamiliar candidates into six invoked-program families. It records an evidence-ladder state and explicit research-priority reasons while preserving every original discovery rank and contention fact. Candidate #2 remains a valid rank-2 lead: its six-block, two-payer, one-shared-account, proven-depth-2 evidence is retained and its disposition is `deferred-not-rejected`; the bounded triage simply found no exact authoritative mutation-level source path.

Official Velocity documentation authoritatively associates `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P` with Velocity. Offline replay independently revalidates Candidate #3's exact six-account identity in all six referenced blocks. Each occurrence contains four successful transactions, two payers, six edges, 15 conflict atoms, proven depth four, and complete known-compute coverage. The dossier also parses and locally verifies 18 Ed25519 signatures using 54 cross-instruction references.

The outcome is `identity-found-semantics-incomplete`. The public protocol-v2 tree is only a source-family match: no verified build, release hash, or reproducible mapping connects it to the deployed executable, and the observed successful five-account native discriminator-2 path conflicts with the pinned source-family handler's six-account minimum. Deployed mutations and semantic independence therefore remain unknown, the actionability gate is closed, and no semantic decoder or counterfactual was added.

Compact outputs live under `output/research/sourceability/` and `output/research/candidate-043c938568ad5e15/`; the evidence narrative is `docs/research/CANDIDATE-043C938568AD5E15.md`. Complete raw block analyses remain in existing external caches rather than being embedded in the dossier.

## Reproduce Velocity deployed-binary archaeology

```bash
npm run research-velocity-binary -- --plan research-plans/velocity-binary-milestone-2.1.json --offline
```

The committed plan pins the ProgramData snapshot, complete ProgramData-address history, authoritative loader source, public source-history evidence, build-environment evidence, and all prior-artifact preservation hashes. Offline replay extracts the 6,050,397-byte ELF64-SBF payload at ProgramData offset 45 and verifies SHA-256 `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`.

Continuity is `sample-binary-continuity-established`: the program pointer, decoded upgrade at slot 488659528, complete 30-signature ProgramData history, absence of a later ProgramData mutation through snapshot slot 490041839, and all six later sample slots jointly establish the evidence. Address equality alone is not used.

The strongest pre-deployment public Velocity candidate is commit `f7df335599c194bc759cebf682a11bcad6bd5ed2`. It supplies the exact program ID, source paths, Anchor discriminators, instruction names, and posting log present in the binary. It does not supply native opcode 2. Public Drift commit `ffd10b2bd6a009e66aaaf42bb065387ccc1c72c8` supplies opcode 2 only as a six-account handler whose position 4 must be the System Program, contradicting the observed five-account instruction whose position 4 is writable and Velocity-owned. No inspected public source contains the deployed `<=` skip log.

The pinned build recipe could not be executed on this host because no usable Solana/Anchor/Rust/verifiable-build runtime was available, so the build result is `build-unavailable` and no exact binary match is claimed. The two Anchor variants are independently `strong`; the native variant is `unresolved`. Outputs live under `output/research/velocity-binary/`, with the audit narrative in `docs/research/VELOCITY-DEPLOYED-BINARY-CORRESPONDENCE.md`.

## Reproduce Velocity Anchor-bundle research

```bash
npm run research-velocity-anchor-bundle -- --plan research-plans/velocity-anchor-bundle-milestone-2.2.json --offline
```

The manifest pins all 24 component transactions, instruction-data and account-list hashes, logs, signed-message hashes, six source caches, every dossier/binary input, the established executable, the Velocity source-family commit, and a Pyth-maintained Lazer protocol commit. Offline replay writes eight compact artifacts under `output/research/velocity-anchor-bundle/` plus `docs/research/VELOCITY-ANCHOR-BUNDLE.md`.

Each Anchor-only subgraph is a 3-clique with 12 atoms and proven current-lock wave bounds 3–3. Every pair shares the same three writable oracle PDAs plus the same writable payer; either cause set independently preserves the clique. The unresolved native transaction adds one market-account atom to each Anchor path but contributes no semantic evidence.

The exact repeated topology is established, including six distinct 149-byte messages, feed IDs 6/1/2, exact PDA derivations, 18 posting logs, 36 equality-skip logs, and 18 TWAP instruction logs. The word “skip” is not treated as proof of no mutation. The established executable, deployed format-string fragments, and historical handler source reach evidence Levels 1–4, but the public `<` skip condition differs from the deployed equality edge and no exact build or bounded code reference proves the deployed branch. No Anchor semantic decoder or optimization is authorized.

## Analyze a cached or fetchable range

```bash
npm run analyze-range -- --start-slot 488638500 --end-slot 488638508 --cache-dir cache/contention-devnet --output-dir output/range-488638500-488638508
```

The command always checks `slot-N.json` cache entries first. By default, a cache miss is recorded as `missing` and no network call is made. Add `--fetch-missing` to make read-only `getBlock` requests for missing slots, or add `--offline` to guarantee cache-only replay. The flags are mutually exclusive. Fetches use bounded exponential retry for rate limits and cache successful responses. Unavailable and explicitly skipped slots are persisted in sidecars so a run can resume without repeating settled work.

Useful options:

- `--rpc-url URL` selects the read-only Solana endpoint.
- `--skip-slots 123,124` records intentional skips explicitly.
- `--max-retries N` bounds retries from 0 through 8.
- `--backoff-ms N` sets the initial exponential backoff.

Range output consists of `range-analysis.json`, `range-report.html`, and a terminal summary. Provenance records the requested range, each observed/missing/unavailable/failed/skipped slot, source mode, retrieval time, and source fixture metadata.

### Cross-block evidence model

Decoded BPF Upgradeable Loader writes are grouped by buffer and authority and partitioned when decoded lifecycle evidence establishes a boundary. The analyzer reports observed chunks, exact covered byte ranges, duplicates, overlaps, gaps, varying sizes, authority changes, and decoded lifecycle events. Alignment-based missing-chunk counts are hypotheses only and never increase observed counts.

For each observed block in a stitched sequence, the output retains the underlying semantic finding, conflict-pair contribution, known Compute Units, component wave bounds, full-block generated depth, and generated depth after excluding the upload component. Aggregate values sum counts only; per-block percentages are never added across blocks.

The bundled devnet cache establishes that slots 488638500-488638508 contain 148 directly observed, contiguous 916-byte writes spanning offsets 633872-769439. Slot 488638500 contains 15 chunks, the seven intervening blocks contain 116 chunks, and slot 488638508 contains 17 chunks. Thus the 106,256-byte open interval and the full 135,568-byte aligned span are observed here, not reconstructed by interpolation.

The recurring-contention index lists writable accounts that contribute conflict pairs in more than one observed block, together with observed slots, distinct declared fee payers, cross-payer pairs, invoked programs, and decoded roles. It is candidate discovery only and does not claim redesignability.

### Semantic footprints and causal ablation

For RPC-decoded BPF Upgradeable Loader `Write` instructions, pinned primary-source analysis verifies an exact buffer-program-data byte range plus read-only buffer-state, authority, signer, and bounds prerequisites. The declared writable account remains unchanged. Failed, unknown, partially decoded, raw-only, or mixed buffer operations use conservative whole-account semantics.

Supported findings compare four models:

1. current declared account locks;
2. role-preserving fee-payer-decoupled analytical counterfactual;
3. verified byte-range refinement with real fee-payer locks preserved; and
4. the joint payer-decoupled plus byte-range counterfactual.

Payer ablation removes only synthetic fee-debit access. If the payer address is also an operand of any outer or inner instruction, its original declared read/write access is preserved conservatively. Each model records whether payer ablation is fully applicable, partially applicable, or blocked by instruction use.

Buffer refinement is precomputed per target buffer and analyzed scope. It is eligible only when every touching transaction succeeded, every instruction touch has an exact verified footprint, no lifecycle/authority/resize/unknown/mixed touch exists, and every semantic prerequisite is represented. A single blocker preserves whole-account conflicts for that buffer throughout the scope and is recorded as evidence.

Every model retains every scoped transaction and its Compute Units. Reports show lower/upper wave bounds, proven minima only when bounds match, minimal supported cause sets, and joint-only interaction. The exhaustive supported cause universe is limited to fee-payer role coupling and verified loader-buffer whole-account locking; this is not arbitrary N-cause discovery. Semantic counterfactuals are unavailable under current Solana whole-account locking and do not establish practical runtime implementability.

Each conflict atom is one (transaction A, transaction B, conflicting account) triple. Models retain deterministic atom and edge lists, removed and retained atoms relative to current locks, eliminated edges, and edges that survive because another account cause remains. Edge count and atom count are distinct: one transaction-pair edge can carry several account causes.

Supported cause presence comes only from actual atom removal. A blocked payer transformation with no removed synthetic payer atom does not establish fee-payer role coupling. An eligible but overlapping buffer range does not establish coarse whole-account locking because its buffer atom remains. Applicability, present causes, removed atoms, eliminated edges, masked surviving edges, wave-depth effects, and minimal supported cause sets are reported separately.

The range report leads with a slot-selectable interaction card and keeps the full 36-row matrix in expandable technical details. For slot 488638504, 26 upload transactions have 325 current transaction-pair edges and 650 conflict atoms. Payer-only removal deletes 325 atoms while all edges remain masked by buffer atoms; range-only removal deletes the other 325 atoms while all edges remain masked by payer atoms; the joint transformation deletes all 650 atoms and all 325 upload edges. The upload component changes 26-to-1 and the full block changes 26-to-6 while retaining all 71 transactions and all 646,522 known Compute Units.

The range report distinguishes complete observation inside the requested slot range from complete upload-lifecycle coverage. For the bundled nine-block run, requested-range coverage is complete, but neither the upload start nor end boundary is observed. Offsets 633872 and 768524 correspond arithmetically to byte-zero-aligned positions 692 and 839 for 916-byte chunks; these are not protocol upload sequence numbers.

Byte coverage and transaction ordering are independent evidence. The report says Contiguous byte coverage after sorting by offset. It separately records whether block-order offsets are monotonic, the pairwise block-order inversion count, and both offset-sorted and transaction-ordered chunk indexes. Slot 488638504 is contiguous after offset sorting but not block-order monotonic: transactions 17, 18, and 19 begin at 689748, 699824, and 695244, and the block contains 31 block-order offset inversions. Transaction order in the block is descriptive evidence, not proof of arrival order, scheduler order, or runtime parallelism.

## Analyze fixtures offline

```bash
npm run analyze -- --fixture fixtures/real-devnet-block.json --output-dir output
npm run analyze -- --fixture fixtures/cross-payer-devnet-block.json --output-dir output/cross-payer-real
npm run analyze -- --fixture fixtures/cross-payer-application-state-teaching.json --output-dir output/cross-payer-teaching
```

Open each `report.html` directly in a browser. The adjacent `analysis.json` contains complete evidence and metrics.

### Fixture provenance

| Fixture | Status | Meaning |
|---|---|---|
| `real-devnet-block.json` | Real devnet slot 488638500 | Program-deployment workload with 15 RPC-decoded BPF Upgradeable Loader `write` transactions. |
| `cross-payer-devnet-block.json` | Real devnet slot 488638508 | Scanner-discovered cross-payer writable conflict. Decoded evidence identifies a shared System Program transfer source, so it is **not** labeled application state. |
| `cross-payer-application-state-teaching.json` | Curated deterministic teaching data | Demonstrates three distinct fee payers updating one decoded `stateAccount`. It is never presented as observed network behavior. |

Real fixtures contain paired `jsonParsed` and raw `json` evidence. Provenance records cluster/endpoint, retrieval time, mode, and real-versus-teaching status.

## Analyze a historical slot

```bash
npm run analyze -- --slot 488638500 --rpc-url https://api.devnet.solana.com
```

The CLI makes two read-only `getBlock` requests, one parsed and one raw, so parsed semantics and compiled account indexes/data are both retained. Public RPC endpoints may rate-limit or omit historical slots.

## Find cross-payer contention

```bash
npm run find-contention -- --start-slot 488638500 --count 200 --rpc-url https://api.devnet.solana.com
```

The scanner is bounded to 500 slots per run, waits between requests, ranks accounts by cross-payer shared writable conflict pairs, and caches successful block responses under `cache/contention` by default. It never submits transactions.

Replay cached or saved fixtures without network access:

```bash
npm run find-contention -- --start-slot 488638500 --count 200 --offline --fixture-dir fixtures
```

## Meaning-layer methodology

### Conflict causes

Two transactions conflict when they share an account and at least one declares it writable. Every unique transaction pair is counted once as an edge, while each conflicting account on that edge is counted separately as a conflict atom.

Edge structure is labeled without guessing account meaning:

- fee-payer-only;
- same-payer shared-account;
- cross-payer shared-account;
- other.

Per-account statistics report unique pair coverage and split exclusive from overlapping pairs. These counts are intentionally not presented as additive. Repeated account cause sets become contention signatures.

Legacy serialized edge labels "fee-payer-plus-state" and "cross-payer-shared-state" can be normalized through the exported compatibility helper, but new analysis output does not emit those state-assuming names.

### Instructions and roles

Normalization retains outer/inner instructions, invoked program IDs, deterministic known program/sysvar labels, parsed types and fields, raw compiled instructions, account indexes/addresses, base58 data, stack heights, and program logs.

Roles are inferred only from protocol position or decoded fields. Every role includes confidence and evidence. Unknown accounts retain a null label and receive no invented role. A partially decoded instruction remains explicitly partially decoded.

### Findings and evidence dimensions

Every nontrivial component reports three independent conclusions, each with its own confidence and evidence:

- cause: program-buffer writes, transfer/funding source, application state, vote account, repeated fee payer, other decoded role, or unknown;
- actor pattern: same payer, cross payer, or unknown;
- actionability: likely protocol-required or intentional, potentially redesignable, or insufficient evidence.

A shared payer is a protocol-position fact, not proof of common real-world ownership. Decoded application state alone is also insufficient for a redesignability claim; a concrete alternative partitioning and evidence of logical independence would be required.

The notable findings collection deduplicates components selected for serialization depth, unique-pair share, known-compute share, cross-payer participation, redesignability, and decoded loader uploads. Singleton components retain the exact no-conflict explanation and never become contention findings.

### Waves and workload context

Transactions are processed in block order and assigned to the first compatible wave. This is one valid conflict-free grouping and therefore an upper bound, not a validator schedule. A verified clique provides a lower bound. When the two match, the report states a proven minimum wave count; otherwise it keeps the result explicitly bounded and estimated.

The report also shows:

- all-lock estimated waves;
- role-preserving payer-ablation analytical waves (a counterfactual; validators still lock payers);
- waves after excluding the dominant component;
- wave transaction counts, known CU totals, and maximum transaction CU.

Compute-unit figures are workload context, not wall-clock time, throughput, utilization, or recoverable performance.

Known-compute coverage is reported for the block and component context. Rankings are qualified whenever any relevant transaction lacks CU data.

### Decoded loader-write sequences

RPC-decoded BPF Upgradeable Loader writes are grouped by target buffer and authority, sorted by offset, and partitioned into maximal contiguous runs. Reports include chunk count, uniform/varying sizes, first and last starting offsets, final covered byte, total bytes, gaps, and overlaps. The detector uses decoded fields only and contains no fixture-specific addresses, slots, or transaction indexes.

## Main outputs

- `analysis.json`: byte-deterministic normalized transactions/instructions, evidence-bearing roles, shared-account conflict labels, separated findings dimensions, write sequences, wave bounds, counterfactuals, and provenance.
- terminal report: concise explanation and metrics.
- standalone HTML: deduplicated selectable finding cards, selected account-to-transaction structure, three evidence dimensions, component and full-block wave contexts, decoded sequences, and secondary audit views.

## Limitations

### Interaction taxonomy and report truth

Cause overlap and depth effects are independent. The JSON reports same-pair overlap, individual and joint generated-wave reductions, actual Joint masked edges, and residual edges. Presentation distinguishes same-pair masking with joint-only reduction, separate-bottleneck joint-only reduction, overlap without reduction, supported overlap or individual depth effects without joint-only synergy, and a true no-overlap/no-depth-effect negative. The report starts neutral, selects deterministically by interaction and depth-reduction priority, and derives residual wording from the selected joint full-block model.

- Declared locks do not prove actual lock duration, execution order, or waiting.
- RPC parsers do not decode every program. Raw evidence is retained, but unknown data is not guessed.
- Same fee payer suggests repeated activity by one submitting account, not verified real-world identity.
- Public RPC results and retention vary; cached fixtures are the reproducibility anchor.

## Velocity equality-branch replay

Milestone 2.3 adds a cache-only research layer for the exact deployed Velocity ELF:

```bash
npm run research-velocity-equality-replay -- --plan research-plans/velocity-equality-replay-milestone-2.3.json --offline
```

The pipeline re-extracts and guards executable SHA-256 `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`, builds a byte-compatible five-instruction Instructions sysvar at current index 3, preserves the Ed25519 references into Post instruction bytes, pins authentic current-state-derived account fixtures, and documents three-way timestamp input variants for all three oracle PDAs.

The result is `exact-binary-replay-inconclusive`. No faithful maintained deterministic SVM could execute or build on this Windows host, so the candidate timestamp bytes remain a source-family hypothesis and all output account diffs remain unresolved. The report does not infer a no-op from observed skip logs, does not alter the analyzer or graph, and does not authorize a decoder, counterfactual, or optimization.
