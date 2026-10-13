# Candidate 043c938568ad5e15 research dossier

Milestone 2.0 performs bounded public, read-only research into declared account contention. It is analytical and educational; it does not submit transactions, operate wallets, implement trading, or reconstruct a validator's exact private schedule.

## Executive finding

Official Velocity documentation authoritatively identifies the exact program ID, and observed discriminators/log names align with the official protocol-v2 source family. The deployed executable is unverified and unmapped, while a five-versus-six-account native-handler mismatch and comparison-log divergence prevent mutation-level or independence claims.

Decision: `identity-found-semantics-incomplete`.

- Authoritative exact Velocity identity is established.
- All six exact account-set occurrences independently revalidate and partial overlaps are rejected.
- Two Anchor discriminators and their emitted names match official source-family instruction paths.
- The exact deployed binary has no verified build, release hash, or reproducible source mapping.
- Observed native discriminator-2 behavior contradicts the pinned source-family handler's minimum account cardinality.
- Therefore exact deployed branches, shared-account mutations, and semantic independence remain incomplete.

## Exact identity and representative structure

- Candidate: `candidate-043c938568ad5e15`.
- Exact non-fee-payer shared writable account set: `2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV`, `6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH`, `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t`, `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg`, `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`, `J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ`.
- Six references independently revalidated: true; partial identity matches rejected: true.
- Representative slot 489572998, component 1: 4 transactions, 2 payers, 6 edges, 15 atoms, bounds 4-4, 183675 known Compute Units, coverage 1.

| Slot | Component | Tx indexes | Status | Payers | Edges | Atoms | Bounds | Known CU | Deviation |
|---:|---:|:---|:---|---:|---:|---:|:---:|---:|:---|
| 489572998 | 1 | 1, 2, 3, 24 | 4 success / 0 failed / 0 unknown | 2 | 6 | 15 | 4-4 | 183675 | none |
| 489593012 | 17 | 17, 21, 22, 23 | 4 success / 0 failed / 0 unknown | 2 | 6 | 15 | 4-4 | 182022 | known compute total differs; component identifier differs |
| 489602971 | 14 | 14, 17, 18, 19 | 4 success / 0 failed / 0 unknown | 2 | 6 | 15 | 4-4 | 181374 | known compute total differs; component identifier differs |
| 489603031 | 16 | 16, 21, 22, 23 | 4 success / 0 failed / 0 unknown | 2 | 6 | 15 | 4-4 | 180899 | known compute total differs; component identifier differs |
| 489612991 | 11 | 11, 17, 18, 19 | 4 success / 0 failed / 0 unknown | 2 | 6 | 15 | 4-4 | 180947 | known compute total differs; component identifier differs |
| 489613051 | 17 | 17, 19, 20, 21 | 4 success / 0 failed / 0 unknown | 2 | 6 | 15 | 4-4 | 181397 | known compute total differs; component identifier differs |

## Authoritative Velocity identity

- Pinned official Velocity docs commit bd4846ff6039747ea254c0f339ce7a2b6b022ae9 names the exact ID on devnet and mainnet.
- The official organization owns the protocol-v2 repository and publishes @velocity-exchange/sdk.

The exact program ID is `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`.

## Deployed-code correspondence

Classification: **source-family-only**.

- ProgramData: `HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7`.
- Current last-deploy slot: 488659528.
- Current executable SHA-256: `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`.

- The official protocol-v2 tree is a public Velocity source family and its instruction names/log strings match two observed Anchor discriminators.
- The pinned source tree declares the Drift program ID dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH rather than the exact Velocity ID.
- The repository .verified-build.json maps only the Drift program ID, and the exact Velocity ID returned is_verified false from the maintained verification service.
- No official release hash or reproducible build record matched executable SHA-256 89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c.
- The observed native discriminator-2 instruction succeeds with five accounts, while the pinned source-family handler requires at least six.
- Observed skip logs use a <= comparison, while the pinned source-family Pyth Lazer handler and message use <.

Current metadata is not historical state for the sampled slots.

