# Read your first report

Start with the bundled example so the evidence stays reproducible:

~~~sh
npm ci
npm run demo
~~~

Open output/demo/index.html and choose **Real devnet: loader buffer writes**. Once dependencies are installed, the demo and reports work offline. The data is a captured devnet block, not a live mainnet measurement. The synthetic teaching example is labeled separately.

Use the report's section links to jump to **Transactions**, **Findings**, **Account graph**, or **Wave timeline**. Tab to a link and press Enter to move focus to its heading. The summary cards use balanced rows on desktop and narrower columns on phones.

## Establish what was observed

The loader example uses slot **488638500**. Its current report contains:

| Evidence | Value | What it means |
| --- | --- | --- |
| Transactions | 45 | Transactions represented in the supplied block |
| Recorded successful outcomes | 45 | The supplied metadata records success |
| Declared conflict pairs | 116 | Pairs sharing an account where at least one declares write access |
| Compute coverage | 45 of 45 | Every supplied transaction has a recorded compute value |
| Recorded compute total | 122,696 CU | A computational-work total, not elapsed time |
| Full-block wave bounds | 15–15 | A verified 15-member clique and a valid 15-wave grouping agree |

In another report, missing compute stays unknown; a partial subtotal is not a full-block total. Unknown transaction status is different from failure. Evidence coverage also describes available instruction lists and explicit operands; it does not prove complete runtime recording.

## Follow a claim to its transactions

Search for **#11**. Open its **Declared accounts** list to see read/write permissions and signer status. Select an account to see its block-wide usage and matching transactions, including accounts that create no conflicts. The transaction inspector also lists conflicting peers and the accounts responsible for each pair.

Search accepts an exact transaction index, a signature fragment, or an exact account address. Successful, Failed, and Unknown filters work with or without search text. When a failed transaction includes an RPC error, the inspector preserves that original error.

Select a wave bar to inspect every member of that generated grouping. Lists use Previous/Next controls. Full-block and selected-component wave numbers belong to different groupings; read the scope label. Wave membership does not change with the search filter. Bar height reflects recorded compute, not duration.

Expand **Lower-bound witness** under the block or selected-component bounds. Every pair of listed transaction indexes conflicts under that model. A 15-member clique requires at least 15 different waves; the generated 15-wave grouping proves that 15 suffice for this declared-lock model. An unmatched lower/upper pair leaves the minimum unresolved. A witness need not be the largest possible clique.

Graph controls, wave bars, inspection buttons, and pagination support keyboard operation. Use Tab to focus a control and Enter or Space to activate buttons.

## Keep hypothetical results separate

The loader example's primary component contains 15 transactions and a sequence of 15 decoded buffer-write chunks. Its models have these matching lower/upper bounds:

| Model | Selected component | Full block |
| --- | --- | --- |
| Current declared locks | 15 | 15 |
| Payer decoupling only | 15 | 15 |
| Byte-range refinement only | 15 | 15 |
| Both hypothetical changes | 1 | 3 |

The joint model removes both supported causes of contention in the selected component. Other transactions still require three waves in the full-block model. This does **not** demonstrate a fivefold speedup, a deployable redesign, or current validator support for byte-range locks. The counterfactual assumptions and retained causes are part of the result.

Use **Inspect upload chunks** to follow byte ranges to the selected transaction and exact outer or inner instruction. In the multi-block example, the inspector also identifies the slot and instruction parent. Decoded payload coverage—including payloads from failed or unknown transactions—does not establish final buffer contents. Only successful lifecycle observations can establish an observed upload boundary.

## Compare the captured blocks

Use **Back to demo** at the top of a demo report to return to its example card. The opening page also offers **Compare captured blocks** in its top navigation.

The worked comparison places the upload block (slot 488638500) on the left and the funding block (slot 488638508) on the right:

