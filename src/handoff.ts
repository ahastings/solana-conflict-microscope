export const MILESTONE_17_HEADER = "# Milestone 1.7 handoff";
export const MILESTONE_17_STOP = "Stop after Milestone 1.7.";

export function validateMilestone17Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 1.7 handoffs are not byte-identical.");
  if (!root.startsWith(`${MILESTONE_17_HEADER}\n`) && !root.startsWith(`${MILESTONE_17_HEADER}\r\n`)) errors.push(`Root handoff must begin exactly with '${MILESTONE_17_HEADER}'.`);
  if (!/Semantic Lock Footprints and Causal Ablation/.test(root)) errors.push("Root handoff does not describe Semantic Lock Footprints and Causal Ablation.");
  if (!/143fa53/.test(root)) errors.push("Root handoff does not record Milestone 1.6 base commit 143fa53.");
  if (/# Milestone 1\.5\.1 handoff|Stop after Milestone 1\.5\.1\./.test(root)) errors.push("Root handoff retains a stale Milestone 1.5.1 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_17_STOP) errors.push(`Root handoff must end with '${MILESTONE_17_STOP}'.`);
  return errors;
}

export const MILESTONE_171_HEADER = "# Milestone 1.7.1 handoff";
export const MILESTONE_171_STOP = "Stop after Milestone 1.7.1.";

export function validateMilestone171Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 1.7.1 handoffs are not byte-identical.");
  if (!root.startsWith(`${MILESTONE_171_HEADER}\n`) && !root.startsWith(`${MILESTONE_171_HEADER}\r\n`)) errors.push(`Root handoff must begin exactly with '${MILESTONE_171_HEADER}'.`);
  if (!/Role-Preserving Ablation and Interaction Surface/.test(root)) errors.push("Root handoff does not describe Role-Preserving Ablation and Interaction Surface.");
  if (!/b920b9d/.test(root)) errors.push("Root handoff does not record Milestone 1.7 base commit b920b9d.");
  if (/^# Milestone 1\.7 handoff\r?$|^Stop after Milestone 1\.7\.\r?$/m.test(root)) errors.push("Root handoff retains a stale Milestone 1.7 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_171_STOP) errors.push(`Root handoff must end with '${MILESTONE_171_STOP}'.`);
  return errors;
}

export const MILESTONE_172_HEADER = "# Milestone 1.7.2 handoff";
export const MILESTONE_172_STOP = "Stop after Milestone 1.7.2.";

export function validateMilestone172Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 1.7.2 handoffs are not byte-identical.");
  if (!root.startsWith(`${MILESTONE_172_HEADER}\n`) && !root.startsWith(`${MILESTONE_172_HEADER}\r\n`)) errors.push(`Root handoff must begin exactly with '${MILESTONE_172_HEADER}'.`);
  if (!/Conflict-Atom Attribution and Ordering Truth/.test(root)) errors.push("Root handoff does not describe Conflict-Atom Attribution and Ordering Truth.");
  if (!/ef0b039/.test(root)) errors.push("Root handoff does not record Milestone 1.7.1 base commit ef0b039.");
  if (/^# Milestone 1\.7\.1 handoff\r?$|^Stop after Milestone 1\.7\.1\.\r?$/m.test(root)) errors.push("Root handoff retains a stale Milestone 1.7.1 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_172_STOP) errors.push(`Root handoff must end with '${MILESTONE_172_STOP}'.`);
  return errors;
}

export const MILESTONE_173_HEADER = "# Milestone 1.7.3 handoff";
export const MILESTONE_173_STOP = "Stop after Milestone 1.7.3.";

export function validateMilestone173Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 1.7.3 handoffs are not byte-identical.");
  if (!root.startsWith(`${MILESTONE_173_HEADER}\n`) && !root.startsWith(`${MILESTONE_173_HEADER}\r\n`)) errors.push(`Root handoff must begin exactly with '${MILESTONE_173_HEADER}'.`);
  if (!/Interaction Taxonomy and Empty-State Truth/.test(root)) errors.push("Root handoff does not describe Interaction Taxonomy and Empty-State Truth.");
  if (!/67141d1/.test(root)) errors.push("Root handoff does not record Milestone 1.7.2 base commit 67141d1.");
  if (/^# Milestone 1\.7\.2 handoff\r?$|^Stop after Milestone 1\.7\.2\.\r?$/m.test(root)) errors.push("Root handoff retains a stale Milestone 1.7.2 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_173_STOP) errors.push(`Root handoff must end with '${MILESTONE_173_STOP}'.`);
  return errors;
}

