#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
dependency="$root/cache/native-full-bundle/mollusk"
expected_runtime=cd97e9c517ea380a0942da17ddd4e85c10e961595f273298550a73e12e34bd71
test -f "$dependency/harness/src/lib.rs"
test "$(sha256sum "$dependency/harness/src/lib.rs" | cut -d' ' -f1)" = "$expected_runtime"
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
export RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-stable}"
export CARGO_NET_OFFLINE=true
export CARGO_TARGET_DIR="$root/output/full-bundle-runtime-target"
export MICROSCOPE_REPO_ROOT="$root"
export MICROSCOPE_NATIVE_FIXTURE="${MICROSCOPE_NATIVE_FIXTURE:-$root/output/native-current-bundle/fixture.json}"
export MICROSCOPE_NATIVE_OUTPUT="${MICROSCOPE_NATIVE_OUTPUT:-$root/output/native-current-bundle/execution.json}"
case "${1:-}" in
  --build-only)
    cargo build --manifest-path tools/current-bundle-runtime/Cargo.toml --locked --offline
    ;;
  --test-only)
    cargo test --manifest-path tools/current-bundle-runtime/Cargo.toml --locked --offline
    ;;
  "")
    test -f "$MICROSCOPE_NATIVE_FIXTURE"
    test ! -e "$MICROSCOPE_NATIVE_OUTPUT"
    cargo run --manifest-path tools/current-bundle-runtime/Cargo.toml --locked --offline
    ;;
  *)
    echo 'usage: run.sh [--build-only|--test-only]' >&2
    exit 2
    ;;
esac
