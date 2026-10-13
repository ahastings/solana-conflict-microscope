# Milestone 2.7 handoff

## Outcome

Milestone 2.7.1, “Candidate #5 Shared-Account Identity and Ownership Tri-State Correction,” is complete from base commit `73490c7` as a narrow correction to the Candidate #5 Sourceability and Semantic Dossier.

Outcome: `black-box-structure-only`.

Frozen artifact truth confirms discovery rank #5 as `candidate-be8750c7a73d9c2c` in `family-4sym-538e-token`, with sourceability priority 4. Its exact invoked programs are `4sYM2WwKh1Usdjz1huRB3W1WxgHT6AVKGgZugSFMmT9T`, `538EkNnKcnCchAoB78LYZcx2mfatx1iXMWStCx2DnGFs`, legacy SPL Token, and Token-2022. No reranking or substitution occurred.

## Evidence

All three cached occurrences were revalidated: slots 489582977/component 1, 489582991/component 16, and 489583020/component 17. Each is a three-transaction clique with three edges, seven atoms, and exact current declared-lock depth 3. Candidate #5 ties the block depth of 3 in the first occurrence and sits below other components at full-block depths 7 and 10 in the remaining occurrences. The same three shared writable addresses recur; transaction payers rotate and are distinct within each occurrence.

Every edge and all 21 account causes are preserved. Canonical legacy SPL Token semantics establish that successful `TransferChecked` execution requires its writable destination to unpack as Token `Account` state and to be owned by the invoked Token Program. The recurring `F1T2…FgurQ` destination therefore contributes exactly three established SPL Token-account atoms, while its overlapping application-instruction role remains separately preserved. None of the shared atoms is a fee payer or mint. The other 18 atoms, contributed by `4Ajv…1B44` and `E5NJ…8QMb`, retain unresolved identity and ownership.

Both application programs now represent shared-account ownership as the explicit tri-state pair `ownsSharedWritableAccount: null` and `sharedWritableOwnershipStatus: unresolved`. No cached owner metadata establishes which, if either, application owns either unresolved shared account, so absence of evidence is no longer encoded as false non-ownership.

The two application IDs were inventoried separately. Existing frozen evidence and bounded exact-ID web/GitHub searches on 2026-09-02 found no authoritative identity, official source, verified deployment documentation, or cached ProgramData correspondence for either. Each therefore receives application `sourceabilityGate: black-box`. Legacy SPL Token and Token-2022 receive `coreInterfaceStatus: canonical-authoritative-interface` and application `sourceabilityGate: null`; no exact deployed-source correspondence is claimed.

Stable family, topology, instruction forms, shared addresses, and role patterns establish structural recurrence only. Both application programs remain black boxes, every pair edge retains unresolved application-referenced causes, and 18 atoms remain on accounts of unresolved identity and ownership. There is still no defensible source-backed no-op, update-if-newer, byte partition, hidden substate, narrower dependency, or commutative-mutation question. The evidence-derived disposition therefore remains `black-box-structure-only`; no semantic refinement or counterfactual was executed.

## Preservation and replay

Candidate #1 remains `black-box-structure-only`; Candidate #2 remains `deferred-not-rejected`; Candidate #3/Velocity remains complete through Milestone 2.5 with `velocity-full-block-depth-propagation-established`. Candidate #4 remains `infrastructure-or-token-serialization-not-semantic-candidate` with XuX application/`black-box` and ATA/SPL Token core/`canonical-authoritative-interface` taxonomy. Frozen discovery ranks and Milestones 1.x and 2.0–2.6.2 outputs are unchanged.

Run `npm run research-candidate-5 -- --plan research-plans/candidate-5-milestone-2.7.json --offline` to regenerate the five Candidate #5 artifacts. Run `npm run verify` for full verification. Testing remains serialized with `--test-concurrency=1`.

No wallet, private key, transaction submission, trading, new broad scan, validator-private scheduling inference, actual validator concurrency, throughput, TPS, elapsed-time reduction, speedup, or deployable redesign claim was introduced. Nothing was pushed.

Stop after Milestone 2.7. Do not automatically advance to Candidate #6.
