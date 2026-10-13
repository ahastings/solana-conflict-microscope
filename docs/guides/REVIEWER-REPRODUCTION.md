# Reproduce the conditional Velocity graph review

The portable reviewer checks six bundled public devnet blocks and independently recomputes their declared-lock and conditional dependency layers. It needs no historical cache directory, generated milestone reports, Solana RPC access, Rust toolchain, or native runtime. Use Node 22.12 or newer; the project has been tested on Node 24.16 on Windows and Linux.

From the project root:

```text
npm ci
npm run review-case
```

Open `output/reviewer/review.html`. The neighboring `review.md` is a concise text report; `review.json` contains input hashes, observed transaction identities, conflict atoms, every computed layer witness, controls, and the explicit full-block substitution check. Dependency installation can access npm; the reviewer itself performs no network requests.

To select a different local copy of the **same frozen reviewer input set** or an output directory:

```text
npm run review-case -- --fixture-dir PATH_TO_REVIEWER_FIXTURES --output-dir PATH_TO_OUTPUT
```

The default fixture directory is resolved from the module location, so it does not depend on the caller's working directory. An explicit fixture directory must contain `manifest.json` and the six named block files. Input paths inside the manifest are constrained to local `slot-N.json` filenames. The command validates all inputs before writing reports; it rejects changed block hashes, signatures, role evidence, instruction representations, component topology, and unresolved searches. `--max-search-states INTEGER` can set the finite solver's explicit search budget. The solver rejects graphs above twelve nodes; this bound is sufficient for every connected component in these fixtures.

## Evidence included

`fixtures/reviewer/manifest.json` lists the exact byte hashes and original provenance of six copied block records. The records are byte-for-byte copies of the frozen public getBlock cache:

| Slot | Original cache file SHA-256 |
| --- | --- |
| 489572998 | `c64b519554b772cd5384916bd6cb058e1eebe3aae502a01df02c4845adf38e18` |
| 489593012 | `37360ec1bf9be854bbfe901bc0045c4a849f21e2af91ba9de0e2c1486430cc18` |
| 489602971 | `d20af433b18b23930fd944341e976dfff5dae58a6cfb561ab25aea0f0a5b4673` |
| 489603031 | `786507c49ad0d1b14a3612c3120731e3ac72506d20034c4dbac145f8ce52b21e` |
| 489612991 | `2562121fb9d1ebe408c3e1623c62bf7e1460027c78cf0587be4ca03095a1353c` |
| 489613051 | `2c6d7fe3e7525a52d915b76cc0e57bb89ebef9b6b402e3fd72815ce43d0496d6` |

The block records total 1,375,140 bytes. They contain declared account permissions, parsed and compiled instruction representations, transaction identities, and recorded logs. The manifest selects the observed posting-log producer, two later equality-log consumers, and native transaction by index and signature. The reviewer checks the selected roles against those records, verifies the public Ed25519 signed message, and confirms within-block message reuse. This verifies the referenced public message signature; it is not a fresh chain query or independent authentication of every RPC field.

The ELF and historical Linux execution-record hashes in the manifest are **reference-only**. Those large/runtime inputs are not bundled, not loaded, and not executed by this command. See the [independent audit](VELOCITY-INDEPENDENT-AUDIT.md) for the separate native-evidence scope.

## What the calculations establish

The current graph comes from declared account permissions. The reviewer decomposes each conflict edge into one atom per shared conflict account and independently solves the resulting constraints. It then computes three conditional variants:

- **Equality only:** hypothetically reclassify Anchor/Anchor oracle conflicts, retaining directed producer-to-consumer dependencies. Shared payer conflicts remain.
- **Payer only:** hypothetically remove Anchor/Anchor shared payer coupling. All oracle conflicts remain.
- **Joint:** apply both hypotheses and retain the producer dependencies and every native market conflict.

For the bundled data, the exact model depths are **4 / 4 / 4 / 3**. These numbers are solver results, not expected values read from the historical reports. An independently derived witness accompanies every result. The full-block calculation also solves every unchanged connected component and explicitly constructs the target substitution before checking non-target atom conservation.

The producer-erasure comparison intentionally removes directed dependencies. Its mathematical result is labeled **INVALID** and excluded from conclusions. A synthetic disconnected unchanged clique demonstrates a case where another component masks the target's local reduction. The one-cause models expose masking within the target itself. Tests also add an extra consumer conflict and confirm the joint depth returns to 4 rather than silently preserving the headline.

## What remains unproven

The historical native harness executed the prefix through Post while carrying a five-instruction sysvar. It did not execute trailing TWAP or a full producer/consumer sequence. Therefore the whole-transaction oracle read/no-op footprint assumed by equality refinement remains unproven. Recorded equality logs alone cannot establish it.

The shared payer is also a writable signer in program instructions. The payer hypothesis removes that coupling as a mathematical assumption; the reviewer does not claim that changing only the transaction fee payer implements it. Native prefix discriminator 2 remains unresolved and all its observed market conflicts are preserved.

The output describes declared contention and conditional semantic layers. It does not establish safe same-prestate concurrency, a validator's private schedule, elapsed-time savings, TPS, or an optimization ready to deploy. No new native experiment was performed for this reviewer.

The focused checks can be run directly:

```text
node --import tsx --test test/dependency-layers.test.ts test/reviewer.test.ts
```

They include independent finite assignment enumeration, malformed/cyclic constraints, search exhaustion, byte tampering, changed graph conditions, misassigned identities, and execution from a temporary directory containing only copied reviewer fixtures. Historical milestone artifacts are not rewritten.