export const MILESTONE_18_HEADER = "# Milestone 1.8 handoff";
export const MILESTONE_18_STOP = "Stop after Milestone 1.8.";

export function validateMilestone18Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 1.8 handoffs are not byte-identical.");
  if (!root.startsWith(`${MILESTONE_18_HEADER}\n`) && !root.startsWith(`${MILESTONE_18_HEADER}\r\n`)) errors.push(`Root handoff must begin exactly with '${MILESTONE_18_HEADER}'.`);
  if (!/Candidate Hunt and Two-Stage Materialization/.test(root)) errors.push("Root handoff does not describe Candidate Hunt and Two-Stage Materialization.");
  if (!/1fd30e5/.test(root)) errors.push("Root handoff does not record Milestone 1.7.3 base commit 1fd30e5.");
  if (/^# Milestone 1\.7\.3 handoff\r?$|^Stop after Milestone 1\.7\.3\.\r?$/m.test(root)) errors.push("Root handoff retains a stale Milestone 1.7.3 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_18_STOP) errors.push(`Root handoff must end with '${MILESTONE_18_STOP}'.`);
  return errors;
}

export const MILESTONE_19_HEADER = "# Milestone 1.9 handoff";
export const MILESTONE_19_STOP = "Stop after Milestone 1.9.";

