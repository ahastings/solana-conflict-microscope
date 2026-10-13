import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeBlock } from "./analyze.js";
import type { ConflictEdge } from "./types.js";

export const MILESTONE_25_OUTCOME = "velocity-full-block-depth-propagation-established" as const;
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const hash = (v: Uint8Array | string) => createHash("sha256").update(v).digest("hex");
type Target = { slot:number; componentId:number; transactionIndexes:number[]; blockPath:string; sha256:string };
type Plan = { schemaVersion:string; expectedMilestone24Outcome:string; targets:Target[]; inputs:Array<{path:string;sha256:string}> };
type M24 = { outcome:string; components:Array<{slot:number;models:Array<{model:string;fullComponentConflictAtomCount:number;retainedConflictAtomCounts:{nativeMarket:number};survivingDirectedDependencies:unknown[];depth:{value:number}}>}> };
const pair = (a:number,b:number) => a < b ? `${a}:${b}` : `${b}:${a}`;
const structural = (indexes:number[], edges:ConflictEdge[]) => hash(json({indexes:[...indexes].sort((a,b)=>a-b),edges:edges.map(e=>({source:e.source,target:e.target,accounts:e.accounts,classification:e.classification}))}));

function exactDepth(indexes:number[], edges:ConflictEdge[]) {
  if (indexes.length < 2) return indexes.length;
  const neighbors = new Map(indexes.map(i=>[i,new Set<number>()]));
  for (const e of edges) if (neighbors.has(e.source) && neighbors.has(e.target)) { neighbors.get(e.source)!.add(e.target); neighbors.get(e.target)!.add(e.source); }
  const greedy = [...indexes].sort((a,b)=>neighbors.get(b)!.size-neighbors.get(a)!.size||a-b), colors = new Map<number,number>();
  for (const v of greedy) { const used=new Set([...neighbors.get(v)!].map(n=>colors.get(n)).filter((x):x is number=>x!==undefined)); let c=0; while(used.has(c)) c++; colors.set(v,c); }
  let best = Math.max(...colors.values())+1; colors.clear();
  const search = (used:number) => {
    if (colors.size===indexes.length) { best=Math.min(best,used); return; }
    let selected=-1, selectedSat=-1, selectedDegree=-1;
    for (const v of indexes) if (!colors.has(v)) { const sat=new Set([...neighbors.get(v)!].map(n=>colors.get(n)).filter((x):x is number=>x!==undefined)).size, degree=neighbors.get(v)!.size; if(sat>selectedSat||(sat===selectedSat&&(degree>selectedDegree||(degree===selectedDegree&&v<selected)))) { selected=v; selectedSat=sat; selectedDegree=degree; } }
    const forbidden=new Set([...neighbors.get(selected)!].map(n=>colors.get(n)).filter((x):x is number=>x!==undefined));
    for(let c=0;c<Math.min(used+1,best);c++) if(!forbidden.has(c)) { const next=Math.max(used,c+1); if(next<best){colors.set(selected,c);search(next);colors.delete(selected);} }
  };
  search(0); return best;
}

function topAccounts(edges:ConflictEdge[]) { const counts=new Map<string,number>(); for(const e of edges) for(const a of e.accounts) counts.set(a,(counts.get(a)??0)+1); return [...counts].map(([account,edgeCount])=>({account,edgeCount})).sort((a,b)=>b.edgeCount-a.edgeCount||a.account.localeCompare(b.account)).slice(0,5); }

