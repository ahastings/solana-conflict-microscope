import {runMilestone30} from "./milestone30.js";
const a=process.argv.slice(2),v=(n:string,d:string)=>{const i=a.indexOf(n);return i<0?d:a[i+1]!};
const r=await runMilestone30(v("--output-dir","output/research/candidate-queue-family-triage"),a.includes("--offline"));
console.log(`Milestone 3.0: ${r.queue.candidateCount} frozen candidates mapped; next is rank ${r.nextCandidate.discoveryRank} ${r.nextCandidate.candidateId}; dossier not started.`);
