# Velocity exact-binary equality-branch replay

## Result

`equality-branch-byte-identical-established`

The pinned exact Velocity ELF executed successfully on Linux through Mollusk 0.13.1. The baseline and all twelve frozen variants returned success. In all four equality cases, every exact before/after oracle-account byte sequence was identical; the conclusion does not rely on the word “Skipping.”

## Runtime and fixture

The 6,050,397-byte application ELF retained SHA-256 `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c` and was loaded with BPFLoaderUpgradeable. No public source or rebuilt program was substituted. The constructed-current-state-derived fixture, five-instruction Instructions sysvar, instruction bytes, account hashes, and twelve variants were unchanged.

Host: Ubuntu 26.04 LTS under Linux 6.6.114.1-microsoft-standard-WSL2, x86_64; rustc 1.98.0; Cargo 1.98.0. Mollusk commit `f292187b800be56447ac6047cc27d19a922b37a7` uses Solana/Agave 4.0.0-era crates, `solana-instructions-sysvar` 3.0.0, and `solana-sbpf` 0.14.4.

Mollusk 0.13.1 initially supplied only the current Ed25519 instruction data to Agave's precompile verifier. The pinned local runtime source was narrowly corrected to pass the complete sanitized instruction-data array, which is required by the frozen cross-instruction offsets. This changed no logical account, sysvar, instruction, or application ELF byte.

## Baseline and cases

Baseline exact-ELF execution returned success and left all oracle account bytes unchanged. All twelve frozen cases returned success. Equal and greater-than variants reached the deployed timestamp comparison. Less-than variants passed that comparison and reached the deployed future-message guard because the frozen fixture does not declare or supply Clock and Mollusk's default clock is unix timestamp 0; no Clock account was invented.

Bytes [16,24) are therefore classified `deployed-branch-validated timestamp field`.

All equality outputs have zero lamport delta, zero data-length delta, unchanged owner/executable state, empty byte-diff ranges, and output SHA-256 equal to their exact input SHA-256.

## Preserved boundary

Candidate #1/#2/#3 evidence, discovery/sourceability, Milestones 2.0–2.2, graph attribution, native opcode-2 status, fee-payer masking, and protected legacy artifacts are unchanged. This result adds no semantic counterfactual, scheduling claim, optimization, or performance claim.

## Artifacts

- `replay-fixture-manifest.json`
- `instructions-sysvar-proof.json`
- `timestamp-field-validation.json`
- `branch-replay-results.json`
- `oracle-state-diffs.json`
- `runtime-manifest.json`
- `equality-replay-report.html`