| Evidence | Left | Right | Right minus left |
| --- | --- | --- | --- |
| Transactions | 45 | 51 | +6 |
| Declared conflict pairs | 116 | 146 | +30 |
| Connected components | 22 | 26 | +4 |
| Proven minimum waves | 15 | 17 | +2 |
| Known compute subtotal (CU) | 122,696 | 403,169 | +280,473 |

Both blocks have complete recorded compute coverage. These are different workloads: more compute or more waves does not establish a regression, and fewer would not establish a speedup. For other inputs, missing compute suppresses the compute delta, and unmatched wave bounds leave the proven minimum unavailable. On a narrow screen, focus the comparison table and use arrow keys to scroll across it. Expand the verification certificates to inspect each block's declared-evidence checks.

## Share the exact selection

Selected transactions, range slots and upload chunks now provide native links that reopen the same evidence. Transaction links use #tx=N; range links use #slot=N or #chunk=sequenceIndex:chunkIndex. These indexes belong to the saved report. See the [sharing guide](SHARING-EVIDENCE.md) for worked links and offline use.

## Save and check the evidence

Range reports have section links for **Coverage**, **Block evidence**, **Upload timeline**, and **Recurring accounts**. They move keyboard focus to the selected heading.

Range reports also include a **Block-by-block evidence** table, covering every requested slot even when no upload was decoded. Compare transaction outcomes, known and unknown compute, declared conflict pairs, wave bounds, and widest generated wave. Select a slot button to inspect its stored clique witness and grouping method. Missing block evidence is explicitly unavailable rather than zero activity. The **Download block overview CSV** button works offline; the same summary is saved as range-overview.csv beside the range reports. CSV blanks represent unavailable measurements or an unproven minimum, while recorded zero values remain zero. The CSV is a comparison summary; use range-analysis.json for the full evidence and independent verification.

The **Recorded parent links** section compares each observed block's previous hash with the saved block at its declared parent slot, when that parent is available. It distinguishes matches, hash mismatches, unavailable parents, and nonpreceding parent references. It also counts links that bypass earlier observed blocks and identifies the first bypassed slot; this warns when individually matching links cannot place every supplied block on one ancestry path. Skipped or unavailable slots are not counted as bypassed blocks. A mismatch makes single-chain interpretations unsafe; a match is only an internal comparison and can still occur among records from separate branches. This does not establish canonical or finalized ancestry, and the range certificate does not certify ancestry. The field meanings follow [Solana's confirmed-block JSON format](https://solana.com/docs/rpc/json-structures#confirmed-blocks).

The single-block report's **Download analysis JSON** button works even when you only have the HTML file. To check the example's saved JSON independently:

~~~sh
npm run verify:analysis -- --analysis output/demo/real-loader/analysis.json
~~~

The command reconstructs declared conflicts and connected-component membership, checks the component count and wave coverage, verifies the stored clique and bound claims, and checks status counts and compute evidence against the supplied transactions. Its SHA-256 identifies the checked bytes. It does not authenticate their origin or verify hypothetical program semantics.

To verify an arbitrary saved range report:

~~~sh
npm run verify:range -- --analysis output/demo/multi-block-upload/range-analysis.json
~~~

This checks that every requested slot appears exactly once in order, preserves missing/skipped/unavailable/failed observations, checks that all five provenance slot lists match the ledger, verifies embedded block identities, and applies the independent block checker to every observed slot. It reports observation counts and the file's SHA-256 without rewriting it or making RPC calls. It does not authenticate observation status, verify chain ancestry, or certify cross-block upload reconstruction and counterfactual semantics.

~~~sh
npm run verify:demo
~~~

This checks the three saved single-block analyses and all nine observed blocks in the range demo without regenerating them. It also recomputes the saved comparison and checks that its data and original source hashes match. Rendered HTML is outside this data certificate. For the complete portable workflow, use npm run verify:portable.

The separate [Velocity reviewer](REVIEWER-REPRODUCTION.md) examines six pinned public blocks and conditional graph models. Its native-execution limitations are different from the general declared-lock certificate; retain the scope of each check when sharing results.
