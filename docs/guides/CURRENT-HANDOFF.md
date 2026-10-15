# Current public release — v1.1.0, 2026-10-14

[The GitHub Pages demo](https://ahastings.github.io/solana-conflict-microscope/) and [v1.1.0 downloads](https://github.com/ahastings/solana-conflict-microscope/releases/tag/v1.1.0) are live. The released source commit is bde17a5d0fbdb5d9a2c3f0ea3a6c968b8a4e7b98. Project code is MIT, copyright 2026 ahastings. Private development history and research caches were not published.

The release adds native transaction, slot and upload-chunk links, browser comparison resource budgets, source/feedback navigation, and a pinned development browser driver. See [the changelog](../../CHANGELOG.md), [sharing evidence](SHARING-EVIDENCE.md), and [browser checks](BROWSER-CHECKS.md). The feedback chooser is available in the repository; submitting a GitHub issue requires an account.

Windows portable verification passed 276 tests and 18 fixture pins. [GitHub's Ubuntu build and Pages deployment](https://github.com/ahastings/solana-conflict-microscope/actions/runs/38691711711) passed the portable workflow and all four browser suites. Deployed Chrome checks passed at 1440px and 390px, including evidence links, pagination, comparison downloads, input hashes, and no comparison requests after the document loaded. All five saved example-analysis JSON files remain byte-identical. A fresh Windows clone and extracted source archive verified all 260 source hashes; the offline archive retained all 13 demo files exactly.

These checks establish supplied-evidence consistency and tested interface behavior. They do not establish RPC authenticity, native runtime performance, whole-transaction counterfactual semantics, or a validator's private schedule. No new native execution or historical research replay was performed for 1.1.0. Future publishing still requires explicit owner permission; authorization for this release does not authorize contacting reviewers or posting promotion.

The material below is historical. Its pending-publication and license statements were superseded by the live release above.

---

## Historical release preparation — 2026-10-13

The owner requests v1.0 publication on GitHub, a website/demo, and initial promotion. The 2026-10-02 launch decision selected MIT and ahastings on GitHub with a GitHub Pages demo; use ahastings in the copyright notice. Cloudflare domains were deferred. Prepare a clean source export instead of publishing private development history. Final candidate checks, GitHub authentication, and successful remote deployment must be verified before claiming that v1.0 or its site is live. Promotion destinations still need to be identified. Keep this work bounded to release preparation, publication, and initial promotion rather than new feature or native-research work. The earlier automatic goal remains paused.

The working v1.0 candidate passed npm run verify:portable on 2026-10-13 with Windows / Node.js 24.16.0 / npm 11.13.0: 276 tests, zero failures/skips, 18 fixture pins, twelve demo block certificates plus the saved-comparison check, and the six-block reviewer. Local log: output/v1.0-portable-2026-10-13-verified.log. Clean source-export verification is pending. No new Linux, browser, full historical research-suite, or native-execution validation is claimed.

The snapshot below preserves the 2026-09-24 preparation state. Its licensing and publication decisions were superseded by the dates above; its verification results apply only to the named historical revisions.

## Historical maintainer handoff — 2026-09-24

This is a local, read-only Solana declared-account contention tool. Read AGENTS.md before editing. At this historical checkpoint, the owner had deferred release and left licensing undecided; push, publication, licensing, and reviewer contact had not been authorized. No trading, wallets, keys, or transaction submission.

### Usable state at the historical checkpoint

Source checkpoint: 2107139; validation record: b3a6cea. The working tree was clean when this handoff was written. Start with README.md and docs/guides/READING-REPORTS.md rather than the historical conversation.

- npm run demo creates output/demo/index.html from shipped fixtures. Reports have return links. The opening page links a verified upload-versus-funding comparison.
- npm run compare:analyses -- --left FILE --right FILE --output-dir NEW_DIR checks two saved block analyses and writes HTML/JSON. It refuses an existing output directory. Missing compute and unresolved minimum waves remain explicit.
- npm run verify:demo checks twelve saved block analyses and recomputes the comparison against original source hashes. It checks data consistency, not rendered HTML or RPC authenticity.
- Full-block wave bounds describe declared locks, not a validator schedule or measured speedup. Hypothetical program semantics and native-execution claims have separate limitations.

### Historical verified evidence and its limits

The fresh export at output/portable-2107139 passed offline npm ci and npm run verify:portable on Windows / Node 24.16.0: build, 18 fixture pins, 276 tests, demo generation/verification, and the six-block reviewer. All 246 exported source hashes remained unchanged; all twelve demo files matched the working demo byte-for-byte. Logs: install.log and portable.log in that export. Installation used the existing npm cache. This is not a new Linux validation or native execution run.

Chrome checks covered return navigation, comparison values, narrow-screen scrolling, and desktop/mobile access. See CHECKPOINTS/2026-09-24-comparison-navigation/README.md for specific revisions and local evidence. Earlier ZIP archives predate these changes; do not describe them as the latest source.

### Historical preparation finish line

The owner raised a usage-cost concern. Batch related edits and run checks appropriate to the change; do not regenerate packages or rerun broad suites merely to produce another checkpoint. Prefer one bounded issue with a concrete user-facing result and no automatic feature expansion afterward. The owner paused the automatic goal and chose bounded tasks. At this historical checkpoint, the authorized task was to prepare one public-preview candidate, review its contents, create matching source/demo archives and an announcement, then stop without publishing.

Phone-width inspection found wrapped numeric cells in the comparison; source 7cef44e keeps the numbers on one line and preserves horizontal table scrolling. Build and desktop/mobile browser checks passed. At that stage, the next decisions after packaging were the owner's license and publication destination; those decisions were recorded on 2026-10-02. Do not add features automatically.
