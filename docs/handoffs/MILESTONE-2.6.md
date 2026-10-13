# Milestone 2.6.2 handoff

## Outcome

Milestone 2.6.2, “Candidate #4 Core-Program Sourceability Taxonomy Correction,” is complete from base commit `9fa956e`.

Outcome: `infrastructure-or-token-serialization-not-semantic-candidate`.

Frozen artifact truth resolves discovery rank #4 as `candidate-df7d92f4a2196698` in `family-xux-token`. The prose-hypothesized 4sYM/538E + Token candidate is rank #5 and was not investigated.

## Evidence

All four cached occurrences were revalidated: slots 489613040/component 17, 489613045/component 11, 489613046/component 8, and 489613047/component 14. Each is a two-transaction, one-edge component with exact current declared-lock depth 2. One shared SPL Token mint recurs in every occurrence; two occurrences add an atom with overlapping fee-payer and ATA funding-source roles. The occurrence matrix records transaction indexes, Compute Units, fee payers, outer/inner programs, decoded standard instructions and roles, full-block depth, and current depth relevance.

XuX (`XuXkWAz3xRktfEjAfFDdkFksYBqFzet8JPkQxZMoRfi`) remains an unresolved application with sourceability gate `black-box`: existing repository evidence found no authoritative identity, official source, verified deployment correspondence, or cached ProgramData correspondence. Canonical SPL Token and Associated Token Account programs are represented separately with `coreInterfaceStatus: canonical-authoritative-interface` and application `sourceabilityGate: null`. Their canonical identities and authoritative standard interfaces support deterministic instruction and account-role decoding; Candidate #4 established no exact deployed binary/source correspondence for them.

The corrected attribution separates identity from roles. Four recurring atoms are deterministically decoded as the SPL Token mint, including `mintTo`. The other two atoms are the same address in overlapping fee-payer and ATA `source`/funding-payer roles; no independent cached owner/data metadata establishes that address as a token account or mint. Available authoritative semantics do not establish a no-op/idempotent application mutation, independent state partition, or narrower dependency. Payer-only removal cannot remove the recurring mint cause, so the disposition is unchanged. No semantic counterfactual was executed.

## Preservation and replay

Candidate #1 remains `black-box-structure-only`; Candidate #2 remains `deferred-not-rejected`; Candidate #3/Velocity remains complete through Milestone 2.5 with outcome `velocity-full-block-depth-propagation-established`. Frozen discovery and sourceability ranks and all Milestones 1.x and 2.0–2.5 artifacts remain unchanged.

Run `npm run research-candidate-4 -- --plan research-plans/candidate-4-milestone-2.6.json --offline` to regenerate the five Candidate #4 artifacts. Run `npm run verify` for full verification.

No wallet, key, transaction submission, trading, new broad scan, Velocity experiment, deployed-binary archaeology, validator-private scheduling inference, runtime concurrency, throughput, TPS, or speedup claim was introduced.

Stop after Milestone 2.6.2. Do not automatically move to Candidate #5.
