# Candidate ff30780de8479976 research dossier

Generated for Milestone 1.9 from the committed candidate manifest and cache-first evidence. This is an analytical and educational report about declared account contention, not a trading system.

## Executive finding

All 25 cached references independently resolve to the same exact two-account recurring pattern. Each observed candidate transaction places native Ed25519 verification before one structurally consistent BQsAJ instruction. Current snapshots and embedded binary paths add context, but no authoritative public source identifies the program or proves which shared-account bytes are read or mutated.

Decision: `black-box-structure-only`.

- 25/25 exact recurrence references revalidated from cached blocks.
- Native Ed25519 layouts, referenced bytes, signer keys, message hashes, and local signature checks were decoded deterministically.
- No primary source, maintained interface, verified-build record, or source-linked metadata establishes the exact program identity or its mutation semantics.
- Without exact source-confirmed mutation semantics, no decoder, commutativity finding, redesign conclusion, or new counterfactual is justified.

## Evidence ladder

1. **observed on-chain declaration:** Exact account keys, flags, instruction order, logs, conflict edges, conflict atoms, and component bounds from cached blocks.
2. **deterministically decoded structure:** Ed25519 offsets and covered bytes, loader metadata, hashes, stable payload boundaries, current account metadata, and binary strings.
3. **source-confirmed semantics:** Generic Solana Ed25519, Instructions sysvar, and upgradeable-loader behavior only; no exact BQsAJ instruction or mutation semantics.
4. **supported inference:** The repeated pattern appears to carry a signed update into a DEX-like current binary, but exact purpose and mutations remain unconfirmed.
5. **unresolved hypothesis:** Protocol identity, field meanings, shared-account state transitions, signer organization, and logical independence remain unknown.

## Exact identity and representative structure

- Candidate: `candidate-ff30780de8479976`.
- Exact shared-account set: `2ZU4QHdSZVMfzWyyzDJUs6ca5PKQigPMAcnWLcRT6EX2` and `4SnAS3mQcB5AwHL4u5fnZeciLZ8J7deALb4YdXfjr9uN`.
- Revalidated recurrence: 25 blocks; all references revalidated: true.
- Representative: slot 489573044, component 15, 3 transactions, 3 fee payers, 3 edges, 6 atoms, bounds 3-3.
- Across occurrences: 43 recomputed edges and 94 atoms. These are declared-access facts, not proof of mutation.

## Recurrence timeline

| Slot | Component | Tx | Payers | Edges | Atoms | Bounds | Deviation |
|---:|---:|---:|---:|---:|---:|:---:|:---|
| 489572970 | 17 | 2 | 1 | 1 | 3 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489572988 | 17 | 2 | 1 | 1 | 3 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489573007 | 1 | 2 | 1 | 1 | 3 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489573025 | 18 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489573044 | 15 | 3 | 3 | 3 | 6 | 3-3 | none |
| 489573063 | 9 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489582970 | 6 | 3 | 3 | 3 | 6 | 3-3 | none |
| 489582989 | 1 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489583007 | 19 | 3 | 3 | 3 | 6 | 3-3 | none |
| 489583025 | 3 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489583062 | 18 | 3 | 2 | 3 | 7 | 3-3 | conflict-atom count differs |
| 489592978 | 4 | 3 | 3 | 3 | 6 | 3-3 | none |
| 489592995 | 14 | 3 | 2 | 3 | 7 | 3-3 | conflict-atom count differs |
| 489593014 | 2 | 3 | 2 | 3 | 7 | 3-3 | conflict-atom count differs |
| 489593033 | 2 | 3 | 3 | 3 | 6 | 3-3 | none |
| 489593051 | 21 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489602972 | 20 | 2 | 1 | 1 | 3 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489603008 | 22 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489603045 | 6 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489603063 | 1 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489612968 | 6 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489612986 | 1 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489613022 | 10 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489613040 | 9 | 2 | 2 | 1 | 2 | 2-2 | transaction count differs; conflict-edge count differs; conflict-atom count differs; wave bounds differ |
| 489613059 | 2 | 3 | 2 | 3 | 7 | 3-3 | conflict-atom count differs |