## Exact observed instruction path

| Observed variant | Encoding | Discriminator | Bytes | Count | Source-family variant | Finding |
|:---|:---|:---|---:|---:|:---|:---|
| native-prefix-discriminator-2 | native-prefix | `ffffffff02030100` | 84 | 6 | handle_set_oracle_cache_entries_native | The prefix maps to native discriminator 2 in the pinned source family, but observed account cardinality/flags contradict that exact handler. |
| post-pyth-lazer-oracle-update | anchor-discriminator | `daedaaf5278fa621` | 263 | 18 | post_pyth_lazer_oracle_update | The Anchor discriminator and emitted instruction name match the pinned source family; exact deployed source correspondence remains unproven. |
| update-perp-bid-ask-twap | anchor-discriminator | `f717ff41d45addc2` | 8 | 18 | update_perp_bid_ask_twap | The Anchor discriminator and emitted instruction name match the pinned source family; exact deployed source correspondence remains unproven. |

All six successful native-prefix transactions supply five accounts. The pinned official source-family discriminator-2 handler rejects fewer than six, so the handler cannot be treated as the exact deployed branch.

The two Anchor discriminator hashes and emitted names identify the observed names, but exact deployed handler/source correspondence is not established. The native-prefix branch is intentionally left as an observed variant because the pinned handler's account contract disagrees.

## Account-role matrix

| Variant | Position | Signer / writable | Source-family constraint | Source-family role | Source-family mutation | Deployed mutation | Scope |
|:---|---:|:---:|:---|:---|:---|:---|:---|
| native-prefix-discriminator-2 | 0 | true / true | admin | administrative signer/payer | none | unknown | signer-configuration-specific |
| native-prefix-discriminator-2 | 1 | false / false | state | protocol state | none | unknown | global |
| native-prefix-discriminator-2 | 2 | false / true | cache0 | oracle cache buffer 0 | Source-family handler initializes/reallocates both cache buffers and overwrites cache metadata and entries. | unknown | oracle-specific |
| native-prefix-discriminator-2 | 3 | false / true | cache1 | oracle cache buffer 1 | Source-family handler initializes/reallocates both cache buffers and overwrites cache metadata and entries. | unknown | oracle-specific |
| native-prefix-discriminator-2 | 4 | false / true | system_program | System Program | none | unknown | global |
| post-pyth-lazer-oracle-update | 0 | true / true | keeper | keeper signer | No explicit handler field mutation; source-family account constraint declares mutability. | unknown | signer-configuration-specific |
| post-pyth-lazer-oracle-update | 1 | false / false | pyth_lazer_storage | Pyth Lazer signer/storage configuration | none | unknown | global |
| post-pyth-lazer-oracle-update | 2 | false / false | ix_sysvar | Instructions sysvar | none | unknown | global |
| post-pyth-lazer-oracle-update | 3 | false / true | remaining_accounts[feed_index] | Pyth Lazer oracle PDA candidate | Source-family branch conditionally writes price, posted_slot, publish_time, exponent, and conf after signature/message/PDA/timestamp validation; stale updates skip. | unknown | oracle-specific |
| post-pyth-lazer-oracle-update | 4 | false / true | remaining_accounts[feed_index] | Pyth Lazer oracle PDA candidate | Source-family branch conditionally writes price, posted_slot, publish_time, exponent, and conf after signature/message/PDA/timestamp validation; stale updates skip. | unknown | oracle-specific |
| post-pyth-lazer-oracle-update | 5 | false / true | remaining_accounts[feed_index] | Pyth Lazer oracle PDA candidate | Source-family branch conditionally writes price, posted_slot, publish_time, exponent, and conf after signature/message/PDA/timestamp validation; stale updates skip. | unknown | oracle-specific |
| update-perp-bid-ask-twap | 0 | false / false | state | protocol state | none | unknown | global |
| update-perp-bid-ask-twap | 1 | false / true | perp_market | perpetual market | Source-family handler mutates AMM/mark TWAP state and may update funding-related market state after validation. | unknown | market-specific |
| update-perp-bid-ask-twap | 2 | false / true | oracle | market oracle | none | unknown | oracle-specific |
| update-perp-bid-ask-twap | 3 | false / false | keeper_stats | keeper permissions/stake state | none | unknown | signer-configuration-specific |
| update-perp-bid-ask-twap | 4 | true / true | authority | keeper authority signer | none | unknown | signer-configuration-specific |
| update-perp-bid-ask-twap | 5 | false / false | remaining_accounts[maker_index] | optional maker input | none | unknown | market-specific |
| update-perp-bid-ask-twap | 6 | false / false | remaining_accounts[maker_index] | optional maker input | none | unknown | market-specific |

