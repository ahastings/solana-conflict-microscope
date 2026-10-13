# Milestone 2.0 handoff

## Scope and base

Milestone 2.0, "Sourceability Triage and Velocity Semantic Dossier," is complete on top of local base commit `afec9ae` ("Complete candidate identity dossier milestone"). The repository is Solana Conflict Microscope on branch `master`.

This milestone uses only public, read-only Solana and public-source evidence. It adds no semantic decoder, semantic footprint, semantic counterfactual, broad scan, transaction submission, wallet/key handling, trading, Jito/MEV behavior, private-auction reconstruction, exact validator-schedule claim, production hosting, or monitoring.

## Preflight

Before modification:

- repository root: `C:/Users/Owner/Documents/ChatGPT/solana-conflict-microscope`;
- `git status --short`: empty;
- branch: `master`;
- HEAD: `afec9ae Complete candidate identity dossier milestone`;
- `afec9ae` was present in `HEAD` history;
- the handoff began with the required Milestone 1.9 header;
- baseline `npm run verify`: 108 passed, 0 failed;
- discovery baseline: 500 requested, 500 observed, 70 candidates, 19 high-priority candidates, and 20 materializations;
- Candidate #1 remained `black-box-structure-only`;
- Candidate #3 was materialized at discovery rank 3 with representative slot 489572998.

## Sourceability triage

The new deterministic research-priority view preserves discovery rank and answers a different question: which already-strong candidate currently has enough authoritative public evidence for bounded semantic research?

All 19 high-priority unfamiliar candidates are mapped exactly once into six meaningful invoked-program families. Each record preserves candidate ID, original rank, exact program IDs, recurrence, payer/depth/compute context, existing cause and role evidence, shared writable count, materialization path, exact-ID/source/interface/verified-build fields, deployment-correspondence confidence, evidence-ladder outcome, and explicit research-priority reasons.

Candidate #3, `candidate-043c938568ad5e15`, remains discovery rank 3 and becomes sourceability priority 1 because official Velocity identity, a maintained SDK/IDL, and a public official source family are available. This does not rewrite the discovery ordering.

Candidate #2, `candidate-e5d929864077a76b`, remains a valid discovery-rank-2 lead and is `deferred-not-rejected`. Its six observed blocks, representative two-transaction/two-payer cross-payer component, single shared writable destination, proven depth two, qualified known-compute share 0.551766 at complete coverage, and materialized report are preserved. The bounded triage found no exact authoritative mutation-level source path; it did not demote the contention evidence.

## Candidate #3 exact recurrence evidence

The manifest `research-plans/candidate-043c938568ad5e15.json` pins the exact six-account identity, six recurrence references, representative slot/component, all 24 transaction signatures, source and snapshot cache paths, materialized paths, expected counts, invoked programs, provenance, every input SHA-256, and the offline replay contract.

Exact-set equality independently revalidates these six slot/component pairs:

- 489572998 / 1;
- 489593012 / 17;
- 489602971 / 14;
- 489603031 / 16;
- 489612991 / 11;
- 489613051 / 17.

Every occurrence has four successful transactions, two distinct declared fee payers, six transaction-pair conflict edges, 15 conflict atoms, wave bounds 4-4 with proven depth four, and complete known-compute coverage. The six totals are 183675, 182022, 181374, 180899, 180947, and 181397 Compute Units, or 1,090,314 combined. Partial identity matches are rejected and are never merged as candidate occurrences.

## Authoritative identity and deployment correspondence

Official Velocity documentation at commit `bd4846ff6039747ea254c0f339ce7a2b6b022ae9`, path `content/developers/velocity-sdk/setup.mdx`, names `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P` on devnet and mainnet. Official organization/repository metadata, the public protocol-v2 tree, and maintained `@velocity-exchange/sdk` 0.17.0 establish a public Velocity source family and interface. Eleven pinned source records preserve classification, URL, commit or release, path, access date, exact-ID match, content hash, supported claims, and unsupported claims.