## Account-position and role matrix

| Position | Signer | Writable | Constant | Distinct | Candidate relation | Role finding | Confidence |
|---:|:---:|:---:|:---:|---:|:---|:---|:---:|
| 0 | false | false | true | 1 | none | fixed instruction account; function unknown | low |
| 1 | false | true | false | 3 | none | update-specific instruction account; function unknown | low |
| 2 | false | true | true | 1 | first-exact-identity-account | globally recurring shared writable account; actual state transition unknown | high |
| 3 | false | true | true | 1 | second-exact-identity-account | globally recurring shared writable account; actual state transition unknown | high |
| 4 | false | true | false | 3 | none | update-specific instruction account; function unknown | low |
| 5 | false | false | true | 1 | none | Instructions sysvar account; exact BQsAJ inspection behavior is not source-confirmed | high |

Every writable value above is a declared flag. The dossier does not claim that a writable account was actually mutated.

## Ed25519 evidence

- 59 native Ed25519 instructions contain 118 signatures.
- 118 locally reconstructed signature checks pass; 0 layouts are malformed and 0 contain unsupported references.
- 4 signer public keys and 59 deterministic signed-message hashes were observed.
- Same-instruction references: 118; cross-instruction references: 0.
- Signer real-world identity and organizational independence are not inferred.

Exact offsets, referenced instruction indexes, byte ranges, public keys, signatures, message bytes, and message hashes are in `candidate-evidence.ndjson`.

## Candidate payload and log layout

- `instruction_discriminator` bytes 0-7: Stable eight-byte instruction discriminator; no public interface supplies an instruction name.
- `field_0` bytes 8-8: One-byte field with a bounded observed distribution; meaning unknown.
- `optional_value_a` bytes 9-17: Observed one-byte optional marker followed by an eight-byte little-endian signed value when marker is one; meaning unknown.
- `optional_value_b` bytes 18-26: Observed one-byte optional marker followed by an eight-byte little-endian signed value when marker is one; meaning unknown.
- `candidate_timestamp` bytes 27-34: Eight-byte little-endian value compared exactly with block time; field name remains neutral.

The corpus contains 59 candidate instruction payloads and 59 program-data log payloads. Raw bytes and hashes are retained in `payload-layout.json`. No unsupported denomination, asset, side, or market meaning is assigned.

## Current account snapshots

These are current snapshots at RPC context slot 489868594; they are not historical account-state snapshots from slot 489573044.

