import {runMilestone28} from "./milestone28.js";
const args=process.argv.slice(2),value=(n:string,d:string)=>{const i=args.indexOf(n);return i<0?d:args[i+1]!};
const r=await runMilestone28(value("--plan","research-plans/candidate-6-milestone-2.8.json"),value("--output-dir","output/research/candidate-b1cc5e297f33e545"),args.includes("--offline"));
console.log(`Milestone 2.8: rank ${r.dossier.discoveryRank} ${r.dossier.candidateId}; ${r.dossier.finalDisposition}; ${r.matrix.occurrences.length}/${r.matrix.occurrences.length} cached occurrences; ${r.attribution.summary.totalAtoms} atoms.`);
