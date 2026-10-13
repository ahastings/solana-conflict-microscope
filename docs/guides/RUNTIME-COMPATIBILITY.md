# Runtime compatibility

The minimum runtime is Node.js 22.12.0, as declared in package.json. Windows x64 tested source e64ea3a420fa553712092e3a521fb8561e562eed. Ubuntu/WSL x64 tested a fresh 238-file source export at 0dfa755a7a121ad5df5493925638c86b28cf88cd; the revisions differ only in runtime documentation. Both official runtime archives matched the publisher's SHASUMS256.txt before execution:

~~~text
2b8f2256382f97ad51e29ff71f702961af466c4616393f767455501e6aece9b8  node-v22.12.0-win-x64.zip
22982235e1b71fa8850f82edd09cdae7e3f32df1764a9ec298c72d25ef2c164f  node-v22.12.0-linux-x64.tar.xz
~~~

Official sources: [Node.js 22.12.0 release](https://nodejs.org/en/blog/release/v22.12.0) and [distribution checksums](https://nodejs.org/dist/v22.12.0/SHASUMS256.txt).

## Verified workflow

With the 22.12.0 executable directory first on the process PATH, npm run verify:portable passed on both platforms:

- Strict TypeScript compilation and all 18 pinned fixture checks.
- 263 portable regression tests, with no failures or skips.
- Offline demo generation and independent verification of all 12 saved block analyses.
- The six-block conditional reviewer, without native execution.

The same source generated 13 byte-identical artifacts under Node.js 24.16.0: three single-block JSON/HTML pairs, the range JSON/HTML/CSV, the demo index, and reviewer JSON/HTML/Markdown. This checks deterministic report output as well as successful execution.

The Linux source export also passed a fresh offline npm ci with lifecycle scripts disabled, retained all 238 manifest hashes, and generated the same 13 artifacts byte-for-byte as Windows Node 22.12.0. The separate range-review recovery checkpoint tested Node.js 24.16.0 on both Windows and Ubuntu/WSL, at its pinned earlier source revision. Browser automation and Rust/Mollusk are separate checks and are not implied by runtime compatibility.

## Reproduce

With the runtime being tested first on PATH, confirm node --version and run:

~~~sh
npm ci
npm run verify:portable
~~~

The local evidence record is output/node-22-minimum-portable.log, output/node-minimum-parity.json, and output/check-node-minimum-parity.ts. Linux evidence is in output/node22-linux-install.log, output/node22-linux-portable.log, output/node22-linux-evidence.json, and output/check-node22-linux.cjs. The Windows runtime was extracted under output/node-minimum-check; the Linux runtime and source copy used a temporary directory. No global runtime installation or persistent PATH change was made.

## Expanded verifier follow-up

At source 8111eeb, the full portable workflow passed on Windows Node.js 22.12.0 with 270 tests and no failures/skips, all pinned fixtures, 12 saved-analysis checks, and the six-block reviewer. This includes connected-component certificate checks, original-byte hashing for BOM-marked evidence, and concise verifier errors. The 13 generated demo/reviewer files still match the Node.js 24.16.0 preview at ab9638d byte-for-byte; intervening verifier changes do not alter those reports. Local evidence: output/current-node22-portable.log and output/current-node22-evidence.json. This follow-up did not repeat Linux or native execution; the earlier Linux record above retains its own source pin.
