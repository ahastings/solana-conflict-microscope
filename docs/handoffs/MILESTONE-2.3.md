# Milestone 2.3 handoff

## Status

Milestone 2.3, “Velocity Exact-Binary Equality-Branch Replay and State-Diff Proof,” is complete on base commit `b5c832f`.

Outcome: `equality-branch-byte-identical-established`.

The pinned deployed Velocity ELF executed successfully on Linux. Its SHA-256 remained `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`. No public source, rebuilt program, wallet, private key, transaction submission, or network-chain write was used.

## Linux runtime

Host: Ubuntu 26.04 LTS (Resolute Raccoon), Linux kernel 6.6.114.1-microsoft-standard-WSL2, x86_64. Rust was 1.98.0 and Cargo was 1.98.0.

The selected runtime was Mollusk 0.13.1 at commit `f292187b800be56447ac6047cc27d19a922b37a7`, with Solana/Agave 4.0.0-era dependencies, `solana-instructions-sysvar` 3.0.0, and `solana-sbpf` 0.14.4. The exact ELF was loaded through BPFLoaderUpgradeable.

Mollusk 0.13.1’s transaction path initially passed only the current Ed25519 instruction data to Agave’s precompile verifier. That made the frozen cross-instruction offsets fail with `Err(InstructionError(2, Custom(3)))`. The pinned local runtime source was narrowly corrected to pass the complete sanitized transaction instruction-data array. This was a runtime representation correction: no logical account bytes, sysvar bytes, instruction bytes, or application ELF bytes changed.

Installation and execution commands, dependency versions, loader configuration, initial direct-instruction index error, precompile error, and other host errors are recorded verbatim in `runtime-probe.raw.json`.

## Frozen fixture and baseline

The existing `constructed-current-state-derived-fixture`, exact five-instruction Instructions sysvar at current index 3, twelve cases, account hashes, instruction bytes, and evidence boundaries were reused without semantic modification.

Baseline execution returned success. The exact PostPythLazerOracleUpdate instruction reached the deployed program, and every oracle account’s output bytes, hash, lamports, owner, executable flag, and data length matched its input.

## Twelve frozen cases

All twelve frozen cases executed successfully:

- feed 6: less-than, equal, greater-than;
- feed 1: less-than, equal, greater-than;
- feed 2: less-than, equal, greater-than;
- complete three-feed: less-than, equal, greater-than.

Every equality case produced exact byte-identical oracle outputs. This conclusion comes from before/after account bytes and hashes, not the word “Skipping.”

Changes to bytes `[16,24)` predictably changed the deployed control flow: equal and greater-than values were echoed by the deployed comparison branch, while less-than values passed that comparison and reached the separate future-message guard. The classification is therefore `deployed-branch-validated timestamp field`.

Clock was not declared or supplied by the frozen fixture. Mollusk’s default clock had unix timestamp 0, so less-than cases reached the future-message guard and did not mutate. No Clock account or additional experiment was invented.

## Preserved evidence boundary

Candidate #1/#2/#3 evidence, discovery/sourceability results, Milestones 2.0–2.2, graph attribution, native-prefix-discriminator-2 unresolved status, fee-payer masking, and all protected legacy artifacts remain unchanged.

This milestone adds no semantic counterfactual, speedup, scheduling, throughput, redesign, or optimization claim. Results remain declared-account contention and exact deployed instruction evidence, never a validator’s exact private schedule.

Nothing was pushed. Do not begin Milestone 2.4.

Stop after Milestone 2.3.