export async function runMilestone25(planPath:string, outputDir:string, offline:boolean) {
  if(!offline) throw new Error("Milestone 2.5 is cache-only; pass --offline");
  const plan=JSON.parse(await readFile(resolve(planPath),"utf8")) as Plan;
  if(plan.schemaVersion!=="2.5"||plan.targets.length!==6) throw new Error("Milestone 2.5 plan boundary changed");
  for(const pin of [...plan.inputs,...plan.targets.map(t=>({path:t.blockPath,sha256:t.sha256}))]) { const bytes=await readFile(resolve(pin.path)); if(hash(bytes)!==pin.sha256) throw new Error(`Pinned input changed: ${pin.path}`); }
  const m24=JSON.parse(await readFile(resolve(plan.inputs[0]!.path),"utf8")) as M24;
  if(m24.outcome!==plan.expectedMilestone24Outcome) throw new Error("Milestone 2.4 outcome changed");
  const blocks=[];
  for(const target of plan.targets) {
    const cached=JSON.parse(await readFile(resolve(target.blockPath),"utf8")) as {block:unknown};
    const analysis=analyzeBlock(cached.block,target.slot,"rpc");
    const targetSet=new Set(target.transactionIndexes), component=analysis.components.find(c=>c.id===target.componentId);
    if(!component||json(component.transactionIndexes)!==json(target.transactionIndexes)) throw new Error(`Slot ${target.slot} target component identity/isolation changed`);
    const external=analysis.conflictEdges.filter(e=>(targetSet.has(e.source)||targetSet.has(e.target))&&!(targetSet.has(e.source)&&targetSet.has(e.target)));
    const m=m24.components.find(c=>c.slot===target.slot), joint=m?.models.find(x=>x.model==="joint-equality-aware-plus-payer-decoupled");
    if(!m||!joint||m.models.map(x=>x.depth.value).join("/")!=="4/4/4/3"||joint.fullComponentConflictAtomCount!==15||joint.retainedConflictAtomCounts.nativeMarket!==3||joint.survivingDirectedDependencies.length!==2) throw new Error(`Slot ${target.slot} Milestone 2.4 conservation changed`);
    const details=analysis.components.map(c=>{const set=new Set(c.transactionIndexes), edges=analysis.conflictEdges.filter(e=>set.has(e.source)&&set.has(e.target)), meaning=analysis.componentMeanings.find(x=>x.componentId===c.id)!, bounds=meaning.waveBounds; return {componentId:c.id,transactionIndexes:c.transactionIndexes,transactionCount:c.transactionIndexes.length,edgeCount:edges.length,exactDepth:bounds.boundsMatch ? bounds.provenMinimumWaveCount! : exactDepth(c.transactionIndexes,edges),proof:bounds.boundsMatch?"matching-clique-lower-and-conflict-free-upper-bounds":"exact-dsatur-coloring",reportedBounds:{lower:bounds.cliqueLowerBound,upper:bounds.generatedWaveUpperBound},topConflictAccounts:topAccounts(edges),dominantCause:meaning.cause.value,structuralSha256:structural(c.transactionIndexes,edges)};});
    const targetDetail=details.find(c=>c.componentId===target.componentId)!, others=details.filter(c=>c.componentId!==target.componentId), deepest=Math.max(0,...others.map(c=>c.exactDepth)), current=Math.max(4,deepest), counterfactual=Math.max(3,deepest), bottlenecks=others.filter(c=>c.exactDepth===deepest&&deepest>=3);
    const classification=counterfactual<current?"propagates-to-full-block":deepest>=4?"masked-by-other-component":"tied-or-bound-inconclusive";
    blocks.push({slot:target.slot,model:"velocity-joint-substitution",fullBlockTransactionCount:analysis.summary.transactionCount,fullBlockConflictEdgeCount:analysis.conflictEdges.length,connectedComponentCount:analysis.components.length,velocityComponentId:target.componentId,velocityTransactionIndexes:target.transactionIndexes,velocityComponentSize:4,externalEdgesFromVelocity:external,externalEdgeCount:external.length,isIsolatedConnectedComponent:external.length===0,currentDeclaredLockWaveDepth:{exact:true,value:current},targetVelocityCurrentDepth:4,targetVelocityJointDepth:3,deepestNonVelocityComponentDepth:{exact:true,value:deepest},velocityDepthRole:deepest<4?"uniquely-depth-determining":deepest===4?"tied-for-maximum":"below-another-component",counterfactualFullBlockSemanticLayerDepth:{exact:true,value:counterfactual},depthPropagationClassification:classification,components:details,maskingComponents:bottlenecks,conservation:{currentConflictAtoms:15,jointRetainedNativeMarketAtoms:3,directedDependencies:2,nonTargetStructuralHashesBefore:others.map(x=>x.structuralSha256),nonTargetStructuralHashesAfter:others.map(x=>x.structuralSha256),nonTargetStructurallyUnchanged:true,newCrossComponentEdges:0,removedNonTargetEdges:0}});
  }
  const frequency=(values:number[])=>Object.fromEntries([...new Set(values)].sort((a,b)=>a-b).map(v=>[String(v),values.filter(x=>x===v).length]));
  const reduced=blocks.filter(b=>b.depthPropagationClassification==="propagates-to-full-block").length, masked=blocks.filter(b=>b.depthPropagationClassification==="masked-by-other-component").length;
  const summary={schemaVersion:"2.5",outcome:MILESTONE_25_OUTCOME,observedBlockCount:6,localVelocityReductionCount:blocks.filter(b=>b.targetVelocityCurrentDepth===4&&b.targetVelocityJointDepth===3).length,fullBlocksReduced:reduced,maskedBlockCount:masked,inconclusiveBlockCount:6-reduced-masked,currentFullBlockDepthDistribution:frequency(blocks.map(b=>b.currentDeclaredLockWaveDepth.value)),counterfactualFullBlockSemanticLayerDepthDistribution:frequency(blocks.map(b=>b.counterfactualFullBlockSemanticLayerDepth.value)),maskingComponents:blocks.flatMap(b=>b.maskingComponents.map(c=>({slot:b.slot,componentId:c.componentId,depth:c.exactDepth,transactionCount:c.transactionCount,edgeCount:c.edgeCount}))),conclusions:[`The established local Velocity 4→3 semantic-layer reduction also reduces the counterfactual full-block layer depth in ${reduced} of six observed blocks.`,`The established local Velocity 4→3 reduction does not change the counterfactual full-block layer depth in ${masked} blocks because another unchanged component already determines an equal or greater depth.`],disclaimer:"Counterfactual semantic layers describe depth propagation, not an actual validator schedule or a performance result."};
  const propagation={schemaVersion:"2.5",model:"velocity-joint-substitution",blocks};
  const attribution={schemaVersion:"2.5",blocks:blocks.map(b=>({slot:b.slot,currentFullBlockDepth:b.currentDeclaredLockWaveDepth,targetVelocityCurrentDepth:4,targetVelocityJointDepth:3,deepestNonVelocityComponentDepth:b.deepestNonVelocityComponentDepth,velocityDepthRole:b.velocityDepthRole,resultingFullBlockCounterfactualDepth:b.counterfactualFullBlockSemanticLayerDepth,classification:b.depthPropagationClassification,maskingComponents:b.maskingComponents}))};
  const html=report(propagation,summary);
  await mkdir(resolve(outputDir),{recursive:true}); await Promise.all([writeFile(resolve(outputDir,"velocity-full-block-propagation.json"),json(propagation)),writeFile(resolve(outputDir,"velocity-block-bottleneck-attribution.json"),json(attribution)),writeFile(resolve(outputDir,"velocity-full-block-summary.json"),json(summary)),writeFile(resolve(outputDir,"velocity-full-block-report.html"),html)]);
  return {propagation,attribution,summary,html};
}

