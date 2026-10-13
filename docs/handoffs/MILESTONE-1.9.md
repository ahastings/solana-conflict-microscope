# Milestone 1.9 handoff

## Scope and base

Milestone 1.9, Candidate #1 Identity and Semantic Dossier, is complete on top of local base commit `be3fded` (Complete candidate hunt milestone). The repository is Solana Conflict Microscope on branch `master`.

This milestone is bounded, public-data, read-only research for `candidate-ff30780de8479976`. It adds no semantic instruction family, semantic footprint, candidate counterfactual, broad scanner, transaction submission, wallet/key handling, trading, Jito/MEV behavior, private-auction reconstruction, validator-schedule claim, production hosting, or monitoring.

## Preflight

Before modification:

- repository root: `C:/Users/Owner/Documents/ChatGPT/solana-conflict-microscope`;
- `git status --short`: empty;
- branch: `master`;
- HEAD: `be3fded Complete candidate hunt milestone`;
- `be3fded` was present in `HEAD` history;
- `HANDOFF.md` began exactly `# Milestone 1.8 handoff`;
- baseline `npm run verify`: 96 passed, 0 failed;
- discovery index schema: `1.8`;
- the selected candidate was materialized;
- representative slot: `489573044`.

## Evidence-based outcome

Decision: `black-box-structure-only`.

All 25 cached discovery references independently revalidate to the same exact two-account core pattern:

- `2ZU4QHdSZVMfzWyyzDJUs6ca5PKQigPMAcnWLcRT6EX2`;
- `4SnAS3mQcB5AwHL4u5fnZeciLZ8J7deALb4YdXfjr9uN`.

Exact equality defines candidate identity. Partial overlaps are rejected, and same-program components sharing only one candidate account remain separate related-family evidence. No such related component was present in the bounded 25-block corpus.

The representative remains slot 489573044, component 15: three transactions, three distinct declared fee payers, three transaction-pair conflict edges, six conflict atoms, and proven component depth three. The two invoked programs remain `BQsAJYV4ZQDf683UrhA1MVLvbot9XYUfRHXxP1h13fPL` and `Ed25519SigVerify111111111111111111111111111`.

Across all exact occurrences:

- 25 blocks and 59 candidate transactions;
- 43 occurrence-level conflict edges and 94 conflict atoms;
- four component variants occurring 12, 4, 5, and 4 times;
- transaction counts of two or three and proven bounds of 2-2 or 3-3.

These are declared account-lock observations and estimated/proven graph bounds. A writable declaration does not prove an actual mutation.

## Portable plan and replay

The committed manifest is `research-plans/candidate-ff30780de8479976.json`. It records the exact identity, invoked programs, all 25 slots, representative component, discovery/materialization references, source and snapshot cache paths, expected counts, retrieval/source provenance, and SHA-256 hashes for every input used by the dossier. Candidate-specific identifiers remain outside generic analyzer logic.

Initial bounded read-only acquisition and hash freezing used:

`npm run research-candidate -- --plan research-plans/candidate-ff30780de8479976.json --bootstrap-hashes`

The strict cache-only replay is:

`npm run research-candidate -- --plan research-plans/candidate-ff30780de8479976.json --offline`

The replay reports: 25/25 exact recurrence references revalidated, 118 Ed25519 signatures decoded, decision `black-box-structure-only`.

## Ed25519 evidence

The parser follows pinned Solana SDK and Agave source for the two-byte header, 14-byte offset records, `0xffff` same-instruction references, non-self instruction indexes, exact slice bounds, 32-byte public keys, 64-byte signatures, and covered messages.

The corpus has 59 native Ed25519 instructions and 118 signatures. All 118 referenced byte sets reconstruct and verify locally. Four signer public keys and 59 deterministic message hashes were observed. All candidate references are same-instruction; cross-instruction support is implemented and tested but not observed here. Malformed and unsupported formats produce conservative evidence records.

Signer keys are protocol bytes. The dossier does not infer human identity, organizational control, or signer independence. The pinned Instructions sysvar interface establishes that checked transaction-instruction access is available when the correct sysvar is supplied; no exact BQsAJ source proves how this program uses preceding instruction data.

