# Full Anchor-bundle experiment

This is a separate experiment; it does not change the frozen Milestone 2.3 harness or its evidence. It executes public instruction bytes locally with the exact captured Velocity ELF. It creates no wallet, verifies no transaction signatures, submits nothing, and makes no RPC requests.

## Scope

The fixture comes from the pinned block at slot 489572998 and the later account snapshot at slot 490041839. All 14 ordinary accounts needed by the three Anchor roles are present. Each role retains all five observed instructions. Four-instruction Post-only controls are explicitly labeled.

Six scenarios preserve captured account bytes except three documented oracle timestamp changes at offsets [16,24). Clock choices are explicit; all other Clock fields keep Mollusk's zero defaults. No market/maker layout is patched. Observed transaction-wide signer/writable privileges are preserved.

The harness uses Mollusk's atomic process_transaction_instructions API and read-only before/after top-level invocation callbacks. It records full bytes, metadata, hashes, logs, and consumed units. Intermediate callback snapshots can contain writes later rolled back; failed final outputs must equal their inputs. A sequence stops at its first failed bundle.

Mollusk supplies program-account fallbacks and the correctly serialized Instructions sysvar for each role. Those generated accounts appear in traces; ordinary supplied account state is carried between successful bundles. The exact ELF is loaded into the program cache. The instruction Ed25519 precompile is verified, but this is not a bank-level transaction replay: transaction signatures, fee debits, and validator scheduling are outside the experiment. The compute budget is fixed to the observed 200,000-unit limit. Do not interpret consumed units as measured throughput.

## Reproduce

Requires the separately preserved historical snapshot, a Rust toolchain, and cached Cargo dependencies. A portable TypeScript source installation alone does not contain them. The fixture preparer rejects altered source pins. No new dependencies were added to the TypeScript package.

Restore inputs at these paths relative to this repository root:

| Input | Required path | Availability |
| --- | --- | --- |
| Captured account snapshot | `cache/research/candidate-043c938568ad5e15/account-snapshots.raw.json` | Restore separately; SHA-256 `49bf9f3880a931c3656e44e5b8c684b09978ec5743fc93eb7ce274978a673391` |
| Public block | `fixtures/reviewer/slot-489572998.json` | Included in the source preview |
| Frozen replay plan | `research-plans/velocity-equality-replay-milestone-2.3.json` | Included in the source preview |
| Mollusk Git repository | `cache/research/velocity-equality-replay/repositories/mollusk-0.13.1` | Restore separately, or set `MOLLUSK_REPOSITORY` to a local copy containing the commit specified below |

`native:prepare` extracts the deployed ELF from the snapshot's pinned ProgramData account after checking its header and payload SHA-256. It creates `cache/research/velocity-equality-replay/velocity-deployed.so`, the exact path consumed by the Rust harness, when that file is absent. The required ELF hash is `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`. An identical existing file is verified and reused without rewriting; different bytes cause an error and remain untouched. No separate ELF download or manual extraction is needed.

From the repository root:

    npm run native:prepare

On Linux/WSL with cargo on PATH:

    bash tools/full-bundle-runtime/run.sh

Then independently validate the recorded full bytes, trace continuity, required-account coverage, commit/rollback behavior, and runtime source hashes:

    npm run native:review

Preparation writes a new fixture beneath `output/native-full-bundle` and, if missing, the verified ELF at the cache path above. It rejects linked output paths and writes only inside this source workspace. Existing fixture, execution, or review files are not overwritten. To compare a separate run, use `npm run native:prepare -- --output NEW_FILE_INSIDE_WORKSPACE`, set `MICROSCOPE_NATIVE_FIXTURE` and `MICROSCOPE_NATIVE_OUTPUT` for the runtime, and pass fixture, execution, and review paths as positional arguments to `native:review`. The runtime also materializes its patched Mollusk source beneath `cache/native-full-bundle` and builds beneath `output/full-bundle-runtime-target`.

The runtime source is reconstructed using git archive from Mollusk commit f292187b800be56447ac6047cc27d19a922b37a7. Set MOLLUSK_REPOSITORY to a local repository containing that commit if the historical cache is absent. The script copies source into cache/native-full-bundle/mollusk and applies the supplied cross-instruction precompile patch there. It never modifies the source repository. The resulting harness source must hash to cd97e9c517ea380a0942da17ddd4e85c10e961595f273298550a73e12e34bd71.

The patch implements the same correction as the old experiment, with corrected unified-diff hunk counts and a final newline. It passes the complete transaction instruction-data list to the precompile, allowing the observed cross-instruction Ed25519 references; it does not change the deployed program or signed bytes.

Native evidence includes the fixture, ELF, harness source, runtime source, and Cargo.lock hashes. Hashes identify recorded evidence; they do not substitute for independent reexecution. Results on this constructed fixture do not establish historical prestate or general reordering safety.
