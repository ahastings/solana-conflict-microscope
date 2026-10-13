import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { normalizeBlock } from "../src/normalize.js";
import { analyzeBlock, buildConflictData } from "../src/analyze.js";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--full")) {
  throw new Error("Usage: npm run benchmark:conflicts -- [--full]");
}
const full = args[0] === "--full";
const results = [];
for (const profile of ["independent", "shared-writer", "overlapping"]) {
  const transactions = Array.from({ length: 240 }, (_, index) => ({
    transaction: {
      signatures: ["synthetic-" + index],
      message: {
        accountKeys: [
          { pubkey: "P" + index, signer: true, writable: true },
          ...Array.from({ length: 8 }, (_, j) => ({ pubkey: "Private" + index + "-" + j, signer: false, writable: j % 2 === 0 })),
          ...(profile === "independent" ? [] : [{ pubkey: "Shared", signer: false, writable: index % 3 === 0 }]),
          ...(profile === "overlapping" ? [{ pubkey: "Group" + (index % 4), signer: false, writable: true }] : []),
        ],
        instructions: [],
      },
    },
    meta: { err: null, fee: 0 },
  }));
  const block = { blockhash: "synthetic", previousBlockhash: "synthetic", parentSlot: 0, transactions };
  const normalized = normalizeBlock(block, 1);
  const elapsed = [];
  let data;
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    data = full ? analyzeBlock(block, 1, "fixture") : buildConflictData(normalized);
    elapsed.push(performance.now() - start);
  }
  results.push({
    profile, transactions: 240, accounts: data!.accounts.length,
    edges: "conflictEdges" in data! ? data.conflictEdges.length : data!.edges.length,
    milliseconds: elapsed,
    sha256: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  });
}
console.log(JSON.stringify({
  node: process.version, platform: process.platform,
  scope: full ? "Full analysis including normalization and counterfactuals; synthetic inputs; no HTML or RPC"
    : "Conflict graph and account-summary construction only; synthetic inputs",
  results,
}, null, 2));