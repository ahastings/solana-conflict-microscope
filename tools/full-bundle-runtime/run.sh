#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
commit=f292187b800be56447ac6047cc27d19a922b37a7
source_repo="${MOLLUSK_REPOSITORY:-$root/cache/research/velocity-equality-replay/repositories/mollusk-0.13.1}"
dependency="$root/cache/native-full-bundle/mollusk"
expected_runtime=cd97e9c517ea380a0942da17ddd4e85c10e961595f273298550a73e12e34bd71
if [ ! -d "$dependency" ]; then
  test "$(git -C "$source_repo" rev-parse "$commit")" = "$commit"
  mkdir -p "$dependency"
  git -C "$source_repo" archive "$commit" | tar -x -C "$dependency"
  (cd "$dependency" && patch --batch --forward -p1 < "$root/tools/full-bundle-runtime/cross-instruction.patch")
fi
test "$(sha256sum "$dependency/harness/src/lib.rs" | cut -d' ' -f1)" = "$expected_runtime"
export RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-stable}"
export CARGO_NET_OFFLINE=true
export CARGO_TARGET_DIR="$root/output/full-bundle-runtime-target"
export MICROSCOPE_REPO_ROOT="$root"
export MICROSCOPE_NATIVE_FIXTURE="${MICROSCOPE_NATIVE_FIXTURE:-$root/output/native-full-bundle/fixture.json}"
export MICROSCOPE_NATIVE_OUTPUT="${MICROSCOPE_NATIVE_OUTPUT:-$root/output/native-full-bundle/execution.json}"
test -f "$MICROSCOPE_NATIVE_FIXTURE"
test ! -e "$MICROSCOPE_NATIVE_OUTPUT"
cargo run --manifest-path tools/full-bundle-runtime/Cargo.toml --locked --offline
