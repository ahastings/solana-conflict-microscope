# Milestone 1.8 handoff

Status: Candidate Hunt and Two-Stage Materialization implemented and verified on 2026-08-28.

Base commit: 1fd30e5 (Milestone 1.7.3).

## Current behavior

- Stage A resolves a bounded concrete scan plan, processes only a configurable concurrent batch, reduces each observed block to compact candidate evidence, and releases the complete block analysis.
- The compact index excludes complete normalized transactions, instruction payloads, conflict-edge arrays, conflict-atom arrays, wave memberships, component counterfactual models, and complete single-block analyses.
- Stage B regenerates complete analysis JSON and standalone HTML only for the deterministically ranked top K candidates, default 20, from representative-slot cache entries.
- Successful dual-encoding block responses are cached. Scans are cache-first and resumable. Offline replay uses the saved concrete plan and reports observed, skipped, missing, unavailable, and failed states explicitly.
- Adaptive HTTP 429 handling uses bounded exponential backoff. Request delay, concurrency, endpoint, retries, budgets, skipped slots, and output/cache locations are configurable.
- Candidate IDs, recurrence aggregation, priority tiers, selection reasons, infrastructure buckets, and tie-breakers are deterministic and fully exposed. No opaque interestingness score is used.
- Vote activity, loader deployment, pure same-payer repetition, System funding, known program/sysvar, and fee-payer-only records remain available in separate audit buckets. Bucket membership is not a claim of unimportance or avoidability.
- Candidate actionability remains insufficient evidence unless logical independence, verified state-transition semantics, and a concrete alternative state layout or execution rule are established.

## Mixed-effect taxonomy correction

Same-pair cause overlap and generated-wave depth reductions remain independent facts. When overlap is present or payer-only, range-only, or Joint depth reduction is positive, the presentation no longer says No supported interaction. Mixed individual-plus-Joint cases use the truthful fallback title No joint-only depth interaction.

Synthetic coverage includes same-pair overlap where payer-only helps and Joint helps further, the corresponding range-only case, both individual models helping, separate causes with individual effects, and a true no-overlap/no-depth-effect negative. The existing nine-block classifications and every numerical result are unchanged.

## Preserved Milestone 1.7.3 baseline

The cached devnet range 488638500-488638508 still contains 148 directly observed decoded loader writes and 135,568 observed bytes.

- Current full-block depths: 15, 15, 15, 16, 26, 15, 15, 14, 17.
- Payer-only depths: unchanged from current.
- Range-only depths: unchanged from current.
- Joint full-block depths: 3, 4, 10, 2, 6, 3, 3, 1, 3.
- Every model retains all analyzed transactions and known Compute Units.

Slot 488638504 remains 26 upload transactions, 325 edges, and 650 current atoms. Each individual supported transformation removes 325 atoms and eliminates zero edges because the other cause masks every pair. Joint removes 650 atoms and 325 upload edges, changes component depth 26-to-1 and full-block depth 26-to-6, and retains all 71 transactions and 646,522 known Compute Units.

## Required real devnet scan

The portable committed plan is `discovery-plans/milestone-1.8-devnet.json`. It resolved latest confirmed slot 489613067 once at 2026-08-28T23:36:59.408Z and records these exact windows:

- 489572968-489573067
- 489582968-489583067
- 489592968-489593067
- 489602968-489603067
- 489612968-489613067

Rate settings after the public endpoint initially returned HTTP 429 were delay 750 ms, concurrency 1, maximum 3 retries, and 2,000 ms initial backoff. The completed online pass and final offline replay both report:

- 500 requested and 500 observed slots;
- 0 skipped, missing, unavailable, or failed slots;
- 70 compact candidates;
- 19 unfamiliar candidates in priority tiers 1-2;
- 20 separately materialized complete candidate reports.

Infrastructure buckets contain 14 vote-activity, 2 loader-deployment, 16 pure-same-payer-repetition, 1 System-funding, 0 known-program-or-sysvar, and 17 fee-payer-only candidates. One non-infrastructure candidate remains contextual tier 3.

The leading research candidate is `candidate-ff30780de8479976`. It recurs in 25 observed blocks. Representative slot 489573044 has three transactions, three distinct declared fee payers, three conflict pairs, proven component depth 3, two shared writable accounts with unknown decoded roles, and 7.0% of known block Compute Units with complete component coverage. This proves recurrent cross-payer declared writable contention in the sample, not logical independence, redesignability, avoidability, runtime causality, or recoverable throughput.

No teaching candidate was substituted. No new semantic instruction family was added. Mainnet-beta was not attempted because it was optional and no separate usable provider was available or required.

## Commands and artifacts

Initial bounded online command:

`npm run discover-contention -- --cluster devnet --latest --window-count 5 --window-size 100 --window-stride 10000 --cache-dir cache/discovery-devnet --output-dir output/discovery-devnet --top 20 --delay-ms 100 --concurrency 1 --max-retries 2 --backoff-ms 500`