Current read-only account metadata was cached at RPC context slot 490041839. The upgradeable program points to ProgramData `HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7`; its current last-deploy slot is 488659528, upgrade authority is `8Z22ng8xW4AemtC9WdwxcZyWthnwVbQLbDfyuARCs122`, ProgramData length is 6,050,442 bytes, and executable SHA-256 is `89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c`. Program, ProgramData, all six shared writable accounts, and representative instruction-specific accounts retain owners, lengths, executable flags, and raw hashes. These are current snapshots, not historical state for the sampled slots.

Deployed correspondence is `source-family-only`. No verified build, release hash, SDK mapping, or reproducible deployment record connects the sampled executable to the pinned source. The pinned tree declares the Drift program ID and its verified-build record covers Drift, while the maintained exact Velocity verification status was false at access time.

## Instruction and role findings

The six occurrences contain:

- 18 Anchor `PostPythLazerOracleUpdate` instructions with discriminator `daedaaf5278fa621` and length 263;
- 18 Anchor `UpdatePerpBidAskTwap` instructions with discriminator `f717ff41d45addc2` and length 8;
- six 84-byte native-prefix discriminator-2 instructions.

The two Anchor discriminators and emitted names align with official source-family paths. The native branch supplies decisive contrary correspondence evidence: every observed successful instruction has five accounts, while the pinned source-family discriminator-2 handler requires at least six. Observed skip logs also use `<=` where the pinned source-family Pyth Lazer handler uses `<`.

Eighteen Ed25519 instructions contain 18 signatures. All references resolve, all 18 local verification checks pass, and the structures contain 54 cross-instruction references, one signer key, and six messages. These are structural facts, not signer-identity or application-semantic claims.

The account-role matrix separates observed signer/writable flags, source-family constraints and roles, source-family mutations, and deployed mutation truth. Every deployed shared-account mutation remains `unknown`. Therefore no valid-prestate semantic independence or commutativity result can be established.

## Evidence-based outcome

Decision: `identity-found-semantics-incomplete`.

Authoritative exact Velocity identity is established, but exact deployed code, the native instruction branch, shared-account state transitions, and semantic independence are insufficiently established. The actionability gate is closed. No semantic decoder, footprint, counterfactual model, runtime redesign, scheduling claim, throughput claim, or deployable proposal was added.

## New artifacts

Sourceability:

- `output/research/sourceability/sourceability-index.json`;
- `output/research/sourceability/sourceability-report.html`;
- `output/research/sourceability/program-family-map.json`.

Candidate #3:

- `output/research/candidate-043c938568ad5e15/candidate-dossier.json`;
- `candidate-dossier.html`;
- `candidate-evidence.ndjson`;
- `source-manifest.json`;
- `account-snapshots.json`;
- `instruction-layout.json`;
- `signer-message-summary.json`;
- `docs/research/CANDIDATE-043C938568AD5E15.md`.

The source/snapshot caches provide offline replay inputs. Complete raw block analyses stay external to the compact dossier.

## Preservation, verification, and visual QA

The Milestone 1.8 discovery replay remains 500/500 with 70 candidates, 19 high-priority candidates, and 20 materializations. Candidate #1 remains 25 exact occurrences, 59 transactions, 118 locally verified Ed25519 signatures, and `black-box-structure-only`. The nine-block loader case and all eight legacy artifact hashes remain byte-identical.

`npm run verify` passes strict compilation, all 125 deterministic tests, three fixture reports, the offline nine-block replay, offline 500-slot discovery replay, offline Candidate #1 dossier, offline Milestone 2.0 sourceability/Candidate #3 replay, legacy hash guards, and byte-identical handoff validation.

The preferred browser runtime exited during Windows sandbox startup. The established local Playwright/Chrome fallback rendered both reports at 1440x1000 and true 390x844 viewports. Both have zero page errors, zero console errors, zero invalid paragraph/list nesting, and document/body scroll widths equal to their viewport. Desktop and mobile captures for both reports were visually inspected; tables remain contained in intentional local scroll wrappers.

## Review boundary

Independent review is next. A later milestone may reconsider a decoder only if stronger deployed-code and exact mutation evidence closes the correspondence gap. Nothing was pushed.

Stop after Milestone 2.0.
