# Milestone 2.3 Linux runtime harness

This harness loads only the pinned deployed Velocity ELF and reads the frozen Milestone 2.3 plan, account snapshot, Instructions sysvar, and twelve cases.

Mollusk 0.13.1 must be present at the path pinned in `Cargo.toml`. Apply `mollusk-0.13.1-cross-instruction.patch` at that repository root. The patch supplies Agave's Ed25519 verifier with the complete transaction instruction-data array required by the frozen cross-instruction offsets; it changes no fixture or application ELF bytes.

Run from the repository root. Choose a new output path so the frozen evidence is preserved:

```sh
mkdir -p output/milestone23-linux-runtime
test ! -e output/milestone23-linux-runtime/replay-new.raw.json && \
M23_REPO_ROOT="$PWD" \
M23_EVIDENCE_OUTPUT="$PWD/output/milestone23-linux-runtime/replay-new.raw.json" \
RUSTUP_TOOLCHAIN=stable CARGO_NET_OFFLINE=true \
cargo run --manifest-path tools/milestone23-linux-runtime/Cargo.toml --locked
```

The harness performs no Solana RPC requests, transaction submissions, wallet operations, or source-program substitution.
