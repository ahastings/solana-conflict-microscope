# Windows and Linux verification

## Latest verification: bounded wave analysis

Verified source: **42beb3254367d8b622fa93b315386e89c9b614b4**, on 2026-09-24. Fresh Windows and Ubuntu/WSL copies using Node.js 24.16.0 passed offline locked dependency installation, strict compilation, 18 pinned fixture checks, **245 portable tests each** (no failures or skips), the four-example demo, and the six-block reviewer. All **226 source-file hashes** remained unchanged. **Twelve artifacts** matched byte for byte: all eight demo JSON/HTML reports, the demo index, and the reviewer JSON/HTML/Markdown. The original Linux repository was not modified.

The verified ZIP, complete Git recovery bundle, manifests, logs, parity results, browser results, checksums, and restore guide are in `CHECKPOINTS/2026-09-24-wave-bounds/`. The development workspace separately passed 362 tests and 22 Windows Chrome browser cases. This record does not claim Linux browser or new native Rust verification. Release and licensing remain deferred.


## Earlier verification: report accuracy checkpoint

Verified source: **4f5d3686d9e316733b802930c7f3925970cb27d1**, on 2026-09-24, with Node.js 24.16.0 on Windows and Ubuntu under WSL. Fresh source copies passed offline dependency installation with lifecycle scripts disabled, strict TypeScript, 18 pinned fixture hashes, **235 portable tests each** (no failures or skips), all four demo examples, and the six-block reviewer. All **223 selected source hashes** remained unchanged on both platforms; **eight demo JSON/HTML artifacts** were byte-identical. The original Linux repository was not modified.

Local recovery evidence is retained in `CHECKPOINTS/2026-09-24-report-accuracy/`: source ZIP, manifest, complete Git bundle, install/test logs, parity hashes, restore guide, and checksums. Every source ZIP entry was checked against its manifest. The original development workspace separately passed 352 tests. This checkpoint does not claim new Rust/Mollusk or Linux browser verification. Release and licensing remain deferred.


## Earlier verification: upload evidence and instruction ordering

Verified source: **2169cad26437463200a1eb767c0cbff063851cd0**, on 2026-09-24, using Node.js 24.16.0 on Windows and Ubuntu under WSL.

Fresh source-only copies on both platforms passed `npm ci --offline --ignore-scripts` and `npm run verify:portable`: strict TypeScript, fixture verification, **225 tests each** with zero failures or skips, demo generation, and the six-block reviewer. All **217 selected source files** matched their manifest after execution. Each demo's JSON and HTML was byte-identical across platforms: **six artifacts**. The original Linux repository was not modified.

Local evidence is retained in `CHECKPOINTS/2026-09-24-upload-evidence/`, including the source ZIP, manifest, complete Git recovery bundle, install/test logs, parity hashes, restore guide, and checksums. The final ZIP's selected file bytes were independently checked against the manifest. This is a recovery checkpoint, not a published release; licensing remains undecided.

The full development workspace separately passed 342 tests. The final lifecycle-position HTML addition passed 23 range tests and 12 Windows browser cases. These checks do not establish every Node/OS combination and did not rerun Rust/Mollusk or Linux browser automation.

## Earlier verification record

Verified source: 3b9cff21f400fe3d6b6f8836fbb554f9ea37d9d5, on 2026-09-24.

The current tool was checked on Windows and on Ubuntu under WSL with Node.js 24.16.0. The Linux run used a fresh temporary source copy and an offline dependency installation from the local npm cache. The original Linux repository was not modified.

## Results

- Windows: strict TypeScript compilation and all 316 source tests passed, including the locally available historical research archive.
- Linux: `npm ci --offline --ignore-scripts --no-audit --no-fund` succeeded, followed by `npm run verify:portable`: strict TypeScript, fixture verification, 199 tests (zero failures or skips), the offline demo, and the six-block independent reviewer.
- All 213 selected source files matched the export manifest after Linux execution.
- Each demo's `analysis.json` and `report.html` matched the corresponding freshly generated Windows file byte-for-byte: six artifacts total.

These results cover the Node.js tool on these environments. They do not establish compatibility with every Node version or operating system, and do not include Linux browser automation or a new native Rust/Mollusk execution. The optional Chrome interaction checks were performed separately on Windows.

## Local evidence

The following ignored artifacts are retained in the development workspace; they are not required by a clean checkout:

- `output/linux-portability-check/SOURCE-MANIFEST.json`: tested source selection and hashes.
- `output/linux-portability-install.log`: offline dependency installation.
- `output/linux-portability-verified.log`: complete Linux portable verification output.
- `output/linux-portability-parity.json`: source count and matching report hashes.
- `output/check-linux-parity.cjs`: source and cross-platform report hash assertions.
- `output/semantic-reuse-verification.log`: Windows source test results for this revision.

A shell-wrapper newline issue occurred after the first parity assertions completed. The parity check was rerun as a file and completed with exit code zero; the parity JSON listed above is from that successful rerun. The Linux portable test command itself completed successfully and its log was retained.

## Reproduction

From a source checkout, install the locked dependencies and run `npm run verify:portable` on each platform. Offline installation requires an already populated npm cache; it is not a fresh-machine prerequisite. Regenerate the demo on both platforms and compare SHA-256 hashes of the three pairs of JSON/HTML files under `output/demo`.

No publication, license decision, or network acquisition was performed by this verification.
