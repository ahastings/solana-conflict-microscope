# Contributing

The most useful review starts with one question: can you reproduce a finding and understand what evidence supports it?

## First run

Use Node.js 22.12+ and npm. Run npm ci, then npm run verify:portable. Open output/demo/index.html and select a finding in a report. No RPC or wallet is needed for this workflow.

If a check fails, include the command, Node/npm versions, operating system, and the error. Do not share endpoint credentials, private keys, or unrelated personal files.

## Report a useful problem

Describe what you expected, what happened, and the smallest public fixture that reproduces it. Include fixture provenance and distinguish a captured block from constructed teaching data. For a mathematical claim, include the relevant transaction/account relationships and a witness or counterexample.

## Change the code

Keep TypeScript strict and dependencies modest. Test behavior that could change the analysis, not the wording of implementation details. Every conflict-free wave should satisfy the conflict rule. A lower bound is not an exact minimum unless a matching valid grouping establishes the upper bound.

Do not infer application semantics from account co-occurrence or log wording alone. Attribute identities, decoded roles, ownership, actor patterns, and actionability separately. Keep unknowns explicit and cite primary technical evidence for a new decoder.

The full historical research suite requires pinned evidence outside the portable source preview. Do not weaken it, rewrite historical hashes, or claim it passed after only running the portable suite. Review any change in a frozen artifact as a result change.

## Scope

Public read-only Solana analysis and education. No wallets, keys, transaction submission, trading, MEV extraction, private auctions, or validator-private schedule reconstruction. Do not add telemetry, paid dependencies, or external services as prerequisites for the offline tool.

## Licensing and release

Project code is available under the [MIT license](LICENSE), copyright 2026 ahastings. Third-party material retains its own terms; see the [inventory](docs/guides/THIRD-PARTY-INVENTORY.md). Publishing a release requires the project owner's explicit authorization. No donation service is configured.