export function validateMilestone19Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 1.9 handoffs are not byte-identical.");
  if (!root.startsWith(`${MILESTONE_19_HEADER}\n`) && !root.startsWith(`${MILESTONE_19_HEADER}\r\n`)) errors.push(`Root handoff must begin exactly with '${MILESTONE_19_HEADER}'.`);
  if (!/Candidate #1 Identity and Semantic Dossier/.test(root)) errors.push("Root handoff does not describe Candidate #1 Identity and Semantic Dossier.");
  if (!/be3fded/.test(root)) errors.push("Root handoff does not record Milestone 1.8 base commit be3fded.");
  if (!/candidate-ff30780de8479976/.test(root)) errors.push("Root handoff does not identify the researched candidate.");
  if (!/black-box-structure-only/.test(root)) errors.push("Root handoff does not record the evidence-based dossier outcome.");
  if (/^# Milestone 1\.8 handoff\r?$|^Stop after Milestone 1\.8\.\r?$/m.test(root)) errors.push("Root handoff retains a stale Milestone 1.8 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_19_STOP) errors.push(`Root handoff must end with '${MILESTONE_19_STOP}'.`);
  return errors;
}

export const MILESTONE_20_HEADER = "# Milestone 2.0 handoff";
export const MILESTONE_20_STOP = "Stop after Milestone 2.0.";

export function validateMilestone20Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 2.0 handoffs are not byte-identical.");
  if (!root.startsWith(`${MILESTONE_20_HEADER}\n`) && !root.startsWith(`${MILESTONE_20_HEADER}\r\n`)) errors.push(`Root handoff must begin exactly with '${MILESTONE_20_HEADER}'.`);
  if (!/Sourceability Triage and Velocity Semantic Dossier/.test(root)) errors.push("Root handoff does not describe Sourceability Triage and Velocity Semantic Dossier.");
  if (!/afec9ae/.test(root)) errors.push("Root handoff does not record Milestone 1.9 base commit afec9ae.");
  if (!/candidate-043c938568ad5e15/.test(root)) errors.push("Root handoff does not identify the researched candidate.");
  if (!/identity-found-semantics-incomplete/.test(root)) errors.push("Root handoff does not record the evidence-based dossier outcome.");
  if (/^# Milestone 1\.9 handoff\r?$|^Stop after Milestone 1\.9\.\r?$/m.test(root)) errors.push("Root handoff retains a stale Milestone 1.9 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_20_STOP) errors.push(`Root handoff must end with '${MILESTONE_20_STOP}'.`);
  return errors;
}

export const MILESTONE_21_HEADER = "# Milestone 2.1 handoff";
export const MILESTONE_21_STOP = "Stop after Milestone 2.1.";

export function validateMilestone21Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 2.1 handoffs are not byte-identical.");
  if (!root.startsWith(MILESTONE_21_HEADER + "\n") && !root.startsWith(MILESTONE_21_HEADER + "\r\n")) errors.push("Root handoff must begin exactly with '" + MILESTONE_21_HEADER + "'.");
  if (!/Velocity Deployed-Binary Archaeology and Historical Source Correspondence/.test(root)) errors.push("Root handoff does not describe Velocity Deployed-Binary Archaeology and Historical Source Correspondence.");
  if (!/532f256/.test(root)) errors.push("Root handoff does not record Milestone 2.0 base commit 532f256.");
  if (!/sample-binary-continuity-established/.test(root)) errors.push("Root handoff does not record the continuity result.");
  if (!/variant-level-strong-correspondence/.test(root)) errors.push("Root handoff does not record the evidence-based correspondence outcome.");
  if (/^# Milestone 2\.0 handoff\r?$|^Stop after Milestone 2\.0\.\r?$/m.test(root)) errors.push("Root handoff retains a stale Milestone 2.0 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_21_STOP) errors.push("Root handoff must end with '" + MILESTONE_21_STOP + "'.");
  return errors;
}

export const MILESTONE_22_HEADER = "# Milestone 2.2 handoff";
export const MILESTONE_22_STOP = "Stop after Milestone 2.2.";

export function validateMilestone22Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 2.2 handoffs are not byte-identical.");
  if (!root.startsWith(MILESTONE_22_HEADER + "\n") && !root.startsWith(MILESTONE_22_HEADER + "\r\n")) errors.push("Root handoff must begin exactly with '" + MILESTONE_22_HEADER + "'.");
  if (!/Velocity Anchor Bundle Semantics and Repeated-Update Proof/.test(root)) errors.push("Root handoff does not describe Velocity Anchor Bundle Semantics and Repeated-Update Proof.");
  if (!/7d3399d/.test(root)) errors.push("Root handoff does not record Milestone 2.1 base commit 7d3399d.");
  if (!/repeated-update-structure-established-semantics-incomplete/.test(root)) errors.push("Root handoff does not record the evidence-based Milestone 2.2 outcome.");
  if (!/native-prefix-discriminator-2.*unresolved|native discriminator-2.*unresolved/is.test(root)) errors.push("Root handoff does not preserve the native discriminator-2 unresolved boundary.");
  if (/^# Milestone 2\.1 handoff\r?$|^Stop after Milestone 2\.1\.\r?$/m.test(root)) errors.push("Root handoff retains a stale Milestone 2.1 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_22_STOP) errors.push("Root handoff must end with '" + MILESTONE_22_STOP + "'.");
  return errors;
}

export const MILESTONE_23_HEADER = "# Milestone 2.3 handoff";
export const MILESTONE_23_STOP = "Stop after Milestone 2.3.";

export function validateMilestone23Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 2.3 handoffs are not byte-identical.");
  if (!root.startsWith(MILESTONE_23_HEADER + "\n") && !root.startsWith(MILESTONE_23_HEADER + "\r\n")) errors.push("Root handoff must begin exactly with '" + MILESTONE_23_HEADER + "'.");
  if (!/Velocity Exact-Binary Equality-Branch Replay and State-Diff Proof/.test(root)) errors.push("Root handoff does not describe Velocity Exact-Binary Equality-Branch Replay and State-Diff Proof.");
  if (!/b5c832f/.test(root)) errors.push("Root handoff does not record Linux continuation base commit b5c832f.");
  if (!/equality-branch-byte-identical-established/.test(root)) errors.push("Root handoff does not record the evidence-based Milestone 2.3 outcome.");
  if (!/native-prefix-discriminator-2.*unresolved|native discriminator-2.*unresolved/is.test(root)) errors.push("Root handoff does not preserve the native discriminator-2 unresolved boundary.");
  if (/^# Milestone 2\.2 handoff\r?$|^Stop after Milestone 2\.2\.\r?$/m.test(root)) errors.push("Root handoff retains a stale Milestone 2.2 identifier or stop boundary.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_23_STOP) errors.push("Root handoff must end with '" + MILESTONE_23_STOP + "'.");
  return errors;
}

export const MILESTONE_24_HEADER = "# Milestone 2.4 handoff";
export const MILESTONE_24_STOP = "Stop after Milestone 2.4.";

export function validateMilestone24Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 2.4 handoffs are not byte-identical.");
  if (!root.startsWith(MILESTONE_24_HEADER + "\n") && !root.startsWith(MILESTONE_24_HEADER + "\r\n")) errors.push(`Root handoff must begin exactly with '${MILESTONE_24_HEADER}'.`);
  if (!/Velocity Equality-Aware Dependency Model and Joint Causal Ablation/.test(root)) errors.push("Root handoff does not describe Milestone 2.4.");
  if (!/8befaeb/.test(root)) errors.push("Root handoff does not record base commit 8befaeb.");
  if (!/observed-order-equality-dependency-and-joint-ablation-established/.test(root)) errors.push("Root handoff does not record the Milestone 2.4 outcome.");
  if (!/native-prefix-discriminator-2.*unresolved/is.test(root)) errors.push("Root handoff does not preserve native discriminator 2 as unresolved.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_24_STOP) errors.push(`Root handoff must end with '${MILESTONE_24_STOP}'.`);
  return errors;
}

export const MILESTONE_25_HEADER = "# Milestone 2.5 handoff";
export const MILESTONE_25_STOP = "Stop after Milestone 2.5.";
export function validateMilestone25Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 2.5 handoffs are not byte-identical.");
  if (!root.startsWith(MILESTONE_25_HEADER + "\n") && !root.startsWith(MILESTONE_25_HEADER + "\r\n")) errors.push("Root handoff does not begin with the Milestone 2.5 header.");
  if (!/Velocity Full-Block Propagation and Bottleneck Attribution/.test(root)) errors.push("Root handoff does not describe Milestone 2.5.");
  if (!/9eef6a9/.test(root)) errors.push("Root handoff does not record base commit 9eef6a9.");
  if (!/velocity-full-block-depth-propagation-established/.test(root)) errors.push("Root handoff does not record the Milestone 2.5 outcome.");
  if (!/6 of six observed blocks/.test(root)) errors.push("Root handoff does not record the six-block propagation result.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_25_STOP) errors.push("Root handoff does not end at Milestone 2.5.");
  return errors;
}

export const MILESTONE_26_HEADER = "# Milestone 2.6.2 handoff";
export const MILESTONE_26_STOP = "Stop after Milestone 2.6.2. Do not automatically move to Candidate #5.";
export function validateMilestone26Handoff(root: string, versioned: string): string[] {
  const errors: string[] = [];
  if (root !== versioned) errors.push("Root and versioned Milestone 2.6.2 handoffs are not byte-identical.");
  if (!root.startsWith(MILESTONE_26_HEADER + "\n") && !root.startsWith(MILESTONE_26_HEADER + "\r\n")) errors.push("Root handoff does not begin with the Milestone 2.6.2 header.");
  if (!/Candidate #4 Core-Program Sourceability Taxonomy Correction/.test(root)) errors.push("Root handoff does not describe Milestone 2.6.2.");
  if (!/9fa956e/.test(root)) errors.push("Root handoff does not record base commit 9fa956e.");
  if (!/infrastructure-or-token-serialization-not-semantic-candidate/.test(root)) errors.push("Root handoff does not record the Milestone 2.6 outcome.");
  if (!/Candidate #2 remains `deferred-not-rejected`/.test(root) || !/velocity-full-block-depth-propagation-established/.test(root)) errors.push("Root handoff does not preserve prior candidate dispositions.");
  if (root.trimEnd().split(/\r?\n/).at(-1) !== MILESTONE_26_STOP) errors.push("Root handoff does not end at Milestone 2.6.2.");
  return errors;
}

export const MILESTONE_27_HEADER = "# Milestone 2.7 handoff";
export const MILESTONE_27_STOP = "Stop after Milestone 2.7. Do not automatically advance to Candidate #6.";
export function validateMilestone27Handoff(root:string,versioned:string):string[]{const errors:string[]=[];if(root!==versioned)errors.push("Root and versioned Milestone 2.7 handoffs are not byte-identical.");if(!root.startsWith(MILESTONE_27_HEADER+"\n")&&!root.startsWith(MILESTONE_27_HEADER+"\r\n"))errors.push("Root handoff does not begin with the Milestone 2.7 header.");if(!/Candidate #5 Sourceability and Semantic Dossier/.test(root))errors.push("Root handoff does not describe Milestone 2.7.");if(!/black-box-structure-only/.test(root))errors.push("Root handoff does not record the Milestone 2.7 outcome.");if(!/Candidate #4.*infrastructure-or-token-serialization-not-semantic-candidate/s.test(root))errors.push("Candidate #4 disposition is not preserved.");if(root.trimEnd().split(/\r?\n/).at(-1)!==MILESTONE_27_STOP)errors.push("Root handoff does not end at Milestone 2.7.");return errors;}

export const MILESTONE_28_HEADER="# Milestone 2.8 handoff";
export const MILESTONE_28_STOP="Stop after Milestone 2.8. Do not automatically advance to Candidate #7.";
export function validateMilestone28Handoff(root:string,versioned:string):string[]{const errors:string[]=[];if(root!==versioned)errors.push("Root and versioned Milestone 2.8 handoffs are not byte-identical.");if(!root.startsWith(MILESTONE_28_HEADER+"\n")&&!root.startsWith(MILESTONE_28_HEADER+"\r\n"))errors.push("Root handoff does not begin with the Milestone 2.8 header.");if(!/Candidate #6 Sourceability-First Semantic Dossier/.test(root))errors.push("Root handoff does not describe Milestone 2.8.");if(!/candidate-b1cc5e297f33e545/.test(root)||!/23 exact pair\/account causes/.test(root)||!/black-box-structure-only/.test(root))errors.push("Candidate #6 outcome or accounting is absent.");if(!/Candidate #5 remains.*21 atoms.*3 established SPL Token-account atoms.*18 unresolved atoms/s.test(root))errors.push("Candidate #5 correction is not preserved.");if(root.trimEnd().split(/\r?\n/).at(-1)!==MILESTONE_28_STOP)errors.push("Root handoff does not end at Milestone 2.8.");return errors;}

export const MILESTONE_29_HEADER="# Milestone 2.9 handoff",MILESTONE_29_STOP="Stop after Milestone 2.9. Do not automatically advance to Candidate #8.";
export function validateMilestone29Handoff(root:string,versioned:string):string[]{const e:string[]=[];if(root!==versioned)e.push("Root and versioned Milestone 2.9 handoffs are not byte-identical.");if(!root.startsWith(MILESTONE_29_HEADER+"\n"))e.push("Root handoff does not begin with the Milestone 2.9 header.");if(!/Candidate #7 Sourceability-First Semantic Dossier/.test(root)||!/candidate-305e6177058fbf49/.test(root))e.push("Candidate #7 identity is absent.");if(!/36 exact pair\/account causes/.test(root)||!/6 SPL Token-account atoms.*30 unresolved atoms/s.test(root)||!/black-box-structure-only/.test(root))e.push("Candidate #7 accounting or outcome is absent.");if(!/Candidate #6 remains.*23 atoms.*22.*later.*current snapshot.*1 unresolved/s.test(root))e.push("Candidate #6 closure is not preserved.");if(root.trimEnd().split(/\r?\n/).at(-1)!==MILESTONE_29_STOP)e.push("Root handoff does not end at Milestone 2.9.");return e;}

export const MILESTONE_30_HEADER="# Milestone 3.0 handoff",MILESTONE_30_STOP="Stop after Milestone 3.0. Do not begin Candidate #10's dossier.";
export function validateMilestone30Handoff(root:string,versioned:string):string[]{const e:string[]=[];if(root!==versioned)e.push("Root and versioned Milestone 3.0 handoffs are not byte-identical.");if(!root.startsWith(MILESTONE_30_HEADER+"\n"))e.push("Root handoff does not begin with the Milestone 3.0 header.");if(!/Remaining Candidate Queue Family-Aware Triage/.test(root))e.push("Milestone 3.0 title is absent.");if(!/candidate-0a165acfc7f2b47a/.test(root)||!/family-arcj-ew9-l2te/.test(root)||!/frozen rank #10/.test(root))e.push("Next-candidate selection is absent.");if(!/Candidate #7.*black-box-structure-only.*family-reopen watchlist/s.test(root))e.push("Candidate #7 watchlist boundary is absent.");if(!/preflight passed 209\/209.*final verification passed 213\/213/s.test(root))e.push("Verification counts are absent.");if(root.trimEnd().split(/\r?\n/).at(-1)!==MILESTONE_30_STOP)e.push("Root handoff does not end at Milestone 3.0.");return e;}
