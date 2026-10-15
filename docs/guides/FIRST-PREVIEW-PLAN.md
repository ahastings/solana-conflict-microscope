# v1.0 release preparation plan

Status as of 2026-10-13: the owner requests a v1.0 release on GitHub, a website/demo, and initial promotion. MIT was selected on 2026-10-02; the launch destination recorded then is ahastings on GitHub with a GitHub Pages demo. Prepare a clean source export rather than private development history. The final v1.0 candidate checks, GitHub authentication, and successful publication still need verification. Nothing here establishes that a repository or site is live.

## Intended first result

A Solana developer can install the selected source, generate the bundled offline examples, identify a shared writable account, inspect its conflict evidence and wave bounds, and export evidence for independent review. The v1.0 release is the portable analytical tool. Native experiments remain separately scoped research references.

## Finish before publication

1. Freeze a candidate revision after fixing any demonstrated portable-tool defects. Defer new decoders, new native experiments, and unrelated feature expansion unless needed to correct a first-preview claim.
2. Run the documented quickstart from a fresh source export. Check the first-report walkthrough against that candidate's generated reports. Record installation steps that need network access; the reports and fixture analysis must work offline afterward.
3. Run verify:portable and the optional desktop/mobile browser checks against that candidate. Record exact source revision, runtime, results, and limitations. Earlier green checks establish earlier revisions, not the release candidate.
4. Review the actual selected files and generated sample reports for connection details, local paths, unlicensed third-party material, and unsupported claims. The exporter's extension/path allowlist is not a content audit. Check documentation links inside the exported package; historical local evidence must be identified as separately preserved when absent.
5. Create a new source package and manifest, record its hash, and retain a matching recovery checkpoint. Do not replace earlier checkpoints.
6. Make the package, example reports, remaining limitations, and proposed announcement reviewable. Publish the verified clean source and demo to the authorized destination once account access is available, and verify the resulting URLs before sharing them. Initial promotion requires the owner's selected channels and any necessary account access. Donations are optional and do not block technical preparation.

## Evidence already available

- Working v1.0 candidate, 2026-10-13: npm run verify:portable passed on Windows / Node.js 24.16.0 / npm 11.13.0 with 276 tests, zero failures/skips, 18 fixture pins, twelve demo block certificates plus the saved-comparison check, and the six-block reviewer. Local log: output/v1.0-portable-2026-10-13-verified.log. Clean source-export verification is pending; this is not a new Linux, browser, full research-suite, or native-execution result.
- [Runtime compatibility](RUNTIME-COMPATIBILITY.md): Node 22.12.0 on Windows and Ubuntu/WSL, 263 portable tests, 18 pinned fixtures, 12 saved-analysis checks, and 13 matching generated artifacts at the documented revisions.
- [First-report walkthrough](READING-REPORTS.md): the existing onboarding example to recheck against the final candidate.
- [Evidence map](EVIDENCE-MAP.md): separates portable analysis, conditional models, and native experiments.
- [Draft review request](REVIEW-REQUEST.md): prepared locally; not sent. External usefulness and adoption have not yet been established.

## Stop condition for preparation

A reproducible candidate package and a reviewable announcement are ready, with no known blocking defect in the documented first-use workflow. At that point, stop feature expansion and complete the authorized release steps; resolve only missing account access or publication destinations. Do not spend the remaining usage allowance merely because it is available, or promise that a particular number of resets will finish the work.

## First feedback to seek after publication

Ask reviewers whether the clean install works, whether one report answers a concrete development question, and whether the evidence supports the explanation. Prioritize reproduced defects and confusing explanations before adding features. No adoption, donations, or runtime-performance outcome is promised.

## Preparation checks recorded on 2026-09-24

At source 17b2d91, a fresh demo matched the first-report walkthrough: slot 488638500, 45 successful transactions, 116 declared conflict pairs, all 45 compute values known, and 122,696 total recorded CU. The selected component contains 15 transactions and 15 decoded chunks. Its four model bounds are 15, 15, 15, and 1; full-block bounds are 15, 15, 15, and 3. Lower and upper bounds match in each case. This confirms the walkthrough describes the generated models; it does not establish their hypothetical semantics as deployable changes.

All 12 saved block analyses passed verify:demo. All 24 offline browser checks passed in local Windows Chrome at desktop and phone widths, including search, paging, keyboard controls, downloads, report evidence, layout, browser errors, and attempted external requests. Local evidence: output/preview-walkthrough-evidence.json, output/preview-verify-demo.log, and output/report-browser-fzIAey/results.json. These are local verification records, excluded from the source export. This pass did not repeat fresh dependency installation, Linux browser checks, the full research suite, or native execution.

The preceding 239-file source export had 44 inline local Markdown file links, all resolving within the package after native archive references were labeled as separately preserved paths. That check excluded remote URLs and fragment identifiers. The final packaged revision still needs the remaining candidate checks above.

A fresh 239-file export at 29d5156 subsequently passed offline npm ci with lifecycle scripts disabled and the complete verify:portable workflow on Windows with Node.js 24.16.0: strict compilation, fixture checks, 263 tests with zero failures/skips, demo verification, and the six-block reviewer. All 239 manifest hashes were unchanged afterward, and all 13 generated demo/reviewer artifacts matched the working copy byte-for-byte. Local evidence: output/first-preview-install.log, output/first-preview-portable.log, and output/first-preview-verification.json. The export is output/first-preview-candidate. The offline install used an existing npm package cache; a new user's initial dependency download still needs network access. This pass did not run the archive-dependent full test suite or native experiments.
