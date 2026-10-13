import type { RangeSlotRecord } from './range-types.js';

/** Compare only recorded direct-parent references; this does not establish canonical ancestry. */
export function rangeParentLinks(records: RangeSlotRecord[]) {
  const observed = records.filter(record => record.status === 'observed' && record.analysis !== null);
  const bySlot = new Map(observed.map(record => [record.slot,record.analysis!]));
  const slots = observed.map(record => record.slot).sort((a,b)=>a-b);
  const positions = new Map(slots.map((slot,index)=>[slot,index]));
  const afterSlot = (slot: number): number => {
    let low=0,high=slots.length;
    while (low<high) {const middle=low+Math.floor((high-low)/2);if(slots[middle]!<=slot)low=middle+1;else high=middle;}
    return low;
  };
  const links = observed.map(record => {
    const context = record.analysis!.context, parent = bySlot.get(context.parentSlot);
    const status = context.parentSlot >= record.slot && record.slot !== 0 ? 'nonpreceding-parent' as const
      : !parent || context.parentSlot === record.slot ? 'parent-unavailable' as const
      : parent.context.blockhash === context.previousBlockhash ? 'matched' as const : 'hash-mismatch' as const;
    const first = afterSlot(context.parentSlot);
    const bypassedObservedSlotCount = Math.max(0,positions.get(record.slot)!-first);
    const firstBypassedObservedSlot = bypassedObservedSlotCount > 0 ? slots[first]! : null;
    return {bypassedObservedSlotCount,firstBypassedObservedSlot,slot:record.slot,parentSlot:context.parentSlot,status,previousBlockhash:context.previousBlockhash,observedParentBlockhash:parent?.context.blockhash ?? null};
  });
  return {bypassingCount:links.filter(link=>link.bypassedObservedSlotCount>0).length,matchedCount:links.filter(link=>link.status==='matched').length,mismatchCount:links.filter(link=>link.status==='hash-mismatch').length,
    unavailableCount:links.filter(link=>link.status==='parent-unavailable').length,nonprecedingCount:links.filter(link=>link.status==='nonpreceding-parent').length,links,
    limitation:'Direct-parent hash comparisons use supplied records only. Parents not present cannot be hash-checked. A reference bypassing another observed block prevents treating every supplied block as one ancestry path; matching links do not authenticate the source or establish canonical/finalized ancestry. Cross-block findings are recorded observations, not proof of one chain.'};
}