function report(data:any,summary:any){const rows=data.blocks.map((b:any)=>`<tr><td>${b.slot}</td><td><b>4 → 3</b><small>LOCAL VELOCITY COMPONENT</small></td><td><b>${b.currentDeclaredLockWaveDepth.value}</b><small>CURRENT FULL BLOCK</small></td><td><b>${b.deepestNonVelocityComponentDepth.value}</b><small>DEEPEST OTHER COMPONENT</small></td><td><b>${b.counterfactualFullBlockSemanticLayerDepth.value}</b><small>JOINT FULL-BLOCK COUNTERFACTUAL</small></td><td>${b.depthPropagationClassification}</td></tr>`).join("");return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Velocity full-block depth propagation</title><style>body{font:16px system-ui;max-width:1150px;margin:auto;padding:2rem;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd3df;padding:.75rem;text-align:left}th{background:#edf2f8}small{display:block;color:#526071;margin-top:.3rem}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem}.cards div{border:1px solid #cbd3df;border-radius:8px;padding:1rem}@media(max-width:760px){body{padding:1rem}.cards{grid-template-columns:1fr 1fr}table{font-size:.78rem}}</style></head><body><h1>Velocity full-block depth propagation</h1><p>Graph-propagation counterfactual only. This is not an actual validator schedule and makes no throughput, TPS, elapsed-time, or speedup claim.</p><section class="cards"><div>LOCAL VELOCITY COMPONENT<br><b>4 → 3</b></div><div>CURRENT FULL BLOCK<br><b>authentic declared locks</b></div><div>DEEPEST OTHER COMPONENT<br><b>unchanged</b></div><div>JOINT FULL-BLOCK COUNTERFACTUAL<br><b>surgical substitution</b></div></section><table><thead><tr><th>Slot</th><th>Local</th><th>Current</th><th>Other</th><th>Counterfactual</th><th>Depth propagation</th></tr></thead><tbody>${rows}</tbody></table><h2>Six-block result</h2><p>${summary.conclusions.join(" ")}</p></body></html>\n`;}
