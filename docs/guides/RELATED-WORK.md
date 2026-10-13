# Related work and positioning

Bounded primary-source check: 2026-09-24. This is not an exhaustive competitive survey or a novelty claim.

- [Sol Tempest](https://github.com/alanhwu/sol-tempest) already visualizes live Solana blocks and account-level compute/contention. A graph of busy accounts alone is therefore not a basis for claiming uniqueness. Its repository describes its own scope; this build has not benchmarked it.
- [Solana transaction documentation](https://github.com/solana-foundation/developer-content/blob/main/docs/core/transactions.md) explains declared account metadata and parallel execution. That model is the foundation for this analyzer, not a new discovery.
- [Solana transaction pipeline documentation](https://solana.com/docs/core/transactions/transaction-pipeline) describes processing stages and scheduling/resource constraints. A declared conflict graph alone cannot represent the complete runtime pipeline.

The practical direction to test is an inspectable offline investigation: connect a finding to its exact shared accounts and decoded evidence, show competing measures of importance, and preserve the limits of any hypothetical refinement. Developer usefulness remains an empirical question. A reproducible package and independent feedback are stronger evidence than another feature list.