Declared writable, source-required writable, source-family mutation, inferred role, and deployed source-confirmed mutation are separate fields. Every deployed mutation remains `unknown`.

## Shared writable transition answers

- `2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV`: Declared writable in the candidate conflict graph. Observed positions align with post-pyth-lazer-oracle-update: Pyth Lazer oracle PDA candidate; update-perp-bid-ask-twap: market oracle, but no verified deployed source maps that declaration to an exact state transition; actual mutation remains unknown.
- `6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH`: Declared writable in the candidate conflict graph. Observed positions align with post-pyth-lazer-oracle-update: Pyth Lazer oracle PDA candidate; update-perp-bid-ask-twap: market oracle, but no verified deployed source maps that declaration to an exact state transition; actual mutation remains unknown.
- `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t`: Declared writable in the candidate conflict graph. Observed positions align with native-prefix-discriminator-2: oracle cache buffer 0; update-perp-bid-ask-twap: perpetual market, but no verified deployed source maps that declaration to an exact state transition; actual mutation remains unknown.
- `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg`: Declared writable in the candidate conflict graph. Observed positions align with native-prefix-discriminator-2: oracle cache buffer 1; update-perp-bid-ask-twap: perpetual market, but no verified deployed source maps that declaration to an exact state transition; actual mutation remains unknown.
- `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`: Declared writable in the candidate conflict graph. Observed positions align with native-prefix-discriminator-2: System Program; update-perp-bid-ask-twap: perpetual market, but no verified deployed source maps that declaration to an exact state transition; actual mutation remains unknown.
- `J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ`: Declared writable in the candidate conflict graph. Observed positions align with post-pyth-lazer-oracle-update: Pyth Lazer oracle PDA candidate; update-perp-bid-ask-twap: market oracle, but no verified deployed source maps that declaration to an exact state transition; actual mutation remains unknown.

## Ed25519 evidence

- 18 Ed25519 instructions and 18 signatures.
- 18 local verification passes.
- 0 same-instruction and 54 cross-instruction byte references.
- 1 distinct signer keys and 6 distinct covered-message hashes.
- Offsets, referenced instruction indexes, covered message bytes, signatures, and local verification are structural evidence. They do not establish signer real-world identity, organizational independence, or deployed application semantics.

## Source-family mutation trace

- The pinned Pyth Lazer handler validates an Instructions sysvar/preceding signature instruction, parses feeds, verifies oracle PDA seeds, skips older timestamps, and otherwise writes price, posted_slot, publish_time, exponent, and conf.
- The pinned UpdatePerpBidAskTwap handler validates state/market/oracle/keeper prerequisites, updates AMM/mark TWAP fields on a mutable PerpMarket, and enters a funding-update path.
- The pinned native discriminator-2 handler initializes or reallocates two OraclePriceCache PDAs and overwrites cache metadata/entries, but its account contract does not match the observed successful instruction.
- These are source-family traces only; none answers deployed mutation truth for the sampled transactions.

These findings are not source-confirmed deployed transitions.

## Semantic independence

Outcome: `cannot-be-established`.

- Exact deployed branch/mutation correspondence is missing.
- The three logged paths share declared writable oracle/market accounts and a signer, while the native path intersects update-specific writable accounts.
- Source-family handlers contain validation, timestamp, oracle, market, funding, and optional-maker dependencies whose deployed equivalence is unresolved.
- No valid-prestate application transition can be proven disjoint or commuting from declared locks and source-family similarity alone.

