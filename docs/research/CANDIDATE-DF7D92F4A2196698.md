# Candidate #4 sourceability and semantic dossier

Frozen discovery evidence resolves rank #4 as `candidate-df7d92f4a2196698`, not the hypothesized 4sYM/538E family. The 4sYM/538E candidate remains untouched at rank #5. Candidate #4 belongs to `family-xux-token`, invokes XuX, the Associated Token Account Program, and SPL Token, and occurs in four cached blocks.

Each occurrence is a two-transaction, one-edge component of exact declared-lock depth 2. One decoded SPL Token mint recurs in all four occurrences. Two occurrences add an atom whose overlapping roles are fee payer and ATA `source`/funding payer; cached evidence does not establish that address as a token account or mint. Full transaction instruction evidence, Compute Units, payers, outer/inner program IDs, parsed core instruction types, account roles, and current full-block depths are preserved in the occurrence matrix.

Authoritative sources used for standard-program interpretation are the canonical [SPL Token repository](https://github.com/solana-program/token) and [Associated Token Account repository](https://github.com/solana-program/associated-token-account). Existing Milestone 2.0 evidence plus a bounded exact-ID search on 2026-09-01 found no official XuX identity, verified source, or deployment correspondence. XuX is therefore gated `black-box`; no explorer label or third-party name is used.

Outcome: `infrastructure-or-token-serialization-not-semantic-candidate`. The observed contention is ordinary token-mint serialization on the available evidence. No authoritative application semantics establish an idempotent/no-op mutation, independent partition, narrower dependency, or commutative update. No semantic counterfactual was executed, and Candidate #5 was not opened.
