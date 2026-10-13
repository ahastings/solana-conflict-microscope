# Milestone 2.2 handoff

## Scope and base

Milestone 2.2, "Velocity Anchor Bundle Semantics and Repeated-Update Proof," is complete on top of local base commit `7d3399d` ("Complete Velocity deployed-binary archaeology milestone"). The repository is Solana Conflict Microscope on branch `master`.

This milestone uses only public, read-only Solana block caches, the established deployed Velocity ELF, public repository history, and Pyth-maintained serialization source. It adds no general Velocity decoder, native opcode-2 decoder, semantic counterfactual, account-layout change, deduplication, optimization, broad scan, transaction submission, wallet/key handling, trading, Jito/MEV behavior, private-auction reconstruction, exact validator-schedule claim, production hosting, or monitoring.

## Preflight

Before modification:

- repository root: `C:/Users/Owner/Documents/ChatGPT/solana-conflict-microscope`;
- `git status --short`: empty;
- branch: `master`;
- HEAD: `7d3399d Complete Velocity deployed-binary archaeology milestone`;
- `7d3399d` was present in `HEAD` history;
- the handoff began exactly with `# Milestone 2.1 handoff`;
- baseline `npm run verify`: 141 passed, 0 failed;
- Candidate #3 remained discovery rank 3 and `identity-found-semantics-incomplete`;
- all six exact slot/component occurrences remained unchanged;
- continuity remained `sample-binary-continuity-established`;
- executable SHA-256 remained `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`;
- Milestone 2.1 remained `variant-level-strong-correspondence`;
- PostPythLazerOracleUpdate and UpdatePerpBidAskTwap remained `strong`;
- native-prefix-discriminator-2 remained `unresolved`.

## Committed evidence manifest

`research-plans/velocity-anchor-bundle-milestone-2.2.json` pins every one of the six exact blocks and components, all four transactions per component, stable Anchor/native role, signatures, fee payers, instruction indexes, every outer instruction-data hash, every account-list hash, complete log hash, signed-message hash, conflict evidence reference, source cache path/hash, all dossier/binary inputs, protected prior artifacts, and commit/path/content hashes for the Velocity and Pyth source blobs.

Offline replay is:

```text
npm run research-velocity-anchor-bundle -- --plan research-plans/velocity-anchor-bundle-milestone-2.2.json --offline
```

It makes zero network requests and fails closed on any persistent input, source-blob, bundle-pin, executable, prior-outcome, or protected-artifact mismatch.

## Stable four-transaction topology

Each exact component contains one unresolved native transaction and three Anchor transactions. A/B/C are stable market-identity labels, not first/second/third ordinals:

- Anchor A: market `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg`, oracle `6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH`, no maker inputs;
- Anchor B: market `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t`, oracle `J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ`, two maker inputs;
- Anchor C: market `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`, oracle `2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV`, two maker inputs.

Their block positions rotate. Every Anchor transaction uses payer `GhMUe97fqJEb9QFNfM6N3BbEy4SD2VmeyjUVFBcXuV6V` and the outer instruction order ComputeBudget, ComputeBudget, Ed25519, PostPythLazerOracleUpdate, UpdatePerpBidAskTwap at indexes 0–4. The native transaction uses a different payer and remains outside semantic scope.

## Signed-message reuse and byte equivalence

All 18 Ed25519 instructions remain decoded and locally valid under signer key `9gKEEcFzSd1PDYBKWAKZi4Sq4ZCUaVX5oTr8kEjdwsfR`; no signer identity or organizational independence is inferred. Every 16-byte Ed25519 instruction refers into Post instruction 3 using the same offsets: signature bytes 16–80, public key 80–112, and signed message 114–263.

Each block contains exactly one 149-byte signed message repeated in all three Anchor transactions. The three transaction signatures differ, while their Anchor fee payer is the same; cross-fee-payer reuse is not observed. Six distinct block-message hashes exist, with no cross-block reuse.

Within each block the complete 263-byte PostPyth instruction is byte-identical across A/B/C. The discriminator, message envelope, signature/public key, signed payload, six accounts, account order, and signer/writable flags all match. Every UpdatePerpBidAskTwap instruction is the same eight discriminator bytes, while its account wrapper identifies the distinct market/oracle path and optional makers.

## Pyth structural decode and PDA proof

The Pyth-maintained public Lazer repository is pinned at commit `651247025d547b6b832ee0ebdafd0207878d720d`. Its schema establishes little-endian payload magic `2479346549`, timestamp, channel, feed count, u32 feed IDs, property discriminants, and FeedUpdateTimestamp encoding. Velocity source-family commit `f7df335599c194bc759cebf682a11bcad6bd5ed2` pins seed `pyth_lazer` and the exact program ID context.

Every message consumes exactly all 149 signed bytes and contains channel 3 (`fixed-rate-200ms`), three feeds, and feed IDs 6, 1, and 2. Present properties are Price, BestAskPrice, BestBidPrice, Exponent, and FeedUpdateTimestamp. Confidence is absent. No asset name is inferred from a numerical feed ID.

