# Oracle read-only declarations: the current program rejects the grouped change

Archive scope: the generated native records named below are separately preserved local evidence, not files supplied in the source-only preview. Paths are relative to the original project root. The portable verification command does not execute these experiments or independently reproduce their native results; reproduction requires the documented native inputs and runtime.

The successful unchanged baseline does not authorize removing writable declarations. With the same captured ELF, unchanged account bytes, and full observed Clock, declaring all three oracle accounts read-only in the equality consumers fails at Post with Anchor AccountNotMutable (3006). This is a negative result for the tested grouped change; it does not identify which individual oracle requires mutability.

## Controlled result

| Fixture | Order | What executed | Result |
| --- | --- | --- | --- |
| Original baseline | ABC and ACB | All three complete five-instruction bundles | Success; identical final ordinary state |
| B/C oracle declarations read-only | ABC | A succeeds, B fails at instruction index 3 (Post) | AccountNotMutable 3006; C is not attempted |
| B/C oracle declarations read-only | ACB | A succeeds, C fails at Post | AccountNotMutable 3006; B is not attempted |
| A oracle declarations read-only | ABC and ACB | A fails at Post | AccountNotMutable 3006; no consumer is attempted |

Ed25519 completes before each failed Post. The failed Post has no observed ordinary-account changes, and each failed transaction preserves its full input account bytes and metadata through atomic rollback. The consumer fixtures retain the successful producer state. TWAP is never reached in a failing transaction. The independent reviewer does not evaluate successful final-state equivalence for incomplete sequences.

The original ordinary account contents and metadata, all five Clock fields, instruction programs/data/order/operands, signer bits and payer declarations remain unchanged. The preparation script changes every occurrence of each selected oracle's writable flag, including the trailing TWAP instruction. This is eight flag edits across B/C or four across A. Reversing exactly those edits recovers the complete baseline before the explicit counterfactual provenance is added. The reviewer regenerates the expected fixtures and compares their exact hashes before accepting the native records.

Mollusk compiles the complete instruction list into one transaction message, merging writable/signer privileges across occurrences. Changing just Post while leaving the same oracle writable in TWAP would not establish a read-only transaction account. The observed failure here comes from program account validation, not a demonstrated attempt to write through runtime read-only memory.

## Scope and retained evidence

These are unsigned local counterfactual instruction declarations. Original outer transaction signatures remain provenance references and are not valid signatures for modified transaction messages. No transaction was submitted. The original Ed25519 signed payload bytes remain unchanged. Runtime-generated Instructions sysvar meta bits necessarily change with the declarations.

The exact historical baseline, ELF, and compiled current harness were reused. One run of each counterfactual covers both orders. The unchanged harness emits a fixed accountPrivileges label saying observed transaction-wide privileges; that label is inaccurate for these two variant records. Their pinned fixtures and the review's explicit counterfactual scope describe the actual experiment. Raw execution records are preserved without rewriting that metadata.

This result does not establish a safe alternative interface, a general program property, fewer estimated execution waves, or a speedup. The shared writable payer remains unchanged. It also does not retroactively alter results for the older historical ELF. Any further optimization claim needs new evidence about an implementation that can accept the intended privileges; unchanged oracle bytes alone are insufficient.

## Reproduce

Restore the [current native baseline and prerequisites](CURRENT-NATIVE-BUNDLE-RESULTS.md), then prepare the two derived fixtures:

```sh
npm run native:privilege-prepare
for variant in consumers-readonly producer-readonly; do
  MICROSCOPE_NATIVE_FIXTURE="$PWD/output/native-privilege-controls/fixture-$variant.json" \
  MICROSCOPE_NATIVE_OUTPUT="$PWD/output/native-privilege-controls/execution-$variant.json" \
  bash tools/current-bundle-runtime/run.sh
done
npm run native:privilege-review
```

These commands refuse to overwrite existing evidence. The review rechecks the baseline's successful sequence, fixture deltas, source/ELF identities, all instruction events, native failure logs and rollback. Strict TypeScript and all 14 relevant byte/role reviewer regressions pass. The prior baseline checkpoint retains its 300 passing source tests; this extension leaves the native harness and core analyzer unchanged.

Local artifacts: delta manifest (`output/native-privilege-controls/controls.json`), consumer record (`output/native-privilege-controls/execution-consumers-readonly.json`), producer control record (`output/native-privilege-controls/execution-producer-readonly.json`), and current review (`output/native-privilege-controls/review-v2.json`). The earlier review.json is retained as a preliminary report; review-v2.json adds an explicit baseline-state comparison gate that remains unevaluated for these failures.

Fixture hashes:
- Consumers read-only: c6c0fc673c797d90f6834cb395a95055dcf0b692ccdb7158eed825c93d503953.
- Producer read-only: ec3d2250c3e3710e9e3922c4b9cf5befe35cd9b7516df44be1c9f2ca5064288f.