Narrow non-claims:

- No claim about current Solana concurrency or validator scheduling.
- No throughput estimate or recovery claim.
- No runtime redesign or semantic counterfactual.

No semantic footprint, decoder, counterfactual model, or redesign was implemented.

## Current account snapshots

These values are current read-only snapshots at one RPC context slot, not historical account-state snapshots for the six sampled slots. Ownership and byte hashes do not establish what fields changed in the historical transactions.

- `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`: scope program, owner `BPFLoaderUpgradeab1e11111111111111111111111`, executable true, 36 bytes, raw SHA-256 `33f402bf0387b7b48283f26260ba7e7af6bfa1d4b3abd3778f200a128ce5a5ab`.
- `HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7`: scope program-data, owner `BPFLoaderUpgradeab1e11111111111111111111111`, executable false, 6050442 bytes, raw SHA-256 `618011650ffeed486053d25aa439634ab765c15af24741ef3c32bcd026db5222`.
- `2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV`: scope candidate-shared-writable, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 48 bytes, raw SHA-256 `09ff09c71be820e0830d89e5c69e33957759b059344d62c90f01b8c3c4e14fa7`.
- `6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH`: scope candidate-shared-writable, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 48 bytes, raw SHA-256 `e645c17ec85e5dfc742d45da382051be554472d7d3127dce5b2a342f915e76f0`.
- `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t`: scope candidate-shared-writable, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 1560 bytes, raw SHA-256 `d5c3bd622d94b3e4766836e6de3371340c6215c29ac8adb12d2f38978cac8e10`.
- `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg`: scope candidate-shared-writable, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 1560 bytes, raw SHA-256 `a506233d41cea9985dd9b64bbc576831923ce2cc1fe606488bfc7cb476f538a0`.
- `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`: scope candidate-shared-writable, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 1560 bytes, raw SHA-256 `58e1f180bce1f02e493cd3bdc37cbac9be26319f66335d951f3f73791984efb5`.
- `J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ`: scope candidate-shared-writable, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 48 bytes, raw SHA-256 `bb3e5a444502825969108a2480a648287e151b37a74e5a7d95c78f7769b18f5a`.
- `2etx5NvPNxeMZ7EfHE6GjJfW2imRYEUANehNS1WB4CVW`: scope representative-instruction-specific, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 1752 bytes, raw SHA-256 `97ce4eb18a82e724a8bea69a8f1b4da658dee76e70221bd0f6e67b6f18860dc9`.
- `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL`: scope representative-instruction-specific, owner `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt`, executable false, 381 bytes, raw SHA-256 `bc95799804292206529561227b9c376c6de09fd3f9d463aed94c275f30b36cbe`.
- `4zCsHgrmXM5s9LZZnXcAzs4oiqsUsKCkdYtHCxQdbt4F`: scope representative-instruction-specific, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 240 bytes, raw SHA-256 `3c2f438bf94eb50696b167926316fe803f4de28d032f6b5dea1f6d63866ebe18`.
- `9b3LcNmWTjNhCuMVNC6i4yzYtsx5UncHCDtqSTdAMcaT`: scope representative-instruction-specific, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 240 bytes, raw SHA-256 `173126be97e92f484e4e39b4e0deb00c7529ab50b51b50ad1e89c694f96e9a86`.
- `Admz75Jy7Xd4pdmFpX5AfFrCgciiQxew2sDtM7wBF49e`: scope representative-instruction-specific, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 4496 bytes, raw SHA-256 `0dc418aebf2b6e10d92e80c4701f6d0e36920f4948eb241e805c85c4390b368e`.
- `AziMeCFwLuQisigrHsMP1tKKYxjMCwY43eSfqAGW5xe`: scope representative-instruction-specific, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 240 bytes, raw SHA-256 `2d8a55b837df4b1f68897b876e9342289c79b7b214b2d6c325a9d79256751be1`.
- `Cg32xAQbEoUEWkud61wxo8598CTtxbj7533gpEKb8DCq`: scope representative-instruction-specific, owner `11111111111111111111111111111111`, executable false, 0 bytes, raw SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `GhMUe97fqJEb9QFNfM6N3BbEy4SD2VmeyjUVFBcXuV6V`: scope representative-instruction-specific, owner `11111111111111111111111111111111`, executable false, 0 bytes, raw SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `H8oSKeSX1ifYtKMv9U7Fmv8Hq75mH3jQBNzzUnakfszT`: scope representative-instruction-specific, owner `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`, executable false, 4496 bytes, raw SHA-256 `03117f1b428fe9657f7ea5fa1f2fd54b282a9a89dd4a9cd9e10523c837a78ebc`.
- `Sysvar1nstructions1111111111111111111111111`: scope representative-instruction-specific, owner `missing`, executable unknown, unknown bytes, raw SHA-256 `none`.

