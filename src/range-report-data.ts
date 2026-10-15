import type { CrossBlockPerBlockMetrics } from './range-types.js';
import type { CounterfactualModelResult } from './types.js';

/** Reuse exact repeated model arrays in HTML only; leave the exported analysis untouched. */
export function packRangePerBlocks(sequences: CrossBlockPerBlockMetrics[][]) {
  const groups: CounterfactualModelResult[][] = [], known = new Map<string,number>();
  const retainedAtoms: Array<{group:number;model:number}> = [];
  const references: Array<{sequence:number;block:number;full:number;component:number;ablation:number|null}> = [];
  const intern = (models: CounterfactualModelResult[]): number => {
    const key = JSON.stringify(models), existing = known.get(key);
    if (existing !== undefined) return existing;
    const group = groups.length; known.set(key,group);
    groups.push(models.map((model,index) => {
      if (!model.conflictAtoms.length || JSON.stringify(model.conflictAtoms) !== JSON.stringify(model.retainedConflictAtoms)) return model;
      retainedAtoms.push({group,model:index});return {...model,retainedConflictAtoms:[]};
    }));
    return group;
  };
  const blocks = sequences.map((items,sequence) => items.map((item,block) => {
    references.push({sequence,block,full:intern(item.counterfactualModels),component:intern(item.componentCounterfactualModels),ablation:item.componentCausalAblation ? intern(item.componentCausalAblation.models) : null});
    return {...item,counterfactualModels:[],componentCounterfactualModels:[],componentCausalAblation:item.componentCausalAblation ? {...item.componentCausalAblation,models:[]} : null};
  }));
  return {blocks,groups,retainedAtoms,references};
}

export const rangeReportHydrationScript = `const view=rangeData.view;
for(const ref of rangeData.retainedAtoms){const model=rangeData.groups[ref.group][ref.model];model.retainedConflictAtoms=model.conflictAtoms}
for(const ref of rangeData.references){const block=view.sequences[ref.sequence].perBlock[ref.block];block.counterfactualModels=rangeData.groups[ref.full];block.componentCounterfactualModels=rangeData.groups[ref.component];if(ref.ablation!==null)block.componentCausalAblation.models=rangeData.groups[ref.ablation]}`;
