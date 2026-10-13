# Velocity Anchor bundle semantics

Milestone 2.2 characterizes only the three strongly corresponding Anchor paths in each exact Candidate #3 occurrence. The unresolved five-account native discriminator-2 transaction is retained only as graph context.

## Outcome

**repeated-update-structure-established-semantics-incomplete**

All six occurrences contain one signed 149-byte Pyth Lazer message repeated byte-for-byte in three Anchor transactions. The first Anchor transaction by block position emits three posting logs; the later two emit three exact equal-timestamp skip logs. The PostPyth instruction bytes and six-account list are identical within each block. The separate UpdatePerpBidAskTwap instruction is an identical eight-byte discriminator wrapper targeting three distinct market/oracle paths.

This exact repeated-update structure does not establish deployed no-op or mutation semantics. Both Anchor variants reach evidence Level 4, not Level 5. No semantic decoder, counterfactual, account-layout change, deduplication, lock-footprint change, speedup calculation, scheduler claim, transaction submission, wallet/key handling, trading, Jito, or MEV feature is authorized or implemented.

## Stable role convention

A/B/C are stable market-identity labels. They are not first/second/third execution labels.

| Role | Market-specific writable account | Oracle-specific writable account | Maker inputs |
|:--|:--|:--|:--|
| anchor-A | `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg` | `6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH` | none |
| anchor-B | `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t` | `J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ` | `H8oSKeSX1ifYtKMv9U7Fmv8Hq75mH3jQBNzzUnakfszT`, `AziMeCFwLuQisigrHsMP1tKKYxjMCwY43eSfqAGW5xe` |
| anchor-C | `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY` | `2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV` | `Admz75Jy7Xd4pdmFpX5AfFrCgciiQxew2sDtM7wBF49e`, `4zCsHgrmXM5s9LZZnXcAzs4oiqsUsKCkdYtHCxQdbt4F` |

The block transaction order rotates across the six observations. “Order” below means only index order in the block response, never arrival, scheduling, validator execution order, or a private schedule.

## Six exact bundles

| Slot / component | Anchor roles in block order | Signed-message SHA-256 | Observed log path | Distinct TWAP markets |
|:--|:--|:--|:--|:--|
| 489572998 / 1 | anchor-A@1 → anchor-B@2 → anchor-C@3 | `f700a1c0432eb9c1cede50de39f08a20565da681203fa268407fe97f90df3264` | posting → skipping → skipping | `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg`, `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t`, `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY` |
| 489593012 / 17 | anchor-A@21 → anchor-C@22 → anchor-B@23 | `39019ff5e1a851604de9ad3c94a321b574abecf58667eae18da4871bd6fae1fc` | posting → skipping → skipping | `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg`, `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`, `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t` |
| 489602971 / 14 | anchor-C@17 → anchor-A@18 → anchor-B@19 | `0d2ab55edcc42a21605c82eef39f23fc9ebd16c629f6f094ef06f394f4d9e5fe` | posting → skipping → skipping | `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`, `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg`, `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t` |
| 489603031 / 16 | anchor-C@21 → anchor-B@22 → anchor-A@23 | `1a89d9aa4c7aa65030a6b15fffaa712173302a49bdd8b291a37aae8288b31732` | posting → skipping → skipping | `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`, `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t`, `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg` |
| 489612991 / 11 | anchor-C@17 → anchor-A@18 → anchor-B@19 | `f12687b670fddca2744fe63cfe92eccab1fc3245cdc7d1b29c6b2d848e8dc154` | posting → skipping → skipping | `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`, `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg`, `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t` |
| 489613051 / 17 | anchor-C@19 → anchor-B@20 → anchor-A@21 | `a49e36d632d1d1e837546781b406a711572d35b26a9a1be80c83f577b8652a32` | posting → skipping → skipping | `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY`, `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t`, `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg` |

Every Anchor transaction succeeds, uses payer `GhMUe97fqJEb9QFNfM6N3BbEy4SD2VmeyjUVFBcXuV6V`, places Ed25519 at index 2, PostPythLazerOracleUpdate at index 3, and UpdatePerpBidAskTwap at index 4. The transaction signatures differ. The Anchor fee payer does not differ, so cross-fee-payer reuse is not observed.

## Signed-message and instruction equivalence

- Ed25519 signatures: 18/18 locally valid.
- Signer key: `9gKEEcFzSd1PDYBKWAKZi4Sq4ZCUaVX5oTr8kEjdwsfR` (identity/organization not inferred).
- Distinct signed messages: 6, exactly one per block and exactly three copies per block.
- Cross-block message reuse: none.
- Ed25519 reference layout: one 16-byte Ed25519 instruction referring into instruction 3 at signature bytes 16–80, public-key bytes 80–112, and signed-message bytes 114–263; identical in all 18 transactions.
- PostPyth: all six blocks classify `byte-identical-update` across their three Anchor transactions. Complete bytes, discriminator, accounts, order, signer/writable flags, Instructions sysvar, storage account, and oracle set are identical.
- UpdatePerpBidAskTwap: the eight instruction bytes are identical in all 18 transactions; account wrappers differ by market, oracle, and optional maker inputs.

