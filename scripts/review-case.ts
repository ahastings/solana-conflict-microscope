import { parseReviewerArgs, REVIEWER_USAGE } from "../src/reviewer-options.js";
import { resolve } from "node:path";
import { runReviewer } from "../src/reviewer.js";

const { help, options } = parseReviewerArgs(process.argv.slice(2));
if (help) { console.log(REVIEWER_USAGE); process.exit(0); }
const result = await runReviewer(options);
console.log(`Reviewed ${result.summary.observedBlocks} pinned public blocks; conditional full-block depth changes in ${result.summary.conditionalFullBlocksReduced}. Whole-transaction semantics remain unproven; no native execution.\nReports: ${resolve(options.outputDirectory ?? "output/reviewer", "review.html")}`);
