import { runMilestone27 } from "./milestone27.js";
const args=process.argv.slice(2),value=(n:string,f:string)=>{const i=args.indexOf(n);return i<0?f:args[i+1]??f;};
const r=await runMilestone27(value("--plan","research-plans/candidate-5-milestone-2.7.json"),value("--output-dir","output/research/candidate-be8750c7a73d9c2c"),args.includes("--offline"));
console.log(`Milestone 2.7: rank ${r.dossier.discoveryRank} ${r.dossier.candidateId}; ${r.dossier.finalDisposition}; ${r.matrix.occurrences.length}/3 cached occurrences.`);
