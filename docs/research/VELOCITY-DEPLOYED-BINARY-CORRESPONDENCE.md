# Velocity deployed-binary correspondence

Milestone 2.1 asks one narrow question: can the exact Velocity executable that processed Candidate #3 be reproducibly connected to public historical source?

## Outcome

**variant-level-strong-correspondence**

Temporal result: **sample-binary-continuity-established**.

The exact current executable is established as the executable in force at all six Candidate #3 slots. No authoritative public commit was built to a byte-identical executable. The two Anchor variants have compelling historical-source correspondence, while the native discriminator-2 variant remains unresolved and contradictory. This outcome does **not** authorize a general semantic decoder. A later study, if any, must be narrowly variant-specific.

This work does not add a semantic decoder, semantic footprint, counterfactual model, runtime scheduling claim, throughput claim, redesign claim, transaction submission, wallet/key handling, trading, or MEV/Jito functionality.

## Exact executable

- Program: `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`
- ProgramData: `HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7`
- ProgramData header length: 45 bytes
- Raw ProgramData length / SHA-256: 6050442 / `618011650ffeed486053d25aa439634ab765c15af24741ef3c32bcd026db5222`
- Executable payload length / SHA-256: 6050397 / `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`
- ELF validation: passed (ELF64, little endian, Solana SBF machine 263)
- Deterministic strings: 3146; artifact SHA-256 `ce731b6c46490470a48e62c67cc086d0cf523ea4fb069bbaccfdcf2992c054ea`
- ELF symbols recovered: 19

ProgramData decoding treats the bytes as the upgradeable-loader bincode variant: 4-byte little-endian tag, 8-byte slot, 1-byte authority option, optional 32-byte authority, then the complete executable payload. No trailing bytes are trimmed.

## Temporal executable continuity

