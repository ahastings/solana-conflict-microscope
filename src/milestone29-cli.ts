import {runMilestone29} from "./milestone29.js";
const a=process.argv.slice(2),v=(n:string,d:string)=>{const i=a.indexOf(n);return i<0?d:a[i+1]!};
const r=await runMilestone29(v("--plan","research-plans/candidate-7-milestone-2.9.json"),v("--output-dir","output/research/candidate-305e6177058fbf49"),a.includes("--offline"));
console.log(`Milestone 2.9: rank 7 ${r.dossier.candidateId}; ${r.dossier.finalDisposition}; 1/1 cached occurrence; ${r.attribution.summary.totalAtoms} atoms.`);
