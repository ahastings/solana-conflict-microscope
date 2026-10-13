# Draft v1.0 announcement

Draft, not posted. Version 1.0.0 is the planned first portable release. The source and demo destinations below have not been verified; check the published repository, release, and demo before using this copy. MIT was selected on 2026-10-02.

---

I built Solana Conflict Microscope to make declared account contention easier to inspect.

The v1.0 release is a local, read-only developer tool with offline examples and interactive HTML reports. Follow a shared writable account to the transactions it connects, inspect estimated conflict-free waves and their bounds, explore a range of blocks, compare two saved analyses, and export the evidence.

The bundled examples use captured public data and a separately labeled synthetic teaching case. After dependency installation, they run offline without an RPC account or wallet. Independent verification commands check declared block conflicts, connected components, wave coverage, bound witnesses, and saved comparison evidence.

Estimated waves describe potential parallelism under declared account locks. They do not reconstruct validator execution or measure a runtime speedup. Conditional models retain their assumptions, and native research remains separately scoped.

Feedback on a clean install, a useful report, or an explanation that exceeds its evidence would help. Please include a small reproducible example when possible.

Planned source: https://github.com/ahastings/solana-conflict-microscope

Planned demo: https://ahastings.github.io/solana-conflict-microscope/

License: MIT. Version: 1.0.0.

For the release notes, shorter copy, and bounded launch steps, see [V1-LAUNCH.md](V1-LAUNCH.md).
