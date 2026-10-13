# Draft technical review request

This is a draft for the owner to send after reviewing the source release. Project code is licensed under MIT. No message has been sent; choose the recipient and confirm the published source/demo links before using this request.

---

I am building Solana Conflict Microscope, a local read-only tool for explaining declared account contention. I would value a small technical review rather than an endorsement.

The portable demo uses captured devnet blocks and one clearly labeled synthetic teaching example. It separates conflict-pair count, known compute, estimated waves, and decoded account roles. It does not reconstruct validator scheduling or claim a deployable performance improvement.

The research archive contains separately scoped Velocity experiments. The historical full producer fails at TWAP and rolls back. A newer captured executable succeeds for one constructed producer/equality-consumer fixture in both consumer orders, but making all three consumer oracle declarations read-only is rejected with AccountNotMutable. Thus identical output state does not establish a safe declaration change or a performance gain. The [evidence map](EVIDENCE-MAP.md) separates those results and their reproduction requirements.

Could you help answer three separate questions?

1. Can you install the supplied source and run the documented offline commands without our working caches?
2. Do the conflict rule, evidence attribution, wave bounds, and conditional-model assumptions support the stated results? A concrete counterexample is especially helpful.
3. Would the report help you investigate an application? Which question would you want it to answer next?

Useful feedback can be a short written note with your platform, command, example, and the point where the reasoning or interface became unclear. We will keep corrections visible and do not need a call.