## BQsAJ structure

All 59 candidate instructions are 35 bytes and share discriminator `7800000000000000`. The structural layout uses only neutral names:

- bytes 0-7: `instruction_discriminator`;
- byte 8: `field_0`;
- bytes 9-17: `optional_value_a`;
- bytes 18-26: `optional_value_b`;
- bytes 27-34: `candidate_timestamp`.

The neutral timestamp equals block time in 56 of 59 transactions. Fifty-nine 120-byte program-data log payloads form three prefix groups with counts 22, 19, and 18. Raw bytes, exact distributions, stable ranges, and hashes are retained. No value is labeled SOL, token, asset, price, bid, ask, confidence, or market ID.

## Current metadata and identity search

Bounded read-only devnet snapshots were retrieved at response context slot 489868594. They are labeled `current-snapshot-not-historical`; they are not historical state at representative slot 489573044.

The current executable is owned by `BPFLoaderUpgradeab1e11111111111111111111111` and points to ProgramData `BeY29AvNCDvu7yBHZ6Ugrdt5FKuBk2xSyrTLGuBehLZR`. Exact loader decoding reports last-deploy slot 489095912 and upgrade authority `Dak5MsTrYbhFXJMJqtambhi5CEULkKe48r9exi6ShV5P`. The two candidate accounts, fixed account `RKUoVJ4VYz39SkmEPjAH9geFfVhqTrPNPdYDL6TtCSi`, and six representative rotating accounts are currently BQsAJ-owned. Current ownership and binary strings do not prove historical contents or code identity.

The source manifest pins:

- Anza Solana SDK commit `03bdad1beab267ab80c3ed6537c729eeb3791aa4` for the Ed25519 interface, Instructions sysvar, and loader-v3 state;
- Agave commit `a4144392c8ffd8d0840e312ecc3a59d35533c005` for Ed25519 runtime processing;
- Solana Foundation docs commit `7c6623d45e16a32bccb95c37eaeb66c0f7d0d3d8` for verified-build guidance;
- OtterSec API repository commit `bbb4c312ce1b1a33bce6fb2c29eb775c474d1a6a` and the exact unverified status response.

Exact identifier searches covered public web indexes, npm, crates.io, the maintained verified-build service, the legacy Anchor IDL PDA, and current ProgramData identity metadata. No authoritative program identity or mutation implementation was found. The unauthenticated GitHub code-search request returned HTTP 401 and is recorded as unevaluated. Embedded `programs/dex` and `utils/oracle.rs` strings are low-confidence structural leads, not an organization or protocol identity.

## Generated artifacts

The seven generated files under `output/research/candidate-ff30780de8479976/` are intentionally gitignored and recreate from committed manifests plus cached evidence:

- `account-snapshots.json`: 11,240 bytes; SHA-256 `6110f1e72cb04c60b6cb4e93bcd6287780885eb095810e55065a00c8eab95994`;
- `candidate-dossier.html`: 24,522 bytes; SHA-256 `8f7e379bbd7e1f90e559a729c96269503415e00e575adc0a41411f800b343dfe`;
- `candidate-dossier.json`: 25,347 bytes; SHA-256 `7690e63de201d0bd43d6420d69105f0564403fe6b53330327c6eee3fbd072398`;
- `candidate-evidence.ndjson`: 325,856 bytes; SHA-256 `2050ee1d53683ee3555acb4c687a4c3a0c3d021c55b22c21382c073670281907`;
- `payload-layout.json`: 107,143 bytes; SHA-256 `cd51935789620f7aa4ef6dd6c6de4ceed0bbfadb809fe344a3e959c980fe4108`;
- `signer-message-summary.json`: 20,583 bytes; SHA-256 `5e250408c5c73f25f9a5b0d229c5537fc604ee9e2a57e9f93b5043c022fbf546`;
- `source-manifest.json`: 10,714 bytes; SHA-256 `6cf6f1a571f061bb5e355300d7e9416d053bf85d0ba470ef546dd3dc9db4437e`.