## Pyth-maintained structural decoding

The maintained Pyth Lazer Rust protocol is pinned at commit `651247025d547b6b832ee0ebdafd0207878d720d`. Its little-endian schema establishes magic `2479346549`, timestamp, channel ID, feed count, u32 feed IDs, property discriminants, and property encodings including FeedUpdateTimestamp. The Velocity source-family establishes the PDA seed `pyth_lazer` with the exact Velocity program ID.

| Numeric feed ID | Derived oracle PDA | Bump | Source-confirmed fields in the observed message |
|--:|:--|--:|:--|
| 6 | `2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV` | 255 | Price=`10353034964`, BestAskPrice=`10353275220`, BestBidPrice=`10352741175`, Exponent=`-8`, FeedUpdateTimestamp=`1787953585800000` |
| 1 | `J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ` | 254 | Price=`7745113168392`, BestAskPrice=`7745170496857`, BestBidPrice=`7745021000415`, Exponent=`-8`, FeedUpdateTimestamp=`1787953585800000` |
| 2 | `6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH` | 255 | Price=`242670433339`, BestAskPrice=`242670933075`, BestBidPrice=`242669933100`, Exponent=`-8`, FeedUpdateTimestamp=`1787953585800000` |

The decoded feed order maps exactly to PostPyth remaining-account positions 3, 4, and 5. Every message consumes all 149 signed bytes without trailing data. Channel ID 3 is fixed-rate 200 ms. Asset names are not inferred from numeric feed IDs. These payloads include price, best bid, best ask, exponent, and feed-update timestamp; they do not include the confidence property.

## Exact observed log branches

- Posting logs: 18 (3 per first block-position Anchor transaction).
- Equality-skip logs: 36 (3 per later Anchor transaction).
- `Instruction: UpdatePerpBidAskTwap` logs: 18.
- Failure/early-return logs: 0.

All relevant Velocity log lines are preserved verbatim and in order in `log-branch-matrix.json`. The exact “skip” wording is observed branch evidence, not proof that no account bytes changed.

## Anchor-only conflict attribution

Each three-Anchor subgraph is a clique with 3 edges, 12 atoms, and proven current-lock wave bounds 3–3. Every pair shares four writable causes: the same three oracle PDAs plus the shared writable payer. The oracle set alone preserves all three pair edges; the payer also independently preserves all three. The distinct TWAP market accounts do not cause Anchor–Anchor edges.

The unresolved native transaction adds one atom to each Anchor transaction through that Anchor role’s market account (3 native atoms per full component). It remains excluded from semantic promotion. The authoritative four-transaction components remain unchanged at 6 edges, 15 atoms, and wave bounds 4–4.

## Deployed binary and source-family evidence

Executable SHA-256 remains `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c` with `sample-binary-continuity-established`.

For both Anchor variants the established executable contains the Anchor discriminator bytes, instruction name, embedded Velocity source path, and exact relevant log fingerprints. The bounded analysis does not find a symbol/relocation/code reference proving the handler branch, and no exact reproducible build exists. The variants therefore reach:

1. observed declarations and logs;
2. deterministic message/PDA decoding;
3. strong deployed-binary fingerprints;
4. historical source-family behavior;
5. **not reached** — source-confirmed deployed mutation semantics.

The exact deployed skip string occurs 1 time. Deployed `next_timestamp <= current_timestamp` is the logical complement of deployed positive `current_timestamp < next_timestamp`, so those two formulations are not contradictory. Public source-family code instead skips on `next_timestamp < current_timestamp`; it differs at equality and would admit the equality case that the deployed observations skip. This is a string-version and control-condition mismatch at equality. It is not promoted to a broader semantic mismatch without an exact build or code reference.

## Repeated-update semantic limit

The observed structure establishes:

- one signed message is presented three times per block;
- the same three derived oracle PDAs are writable targets each time;
- the first block-position Anchor path emits posting logs;
- later paths emit equal-timestamp skip logs; and
- all three separately target distinct market state for UpdatePerpBidAskTwap.

It does not establish whether later PostPyth invocations are deployed no-ops, overwrite identical state, or have another state-dependent effect. The public handler's continue-before-write branch is source-family evidence only and differs at the equality edge that matters here. UpdatePerpBidAskTwap's exact deployed field mutations likewise remain unpromoted despite before-to-after logs and strong source/binary correspondence.

## Artifacts

- `output/research/velocity-anchor-bundle/anchor-bundle-dossier.json`
- `output/research/velocity-anchor-bundle/anchor-bundle-report.html`
- `output/research/velocity-anchor-bundle/message-reuse-matrix.json`
- `output/research/velocity-anchor-bundle/instruction-equivalence.json`
- `output/research/velocity-anchor-bundle/log-branch-matrix.json`
- `output/research/velocity-anchor-bundle/anchor-conflict-attribution.json`
- `output/research/velocity-anchor-bundle/anchor-binary-correspondence.json`
- `output/research/velocity-anchor-bundle/anchor-semantic-evidence.json`

All inputs and source blobs are commit/path/hash pinned in `research-plans/velocity-anchor-bundle-milestone-2.2.json`. Offline replay performs zero network requests.