Pinned loader: [Anza Agave v4.3.0-beta.2](https://github.com/anza-xyz/agave/tree/386cf57c45e135d8a3a8b7d16877eb896f695c64) at `386cf57c45e135d8a3a8b7d16877eb896f695c64`.

The ProgramData slot is written to clock.slot on DeployWithMaxDataLen, Upgrade, and ExtendProgram. SetAuthority preserves the existing slot. Therefore it is the last executable deploy/upgrade/extend mutation slot, not a generic authority-change timestamp.

- ProgramData last executable-mutation slot: 488659528
- Candidate slots: 489572998, 489593012, 489602971, 489603031, 489612991, 489613051
- Current cached snapshot context: 490041839
- Deployment transaction: `2vhmyGjHr6bDgtumb4W5p4xC3vw34ZgrwbnZ3WQFtEpYQojPTUCxGUqtg6XzUwF2VMrXZtKM8pajgRbjHmx9kUao` (success)
- Decoded loader accounts: `{"authority":"8Z22ng8xW4AemtC9WdwxcZyWthnwVbQLbDfyuARCs122","bufferAccount":"9MZtrA4nNwV16FRc48EVnvtuJkiWX6f8UF8MFcZQND81","clockSysvar":"SysvarC1ock11111111111111111111111111111111","programAccount":"vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P","programDataAccount":"HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7","rentSysvar":"SysvarRent111111111111111111111111111111111","spillAccount":"dprhSQPzA3h6RH6DiKtyUDX3N6Zkjz52CXeCvFUnc5P"}`
- History scope: Complete 30-signature ProgramData-address history returned by the RPC; the following page was empty because the final page contained fewer than 1,000 entries.

Continuity uses decoded history and absence of later ProgramData-address references through the cached snapshot window; address equality alone is not the basis.

The cached current executable bytes are established as the executable in force for all six Candidate #3 sample slots.

## Official history inspected

- [velocity-exchange/protocol-v2](https://github.com/velocity-exchange/protocol-v2), all locally reachable branches/tags and full relevant Git history.
- The official Drift lineage and SDK release commit `0ae3e3b1db782a6765c3525b3dec38ad4d9d3a62` for `v2.163.0-beta.0`.
- The public Velocity rebrand at `6b993baf684df723f6072ffd09e5de48dde877dd` and strongest reachable pre-deployment Velocity candidate `f7df335599c194bc759cebf682a11bcad6bd5ed2`.
- The official SDK/velocity-v1 repository metadata plus the `@velocity-exchange/sdk@0.17.0` npm tarball.

The current public velocity-v1 Git URL was unavailable. Its official npm tarball is a client/generated SDK and IDL surface: it contains no on-chain Rust, deployable SBF binary, Cargo/Anchor build metadata, published program-binary hash, or exact protocol-v2 deployment mapping.

## Historical source findings

- `de32add525919791b38218ecb59ee506e16a9b3f` introduced the public Lazer feed-update timestamp form using `next_timestamp < current_timestamp` and the exact posting log `Posting new lazer update. current ts {} < next_timestamp {}`.
- `ffd10b2bd6a009e66aaaf42bb065387ccc1c72c8` introduced Drift native discriminator 2 as `handle_set_oracle_cache_entries_native`, requiring at least six accounts in this order: admin, state, cache0, cache1, System Program, rent.
- `6b993baf684df723f6072ffd09e5de48dde877dd` renamed the source tree to `programs/velocity` and declared the exact `vELoC…` program ID, but this public Velocity dispatcher exposes only native opcodes 0 and 1.
- `3f148f8b477e4176e11e0660adb0e67dd5163d3b` hardened the public Velocity native paths; it still does not add opcode 2.
- `f7df335599c194bc759cebf682a11bcad6bd5ed2` matches the deployed ELF’s Velocity source paths, exact program ID, Anchor instruction names, and posting string. It does not contain the deployed `<=` skip fingerprint or a native opcode-2 route.
- The only reachable post-candidate tag containing that branch was `docker-swift-v0.1.13` at `ff80ed4d2d92c04804c0d8d3be1eca63eb521f43`.

The exact observed success log uses `Skipping lazer price update. next_timestamp {} <= current_timestamp {}`. None of the inspected official public versions contains that exact equality form. Exact string correspondence is version evidence, not proof of a complete binary mapping.

## Five-account native structural diff

| Candidate | Observed count | Source minimum | System Program mismatch | Compatible | Conclusion |
|:--|--:|--:|:--:|:--:|:--|
| public-velocity-dispatcher-no-opcode-2 | 5 | 1 | no | no | The public Velocity candidate rejects opcode 2 at dispatch because only opcodes 0 and 1 exist; it cannot be the observed native handler. |
| drift-opcode-2-six-account-cache-handler | 5 | 6 | yes | no | The observed layout contradicts this source contract and cannot be used as deployed handler truth. |

Observed position 4 is `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`, writable and currently Velocity-owned. It is not called or accepted as the System Program.

## Variant correspondence

| Variant | Discriminator | Accounts | Candidate source | Source comparison | Build | Confidence | Remaining contradictions |
|:--|:--|--:|:--|:--|:--|:--|:--|
| native-prefix-discriminator-2 | `ffffffff02` | 5 | `ffd10b2bd6a009e66aaaf42bb065387ccc1c72c8` | n/a | build-unavailable | **unresolved** | Public Velocity history has no opcode 2. Public Drift opcode 2 requires at least six accounts. Observed position 4 is a writable Velocity-owned account, not the System Program. No exact public source or reproducible build maps this branch. |
| post-pyth-lazer-oracle-update | `daedaaf5278fa621` | 6 | `f7df335599c194bc759cebf682a11bcad6bd5ed2` | next_timestamp < current_timestamp | build-unavailable | **strong** | Deployed skip behavior/log uses <= while every inspected official public version uses < or an older equivalent >= form. No exact full-binary build match. |
| update-perp-bid-ask-twap | `f717ff41d45addc2` | 7 | `f7df335599c194bc759cebf682a11bcad6bd5ed2` | n/a | build-unavailable | **strong** | No exact full-binary build match; mutation behavior remains unpromoted. |

The Anchor findings are correspondence findings only. No exact deployed field mutation is promoted for any variant.

## Build attempts

| Source | Commit | Exact command | Status | Deterministic repeat | Comparison |
|:--|:--|:--|:--|:--|:--|
| https://github.com/velocity-exchange/protocol-v2 | `f7df335599c194bc759cebf682a11bcad6bd5ed2` | `solana-verify build --library-name velocity -b solanafoundation/solana-verifiable-build:3.1.14 -- --no-default-features --features no-entrypoint` | build-unavailable | not-run | Pinned build recipe was recovered, but no usable Docker, Podman, WSL, solana-verify, Solana CLI, Anchor, Cargo, or Rust toolchain was available on this host. |
| https://github.com/velocity-exchange/protocol-v2 (public Drift lineage) | `ffd10b2bd6a009e66aaaf42bb065387ccc1c72c8` | `not attempted: the source account contract contradicts the observed transaction before compilation` | build-unavailable | not-run | Eliminated as an exact deployed candidate by the six-account minimum and System Program requirement at observed position 4. |

The public Velocity build metadata pins Rust 1.91.1, Solana 2.3.11, Anchor 1.0.0, `solana-verify` 0.5.0, and image `solanafoundation/solana-verifiable-build:3.1.14`; its devnet recipe strips default features and enables `no-entrypoint`. This host had no usable Docker, Podman, WSL VM, Solana CLI, Anchor, Cargo/Rust, or `solana-verify`, so the exact candidate build was unavailable. No exact binary match is claimed.

## Pinned cache provenance

| Input | SHA-256 | Purpose |
|:--|:--|:--|
| `cache/research/candidate-043c938568ad5e15/account-snapshots.raw.json` | `49bf9f3880a931c3656e44e5b8c684b09978ec5743fc93eb7ce274978a673391` | Public read-only account snapshot containing exact Program and ProgramData bytes |
| `cache/research/velocity-binary/rpc/deployment-history.raw.json` | `0e465af53c244d7f057aa01d4b10fe54b7a78a9cd6f6433f974f163be3f321b2` | Read-only RPC Program/ProgramData signatures, deployment transactions, and node version |
| `cache/research/velocity-binary/source/loader-source.raw.json` | `04fed1ac8927914c1178a0a922867521256fa17835b483cddd4e7dedc8d4e307` | Pinned authoritative Agave upgradeable-loader source |
| `cache/research/velocity-binary/source/source-history.raw.json` | `198a7aa0ff3e0d3d7ece31e5dbc45e9c92a66f5a9fcb2b4ff7d63484110e84c7` | Deterministic full-ref official Git archaeology cache |
| `cache/research/velocity-binary/build/build-environment.raw.json` | `2c7853bd0b0c58f98130c62a520d2aebda61111082edc41a21d4a1000fe9db89` | Bounded local reproducible-build environment probe |
| `cache/research/velocity-binary/npm/velocity-exchange-sdk-0.17.0.tgz` | `22b3c245670892a088ff100300925fff701d0ea136b840952285d760e2f59a88` | Official maintained SDK tarball and velocity-v1 repository metadata fallback |

Offline replay: `npm run research-velocity-binary -- --plan research-plans/velocity-binary-milestone-2.1.json --offline`.

## Durable boundary

The milestone stops at **variant-level-strong-correspondence**. It does not reopen the native branch, and it does not generalize the Anchor correspondence into deployed mutation semantics. Candidate #1 remains `black-box-structure-only`, Candidate #2 remains `deferred-not-rejected`, Candidate #3’s six occurrences and discovery rank remain unchanged, and all prior sourceability/discovery evidence remains preserved.
