# Evidence map for a new reviewer

Start with `npm ci` and `npm run verify:portable`, then open `output/demo/index.html`. This path uses bundled public and explicitly synthetic fixtures. It does not require the research archive, RPC access, or a native runtime.

| Question | Evidence | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| Which declared accounts connect transactions? | [Portable demo and analyzer](../../README.md), public fixtures, conflict-rule and wave-bound tests | Declared account contention, potential parallelism, estimated execution waves and compute coverage | Validator-private scheduling or measured speedup |
| Is a saved block analysis internally consistent? | `npm run verify:analysis -- --analysis FILE`; `verify:range` for a slot ledger | Reconstructed account conflicts, connected-component membership/count, grouped contention pairs, valid wave coverage and clique witnesses, status/compute totals | RPC authenticity, semantic component explanations, cross-block upload reconstruction, counterfactual safety, or validator execution |
| Does the conditional graph arithmetic hold? | `npm run review-case`; [six-block reproduction guide](REVIEWER-REPRODUCTION.md) | Independently computed graph depths with explicit assumptions and witnesses | A deployable program change or removal of payer coupling |
| Did the historical full bundle succeed? | [Historical native experiment](NATIVE-BUNDLE-RESULTS.md) | Post-only write control succeeds; the complete producer fails at TWAP and rolls back for those inputs | A successful complete producer on that historical fixture |
| Can a complete current-deployment sequence succeed? | [Current native experiment](CURRENT-NATIVE-BUNDLE-RESULTS.md) | One constructed fixture succeeds in ABC/ACB order with identical final ordinary state; repeated records are byte-identical | Historical bank replay, general reordering safety, or a result for a different executable |
| Can the oracle declarations simply become read-only? | [Privilege controls](ORACLE-PRIVILEGE-CONTROL-RESULTS.md) | The grouped three-oracle change is rejected with AccountNotMutable by both consumers; producer control also fails | Individual-oracle requirements, an alternative interface, or a valid optimization |

The native results are separate experiments, not contradictory versions of one result. They use pinned executable/input identities. The successful current baseline does not erase the older failure, and unchanged bytes in the baseline do not authorize removing writable declarations.

## Reading an independent certificate

A successful block certificate names its scope, reports connectedComponentCount alongside conflictPairs and wave bounds, and hashes the original input bytes. Connected components group transactions reachable through declared conflict pairs; isolated transactions are components too. The checker derives these groups from normalized account accesses instead of trusting the reported partition. Reordering groups does not change connectivity, while splitting, merging, omitting, or duplicating membership fails verification. Semantic labels attached to those groups remain outside this check.

A verified lower bound need not be the strongest possible bound. A valid clique and a valid wave grouping prove a minimum only when their counts match. An empty block has zero waves; unmatched counts retain an unresolved minimum. The certificate does not establish the origin of the supplied data.

## What ships in the source preview

The source-only preview includes TypeScript, portable fixtures and their manifests, tests, documentation, and Rust harness source/lockfiles. Its SOURCE-MANIFEST.json lists and hashes every selected file. It excludes dependencies, build outputs, ignored caches, native execution records, and local checkpoints. The exporter is a file-selection boundary, not a content-level secrets audit.

The portable checks run from this preview after dependency installation. `npm test` and historical `npm run verify` additionally require the separately preserved research archive. Native commands need their exact public snapshot/ELF and offline Mollusk/Cargo prerequisites; follow the relevant experiment guide. A native review rechecks recorded evidence and source identities, rather than executing an independent runtime implementation.

## Where to continue

[BUILD-STATUS.md](BUILD-STATUS.md) describes current work and verification scope. Root HANDOFF.md and docs/handoffs/MILESTONE-3.0.md are deliberately identical frozen handoffs for the imported research milestone. Their historical stop instruction records that milestone's boundary; use the current build status and this map to navigate subsequent authorized work.

The next useful external feedback is whether a developer can reproduce the portable tool and use its explanations to answer a real debugging question. [A draft review request](REVIEW-REQUEST.md) is prepared but has not been sent. No adoption or novelty claim has been established. Project code is available under the [MIT license](../../LICENSE); third-party material retains its own terms. Check the current release record for publication status.
