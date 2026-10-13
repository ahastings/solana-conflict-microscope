import { verifyDeclaredAnalysis } from './verify-analysis.js';

function requireRange(value: unknown, message: string): asserts value {
  if (!value) throw new Error('Range verification failed: ' + message);
}
function record(value: unknown, label: string): Record<string, unknown> {
  requireRange(value !== null && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  return value as Record<string, unknown>;
}
function slotNumber(value: unknown): number {
  requireRange(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'slot must be a non-negative safe integer');
  return value;
}

/** Certifies the observation ledger and embedded blocks, not cross-block interpretation. */
export function verifyRangeAnalysis(value: unknown) {
  const input = record(value, 'range'), provenance = record(input.provenance, 'provenance');
  const startSlot = slotNumber(provenance.requestedStartSlot), endSlot = slotNumber(provenance.requestedEndSlot);
  requireRange(endSlot >= startSlot, 'requested slot interval is reversed');
  const requestedSlots = endSlot - startSlot + 1;
  requireRange(Number.isSafeInteger(requestedSlots), 'requested slot count exceeds safe integer range');
  requireRange(Array.isArray(input.slots) && input.slots.length === requestedSlots, 'slot ledger must cover every requested slot exactly once');
  const slotStates = {observed:0,missing:0,skipped:0,unavailable:0,failed:0};
  const listedSlots: Record<keyof typeof slotStates, number[]> = {observed:[],missing:[],skipped:[],unavailable:[],failed:[]};
  const blocks = [];
  for (let index = 0; index < input.slots.length; index++) {
    const entry = record(input.slots[index], 'slot record'), slot = startSlot + index;
    requireRange(entry.slot === slot, 'slot identity or ordering disagrees with requested interval');
    const status = entry.status;
    requireRange(status === 'observed' || status === 'missing' || status === 'skipped' || status === 'unavailable' || status === 'failed', 'unknown observation status');
    slotStates[status]++; listedSlots[status].push(slot);
    if (status !== 'observed') {
      requireRange(entry.analysis === null, 'unobserved slot must not contain an analysis');
      continue;
    }
    const analysis = record(entry.analysis, 'observed analysis'), context = record(analysis.context, 'block context');
    requireRange(context.slot === slot, 'embedded block slot identity disagrees with ledger');
    try { blocks.push({slot,verification:verifyDeclaredAnalysis(analysis)}); }
    catch (error) { throw new Error('Range verification failed at slot ' + slot + ': ' + (error instanceof Error ? error.message : String(error))); }
  }
  for (const status of Object.keys(listedSlots) as Array<keyof typeof listedSlots>) {
    const field = status + 'Slots', stored = provenance[field], expected = listedSlots[status];
    requireRange(Array.isArray(stored) && stored.length === expected.length && expected.every((slot,index) => stored[index] === slot), 'provenance ' + field + ' disagrees with slot ledger');
  }
  return {status:'verified' as const,scope:'slot-observation-ledger-and-embedded-declared-block-evidence',startSlot,endSlot,requestedSlots,observedBlocks:blocks.length,slotStates,blocks,
    limitations:'Checks supplied slot coverage and embedded block consistency. Does not authenticate RPC origin or observation status, verify chain ancestry, cross-block upload reconstruction, component summaries, counterfactual semantics, or validator execution.'};
}
