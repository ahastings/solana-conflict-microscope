# Fresh public-data compatibility check

On 2026-09-24, a bounded probe made ten read-only RPC requests to https://api.devnet.solana.com. It captured deployment evidence and a recent public block, submitted no transactions, and exposed two independent compatibility boundaries.

## Mixed transaction versions

The previous client requested maxSupportedTransactionVersion: 0. The endpoint rejected the entire block at slot 503405150 because it contains version 1 transactions. The updated client requests version 1, checks matching supported versions across both encodings, and successfully captured the same block.

| Version | Observed transactions |
| --- | ---: |
| Legacy | 21 |
| 0 | 6 |
| 1 | 2 |

All 29 transactions succeeded. Independent decoding of raw message headers and loaded addresses reproduces every normalized read/write set and all six declared conflict pairs. Four pairwise-conflicting transactions establish a lower bound of four waves; the generated four-wave grouping matches that bound. This concerns declared account contention, with no validator scheduling or performance conclusion.

Version 1 retains account ordering and instruction index meanings. Its extra transactionConfig fields describe transaction configuration. The analyzer continues to use parsed account privileges and recorded meta.computeUnitsConsumed; it does not substitute the configured compute limit for measured consumption. Sources: [SIMD-0385](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0385-transaction-v1.md) and [official RPC JSON structures](https://solana.com/docs/rpc/json-structures).

Both original finalized RPC response files and their request metadata are preserved in fixtures/rpc-v1 and checked by fixtures/manifest.json. The independently recaptured, merged CLI fixture matches those responses. The reader rejects explicit future or malformed versions. Historical offline fixtures with an absent version field remain accepted; new RPC acquisition requires an explicit supported version.

Try the captured block offline:

~~~sh
npm run analyze -- --fixture fixtures/rpc-v1/slot-503405150.json --output-dir output/mixed-version-report
~~~

## Native deployment boundary

| Observation | Historical experiment | Fresh capture |
| --- | --- | --- |
| Deployment slot | 488659528 | 492998273 |
| ELF SHA-256 | 89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c | 7fd13697bfc5bbd1dfd85648c28d80ebe8591052ecba7d8b2e00266a95f7a7cb |

The fresh full deployment capture has context slot 503405402. The Program account's ProgramData address binding was checked, and the full ProgramData header matches the initial smaller probe. The payload hash differs from the exact historical executable.

No fresh native execution followed this mismatch. Historical Post branch behavior, validated mutation offsets, and whole-bundle findings remain scoped to their pinned executable. A new native experiment would require validation of the changed deployment and a compatible complete account snapshot. The fresh block alone supplies neither.

The full deployment response, extracted executable, probe logs, generated block report, and collection scripts are preserved in the local compatibility checkpoint. The portable source preview includes the mixed-version block fixtures and tests; it does not bundle the large deployment capture or promote the conditional native result.
