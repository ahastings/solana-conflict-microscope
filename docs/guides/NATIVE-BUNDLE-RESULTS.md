# Full-bundle native experiment: the producer sequence is not established

Archive scope: the generated native records named below are separately preserved local evidence, not files supplied in the source-only preview. Paths are relative to the original project root. The portable verification command does not execute these experiments or independently reproduce their native results; reproduction requires the documented native inputs and runtime.

Executed twice locally on 2026-09-24, with byte-identical complete native records, using the exact captured deployed ELF. This is new native execution, separate from validation of the historical Milestone 2.3 record. The complete bundle exposes a failure that the Post-only experiment could not show.

## Observed results

| Constructed scenario | Scope | Result | What the bytes establish |
| --- | --- | --- | --- |
| Original captured account bytes, snapshot-derived Clock | A, B, C; five instructions each | All succeed | Post skips a newer/equal stored timestamp; each TWAP changes its own market. All three oracle accounts remain unchanged. |
| Older oracle timestamps, Clock zero | A; Post-only four-instruction control | Succeeds | Future-message guard; no ordinary account changes. |
| Older oracle timestamps, message-derived Clock | A; Post-only four-instruction control | Succeeds | Post changes all three oracle accounts and commits those changes. This supplies the previously missing successful-write control. |
| Same older timestamps and message Clock, full bundle | A; all five instructions | Fails at TWAP with CantUpdatePerpBidAskTwap (6253) | Post writes all three oracles, and TWAP changes market bytes before failing. Atomic final output equals the input: all intermediate writes roll back. B/C are not executed after this failure. |
| Older timestamps, snapshot-derived Clock | A, B, C; five instructions each | All succeed | Post rejects the message as more than 15 seconds old, so there is no producer write. Each TWAP changes its market; oracles remain unchanged. |
| Same snapshot-Clock fixture, order A, C, B | Five instructions each | All succeed | Final ordinary account bytes/metadata match A, B, C. This comparison covers an old-message skip fixture, not a successful producer followed by equality consumers. |

Twelve transaction instruction sets were attempted: eleven succeeded and one failed. Nine successful sets contain the complete five-instruction bundle; two are explicitly Post-only controls. Every attempted instruction has before/after account snapshots. Instructions-sysvar index changes are runtime-managed, and are separated from ordinary account changes in the review output.

## Implication

The successful Post write path is now demonstrated on an explicit constructed input. Full bundles are also executable against the captured accounts, and the sampled TWAP invocations preserve the oracle bytes while changing their market accounts. These facts do not establish the desired complete producer-to-equality-consumer sequence: the case with a genuine producer write fails later, while the successful full sequences do not perform that write. The 4/4/4/3 graph result remains conditional. No payer-coupling removal, transaction-fee equivalence, validator scheduling, or throughput claim is promoted.

The exact logged failure is CantUpdatePerpBidAskTwap (6253), at the deployed program's reported keeper.rs:2913. The deployed logs show the TWAP timestamp moving from 1788031406 back to 1787953586, unchanged bid/ask values, and the explicit guard message "bid or ask twap unchanged from small ts delta update". That identifies the observed rejection; a complete causal diagnosis of the deployed implementation is still outside this experiment. The captured markets have 1560 bytes while the reference source family describes 1304; source-family offsets were not used to patch market or maker state to force success.

## Inputs and evidence

- Observed block: slot 489572998. Captured account snapshot: slot 490041839. This is not historical prestate.
- All 14 required ordinary accounts come from that snapshot. Only each oracle's validated timestamp bytes 16,24) were changed in mutation cases, from 1788031406600000 to 1787953585799999.
- Message Clock: slot 489572998, unix_timestamp 1787953586. Snapshot-derived Clock: slot 490041839, unix_timestamp 1788031407. Guard Clock: zero. Remaining Clock fields: Mollusk defaults zero.
- Exact ELF SHA-256: 89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c.
- Fixture SHA-256: 98e5261417b23180be328ca51734399ffe2240231984e0dc86ce11b4001832aa.
- Native execution record SHA-256: e276b32f1c598c2d862b3b5dabfc82bf8b5e5ac3d1583377de412460e26a22e4.
- Rust 1.98.0; Mollusk 0.13.1 at f292187b800be56447ac6047cc27d19a922b37a7 plus the documented cross-instruction precompile correction. Runtime source/Cargo.lock/harness hashes are embedded in the native record.

Local artifacts: [fixture (`output/native-full-bundle/fixture.json`), full native record (`output/native-full-bundle/execution.json`), independent byte/trace review (`output/native-full-bundle/review-v2.json`). These generated artifacts are preserved in the local checkpoint and are not included by the source-only exporter. [Reproduction instructions](../../tools/full-bundle-runtime/README.md).

The independent reviewer rehashes recorded full bytes, verifies ordinary-account trace continuity, requires every successful instruction, checks final committed state against the final trace, and verifies failed-bundle rollback. It also checks fixture and runtime-source identities. This validates the record, not an independent runtime implementation. The byte/trace checks and fixture transformations have sixteen deterministic regression tests, including safe ELF preparation; the portable suite passes 153 tests.

## Next evidence requirement

A successful complete producer bundle followed by genuine equality consumers needs a compatible, evidenced prestate. Do not replace the missing result with old-message skips, bypass TWAP, patch unknown market offsets, or infer historical prestate from a later snapshot. Existing signed messages and captured accounts can first be inventoried for a time-compatible pair; if none exists, this case stays bounded and the microscope's general analysis remains independently useful. Donations and licensing remain deferred to a later release decision.

## Captured-input inventory

A subsequent offline inventory covered every exact slot-N.json block file in cache/contention-devnet, cache/discovery-devnet, and cache/discovery-smoke: 511 files, 510 distinct slots spanning 488638500–489613067. It found 27 target-program Post transactions with locally verified Ed25519 signatures, containing 11 unique signed messages. Twenty-four transaction occurrences had fully decoded target-feed bodies; the other three use a different feed and were included using the verified signed header's timestamp. No record was silently dropped.

None falls within the observed Post Clock window relative to the later snapshot-derived Clock. The newest message is 71,192 seconds (19 hours 46 minutes 32 seconds) older than that Clock. The inventory has no unresolved input errors. This closes the idea of finding a nearby message in these existing caches; it does not claim no suitable public data exists elsewhere. Matching the time window alone would also not establish historical or full-bundle prestate validity.

Inventory details and input hashes (`output/native-full-bundle/input-inventory-v2.json`) are preserved as a supplemental local checkpoint. New temporal evidence would require a separate, bounded public-data collection step. There is no reason to rerun the same mismatched inputs as a producer-sequence proof.

## Fresh deployment check

The subsequent ten-request public devnet probe on 2026-09-24 found the program active with deployment slot 492998273 and a different ELF hash. Collection stopped short of a new native experiment. The historical results above remain scoped to their exact executable; the fresh block is retained for generic declared-account analysis and v1 compatibility regression. [Captured evidence and compatibility fix](FRESH-DATA-COMPATIBILITY.md).

## Separate current-deployment result

A later, separately captured executable and unchanged earlier account snapshot produced a successful complete producer/equality-consumer sequence. [Current results](CURRENT-NATIVE-BUNDLE-RESULTS.md) include both consumer orders and byte-identical repeated execution. The historical failure above remains unchanged; the new example does not establish historical prestate, generally safe reordering, or performance gains.
