# v1.0 launch packet

Status: local drafts for the first portable release, version 1.0.0. Nothing in this document establishes that the repository, GitHub release, demo, website updates, or announcements are published. Planned destinations are unverified:

- Source: https://github.com/ahastings/solana-conflict-microscope
- Release: https://github.com/ahastings/solana-conflict-microscope/releases/tag/v1.0.0
- Demo: https://ahastings.github.io/solana-conflict-microscope/
- Other websites: destination and edit location still need to be identified.

Use confirmed URLs in public copy. Review the actual release candidate and record its verification result before posting. The longer announcement is in [FIRST-PREVIEW-ANNOUNCEMENT.md](FIRST-PREVIEW-ANNOUNCEMENT.md).

## GitHub release notes

Title: **Solana Conflict Microscope v1.0.0**

Solana Conflict Microscope is a local, read-only developer and teaching tool for exploring declared account contention and potential parallelism. This first portable release produces JSON evidence and standalone interactive HTML reports from public block data.

- Four bundled offline examples cover program-buffer uploads, cross-payer funding contention, a nine-block upload, and a clearly labeled synthetic application-state case.
- Explore shared writable accounts, conflict pairs, connected components, estimated execution waves, bound witnesses, and recorded compute coverage.
- Compare two saved block analyses or inspect a range of blocks, with missing observations kept visible.
- Independently verify saved declared-lock evidence, wave coverage, bounds, and the worked comparison.
- Analyze captured fixtures or explicitly requested public, read-only RPC data. The reader supports legacy, version 0, and version 1 transactions.

Quickstart with Node.js 22.12 or newer:

```sh
npm ci
npm run demo
```

Open `output/demo/index.html`. The bundled demo works offline after dependency installation. Run `npm run verify:portable` for the portable verification workflow.

Estimated waves are groupings under declared account locks, not a validator schedule or measured speedup. Verification checks internal consistency of supplied evidence; it does not authenticate its source. Native research has separate inputs and limitations. Released under MIT; third-party material retains its own terms.

Feedback: open an issue with your platform, command, example, and the confusing or incorrect result. Clean-install feedback and small reproducible counterexamples are especially useful.

## Website blurb

**Solana Conflict Microscope v1.0**

Explore which declared accounts connect Solana transactions and why they contend. This read-only developer tool includes offline examples, interactive HTML reports, estimated execution waves with bounds, and JSON evidence you can verify independently. It describes potential parallelism under declared account locks; it does not reconstruct validator scheduling or measure runtime speedup. Free under MIT.

Suggested links: **Try the offline demo** and **View source and quickstart**, using the verified demo and repository URLs above.

## Short social post

Draft; replace the bracketed links with verified destinations before posting:

> Solana Conflict Microscope v1.0: inspect declared account contention, explore estimated conflict-free waves, and verify the evidence. Read-only, offline examples, MIT. Feedback welcome: [demo] [source]

## Publication and initial promotion

1. Freeze the portable release candidate. Complete the documented portable verification and review its source/demo packages. Record the candidate revision, version, results, and package hashes. Fix only release-blocking defects; defer new features and native experiments.
2. Confirm the GitHub account and repository destination. Publish the clean source export and v1.0.0 release under the owner's explicit publication authorization, without private development history or research caches. Include the final release notes and prepared source/demo assets.
3. Deploy the captured-fixture demo through the included GitHub Pages workflow. Verify the public repository, release, and demo from their actual URLs, including the opening page and one report. Record those URLs as live only after successful checks.
4. Add the website blurb to each website the owner identifies and authorizes. Check its public page and both links. Unidentified websites remain a specific open item, not an assumed publication target.
5. Post one short announcement on the owner's selected channel after explicit sending authorization. If the owner selects a relevant Solana developer community and authorizes a post there, share the same demo once with a focused request: does installation work, does one report answer a development question, and does the evidence support the explanation? Follow that community's posting rules.
6. Close out with verified publication URLs and a record of where the announcement was posted. Keep reported defects as GitHub issues. Finish this launch once the agreed destinations and initial posts are complete; further feature work, repeated promotion, and ongoing monitoring require a new task.

No paid promotion, donation setup, adoption target, or runtime-performance outcome is required for this launch.