The committed narrative `docs/research/CANDIDATE-FF30780DE8479976.md` is 16,981 bytes with SHA-256 `d6cc2b7f5fef5af06f544afa978de730d623a888133dd0da7fb212261b767e93`. The primary JSON and HTML remain compact and reference detailed NDJSON/cache evidence instead of embedding 25 complete block analyses.

## Preserved baselines

Offline replay of `discovery-plans/milestone-1.8-devnet.json` remains exactly 500 requested/500 observed slots, 70 compact candidates, 19 high-priority unfamiliar candidates, and 20 materializations. Compact discovery artifacts retain their hashes:

- plan: `307708755bf54e6ff81a95808a83cfd8f95a4167ec71dac22e1b8338d86dd250`;
- index: `0ac57c17f08f79ef829818f5ca604fb81536dbf75117ac07c3f98dd15765b3e0`;
- HTML: `7c1002b63b04f4ac8d47581a670fd427a0d0702a7390d3f00aed1c98c00d67c8`;
- research queue: `da33e4e958431c8e4c7aefd7f17c7586907d07aeefa30bbc1873ab9e74054770`.

All eight pre-discovery artifacts remain byte-identical:

- `output/analysis.json`: `690784c9aa1454e53e4375ff1c600cdcc3389175f205e4db29a9743bab92c1f9`;
- `output/report.html`: `299a8e75061b1a81740e5aa3fa05786040a0010ff71d3f90149fe2d6d5ab0761`;
- `output/cross-payer-real/analysis.json`: `3d2dedf405f0dfda7f411bb3f240e8a05c58b56d7502ece8d7e1dd61914ab6b5`;
- `output/cross-payer-real/report.html`: `7854e16898bd6207681fdbfd2ce1724ae3165b365840b22683dfd105fdcc1041`;
- `output/cross-payer-teaching/analysis.json`: `9b57a0260429b16730c9cc0b0645c4d506a7c152e00fb22aacb80e61642e84ae`;
- `output/cross-payer-teaching/report.html`: `02985274705b2e03f34ba1b32e248a599cc3fbad85d28cba53b46efd79e5af7c`;
- `output/range-488638500-488638508/range-analysis.json`: `27bddc7cd8dc045a9a4b3a24f50fdb33a7a521de12598fdd501942f570e8f433`;
- `output/range-488638500-488638508/range-report.html`: `31f0190626429c70695d35514fa033507314d986f87ceccd9f25e263309bca3a`.

The nine-block loader evidence and joint depths 3, 4, 10, 2, 6, 3, 3, 1, and 3 are unchanged.

## Verification and visual QA

`npm run verify` now performs strict compilation, all 108 deterministic tests, the three fixture reports, offline nine-block regeneration, offline 500-slot discovery replay, offline candidate-dossier regeneration, and Milestone 1.9 handoff validation.

The preferred browser-control runtime failed before connection at its Windows sandbox startup check. The isolated local Playwright/Chrome fallback rendered `candidate-dossier.html` at 1440�1000 and a true 390�844 viewport. Both document/body scroll widths equal the viewport width; all page-error and console-error arrays are empty; 25 timeline rows, five evidence levels, outcome C, and the closed actionability gate render correctly. Both screenshots were visually inspected. QA results and screenshots remain in the ignored research output directory.

## Evidence limits and next boundary

The dossier separates:

1. observed on-chain declarations;
2. deterministically decoded structures;
3. generic source-confirmed Solana semantics;
4. supported inference;
5. unresolved hypotheses.

No authoritative source identifies the exact BQsAJ program/instruction or proves reads, mutations, prerequisites, logical independence, or conditional state-transition commutativity for the two shared accounts. Therefore the actionability gate is closed. The signed-update and DEX/oracle descriptions remain explicitly labeled hypotheses. No semantic decoder or redesign work is authorized by this evidence.

Candidate #2 may be reviewed in a later milestone. Nothing was pushed.

Stop after Milestone 1.9.
