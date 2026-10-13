# Current captured bundle experiment

This isolated harness executes locally against the current public Velocity deployment captured in `output/current-bundle-capture-oaBfzh`. It leaves the historical harness and its evidence unchanged. It sends no RPC requests, creates no wallet, submits nothing, and uses offline cached dependencies.

The captured ELF must have SHA-256 `7fd13697bfc5bbd1dfd85648c28d80ebe8591052ecba7d8b2e00266a95f7a7cb`. The harness reads `output/current-bundle-capture-oaBfzh/current-deployed.so` and rejects different bytes. The fixture schema remains `full-bundle-fixture-1`; output remains `full-bundle-execution-1` for the generic independent byte/trace validator.

The fixture must contain exactly three roles, `anchor-A`, `anchor-B`, and `anchor-C`, and exactly two scenarios in order ABC then ACB. Each role contains all five observed instructions: compute limit, compute price, Ed25519, Post, and TWAP. The compute-unit limit must be 200,000. Both scenarios must use identical ordinary account bytes and metadata, the same captured Clock, five instructions per role, and an explicitly empty `mutations` array. Missing ordinary instruction accounts fail before execution. This harness does not infer or patch oracle or market byte layouts.

Each scenario Clock includes numeric `slot`, `epochStartTimestamp`, `epoch`, `leaderScheduleEpoch`, and `unixTimestamp`, plus `dataBase64` and `dataSha256`. All 40 decoded bytes are hash-checked and all five decoded fields must equal those numeric values. All five fields are applied to Mollusk. Other runtime sysvars retain Mollusk defaults; Instructions sysvar bytes are generated for each exact instruction sequence.

The ordinary account snapshot predates the selected public bundles. Combining that snapshot with the captured later Clock is explicitly constructed prestate, not reconstructed historical prestate. Public block success does not predict fixture success. The new ELF's behavior must be observed directly.

Read-only top-level invocation callbacks record full account bytes, metadata, hashes, logs, and compute units. Each successful bundle carries ordinary state into the next. Each failed bundle must atomically restore all supplied ordinary accounts, and the scenario stops immediately. Intermediate callback writes can subsequently roll back. Both scenarios begin independently from the same unchanged snapshot.

The runtime verifies the Ed25519 instruction. It does not verify the outer transaction signature, debit fees, reproduce all bank behavior, or model validator scheduling. Matching final state would establish only a result for this constructed fixture, not general reordering safety or throughput.

From the repository root on Linux/WSL:

```sh
bash tools/current-bundle-runtime/run.sh --build-only
bash tools/current-bundle-runtime/run.sh --test-only
# After independent fixture preparation:
bash tools/current-bundle-runtime/run.sh
```

Defaults are `output/native-current-bundle/fixture.json` and `output/native-current-bundle/execution.json`. `MICROSCOPE_NATIVE_FIXTURE` and `MICROSCOPE_NATIVE_OUTPUT` can select other local paths. Output creation refuses overwrite. The build-only and test-only modes do not execute the captured program.

The script requires the existing patched Mollusk source at `cache/native-full-bundle/mollusk`, whose `harness/src/lib.rs` must hash to `cd97e9c517ea380a0942da17ddd4e85c10e961595f273298550a73e12e34bd71`. It reuses `output/full-bundle-runtime-target` and the cached Cargo dependencies with `--locked --offline`; it never fetches or modifies the runtime source. The copied lockfile differs from the historical lockfile only in this package's name. Execution evidence records source, runtime, lockfile, fixture, and ELF hashes.