Exact Solana PDA derivation maps:

- feed 6 to `2k3U...` with bump 255 and Post position 3;
- feed 1 to `J7Fp...` with bump 254 and Post position 4;
- feed 2 to `6wQ5...` with bump 255 and Post position 5.

The derived order exactly matches the three writable oracle accounts.

## Observed log branches and order boundary

All relevant Velocity logs are preserved verbatim and in order. Across six occurrences:

- the first Anchor transaction by block index emits three posting logs: 18 total;
- the later two Anchor transactions emit three equal-timestamp skip logs each: 36 total;
- all 18 emit `Instruction: UpdatePerpBidAskTwap` and market-specific before-to-after TWAP logs;
- no failure or early-return log occurs.

This is block transaction order only. It is not arrival order, scheduler order, validator execution order, or a private schedule. The word "skip" is classified as observed branch/log evidence and is never used alone as proof of no mutation.

## Exact graph attribution

Each Anchor-only subgraph has three pair edges, 12 conflict atoms, and proven current-lock wave bounds 3–3. Each pair shares four writable causes: all three oracle PDAs plus the writable payer. The common oracle set alone preserves the 3-clique; the payer independently preserves it. Distinct TWAP market accounts cause no Anchor–Anchor pair edge.

The unresolved native transaction contributes exactly one market-account atom to each Anchor role, three native atoms per block. The authoritative full component remains unchanged at six edges, 15 atoms, and proven current-lock depth four. No account is removed or reflagged, and no semantic counterfactual is created.

## Bounded deployed binary/source correspondence

Only the two Anchor variants were inspected. The established executable contains their discriminator bytes, instruction names, embedded source paths, and relevant format/log fingerprints. Rust formatting values compile as separate fragments: the binary contains one exact equality-skip prefix associated with the nearby `<= current_timestamp` suffix, while rendered transaction logs preserve the complete wording.

Deployed skip `next_timestamp <= current_timestamp` is the logical complement of deployed positive/posting `current_timestamp < next_timestamp`; those deployed formulations are not contradictory. Public source-family code skips on `next_timestamp < current_timestamp`, differing exactly at equality. This is retained as a string-version and control-condition mismatch. No bounded symbol/relocation/code reference or exact reproducible build proves the deployed mutation branch, so no broader semantic mismatch is asserted.

## Evidence ladder and outcome

Both Anchor variants reach:

1. observed instruction/account declarations and logs;
2. deterministic instruction/message/PDA decoding;
3. strong deployed-binary fingerprints;
4. historical source-family behavior.

Neither reaches Level 5, source-confirmed deployed mutation semantics. Therefore later equal-timestamp Post calls are not classified as no-ops, identical overwrites, or any other exact deployed state transition. UpdatePerpBidAskTwap targets distinct market state and emits before-to-after logs, but its exact deployed field mutation also remains unpromoted.

Single result: `repeated-update-structure-established-semantics-incomplete`.

This is a successful structural result. It does not authorize a later Anchor decoder or counterfactual until the Level 5 gap is independently resolved. Native discriminator-2 remains unresolved and excluded.

## Artifacts, tests, and visual QA

The pipeline generates:

- `anchor-bundle-dossier.json`;
- `anchor-bundle-report.html`;
- `message-reuse-matrix.json`;
- `instruction-equivalence.json`;
- `log-branch-matrix.json`;
- `anchor-conflict-attribution.json`;
- `anchor-binary-correspondence.json`;
- `anchor-semantic-evidence.json`;
- `docs/research/VELOCITY-ANCHOR-BUNDLE.md`.

Deterministic tests cover the required classification, six-block topology, message/signer mapping, byte equivalence, Pyth decoding, PDA mapping, exact logs, branch classification, `<`/`<=` handling, graph atoms, native separation, evidence levels, all three outcomes, offline replay, prior artifacts, sourceability/discovery ordering, legacy hashes, and overclaim guards.

The in-app browser runtime could not start because the Windows sandbox helper failed while applying filesystem isolation. The established isolated local Playwright/installed-Chrome fallback rendered at 1440x1000 and true 390x844. Both have zero page errors, zero console errors, zero invalid paragraph/list nesting, document/body widths equal to the viewport, correct rendered row counts, and only table-local horizontal scrolling at 390 pixels. Desktop and mobile captures were visually inspected.

## Preservation and review boundary

The 500-slot discovery replay remains 500/500. Discovery ranks and sourceability order are unchanged. Candidate #1 remains `black-box-structure-only`; Candidate #2 remains `deferred-not-rejected`; Candidate #3's full four-transaction evidence and prior dossier remain unchanged. The nine-block loader case, all eight legacy artifact hashes, Milestone 2.1 executable/history/source findings, and native unresolved status remain unchanged.

Nothing was pushed. Independent review of the Level 5 boundary is next. Do not implement a semantic decoder or optimization from this result.

Stop after Milestone 2.2.
