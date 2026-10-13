# Milestone 2.1 handoff

## Scope and base

Milestone 2.1, "Velocity Deployed-Binary Archaeology and Historical Source Correspondence," is complete on top of local base commit `532f256` ("Complete sourceability and Velocity dossier milestone"). The repository is Solana Conflict Microscope on branch `master`.

This milestone uses only public, read-only Solana, repository, package, and executable evidence. It adds no semantic decoder, semantic footprint, semantic counterfactual, broad scan, transaction submission, wallet/key handling, trading, Jito/MEV behavior, private-auction reconstruction, exact validator-schedule claim, production hosting, or monitoring.

## Preflight

Before modification:

- repository root: `C:/Users/Owner/Documents/ChatGPT/solana-conflict-microscope`;
- `git status --short`: empty;
- branch: `master`;
- HEAD: `532f256 Complete sourceability and Velocity dossier milestone`;
- `532f256` was present in `HEAD` history;
- the handoff began exactly with the Milestone 2.0 header;
- baseline `npm run verify`: 125 passed, 0 failed;
- Candidate #3 remained `identity-found-semantics-incomplete` at discovery rank 3;
- deployment correspondence remained `source-family-only`;
- ProgramData remained `HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7` with last-deploy slot 488659528;
- all six exact Candidate #3 slots were strictly later than 488659528.

## Temporal executable continuity

Agave tag `v4.3.0-beta.2`, commit `386cf57c45e135d8a3a8b7d16877eb896f695c64`, pins the relevant upgradeable-loader behavior. Deploy, Upgrade, and ExtendProgram write `clock.slot` into ProgramData; SetAuthority preserves the slot. The field is therefore the last executable deploy/upgrade/extend mutation slot rather than a generic authority-change timestamp.

The Velocity program decodes to the same ProgramData pointer. Complete ProgramData-address RPC history contains 30 signatures and identifies a successful decoded Upgrade at slot 488659528:

- signature: `2vhmyGjHr6bDgtumb4W5p4xC3vw34ZgrwbnZ3WQFtEpYQojPTUCxGUqtg6XzUwF2VMrXZtKM8pajgRbjHmx9kUao`;
- authority: `8Z22ng8xW4AemtC9WdwxcZyWthnwVbQLbDfyuARCs122`;
- buffer: `9MZtrA4nNwV16FRc48EVnvtuJkiWX6f8UF8MFcZQND81`;
- program: `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`;
- ProgramData: `HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7`;
- spill: `dprhSQPzA3h6RH6DiKtyUDX3N6Zkjz52CXeCvFUnc5P`.

No later ProgramData-address mutation appears before the cached snapshot context slot 490041839. The six exact observations at 489572998, 489593012, 489602971, 489603031, 489612991, and 489613051 all lie between the decoded upgrade and snapshot. Result: `sample-binary-continuity-established`. This conclusion uses loader semantics, decoded history, and slot ordering; it is not inferred from address equality alone.

## Frozen deployed executable

The 6,050,442-byte ProgramData account decodes as tag 3, slot 488659528, a present upgrade authority, and a 45-byte header. Hashing every remaining byte without trimming yields:

- raw ProgramData SHA-256: `618011650ffeed486053d25aa439634ab765c15af24741ef3c32bcd026db5222`;
- executable offset: 45;
- executable length: 6,050,397 bytes;
- executable SHA-256: `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`.

The payload validates as little-endian ELF64-SBF, machine 263, with four program headers, nine sections, 19 dynamic-symbol entries, one relocation section, and 3,146 deterministic printable strings. Section hashes, offsets, sizes, extraction rules, symbols, and string-artifact hash are frozen in the generated metadata.

## Historical public-source archaeology

All reachable refs and tags of `velocity-exchange/protocol-v2` were inspected with deterministic Git history operations. Material commits include:

- `0ae3e3b1db782a6765c3525b3dec38ad4d9d3a62`: documented Drift SDK `v2.163.0-beta.0` fork-point release;
- `de32add525919791b38218ecb59ee506e16a9b3f`: public `<` Lazer timestamp/log behavior;
- `ffd10b2bd6a009e66aaaf42bb065387ccc1c72c8`: public Drift native opcode 2 and six-account cache handler;
- `6b993baf684df723f6072ffd09e5de48dde877dd`: Velocity rebrand, exact program ID, and `programs/velocity` source;
- `3f148f8b477e4176e11e0660adb0e67dd5163d3b`: public Velocity native-handler hardening;
- `f7df335599c194bc759cebf682a11bcad6bd5ed2`: strongest public pre-deployment Velocity candidate;
- `ff80ed4d2d92c04804c0d8d3be1eca63eb521f43`: latest public `docker-swift-v0.1.13` tagged lineage;
- `13e8e9b8d614f3b62e3a65a8c372c819e6529aeb`: official default-branch head inspected.

The current public `velocity-v1` Git surface was unavailable as 404/auth-required. The official `@velocity-exchange/sdk@0.17.0` tarball and its repository metadata were inspected as the bounded fallback. Its 1,104 files contain client/generated/IDL material and no on-chain Rust source, SBF binary, Cargo/Anchor build metadata, or exact source-to-deployment mapping. The result is `client-sdk-idl-only-no-on-chain-rust-or-build-metadata`, explicitly bounded to that package surface.

