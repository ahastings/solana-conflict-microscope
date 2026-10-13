# Current deployment: complete producer and equality consumers

Archive scope: the generated native records named below are separately preserved local evidence, not files supplied in the source-only preview. Paths are relative to the original project root. The portable verification command does not execute these experiments or independently reproduce their native results; reproduction requires the documented native inputs and runtime.

Two fresh local executions on 2026-09-24 produced byte-identical records. For this exact captured program and constructed input, the complete producer bundle succeeds, the two complete equality consumers preserve the oracle accounts, and swapping those consumers leaves identical final ordinary account state. This supplies a successful complete-sequence example that the earlier historical experiment could not establish.

## Measured behavior

All roles contain the original five instructions: compute-unit limit, compute-unit price, Ed25519 verification, Post, and TWAP. Both orders start independently from the same 14 unchanged ordinary accounts and all five fields of the later observed Clock.

| Role | Post effect | TWAP effect | Full-bundle result | Local compute units |
| --- | --- | --- | --- | ---: |
| A, observed transaction 19 | Changes all three oracle accounts | Changes market Bx7Joy… | Success, oracle writes committed | 66,523 |
| B, observed transaction 21 | No ordinary-account change; three exact equality logs | Changes market FDejX… | Success, oracle bytes preserved | 56,282 |
| C, observed transaction 22 | No ordinary-account change; three exact equality logs | Changes market 7s5WR… | Success, oracle bytes preserved | 61,679 |

Orders A→B→C and A→C→B each execute all three complete bundles. The reviewer checks full account bytes and metadata, every instruction boundary, state carried between transactions, committed output, and failed-transaction rollback. It requires both complete producer/equality sequences before treating matching final state as a successful order comparison. Identical rolled-back state cannot satisfy that gate. The separate native run reproduces the complete record byte for byte.

The native logs show producer timestamps advancing from 1790243601400000 to 1790243611400000, followed by consumers whose next and current timestamps both equal 1790243611400000. The byte observations establish the effects; log text alone is insufficient. The successful TWAP executions include stale market-maker-oracle diagnostics and fallback estimates, so this fixture does not cover every TWAP path.

## Exact evidence boundary

The coherent ordinary-account snapshot is from finalized slot 503410964. The selected public transactions are from slot 503411001; transaction 20 is not included. The full execution Clock is from a later response at slot 503411022, Unix timestamp 1790243614, epoch 1165, leader-schedule epoch 1166, epoch-start timestamp 1790221913. Combining these observations is an explicitly constructed input. Intervening chain state and historical bank prestate are not reconstructed.

Initial program ownership, executable status, ProgramData pointer, deployment header, and complete ELF were verified. The final check verifies the program binding and deployment header only; it is not a second full executable hash. The current deployment differs from the historical experiment. No unknown oracle or market byte offsets were patched, and no old layout conclusion was transferred to this executable.

The runtime is Mollusk 0.13.1 at f292187b800be56447ac6047cc27d19a922b37a7, with the preserved cross-instruction Ed25519 correction. It verifies the Ed25519 instruction, generates each Instructions sysvar, and applies all five captured Clock fields. Other runtime sysvars use Mollusk defaults. Outer transaction signatures, fee debits, remaining bank behavior, validator scheduling and arrival order are not modeled. Both records use the same runtime implementation; the independent reviewer validates recorded evidence rather than implementing a second runtime.

No instruction account declaration was relaxed. Shared payer coupling remains, and no throughput, latency, generally safe reordering, or safe account-writability change follows. The six historical blocks' conditional graph calculations remain separately scoped to their own executable and assumptions.

## Reproduce and inspect

Restore the separately preserved current public capture under output/current-bundle-capture-oaBfzh, plus the patched Mollusk source and offline Cargo dependencies described in the [harness guide](../../tools/current-bundle-runtime/README.md). The source-only exporter includes the harness and review code, but excludes these large generated inputs and records.

```sh
npm run native:prepare-current
bash tools/current-bundle-runtime/run.sh --test-only
bash tools/current-bundle-runtime/run.sh
npm run native:review-current
```

Commands refuse to overwrite existing evidence. Fixture preparation checks eight exact source hashes, including the 32-gate offline capture validation and its script. A separate comparison verifies that every supplied ordinary account's bytes and metadata survive preparation unchanged, including exact u64 rent epochs. Existing output can be reviewed without another execution.

- Fixture SHA-256: 1aaeb343408b1b34676579f961b4fcdda53fa85d1390f5a2b8288ff6df6061ab.
- Exact ELF SHA-256: 7fd13697bfc5bbd1dfd85648c28d80ebe8591052ecba7d8b2e00266a95f7a7cb.
- Each complete execution record SHA-256: ae6fc37e2493e5507e0ea941649b9d5e79d32f27ec443f5189aff9056cef96af.
- Runtime source SHA-256: cd97e9c517ea380a0942da17ddd4e85c10e961595f273298550a73e12e34bd71.

Local artifacts: fixture (`output/native-current-bundle/fixture.json`), execution (`output/native-current-bundle/execution.json`), repeat (`output/native-current-bundle/execution-repeat.json`), byte/role review (`output/native-current-bundle/review.json`), and unchanged-input comparison (`output/native-current-bundle/preparation-verification.json`).

The earlier [historical full-bundle failure](NATIVE-BUNDLE-RESULTS.md) remains preserved and valid for its different ELF and inputs. The next research question is whether any account privilege change can preserve complete execution under explicit controls; this successful unmodified sequence is the baseline, not permission to change a live program or submit transactions.
## Follow-up privilege control

The subsequent [grouped oracle read-only control](ORACLE-PRIVILEGE-CONTROL-RESULTS.md) fails with AccountNotMutable for both equality consumers and for the producer. This successful baseline remains valid, but directly relaxing those declarations is not supported by the current program.
