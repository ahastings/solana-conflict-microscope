import type { Analysis, CounterfactualModelResult } from "./types.js";

export interface PackedReportAnalysis {
  analysis: Analysis;
  dominantComponentIndex: number | null;
  componentModelReferences: number[];
  retainedAtomReferences: Array<{ componentIndex: number | null; modelIndex: number }>;
}

/** Deduplicate only exact repeated values; preserve independently supplied evidence. */
export function packReportAnalysis(analysis: Analysis): PackedReportAnalysis {
  const index = analysis.dominantComponent === null ? -1 : analysis.componentMeanings.findIndex(component => component.componentId === analysis.dominantComponent!.componentId);
  const dominantComponentIndex = index >= 0 && JSON.stringify(analysis.componentMeanings[index]) === JSON.stringify(analysis.dominantComponent) ? index : null;
  const componentModelReferences: number[] = [], retainedAtomReferences: PackedReportAnalysis["retainedAtomReferences"] = [];
  const models = (items: CounterfactualModelResult[], componentIndex: number | null) => items.map((model, modelIndex) => {
    if (!model.conflictAtoms.length || JSON.stringify(model.conflictAtoms) !== JSON.stringify(model.retainedConflictAtoms)) return model;
    retainedAtomReferences.push({ componentIndex, modelIndex });
    return { ...model, retainedConflictAtoms: [] };
  });
  const componentMeanings = analysis.componentMeanings.map((component, componentIndex) => {
    const shared = JSON.stringify(component.causalAblation.models) === JSON.stringify(component.counterfactualModels);
    if (shared) componentModelReferences.push(componentIndex);
    return {
      ...component, counterfactualModels: models(component.counterfactualModels, componentIndex),
      causalAblation: shared ? { ...component.causalAblation, models: [] } : component.causalAblation,
    };
  });
  return { analysis: { ...analysis, componentMeanings, counterfactualModels: models(analysis.counterfactualModels, null), dominantComponent: dominantComponentIndex === null ? analysis.dominantComponent : null }, dominantComponentIndex, componentModelReferences, retainedAtomReferences };
}

// Executed before report interaction. Restore arrays before component aliases.
export const reportDataHydrationScript = `const a=reportData.analysis;
for(const reference of reportData.retainedAtomReferences){const models=reference.componentIndex===null?a.counterfactualModels:a.componentMeanings[reference.componentIndex].counterfactualModels;const model=models[reference.modelIndex];model.retainedConflictAtoms=model.conflictAtoms}
for(const index of reportData.componentModelReferences){const component=a.componentMeanings[index];component.causalAblation.models=component.counterfactualModels}
if(reportData.dominantComponentIndex!==null)a.dominantComponent=a.componentMeanings[reportData.dominantComponentIndex];`;