## Structural and string fingerprints

The observed successful native-prefix discriminator-2 path has exactly five accounts. Public Velocity source exposes native opcodes 0 and 1 but no opcode 2. Public Drift commit `ffd10b2bd6a009e66aaaf42bb065387ccc1c72c8` requires at least six accounts ordered `admin, state, cache0, cache1, system_program, rent`. Observed position 4 is writable Velocity-owned account `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`, not System Program `11111111111111111111111111111111`. Neither public handler is structurally compatible.

The executable contains the exact Velocity program ID, public `programs/velocity` source paths, both Anchor instruction names/discriminators, and `Posting new lazer update. current ts {} < next_timestamp {}`. Every inspected official public Lazer source uses `<` or the older inverse `>=` form. None contains the deployed `Skipping lazer price update. next_timestamp {} <= current_timestamp {}` string. This exact mismatch remains a contradiction rather than being normalized away.

## Build attempt

The strongest candidate commit pins Rust 1.91.1, Solana 2.3.11, Anchor 1.0.0, `solana-verify` 0.5.0, image `solanafoundation/solana-verifiable-build:3.1.14`, lockfiles, program ID, and this command:

```text
solana-verify build --library-name velocity -b solanafoundation/solana-verifiable-build:3.1.14 -- --no-default-features --features no-entrypoint
```

No usable Docker, Podman, WSL, `solana-verify`, Solana CLI, Anchor, Cargo, or Rust runtime was available on this host. Result: `build-unavailable`. The structurally contradictory Drift candidate was not compiled. No resulting binary hash, deterministic repeat, or exact binary match is claimed.

## Per-variant correspondence and outcome

- `native-prefix-discriminator-2`: `unresolved`. Public Velocity lacks opcode 2; public Drift requires six accounts and System Program at observed position 4.
- `post-pyth-lazer-oracle-update`: `strong`. Exact program ID, source path, discriminator, instruction name, account structure, posting log, and deployment window align; the deployed `<=` skip string and unavailable exact build remain contradictions.
- `update-perp-bid-ask-twap`: `strong`. Exact program ID, source path, discriminator, instruction name, account structure, embedded string evidence, and deployment window align; no exact build match exists.

Overall outcome: `variant-level-strong-correspondence`.

This is version/source correspondence evidence, not source-confirmed deployed mutation truth. Every deployed mutation remains unpromoted, native mutation semantics remain unresolved, and no general semantic decoder is authorized. A later milestone may propose only narrowly scoped variant-specific research.

## Artifacts and replay

The portable plan `research-plans/velocity-binary-milestone-2.1.json` pins every public cache, repository/commit surface, expected identity, prior-artifact hash, and replay rule. `npm run research-velocity-binary -- --plan research-plans/velocity-binary-milestone-2.1.json --offline` regenerates:

- `deployed-programdata-metadata.json`;
- `deployed-executable-metadata.json`;
- `deployed-strings.txt`;
- `deployed-section-manifest.json`;
- `source-history.json`;
- `build-attempts.json`;
- `binary-fingerprint-matrix.json`;
- `variant-correspondence.json`;
- `deployment-history.json`;
- `velocity-binary-report.html`;
- `qa-results.json` and the retained desktop/390 QA captures after browser QA.

The research narrative is `docs/research/VELOCITY-DEPLOYED-BINARY-CORRESPONDENCE.md`. Raw public RPC/source/build caches remain ignored and are hash-pinned rather than committed as report payloads.

## Preservation, verification, and visual QA

The 500-slot discovery replay remains 500/500 with 70 candidates, 19 high-priority candidates, and 20 materializations. Candidate #1 remains `black-box-structure-only`. Candidate #2 remains discovery rank 2 and `deferred-not-rejected`. Candidate #3 remains discovery rank 3 with the same six exact occurrences and unchanged `identity-found-semantics-incomplete` dossier. Milestone 2.0 sourceability ordering, the nine-block loader case, and all eight legacy artifact hashes remain unchanged.

`npm run verify` passes strict compilation, all 141 deterministic tests, three fixture reports, offline nine-block replay, offline 500-slot discovery, Candidate #1, Milestone 2.0 sourceability/Candidate #3, Milestone 2.1 binary archaeology, preservation/hash guards, and byte-identical handoff validation.

The in-app browser runtime could not start because the Windows sandbox helper failed while applying filesystem isolation. The established isolated local Playwright/installed-Chrome fallback rendered the report at 1440x1000 and true 390x844 viewports. An initial mobile check exposed a 521-pixel intrinsic body width caused by the unbroken footer hash; generated CSS was corrected at the source and both viewports were rerun. Final results have zero page errors, zero console errors, zero invalid paragraph/list nesting, all five tables in local scroll wrappers, and document/body scroll widths exactly equal to their viewports. Both final captures were visually inspected.

## Review boundary

Independent review is next. A later milestone may propose narrowly scoped research for one strongly corresponding Anchor variant, but must not treat this result as a general Velocity decoder authorization. Nothing was pushed.

Stop after Milestone 2.1.