- `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`: owner `BPFLoaderUpgradeab1e11111111111111111111111`, executable true, 36 bytes, raw-data SHA-256 `5b45978ab7fb6d19bda1af982f2172226f0e288cde8d628a3c04fb57d77d057d`.
- `BeY29AvNCDvu7yBHZ6Ugrdt5FKuBk2xSyrTLGuBehLZR`: owner `BPFLoaderUpgradeab1e11111111111111111111111`, executable false, 1816533 bytes, raw-data SHA-256 `bc947d608299110fe5cc38c810de201509be57b89bff7ff22cb3324e26d2af37`.
- `2ZU4QHdSZVMfzWyyzDJUs6ca5PKQigPMAcnWLcRT6EX2`: owner `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`, executable false, 432 bytes, raw-data SHA-256 `3e38459ee8ecba8699aa678be84768a79a3fa2af75b93499fd007e9db1b63f0d`.
- `4SnAS3mQcB5AwHL4u5fnZeciLZ8J7deALb4YdXfjr9uN`: owner `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`, executable false, 440 bytes, raw-data SHA-256 `22cda6465f33217f4a60de12dbcacc11734f78daee1d4e1bfce2d8e9ed7f373d`.
- `RKUoVJ4VYz39SkmEPjAH9geFfVhqTrPNPdYDL6TtCSi`: owner `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`, executable false, 1224 bytes, raw-data SHA-256 `dbbbe9ee579e916341b4d32f262d83cff286321c55c6257bd1d9d371e3e4cf12`.
- `3jxMz6eq9v7Hp7GUbBMnCNekinYHNwEpZLWBNrHwn5a5`: owner `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`, executable false, 832 bytes, raw-data SHA-256 `bc83ee7de0e996fd5123a1eddc23724b9d6428fb260ddd01e894edc1fbf704a4`.
- `8MAM7ihijEZ8qj9DaWQFsdsnwe64AUG3e2oayAWLyEUn`: owner `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`, executable false, 832 bytes, raw-data SHA-256 `c09c2d86e933d8836f07651dbe931d4a9ea20f410d4eaa77e4a1d7cdaf9e4b64`.
- `8kweZB7HZyn4eMFhdFkTbzY3aY2xuLktWSbsTtATgrF9`: owner `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`, executable false, 2400 bytes, raw-data SHA-256 `0f1211af4a14819fce7a76c1f80e0d911282d2160add724e033ad594db052956`.
- `CWGwpq6Mcgtt5ChzQW6PkRaTBeGovsp6fwXJaJdKBamt`: owner `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`, executable false, 2400 bytes, raw-data SHA-256 `3d844e26cb93b5133a416d98b1d99a4350da9f961c16364742309cef4b27f4c0`.
- `EDTCXr2u2UPBaFdra2px3nNHPLwa4EMRe59EQc83Jhs8`: owner `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`, executable false, 2400 bytes, raw-data SHA-256 `f3e80ba85e06db4352d46ae57ad237d2940e910376557889c77eef2f0ac5c595`.
- `Gp3XZFQMRXQ8cNb3sx2g9UJHZ9yEgsQmy8biaRmDkMvH`: owner `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL`, executable false, 832 bytes, raw-data SHA-256 `da087d4b1d12005edc0b6fe95bc6495d9d046ad69eff85fe843583870a32370f`.

ProgramData inspection found 50 bounded embedded Rust path leads. Their executable-bytes SHA-256 is `60a7fa23e038bf9e03584fd187f283867afbedf3cee389d69888ecfa7083f3a1`. They are structural leads, not an authoritative program identity.

## Program identity and sources

- The current executable program is owned by BPFLoaderUpgradeab1e11111111111111111111111 and points to ProgramData BeY29AvNCDvu7yBHZ6Ugrdt5FKuBk2xSyrTLGuBehLZR.
- The current ProgramData contains 50 bounded embedded Rust path lead(s), including DEX- and oracle-named paths; these do not name a public organization or prove historical code identity.
- No primary source, maintained interface, verified-build record, or source-linked metadata establishes the exact program identity or its mutation semantics.

