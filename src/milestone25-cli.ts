import { runMilestone25 } from "./milestone25.js";
const args = process.argv.slice(2), value = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1] ?? fallback; };
const result = await runMilestone25(value("--plan", "research-plans/velocity-full-block-propagation-milestone-2.5.json"), value("--output-dir", "output/research/velocity-full-block-propagation"), args.includes("--offline"));
console.log(`Milestone 2.5: ${result.summary.fullBlocksReduced}/6 propagate; ${result.summary.maskedBlockCount}/6 masked; no validator scheduling or performance claim.`);
