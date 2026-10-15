# Mainnet compatibility and independent conflict check

On 2026-09-24, source **3b43041bd8fc3fa69fb4b16746cf5f57c57460a1** analyzed confirmed mainnet-beta slot **450018786** using three public, read-only requests to `https://api.mainnet-beta.solana.com`: one `getSlot` and `getBlock` in `jsonParsed` and `json` encodings. Request options, timestamps, original response bytes, and SHA-256 hashes are retained. This capture used **confirmed**, not finalized, commitment.

| Observation | Result |
| --- | ---: |
| Transactions | 936 |
| Successful / failed / unknown | 888 / 48 / 0 |
| Legacy / version 0 / version 1 | 759 / 116 / 61 |
| Transactions with recorded compute | 936 |
| Declared conflict pairs | 1,601 |
| Verified clique size | 28 |
| Valid generated wave count | 28 |

The independent verifier imports no analyzer code. It expands raw message headers and loaded addresses, checks signer and normalized read/write sets, enumerates all transaction pairs, and compares their exact conflicting account lists. It verifies that the generated waves contain every transaction once and never place a conflicting pair together. A separately found 28-member pairwise-conflicting clique matches the 28-wave upper bound. The largest single-account writer group has only 25 members, so that simpler witness alone would not prove the lower bound of 28.

## Raw requested privileges are not always the parsed privileges

The first header-only check failed on transaction #911: the raw version-0 header requests writable access to the System Program, while the parsed response marks it read-only. The original failed check and its output are retained.

The [Solana message implementation](https://github.com/anza-xyz/solana-sdk/blob/master/message/src/versions/v0/loaded.rs) distinguishes requested writable indexes from loaded writability and removes write access for reserved keys or demoted program IDs. Its tests explicitly cover the System Program. [Agave's reserved-account-key implementation](https://github.com/anza-xyz/agave/blob/master/reserved-account-keys/src/lib.rs) documents the reserved-key mechanism.

Applying the documented System Program rule independently resolves the sole observed privilege mismatch; all 936 sets and all 1,601 edges then agree. This is a check of this captured block with that explicit rule, not a general reimplementation of every runtime privilege rule or a proof of the endpoint's precise validator build. The production analyzer already retained the parsed privileges correctly; no privilege override was added.

`fixtures/mainnet-privilege-demotion.json` preserves transaction #911's complete entries from both encodings, original transaction position, block context, and full-response hashes. It is clearly labeled as a transaction excerpt, not a complete block. The deterministic regression adds a synthetic read-only peer to isolate the false conflict that an incorrect raw-header override would introduce. The excerpt is pinned in the public fixture manifest and included in the portable suite.

## Reproduce and scope

The local recovery package is `CHECKPOINTS/2026-09-24-mainnet-compatibility/`. Its evidence ZIP contains the complete original responses, merged fixture, generated report, request metadata, initial mismatch, independent verifier and result, and regression log. After extracting into a directory, run:

```sh
node PATH/verify-independent.cjs PATH
npm run analyze -- --fixture PATH/fixture.json --output-dir output/mainnet-recheck
```

The verifier expects the preserved `report/analysis.json` inside PATH. To verify regenerated results, use a copy of the evidence directory and regenerate into that copy's `report` directory.

Strict TypeScript, all 348 development tests, and 18 pinned fixture hashes passed. No native execution or browser interaction check of this 936-transaction report was performed. Its HTML is about 42 MB; this is preserved evidence, not a compact new default demo fixture. Only the 86 KB transaction excerpt is added to the portable source.

This single recent mainnet block is a compatibility sample, not a representative workload study. Wave bounds concern declared account contention only; they do not establish validator scheduling, execution time, speedup, or trading opportunity. No wallet, transaction submission, push, publication, or license decision was involved.

## Follow-up: report size and browser usability

The HTML serializer now embeds an exactly duplicated dominant component once and restores its reference before report interactions. It preserves a separately supplied nonidentical dominant component. The complete restored analysis was compared with the original captured analysis and matched; the external analysis JSON format is unchanged.

For this capture, HTML decreased from 42,235,966 to 34,336,132 bytes (7,899,834 bytes saved, about 19%). This is a file-size measurement, not a measured rendering-time improvement. The original capture report remains unchanged in the evidence archive.

The regenerated report passed Windows Chrome checks at 1440 and 390 pixels: reconstructed dominant-component equality, exact transaction #911 lookup, its recorded error, all 48 failed-transaction matches, no page errors or external requests, and no horizontal page overflow. Evidence: `output/mainnet-report-deduplication/result.json`, `browser-results.json`, and `report.html`; local verification scripts are `output/measure-report-deduplication.ts` and `output/check-mainnet-report.cjs`.

A second pass also deduplicates exact component causal-model lists and unchanged retained-atom arrays, restoring arrays before component aliases. Distinct causal models or atom lists remain separate. This reduces the same report to **23,106,419 bytes**, about 45% below the original 42,235,966 bytes and about 33% below the first reduction. The full reconstructed analysis remains identical. All 350 development tests, 20 standard browser cases, and the two captured-mainnet cases passed. The updated evidence is under `output/mainnet-causal-deduplication/`, with scripts `output/measure-causal-deduplication.ts` and `output/check-mainnet-causal-report.cjs`. The original capture archive is unchanged; generated measurement output directories are working artifacts and may be refreshed.

## Current explorer verification

At source c1ee6cd, the saved 936-transaction capture was reanalyzed with byte-identical results. Offline Chrome checks at widths 1440 and 390 traversed all 742 transactions in the largest estimated wave across 15 pages and verified the complete JSON download byte-for-byte. Transaction #911 retained its original error and read-only System Program declaration; status filtering returned all 48 failed transactions. No external requests, page errors, or page-wide horizontal overflow occurred.

Local scripts, results, reproduction notes, and checksums are preserved in CHECKPOINTS/2026-09-24-mainnet-explorer/. Generated reports are in output/mainnet-explorer-verification/. This check used the existing confirmed capture, made no new RPC requests, and does not establish rendering speed, validator behavior, or network-wide performance.

## Saved-analysis component certificate

The expanded checker introduced at 51243a8 independently reconstructed connected components from normalized account conflicts in the saved mainnet analysis. It verified 710 components covering all 936 transactions: 691 isolated transactions and 19 components with multiple transactions. The largest component contains 180 transactions. Component count is not wave count; the independently checked full-block bounds remain 28-28.

The same certificate checks all 1,601 conflict pairs, 213 grouped contention signatures, and 14,251,880 recorded CU with complete compute coverage. The input SHA-256 remains 2d8e9a216a915fd21f60026a8acacc4e169c67aa993285682c242ddb3d862b2e. Local record: output/component-verifier-mainnet.log; input: output/mainnet-certificate/analysis.json. No new network request or native execution was made.

This saved-analysis checker differs from the original raw-header comparison above: it checks internal consistency of the supplied normalized evidence, including connected membership, rather than independently deriving privileges from the raw response. It does not authenticate RPC origin, verify semantic component explanations, or establish safe counterfactual changes.