- [Solana SDK Ed25519 program interface](https://raw.githubusercontent.com/anza-xyz/solana-sdk/03bdad1beab267ab80c3ed6537c729eeb3791aa4/ed25519-program/src/lib.rs) — maintained-interface; commit `03bdad1beab267ab80c3ed6537c729eeb3791aa4`; content SHA-256 `a2e74e696ca3125868ab715429d4646cfcaec41c097d4ad176794f1a45865b1d`; supports: Ed25519 offset record fields and serialized sizes; same-instruction sentinel and construction layout.
- [Agave Ed25519 precompile processor](https://raw.githubusercontent.com/anza-xyz/agave/a4144392c8ffd8d0840e312ecc3a59d35533c005/precompiles/src/ed25519.rs) — primary; commit `a4144392c8ffd8d0840e312ecc3a59d35533c005`; content SHA-256 `d044c226a6228fd6ba7838164b2ef1a6785c132527748acaf8faa5e330b50dc9`; supports: runtime offset resolution; bounds checks; public-key, signature, and message verification flow.
- [Solana Instructions sysvar maintained interface](https://raw.githubusercontent.com/anza-xyz/solana-sdk/03bdad1beab267ab80c3ed6537c729eeb3791aa4/instructions-sysvar/src/lib.rs) — maintained-interface; commit `03bdad1beab267ab80c3ed6537c729eeb3791aa4`; content SHA-256 `c902f435e265ca5d9fe68ca3c82e24e86215e0b87ec0c3b63ae5869957c23077`; supports: checked access to transaction instructions through the Instructions sysvar.
- [Solana upgradeable loader state interface](https://raw.githubusercontent.com/anza-xyz/solana-sdk/03bdad1beab267ab80c3ed6537c729eeb3791aa4/loader-v3-interface/src/state.rs) — maintained-interface; commit `03bdad1beab267ab80c3ed6537c729eeb3791aa4`; content SHA-256 `64f6ee5c4e712bcccae38b4450f679d25e50c132dc8cf9ec40d1756e5c63cb1c`; supports: Program and ProgramData loader variants; ProgramData slot and optional upgrade authority fields.
- [Solana verified-builds guide](https://raw.githubusercontent.com/solana-foundation/solana-com/7c6623d45e16a32bccb95c37eaeb66c0f7d0d3d8/apps/docs/content/docs/en/programs/verified-builds.mdx) — primary; commit `7c6623d45e16a32bccb95c37eaeb66c0f7d0d3d8`; content SHA-256 `af168759e2ce963a249f69b0b7641f42a42e299c81f40bc6942d4074ca8fe023`; supports: meaning and limitations of a verified-build record; source-discovery role of verified builds.
- [OtterSec verified-program status response](https://verify.osec.io/status/BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL) — verified-build-record; commit `bbb4c312ce1b1a33bce6fb2c29eb775c474d1a6a`; content SHA-256 `d12a460cf74cc5e167e078636b4f1efa2cc82679d302d1d390d27d27facc4288`; supports: the maintained service returned is_verified false for the exact program ID at access time.

### Source-confirmed semantics

- The pinned maintained Ed25519 interface defines a two-byte header, fourteen-byte offset records, 32-byte public keys, 64-byte signatures, and 0xffff same-instruction references.
- The pinned Agave processor resolves non-0xffff indexes against transaction instruction data and bounds-checks every referenced slice before verification.
- The pinned Instructions sysvar interface allows a program to load checked transaction instructions when supplied the correct sysvar account.
- No pinned source identifies the exact BQsAJ instruction, its validation branch, or any shared-account mutation.

### Supported inference

- The Ed25519 instruction preceding BQsAJ and the declared Instructions sysvar position support a signed-update hypothesis, but do not prove how BQsAJ uses the verified bytes.
- Rotating writable addresses at two positions and two fixed shared writable addresses establish distinct structural roles, not actual mutation or logical independence.
- Current embedded build paths support a low-confidence DEX-like implementation inference; they do not establish a protocol name.

### Separately labeled hypotheses

- **The repeated instruction may process signed update data.** Confidence: medium. Supports: Each candidate transaction places a successfully verified Ed25519 instruction before BQsAJ. The BQsAJ account list includes the Instructions sysvar. 56/59 candidate payloads contain a neutral timestamp field exactly matching block time. Missing or contrary: No public interface or exact source shows BQsAJ loading or interpreting the preceding instruction. Signer organizations and message schema are unknown.
- **An oracle-related DEX path may be involved.** Confidence: low. Supports: The current executable contains embedded paths under programs/dex and a utils/oracle.rs path. Missing or contrary: No authoritative source or project identifier matches the deployed program ID. Current binary strings do not prove the historical implementation at the observed slots or exact instruction path.

## Unresolved questions

- Which organization or protocol controls this devnet deployment?
- What is the exact instruction variant represented by the stable discriminator?
- Which fields or byte regions, if any, change in the two shared writable accounts?
- Do rotating payload identifiers select logically separate state, and under what prerequisites?
- Are the two Ed25519 signers organizationally independent? No such identity is inferred here.
- Does current ProgramData match the code deployed at every 25 observed slot?

## Actionability gate

Closed. Exact shared-account mutation semantics and logical independence are not source-confirmed. Candidate #2 may be reviewed next; candidate #1 must remain structural only.

No semantic decoder or new counterfactual was added. No exact validator schedule, runtime causality, throughput recovery, historical account state, signer independence, or redesignability is claimed.
