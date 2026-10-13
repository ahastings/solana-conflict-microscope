# Milestone 2.5 handoff

## Outcome

Milestone 2.5, “Velocity Full-Block Propagation and Bottleneck Attribution,” is complete on base commit `9eef6a9`.

Outcome: `velocity-full-block-depth-propagation-established`.

The established local Velocity 4→3 semantic-layer reduction also reduces the counterfactual full-block layer depth in 6 of six observed blocks.

## Exact six-block result

All six authentic blocks have exact current declared-lock wave depth 4 and exact counterfactual full-block semantic layer depth 3. Each frozen four-node Velocity target is an isolated connected component with zero external conflict edges. Every other component has exact depth at most 3, so no unchanged component masks or ties the current Velocity depth.

The distributions are current `{4: 6}` and counterfactual `{3: 6}`. All six classifications are `propagates-to-full-block`; zero are `masked-by-other-component` and zero are `tied-or-bound-inconclusive`.

## Conservation and boundaries

- Each target retains the corrected current full-component count of 15 conflict atoms.
- The surgical `velocity-joint-substitution` retains exactly 3 native-market symmetric atoms and exactly 2 producer→equality-consumer dependencies.
- Every non-target component and edge is structurally unchanged; no cross-component edge is created.
- Milestone 2.4 remains `observed-order-equality-dependency-and-joint-ablation-established` with depths 4 / 4 / 4 / 3.
- Native-prefix discriminator 2 remains unresolved. No equality semantics or payer decoupling is applied outside the target component.
- This is depth propagation in a counterfactual semantic model, not an actual validator schedule or a performance claim.

## Artifacts and replay

Run `npm run research-velocity-full-block-propagation -- --plan research-plans/velocity-full-block-propagation-milestone-2.5.json --offline` to regenerate:

- `velocity-full-block-propagation.json`
- `velocity-block-bottleneck-attribution.json`
- `velocity-full-block-summary.json`
- `velocity-full-block-report.html`

Full verification: `npm run verify`.

No new ELF experiment, Clock modification, source archaeology, opcode decoding, candidate reranking, wallet/key handling, transaction submission, trading behavior, TPS, throughput, elapsed-time, speedup, or runtime-concurrency claim was introduced.

Stop after Milestone 2.5.