The endpoint rate-limited that initial pressure. The windows were not resolved again; the saved plan's rate settings were changed to the values above and resumed with:

`npm run discover-contention -- --plan output/discovery-devnet/discovery-plan.json`

Portable deterministic offline replay:

`npm run discover-contention -- --plan discovery-plans/milestone-1.8-devnet.json --offline`

Compact outputs:

- `output/discovery-devnet/discovery-plan.json`: 895 bytes, SHA-256 `307708755BF54E6FF81A95808A83CFD8F95A4167EC71DAC22E1B8338D86DD250`.
- `output/discovery-devnet/discovery-index.json`: 407,967 bytes, SHA-256 `0AC57C17F08F79EF829818F5CA604FB81536DBF75117AC07C3F98DD15765B3E0`.
- `output/discovery-devnet/discovery-report.html`: 235,261 bytes, SHA-256 `7C1002B63B04F4AC8D47581A670FD427A0D0702A7390D3F00AED1C98C00D67C8`.
- `output/discovery-devnet/candidate-research-queue.md`: 19,481 bytes, SHA-256 `DA33E4E958431C8E4C7AEFD7F17C7586907D07AEEFA30BBC1873AB9E74054770`.

The index/report are well below the 25 MB and 5 MB budgets. Complete candidate details live only under `output/discovery-devnet/candidates/NNN-candidate-ID/`. Cache and generated output directories remain intentionally gitignored; the exact portable plan, implementation, tests, and records are committed.

## Verification and visual QA

`npm run verify` performs strict TypeScript compilation, all old and new deterministic tests, three standalone fixture analyses, offline nine-block range regeneration, and Milestone 1.8 handoff validation.

Expected final evidence:

- 96 tests passed, 0 failed.
- Range schema remains 1.7.3.
- All eight existing JSON/HTML artifacts regenerate with the preserved baseline above.
- Offline discovery replay reports 500/500 observed, 70 candidates, 19 high-priority unfamiliar leads, and 20 materializations.
- Root and versioned Milestone 1.8 handoffs are byte-identical.

Repeat verification also produced byte-identical hashes for all eight preserved Milestone 1.7.3 artifacts:

- `output/analysis.json`: `690784C9AA1454E53E4375FF1C600CDCC3389175F205E4DB29A9743BAB92C1F9`.
- `output/report.html`: `299A8E75061B1A81740E5AA3FA05786040A0010FF71D3F90149FE2D6D5AB0761`.
- `output/cross-payer-real/analysis.json`: `3D2DEDF405F0DFDA7F411BB3F240E8A05C58B56D7502ECE8D7E1DD61914AB6B5`.
- `output/cross-payer-real/report.html`: `7854E16898BD6207681FDBFD2CE1724AE3165B365840B22683DFD105FDCC1041`.
- `output/cross-payer-teaching/analysis.json`: `9B57A0260429B16730C9CC0B0645C4D506A7C152E00FB22AACB80E61642E84AE`.
- `output/cross-payer-teaching/report.html`: `02985274705B2E03F34BA1B32E248A599CC3FBAD85D28CBA53B46EFD79E5AF7C`.
- `output/range-488638500-488638508/range-analysis.json`: `27BDDC7CD8DC045A9A4B3A24F50FDB33A7A521DE12598FDD501942F570E8F433`.
- `output/range-488638500-488638508/range-report.html`: `31F0190626429C70695D35514FA033507314D986F87CECCD9F25E263309BCA3A`.


The preferred browser-control runtime failed before connection because its Windows sandbox helper could not apply deny-read ACLs. The isolated local Playwright/Chrome fallback tested the discovery report and top materialized candidate at 1440px and true 390px. Both document and body scroll widths exactly equaled viewport width, and all page/console error arrays were empty. Cross-payer and recurrence filters and the materialized-report link worked. Visual inspection caught replacement separator glyphs; ASCII-safe HTML entities and a regression test corrected them, and the full QA passed again. QA results and screenshots remain in the generated output directory.

## Interpretation limits

- Results describe declared account contention, potential parallelism, and estimated execution waves. They do not reconstruct a validator's exact private schedule.
- Candidate recurrence, depth, pair share, payer count, decoded roles, and Compute Units are selection context, not evidence of avoidability or performance recovery.
- Compute Units are workload context, not duration, waiting time, utilization, throughput, or wall-clock cost.
- Unknown decoded roles remain unknown; the research queue identifies the primary source or program interface needed next.
- The supported semantic cause universe is unchanged and limited to existing fee-payer role coupling and verified loader-buffer range evidence.
- No wallet, private key, transaction submission, trading, Jito integration, MEV extraction, private-auction reconstruction, production hosting, streaming, or continuous monitoring capability was added.

Stop after Milestone 1.8.
