# Solana Conflict Microscope

Understand which declared accounts connect Solana transactions, why they conflict, and how they can be grouped into estimated conflict-free waves. The microscope is a local, read-only developer and teaching tool. It produces JSON evidence and standalone interactive HTML reports.

**[Try the live demo](https://ahastings.github.io/solana-conflict-microscope/) · [Download the offline demo](https://github.com/ahastings/solana-conflict-microscope/releases/download/v1.1.0/solana-conflict-microscope-v1.1.0-offline-demo.zip) · [Source and release checksums](https://github.com/ahastings/solana-conflict-microscope/releases/tag/v1.1.0)**

For the prebuilt offline demo, extract the ZIP and open its index.html in your browser. No installation, RPC account, API key, wallet, database, server, or research cache is needed. To generate reports from source, follow the local quickstart below.

## Version 1.1

Version 1.1.0 adds shareable evidence links and browser interaction checks to the portable analytical tool, licensed under [MIT](LICENSE), copyright 2026 ahastings. Third-party material retains its own terms; see the [inventory](docs/guides/THIRD-PARTY-INVENTORY.md). The demo uses captured fixtures, not live network streaming. Separate native experiments remain research references with their own prerequisites and limitations.

The included GitHub Pages workflow verifies the portable tool before deploying only output/demo from the main branch. It does not publish research caches, native binaries, or workspace history.

Hosted example pages load Cloudflare Web Analytics, added by the deployment workflow. Generated local demos and offline release archives omit it. The **Compare your files** page excludes analytics and processes selected files locally, without uploading them.

See [what changed](CHANGELOG.md) and [how to share exact evidence](docs/guides/SHARING-EVIDENCE.md).

## Try it locally

Use Node.js 22.12 or newer and npm ([runtime validation](docs/guides/RUNTIME-COMPATIBILITY.md)), then run from the project folder:

~~~sh
npm ci
npm run demo
~~~

Open **output/demo/index.html** in your browser. Each demo report has a **Back to demo** link returning to its example on the opening page. The four bundled examples cover a single-block program-buffer upload, cross-payer funding contention, a nine-block upload, and a conspicuously labeled synthetic application-state teaching case. Reports include selectable findings, account-to-transaction relationships, evidence, compute coverage, and wave bounds.

Follow the [first-report walkthrough](docs/guides/READING-REPORTS.md) for a worked example with verified numbers. Search transactions, inspect declared accounts and conflict pairs, or select a wave to explore its members. Upload inspectors link byte ranges to exact instructions. Search, status filters, paging, and keyboard controls work offline.

Single-block HTML reports include **Download analysis JSON**, which saves the complete embedded analysis locally, even when the report is opened offline without its companion JSON file.

The demonstration reads bundled public fixtures and writes only under output/demo. After dependency installation, it works offline. A report does not run code on Solana.

## What can you learn?

- Which shared writable accounts explain a component of declared contention?
- Does repeated use of a fee payer independently preserve the conflicts?
- Is a component important by conflict-pair count, known compute, or estimated depth?
- Which decoded roles support an explanation, and what remains unknown?
- Do lower and upper bounds match, proving the minimum for this declared-lock model?

Wave grouping starts with first-fit and tries a deterministic saturation-degree ordering within a fixed work budget. A candidate replaces the original only when it uses fewer waves and passes a conflict-free coverage check; ties and exhausted budgets preserve the original witness. Counterfactuals also reuse shorter existing groupings after checking complete coverage and all retained conflicts, so removing constraints cannot worsen the reported upper bound. This can tighten an estimated upper bound without proving the minimum unless it meets the clique lower bound. Each analysis records the method in methodology.waveHeuristic; the HTML report exposes it under How these wave bounds were generated, including the optimization limits and fallback behavior. Newly generated wave bounds also include cliqueWitness transaction indexes: every pair conflicts under that model, independently supporting the lower bound. This witness need not be the largest possible clique. Block and component reports expose these indexes under Lower-bound witness; older saved analyses may omit them.

A declared account conflict means two transactions share an account and at least one declares it writable. Read/read overlap does not create an edge. These account declarations make parallel execution possible in Solana's model; see the [official transaction documentation](https://github.com/solana-foundation/developer-content/blob/main/docs/core/transactions.md).

## Verify exported declared-lock evidence

~~~sh
npm run verify:analysis -- --analysis output/demo/real-loader/analysis.json
~~~

This read-only, offline command independently reconstructs conflicts from normalized account permissions, checks exact conflicting account lists and their grouped contention summaries, independently reconstructs connected components and checks their membership and total count, verifies complete conflict-free wave coverage, and checks every pair of the stored clique witness. It verifies the block's bound claims, status counts, compute totals and coverage, and full-block per-wave compute evidence, then prints the input file's SHA-256. Invalid evidence exits with an error. Older analyses without cliqueWitness must be regenerated.

To verify an arbitrary saved range report:

~~~sh
npm run verify:range -- --analysis output/demo/multi-block-upload/range-analysis.json
~~~

This checks that every requested slot appears exactly once in order, preserves missing/skipped/unavailable/failed observations, checks that all five provenance slot lists match the ledger, verifies embedded block identities, and applies the independent block checker to every observed slot. It reports observation counts and the file's SHA-256 without rewriting it or making RPC calls. It does not authenticate observation status, verify chain ancestry, or certify cross-block upload reconstruction and counterfactual semantics.

Verification establishes internal consistency of the supplied declared-lock evidence. Component membership is checked against declared connectivity; semantic component explanations and counterfactual claims remain outside this certificate. It does not authenticate the source RPC data, verify counterfactual semantics, or establish validator execution. The file hash identifies the checked bytes; it is not proof of their origin. Both verify:analysis and verify:range accept a leading UTF-8 byte-order mark; their SHA-256 still covers the original bytes, including that marker, and the input file is never rewritten.

## Compare two saved blocks

Choose **Compare your files** on the demo opening page to compare two saved block analysis JSON files in your browser. Both inputs are independently checked before any result appears; files stay local. Download the verified comparison as JSON or a standalone HTML report. This also works offline. Browser size and verification-time limits are displayed on the page; use the terminal command below for larger inputs.

~~~sh
npm run compare:analyses -- --left output/demo/real-loader/analysis.json --right output/demo/real-funding/analysis.json --output-dir output/comparison
~~~

A worked upload-versus-funding comparison is also available on the demo opening page after running npm run demo. Run npm run verify:demo to verify the saved block evidence and check that the comparison JSON exactly matches its two source analyses and original file hashes. This checks saved data, not the rendered HTML.

Open output/comparison/comparison.html. The command independently verifies both analyses before writing a standalone HTML comparison and comparison.json. It records the SHA-256 of each original input and refuses to overwrite an existing output directory. Differences are right minus left; they describe two observations, not a controlled experiment or a performance gain. Compute differences are unavailable if either block has missing compute data. Unproven minimum wave counts remain unavailable.

## Analyze your own public block data

~~~sh
npm run analyze -- --fixture fixtures/real-devnet-block.json --output-dir output/my-report
~~~

The reader supports legacy, version 0, and version 1 transactions. For a recent mixed-version public example, use `--fixture fixtures/rpc-v1/slot-503405150.json`. Explicit future transaction versions are rejected pending compatibility review. [Capture and compatibility evidence](docs/guides/FRESH-DATA-COMPATIBILITY.md).

A fixture is a JSON object with a numeric non-negative safe-integer slot and a block containing a parsed getBlock response. The analyze --fixture command accepts a leading UTF-8 byte-order mark without rewriting the input file. Null, boolean, and string slot values are rejected. Compute totals must also stay within the safe-integer range; block, counterfactual, and cross-block upload analysis reject overflowing totals instead of silently rounding them. Parent slots and optional block heights must also be non-negative safe integers; optional block times must be signed safe integers, while null time/height remains unknown. Optional provenance identifies its source and whether it is real network data or synthetic. See the files in fixtures/ for examples. Unknown provenance stays unknown. Supplied signatures must be arrays of nonblank strings, and supplied logs must be arrays of strings; missing or null collections retain the existing absent-evidence handling. Parsed account entries require nonblank names and boolean signer/write permissions. If present, their source must be transaction or lookupTable; an omitted source retains the historical transaction default. Explicit instruction account operands and compiled program indexes must resolve against the original message account list, including loaded addresses. Invalid references fail analysis; a missing operand list remains unknown and cannot establish that an instruction leaves an account untouched. An omitted outer instruction list likewise remains unknown rather than being treated as an explicitly empty list; payer-removal counterfactuals preserve that uncertainty.

To make a public, read-only RPC request, select a slot and endpoint explicitly:

~~~sh
npm run analyze -- --slot 488638508 --rpc-url https://api.devnet.solana.com --output-dir output/fetched-block
~~~

Use `npm run analyze -- --help` or `npm run analyze-range -- --help` for command options. Both commands reject unknown, duplicate, or incomplete options before acquisition. Range analysis reads caches by default; fetching requires `--fetch-missing`, and `--skip-slots` must list explicit integers within the requested range.

Public RPC history and rate limits vary. The frozen demo remains available even if an endpoint no longer serves those slots. A separate [mainnet compatibility check](docs/guides/MAINNET-COMPATIBILITY.md) independently verified 936 transaction access sets and 1,601 declared conflict pairs, including a documented raw-versus-parsed privilege distinction. Live acquisition checks that the parsed and raw responses identify the same block and ordered transactions before combining their instruction evidence. A mismatch fails the acquisition.

Endpoint fields in newly generated block/range reports, public block caches, scanner summaries, and discovery plans retain only the URL origin (scheme, host, and port). URL usernames, passwords, paths, queries, and fragments are omitted; the live request still uses your complete connection URL. Full HTTP URLs in portable report diagnostics are shortened too. This is limited endpoint redaction: other fixture content, hostnames, arbitrary error text, and historical research artifacts still need review before sharing. Existing source fixtures and caches are never rewritten by this redaction. Range acquisition reports corrupt or slot-mismatched block caches and malformed saved slot-status files as failed slots, preserving their original bytes instead of treating them as missing, automatically refetching, or replacing them with a skip record. Use a fresh working cache directory to fetch a replacement while retaining the original evidence. Newly fetched blocks are analyzed successfully before being written to the block cache.

A saved discovery plan whose connection URL was shortened can replay offline. For online replay, supply the full endpoint again with --rpc-url or SOLANA_RPC_URL; the tool refuses to guess missing connection details.

## Verify the portable tool

The analyzer tests include all 1,100 labeled conflict graphs with zero through five transactions, realized using mixed read/write account access. An independent exhaustive coloring oracle checks generated wave validity, bounds, and minimum-count claims. This finite check supports the declared-lock model; it does not verify validator scheduling or whole-program semantic equivalence.

~~~sh
npm run verify:portable
~~~

This runs strict TypeScript compilation, the core analysis/discovery/range/reviewer regression suites, and the demo plus independent reviewer using source-controlled fixtures. After generating the demo, it independently verifies all 12 saved block analyses: three standalone examples and nine observed range blocks. You can repeat that read-only check with npm run verify:demo, or select an existing demo folder with --demo-dir DIR. This certifies declared block conflicts and bounds, not cross-block upload reconstruction or counterfactual semantics. The nine-block range corpus is bundled with checksums in fixtures/loader-range/manifest.json. Missing evidence must fail verification, never silently skip a test. See the [Windows/Linux verification record](docs/guides/PORTABILITY-VERIFICATION.md) for the tested revision, environments, and report parity checks.

For interface changes, also run `npm run check:ui-cases` after `verify:portable`. `npm ci` installs the pinned `playwright-core` development driver without downloading a browser. Set `MICROSCOPE_CHROME_PATH` to an existing Chrome or Chromium executable; `MICROSCOPE_PLAYWRIGHT_PATH` is only needed to override the driver module. Generated reports remain self-contained and work offline.

The four browser suites check report controls, transaction links, range evidence links, and local file comparison at desktop and phone widths, including paging, keyboard focus, downloads, layout, browser errors, and blocked external requests. They write evidence under output/. See the [browser-check guide](docs/guides/BROWSER-CHECKS.md) for setup and commands. Browser checks are separate from `verify:portable`; the Pages deployment runs both before publishing.

`npm run benchmark:conflicts` measures conflict-graph and account-summary construction on three deterministic 240-transaction synthetic workloads. It prints each run's timing and a hash of the complete result, so implementations can be compared without accepting changed evidence. The default mode excludes normalization, counterfactual analysis, HTML generation, and network acquisition. Use `npm run benchmark:conflicts -- --full` to include normalization and all counterfactual analysis; this still excludes HTML and network acquisition. Timings vary by machine and are not validator-performance measurements or pass/fail thresholds.

The historical **npm run verify** and **npm test** commands also exercise the much larger research archive. They require the separately preserved caches and outputs and are not the clean-checkout quickstart. [Research workflow details](docs/guides/RESEARCH-WORKFLOWS.md).

## Evidence boundaries

Estimated execution waves describe a valid grouping under declared account locks. They do not reconstruct transaction arrival, validator execution order, latency, throughput, or private scheduling. The Evidence coverage section reports known status, recorded compute, available outer instruction lists, and explicit operands for represented instructions. These counts do not establish complete inner-instruction recording. Known compute is reported with coverage; missing compute is not zero. Missing execution status stays unknown rather than being counted as failed. Explicit fee and compute values must be non-negative safe integers; numeric strings and booleans are rejected.

Upload byte coverage describes decoded instruction payloads, not verified final buffer contents. Single-block and range reports retain successful, failed, and unknown transaction statuses. Only successful lifecycle transactions establish observed upload boundaries. Range ordering retains outer instruction positions and inner indexes within their parents, so equal local indexes remain distinct. Multi-block sequences include a paged chunk inspector with slot, transaction, instruction position, status, byte range, and selected instruction evidence; selecting a chunk also updates its slot-level causal summary. Byte-range analysis accepts canonical standard Base64 with or without trailing padding; malformed encodings remain in instruction evidence but do not create exact upload ranges or qualify for semantic conflict refinement. Reports list excluded upload instructions by slot, transaction, and outer/inner instruction, with the validation reason; JSON retains the original decoded fields.

A repeated address does not establish common ownership. A decoded transfer source is not automatically application state. Transfer evidence retains transaction outcomes and instruction positions; amounts describe decoded instructions rather than verified balance changes. Transaction counts remain distinct from instruction counts. Synthetic teaching fixtures are not observed network behavior. Counterfactuals show the consequences of stated modeling assumptions, not changes a developer can safely deploy.

For a concise guide to the portable checks, native experiments, and frozen historical handoffs, see the [evidence map](docs/guides/EVIDENCE-MAP.md).

## Review the Velocity case independently

~~~sh
npm run review-case
~~~

Open **output/reviewer/review.html**. Six bundled public blocks are hash-checked and reanalyzed. An independent bounded solver computes the current and conditional graph depths, with explicit witnesses and negative controls. Expand any slot in the HTML report to inspect its four model witnesses, transaction roles, and directed dependencies; the Markdown report includes every slot too. This command does not require historical caches and does not execute a native program. Duplicate or unknown options, empty paths, and invalid search budgets are rejected before evidence is read; --max-search-states requires a positive safe integer.

The conditional result depends on whole-transaction oracle behavior and removal of shared payer coupling that have **not been established as a safe implementation**. The historical native experiment executed Post, not the following TWAP instruction. A matching depth calculation is not proof of those missing semantics. [Independent audit](docs/guides/VELOCITY-INDEPENDENT-AUDIT.md) · [Reproduction scope](docs/guides/REVIEWER-REPRODUCTION.md).

A separate [full-bundle native harness](tools/full-bundle-runtime/README.md) executes explicit Clock controls and captures complete account bytes around every instruction. Its [first results](docs/guides/NATIVE-BUNDLE-RESULTS.md) establish a Post write control but leave the complete producer sequence unproven. It requires the historical snapshot, exact ELF, and an offline Rust environment; the portable reviewer does not run it.

A separately captured current deployment now has a [successful complete producer/equality-consumer experiment](docs/guides/CURRENT-NATIVE-BUNDLE-RESULTS.md). Both consumer orders preserve identical final ordinary account state for that exact constructed fixture, reproduced in two byte-identical native records. This does not relax declared account locks or establish general reordering safety; fees, shared payer coupling, and bank behavior remain outside the experiment.

A subsequent [read-only oracle declaration control](docs/guides/ORACLE-PRIVILEGE-CONTROL-RESULTS.md) fails with AccountNotMutable for both equality consumers. Unchanged output bytes alone do not justify relaxing writable declarations.

The imported archive through Milestone 3.0 is preserved for comparison. Stronger historical prose should be read alongside the independent audit. [Current build status](docs/guides/BUILD-STATUS.md).

## Contribute and reuse

The aim is a free release that other developers can inspect, reproduce, and extend. The project is available under the [MIT license](LICENSE); third-party material retains its own terms. No donation account or payment service is configured.

Useful contributions include a reproducible bug, a confusing report explanation, a public fixture with provenance, or a bounded decoder supported by primary sources. [Contribution guide](CONTRIBUTING.md).

To prepare a local source-only release candidate without caches, credentials, checkpoints, or dependencies:

~~~sh
npm run release:prepare
~~~

It writes a new output/release-preview directory with a SHA-256 source manifest, refuses to overwrite an earlier preview, and publishes nothing. Use --output-dir output/another-preview for another copy.
