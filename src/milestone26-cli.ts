import { runMilestone26 } from "./milestone26.js";
const args=process.argv.slice(2), value=(name:string,fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]??fallback;};
const result=await runMilestone26(value("--plan","research-plans/candidate-4-milestone-2.6.json"),value("--output-dir","output/research/candidate-df7d92f4a2196698"),args.includes("--offline"));
console.log(`Milestone 2.6: rank ${result.dossier.discoveryRank} ${result.dossier.candidateId}; ${result.dossier.finalDisposition}; ${result.matrix.occurrences.length}/4 cached occurrences.`);
