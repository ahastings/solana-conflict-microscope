# Free-range build status

## Objective and current result

Build a useful, trustworthy Solana developer tool that others can inspect and extend. External usefulness and adoption remain untested. Project code is licensed under MIT, copyright 2026 ahastings; third-party material retains its own terms. No donation service is configured.

Release preparation as of 2026-10-13: the owner requests v1.0 publication on GitHub, a website/demo, and initial promotion. The recorded launch destination is ahastings on GitHub with GitHub Pages. Clean source-export verification and successful remote publication are pending. Working-candidate validation is recorded below; it does not establish that v1.0 is live.

The portable microscope is usable from bundled public fixtures. A separate current-deployment experiment now establishes a complete producer followed by two equality consumers for one constructed fixture: all bundles succeed, producer oracle writes commit, consumers preserve the oracles, and swapping consumers gives identical final ordinary account state. Two fresh native executions are byte-identical. [Current measured results and limitations](CURRENT-NATIVE-BUNDLE-RESULTS.md).

The earlier historical experiment remains preserved: its complete producer fails at TWAP and rolls back, while later-Clock successes skip old messages. Those results concern a different ELF and inputs. [Historical measured results](NATIVE-BUNDLE-RESULTS.md).

Portable acquisition now rejects mismatched parsed/raw block identities, transaction counts, ordered signatures, and outer instruction counts before combining evidence. New portable reports and caches omit connection URL details from endpoint fields; shortened discovery plans require an explicit endpoint for online replay and preserve recorded provenance offline. These changes do not extend the native claim.

The follow-up [oracle privilege controls](ORACLE-PRIVILEGE-CONTROL-RESULTS.md) reject declaring all three consumer oracles read-only: B and C each fail at Post with AccountNotMutable (3006), with verified rollback. The producer-only restriction fails too. No account state or instruction payload was patched. This closes the direct grouped-declaration change for the captured current program.

## v1.0 working-candidate verification — 2026-10-13

The working v1.0 candidate passed npm run verify:portable on Windows / Node.js 24.16.0 / npm 11.13.0: strict TypeScript compilation, 18 pinned fixture checks, 276 portable tests with zero failures or skips, demo generation, twelve block certificates plus the saved-comparison check, and the six-block reviewer. Local log: output/v1.0-portable-2026-10-13-verified.log. Loopback RPC test servers required running outside the restricted sandbox after the sandbox blocked binding to 127.0.0.1; no live Solana acquisition was needed. This pass used the working folder and existing installed dependencies. Verification from the clean source export is still pending. It did not repeat Linux checks, the full historical research suite, browser checks, or native execution.

## Recorded portable verification before v1.0

The public-preview source at 7cef44e passed a fresh offline dependency install and the complete portable workflow on Windows / Node 24.16.0: 276 tests, 18 fixture pins, demo generation, twelve block certificates plus the saved-comparison check, and the six-block reviewer. The source folder is output/public-preview-7cef44e; logs are install.log and portable.log within it. The dependency install used an existing npm cache. This does not extend the earlier Linux or native-execution evidence. The automatic goal is paused; current work is bounded release preparation.

The minimum-runtime checks passed 263 portable tests, 18 pinned fixture checks, demo generation, all 12 saved-analysis checks, and the six-block reviewer on Windows and Ubuntu/WSL using Node.js 22.12.0. Thirteen generated artifacts matched byte-for-byte. See [runtime compatibility](RUNTIME-COMPATIBILITY.md) for exact source revisions and scope; this does not imply a fresh full research-suite, browser, or native execution.

The [v1.0 release preparation plan](FIRST-PREVIEW-PLAN.md) defines the remaining preparation and its stopping point. MIT licensing is selected and release work is authorized; account access and verified publication remain to be completed.

## Latest full development suite

At source 62e7a93 on Windows Node.js 24.16.0, npm test passed all 381 development tests with zero failures or skips. The local log is output/first-preview-full-tests.log. This includes the archive-dependent TypeScript tests using preserved research inputs; it is not a fresh execution of the separate full research replay command or Rust/Mollusk experiments. The suite regenerated a host-platform field in the historical runtime manifest; that metadata-only change was inspected and restored.

The source ZIP pinned at 29d5156 remains unchanged and predates the later malformed-fixture CLI diagnostic fix. Do not attribute this new full-suite result to a different packaged source revision.

## Historical verification

- The current deployment completed two native executions of both ABC/ACB scenarios with byte-identical records. All five Rust fixture-gate tests and eight new portable reviewer regressions pass. The CLI verifies the exact fixture, ELF, harness, runtime and lockfile identities, all five Clock fields, native role logs, committed bytes and final-state equality.

- Portable regression suite: 183 tests passed with zero failures or skips, plus strict TypeScript, fixture pins, demo generation, and the six-block reviewer.
- The historical experiment's two fresh Linux native executions of six explicit constructed scenarios generated byte-identical records. Full account bytes, per-instruction observations, and atomic output are preserved. The separate reviewer checks hashes, continuity, coverage, and rollback.
- The preceding source checkpoint passed 254 historical tests and full offline research replay. Clean Windows and Ubuntu/WSL source installs each passed its then-current 137 portable tests, with identical generated reports and desktop/mobile browser QA. Those snapshots are preserved separately; the new native extension has not been described as part of that earlier verification.
- The complete-sequence baseline checkpoint 7c65363 passes all 300 tests with zero failures or skips; the later privilege-control extension passes strict TypeScript and all 14 relevant reviewer regressions. The baseline includes 16 new RPC consistency and endpoint-provenance regressions. Five public CLI workflows were exercised against a loopback HTTP server, including cold-cache discovery override and offline provenance preservation. The earlier native preparation check preserves the exact native fixture hash.
- A fresh public block containing 21 legacy, six v0, and two v1 transactions exposed the former v0 request ceiling. The reader now accepts v1, rejects unsupported future versions, and reproduces all 29 transactions and six declared conflict pairs against independently decoded raw privileges. Six new tests cover version guards and the pinned real block. [Capture details](FRESH-DATA-COMPATIBILITY.md).
- No TypeScript dependencies were added. Native experiments require the separately preserved public snapshot/ELF, pinned runtime source, and Rust dependencies.

## Scope preserved

Recovered baseline: Linux commit 76e8ba0e0378c35d025629dbc18c67e24ce51164 (Milestone 3.0). The original project and frozen research artifacts remain unchanged apart from previously recorded local report regeneration. New evidence is separately versioned. Historical replay used preserved inputs. The subsequent compatibility probe made ten bounded read-only public devnet RPC requests, submitted no transactions, and published nothing.

Conditional graph arithmetic is independently reproduced, while payer-coupling removal, transaction fees, historical prestate, general reordering safety, and runtime speedup remain unproven. The current complete-sequence example uses an unchanged earlier snapshot and later observed Clock, explicitly constructed rather than historical bank prestate. A separately controlled grouped oracle-privilege change has now been tested and rejected by this executable; any alternative needs new interface or implementation evidence. The captured-input inventory found 27 signed Post transactions across 511 cached block files and no time-compatible message for the later snapshot-derived Clock. A subsequent bounded public-data probe found a different current deployed ELF (deployment slot 492998273). The historical branch and layout conclusions cannot automatically transfer to that new executable. The separate current capture validates that new deployment and supplies the successful constructed baseline above; it does not change conclusions for the old inputs. Unknown market layouts must not be patched to force a passing result.

A [draft external review request](REVIEW-REQUEST.md) is prepared but has not been sent.
