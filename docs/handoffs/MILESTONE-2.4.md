# Milestone 2.4 handoff

## Outcome

Milestone 2.4, “Velocity Equality-Aware Dependency Model and Joint Causal Ablation,” is complete on base commit `8befaeb`.

Outcome: `observed-order-equality-dependency-and-joint-ablation-established`.

Exact deployed replay established that the later observed equality branches leave the shared oracle state byte-identical. In an observed-order semantic model, this removes the equality-consumer/equality-consumer oracle conflict but preserves producer-to-consumer state dependency. Fee-payer coupling and native market-account conflicts are evaluated separately.

## Exact result

All six frozen four-node components have the same causal result:

- Full-component accounting is 15 declared conflict atoms: 9 shared-oracle atoms and 3 fee-payer atoms across the Anchor pairs, plus 3 preserved native-market atoms. This corrects the earlier component fields that counted only the 12 Anchor atoms while retaining all three native edges.
- `current-declared-locks`: exact declared-lock wave depth 4;
- `equality-aware-oracle`: exact semantic dependency-layer depth 4 because the shared fee payer masks the Anchor consumer-pair refinement;
- `payer-decoupled`: exact declared-lock wave depth 4 because the three declared oracle writes preserve the Anchor clique;
- `joint-equality-aware-plus-payer-decoupled`: exact semantic dependency-layer depth 3.

In the joint model, the producer occupies an earlier semantic layer than both equality consumers. The two consumers may share a semantic layer in this observed-order counterfactual. The unresolved native node retains one declared market-account conflict with each Anchor role and therefore requires a separate layer. These are counterfactual semantic dependency layers, not validator scheduling and not a claim that all three Anchor transactions can execute concurrently from the same prestate.

The `naive-equality-edge-erasure` comparison is explicitly INVALID. It drops producer-to-consumer state dependency and is excluded from candidate ranking, headline metrics, and causal conclusions.

## Evidence and boundaries

- Milestone 2.3 remains closed with `equality-branch-byte-identical-established`.
- Deployed ELF SHA-256 remains `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`.
- `[16,24)` remains a deployed-branch-validated timestamp field.
- The six occurrences, signed-message reuse, role mapping, fee-payer clique, and three native market relationships are unchanged.
- `native-prefix-discriminator-2` remains unresolved and was not decoded or reinterpreted.
- Candidate rankings and Milestones 2.0–2.3 artifacts remain unchanged.

## Artifacts and replay

Run `npm run research-velocity-equality-dependency -- --plan research-plans/velocity-equality-dependency-milestone-2.4.json --offline` to regenerate the four artifacts under `output/research/velocity-equality-dependency/`.

Full verification: `npm run verify`.

No wallet, private key, transaction submission, new ELF experiment, Clock mutation, trading behavior, network-chain write, throughput estimate, or runtime-concurrency claim was introduced.

Stop after Milestone 2.4.
