import { resolve } from "node:path";
import { runMilestone24 } from "./milestone24.js";
const args = process.argv.slice(2);
const value = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? fallback) : fallback; };
const result = await runMilestone24(value("--plan", "research-plans/velocity-equality-dependency-milestone-2.4.json"), value("--output-dir", "output/research/velocity-equality-dependency"), args.includes("--offline"));
console.log(`Milestone 2.4: ${result.model.outcome}; six observed components; joint semantic dependency layers 3; no validator scheduling claim.`);
