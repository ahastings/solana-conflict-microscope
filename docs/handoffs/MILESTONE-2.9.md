# Milestone 2.9 handoff

## Outcome

Milestone 2.9, “Candidate #7 Sourceability-First Semantic Dossier,” is complete from base commit `4276ebc9957daad8089ad305695f9b8f2288e3b1`.

Outcome: `black-box-structure-only`.

Frozen artifact truth resolves discovery rank #7 as `candidate-305e6177058fbf49`, sourceability priority 4, in `family-4sym-538e-token`. Exact invoked programs are applications `4sYM2WwKh1Usdjz1huRB3W1WxgHT6AVKGgZugSFMmT9T` and `538EkNnKcnCchAoB78LYZcx2mfatx1iXMWStCx2DnGFs`, plus canonical legacy SPL Token and Token-2022. No reranking, substitution, broad scan, or Candidate #8 investigation occurred.

## Sourceability-first gate

538E appears outer and 4sYM inner; both token programs appear inner. Frozen Milestone 2.0 and Candidate #5 triage found no authoritative exact-ID identity, documentation, source, verified build, or deployment correspondence for either application. The bounded exact-ID authoritative search on 2026-09-02 returned no results. Both application gates are `black-box` with low confidence. The token programs use `sourceabilityGate: null` and `coreInterfaceStatus: canonical-authoritative-interface`.

The application gate fails. No authoritative mutation semantics support a precise semantic-refinement question. No binary archaeology, opaque-byte reverse engineering, semantic counterfactual, or ablation was performed.

## Cached evidence and attribution

The sole frozen occurrence, slot 489592970/component 3, contains transactions 3, 4, 6, 8, 10, and 11; 6 transactions, 15 edges, 36 atoms, exact component depth 6, exact full-block depth 6, and is uniquely depth-determining under current declared locks.

All 36 exact pair/account causes are preserved. Successful canonical TransferChecked semantics establish 6 SPL Token-account atoms: 3 legacy SPL Token destination atoms and 3 Token-2022 destination atoms. The other 30 unresolved atoms concern two shared application-referenced accounts whose identity and ownership remain unresolved. There are 0 historically established application-owned atoms, 0 current-snapshot application-owned atoms, 0 mint atoms, 0 other-core atoms, and 0 fee-payer-role atoms. Identity categories conserve all atoms; roles remain separate and overlapping.

All six transactions repeat one application-family/instruction pattern with alternating token interfaces and six distinct payers. This within-block regularity is structural, not cross-block recurrence, and does not establish independence or commutativity. The token destinations are genuinely mutated; every edge also retains unresolved black-box application causes.

## Preservation and replay

Candidate #1 remains `black-box-structure-only`; Candidate #2 remains `deferred-not-rejected`; Candidate #3/Velocity remains `velocity-full-block-depth-propagation-established`; Candidate #4 remains `infrastructure-or-token-serialization-not-semantic-candidate`; Candidate #5 remains `black-box-structure-only`. Candidate #6 remains `black-box-structure-only` with 23 atoms: 22 accounts established as BQsAJ-owned only at the later pinned current snapshot, no historical occurrence-slot ownership claim, and 1 unresolved identity atom with overlapping fee-payer role; both occurrences remain below another component. Frozen ranks and Milestones 1.x–2.8 remain unchanged.

Run `npm run research-candidate-7 -- --plan research-plans/candidate-7-milestone-2.9.json --offline` to regenerate the five artifacts. Run `npm run verify` for full verification; tests remain serialized with `--test-concurrency=1`.

No wallet, key, transaction submission, trading, actual validator concurrency, validator-private scheduling, TPS, throughput, elapsed-time reduction, speedup, or deployable redesign claim was introduced. Nothing was pushed.

Stop after Milestone 2.9. Do not automatically advance to Candidate #8.
