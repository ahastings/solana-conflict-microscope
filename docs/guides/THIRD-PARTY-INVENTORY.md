Current release decision (updated 2026-10-13): project code is licensed under [MIT](../../LICENSE), copyright 2026 ahastings, as selected on 2026-10-02. Upstream material retains its existing terms. The owner now requests v1.0 publication; final candidate verification and remote publication remain pending. Historical package counts and review results below identify their own revisions.

# Third-party material inventory

This inventory records local evidence for release preparation. The project LICENSE grants reuse rights for project code; this inventory does not replace upstream licenses or constitute a completed review of all source provenance and distribution terms.

## JavaScript dependencies

The current package-lock.json records these direct dependencies:

| Package | Locked version | Recorded license field |
| --- | --- | --- |
| @solana/kit | 8.0.0 | MIT |
| @types/node | 24.13.3 | MIT |
| tsx | 4.23.12 | MIT |
| typescript | 5.9.3 | Apache-2.0 |

These are lockfile metadata, not a substitute for each dependency's license text. The source preview excludes node_modules. npm installs the locked packages separately. Transitive packages and any future binary distribution require their own inventory; this table is not an exhaustive dependency list.

## Native research patches

The exported source includes tools/full-bundle-runtime/cross-instruction.patch and tools/milestone23-linux-runtime/mollusk-0.13.1-cross-instruction.patch. They modify harness/src/lib.rs in Mollusk and include surrounding upstream source lines. The native workflow pins Mollusk commit f292187b800be56447ac6047cc27d19a922b37a7; the prepared local runtime is under cache/native-full-bundle/mollusk.

The prepared runtime's Cargo.toml identifies https://github.com/anza-xyz/mollusk and points to its LICENSE file, which contains Apache License 2.0. A byte-for-byte copy is preserved as [Mollusk license](MOLLUSK-LICENSE.md). It records the upstream runtime's license; it is not the license for this whole project. The modifications supply complete transaction instruction data to the precompile verifier, as described in the included harness READMEs.

The source exporter excludes the runtime cache, Cargo build output, application ELF, and installed Rust dependencies. Cargo manifests and lockfiles remain included to identify native prerequisites. Native replay needs separately preserved inputs.

## Captured evidence and historical documentation

The 239-file source preview at 29d5156 includes 43 JSON files and 52 Markdown documents, along with TypeScript, native harness source, manifests, scripts, and patches. It contains no selected .so, .dll, .exe, .wasm, .bin, .png, or .jpg files. Its JSON includes public block fixtures and plans; synthetic data is separately labeled. These extension counts describe package contents, not a finding about rights in every file.

Historical documents retain source citations and scoped research claims. Public availability alone is not a completed provenance review. Review copied excerpts, fixture attribution, old workspace paths, and the exact selected files before publication. MIT licensing has since been selected. This inventory and the upstream license copy were added after the frozen 29d5156 ZIP; that ZIP remains unchanged.

## Historical preview review at 7cef44e

The candidate exported from 7cef44e contains 247 selected source files: 56 Markdown, 43 JSON, 130 TypeScript, three Cargo lockfiles, three TOML manifests, three Rust files, two shell scripts, two patches, and five extensionless files. It includes the Mollusk license copy described above and excludes installed dependency code and native binaries. Scoped scans found four historical generic Owner workspace paths and one intentionally fake credential URL in the RPC-redaction test; these were reviewed and retained. No private-key headers or long quoted secret assignments matched the scan. This is a bounded content check, not a guarantee about all possible secrets or all source provenance. Project licensing was undecided at that checkpoint; MIT was selected afterward. These counts and scans are not a verification of the final v1.0 package.