## Source manifest

- [Velocity SDK setup and program addresses](https://raw.githubusercontent.com/velocity-exchange/velocity-docs/bd4846ff6039747ea254c0f339ce7a2b6b022ae9/content/developers/velocity-sdk/setup.mdx) — official-documentation; commit `bd4846ff6039747ea254c0f339ce7a2b6b022ae9`; exact-ID match true; content SHA-256 `55fb96361c494b12315065b849201f70b9aa7f6c666cfe5a1493ec6b44998248`; supports: Authoritative Velocity association for the exact program ID on devnet and mainnet; Official maintained SDK package name; does not support: Historical account state; A verified mapping from the deployed executable to protocol-v2 source; Exact deployed mutation semantics.
- [Velocity protocol-v2 program entry and instruction entrypoints](https://raw.githubusercontent.com/velocity-exchange/protocol-v2/80b736eeef5ac0e90573477e0e2cc42cacb5e1f9/programs/drift/src/lib.rs) — official-source-family; commit `80b736eeef5ac0e90573477e0e2cc42cacb5e1f9`; exact-ID match false; content SHA-256 `751deff483e081954f8d5f244624f6ec4146e348326914cf45a3ee5a71233cfb`; supports: Official source-family native 0xffffffff routing; Source-family Anchor entrypoints for the two logged instructions; does not support: Exact deployed Velocity binary correspondence; Exact Velocity program-ID declaration; this pinned file declares dRifty.
- [Velocity protocol-v2 Pyth Lazer source-family handler](https://raw.githubusercontent.com/velocity-exchange/protocol-v2/80b736eeef5ac0e90573477e0e2cc42cacb5e1f9/programs/drift/src/instructions/pyth_lazer_oracle.rs) — official-source-family; commit `80b736eeef5ac0e90573477e0e2cc42cacb5e1f9`; exact-ID match false; content SHA-256 `3b754e51c7d84fe6bee80d4e077ac702040ec028fe9be17671351705021b8ef8`; supports: Source-family validation, PDA, account-role, skip, and field-write path for PostPythLazerOracleUpdate; does not support: Proof that the sampled deployed Velocity executable uses this exact handler.
- [Velocity protocol-v2 keeper source-family handler](https://raw.githubusercontent.com/velocity-exchange/protocol-v2/80b736eeef5ac0e90573477e0e2cc42cacb5e1f9/programs/drift/src/instructions/keeper.rs) — official-source-family; commit `80b736eeef5ac0e90573477e0e2cc42cacb5e1f9`; exact-ID match false; content SHA-256 `a22942da706e0f06e216b591c6797233358445830d3272b5923ac4e265ad0428`; supports: Source-family account constraints, validations, and PerpMarket write path for UpdatePerpBidAskTwap; Exact source-family log strings observed in the candidate; does not support: Proof that the sampled deployed Velocity executable uses this exact handler.
- [Velocity protocol-v2 native oracle-cache source-family handler](https://raw.githubusercontent.com/velocity-exchange/protocol-v2/80b736eeef5ac0e90573477e0e2cc42cacb5e1f9/programs/drift/src/instructions/admin.rs) — official-source-family; commit `80b736eeef5ac0e90573477e0e2cc42cacb5e1f9`; exact-ID match false; content SHA-256 `7e180facdb05522004c0cae40dce30dff242726b26c29169554575b9a90856f3`; supports: Source-family meaning of native discriminator 2 and its six-account minimum; does not support: The successful observed five-account native-discriminator-2 branch; the account cardinality mismatch is contrary deployment-correspondence evidence.
- [Velocity protocol-v2 maintained source-family IDL](https://raw.githubusercontent.com/velocity-exchange/protocol-v2/80b736eeef5ac0e90573477e0e2cc42cacb5e1f9/sdk/src/idl/drift.json) — maintained-interface-source-family; commit `80b736eeef5ac0e90573477e0e2cc42cacb5e1f9`; exact-ID match false; content SHA-256 `c8e18d1b86cc6ff3527e3947d74f09a24544b223e49d67dc91b1036c2b929d9c`; supports: Source-family instruction names, account positions, signer/writable constraints, and arguments; does not support: Exact deployed Velocity IDL correspondence.
- [Velocity protocol-v2 repository verified-build record](https://raw.githubusercontent.com/velocity-exchange/protocol-v2/80b736eeef5ac0e90573477e0e2cc42cacb5e1f9/.verified-build.json) — verified-build-record-source-family; commit `80b736eeef5ac0e90573477e0e2cc42cacb5e1f9`; exact-ID match false; content SHA-256 `bf1b35080c2231a2a646c8287078c9c879c3296ca7d5fd3ead6010c6db921740`; supports: The pinned repository record maps a Drift program ID, not the sampled Velocity ID; does not support: A verified build for vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P.
- [Maintained Velocity SDK npm metadata](https://registry.npmjs.org/@velocity-exchange%2Fsdk/0.17.0) — maintained-interface; commit `1e748b5e142979e349ca37f5ef17462cb5159844`; exact-ID match false; content SHA-256 `8dfa6351a9d47546339a361c6d3674a3445663ec08f30ce01386043ae406c9cb`; supports: Maintained public SDK package version, repository, directory, and gitHead; does not support: Exact deployed binary correspondence; Proof that the SDK's source tree matches sampled instruction bytes.
- [Official protocol-v2 repository metadata](https://api.github.com/repos/velocity-exchange/protocol-v2) — official-repository-metadata; commit `13e8e9b8d614f3b62e3a65a8c372c819e6529aeb`; exact-ID match false; content SHA-256 `a9b817b61afc1002309bd89094d108c83bbaa48a2ca4815b78e79bef66e1b017`; supports: Official organization ownership and public source-repository availability; does not support: Exact deployed source correspondence.
- [Official protocol-v2 release metadata](https://api.github.com/repos/velocity-exchange/protocol-v2/releases?per_page=100) — official-release-metadata; bounded release-list snapshot; exact-ID match false; content SHA-256 `6aea608d18a4a81318112c7d64f81073026f4b19a1079f4bf54d7f9ecbc7ca35`; supports: Bounded release/tag and published verified-hash search surface; does not support: A release whose published hash matches the sampled deployed executable.
- [OtterSec exact Velocity program verification status](https://verify.osec.io/status/vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P) — verified-build-status; commit `bbb4c312ce1b1a33bce6fb2c29eb775c474d1a6a`; exact-ID match true; content SHA-256 `d12a460cf74cc5e167e078636b4f1efa2cc82679d302d1d390d27d27facc4288`; supports: The exact program ID was not verified by this maintained service at access time; does not support: Proof that no source exists elsewhere; Program semantics.

## Actionability gate

Closed. Authoritative identity is insufficient: deployed-version correspondence, the exact native branch, shared-account state transitions, and semantic independence are not established.

No runtime scheduling, validator behavior, throughput recovery, production deployment, monitoring, or trading claim follows from this dossier.
