/** Count strict offset inversions without changing the recorded input order. */
export function countOffsetInversions(offsets: readonly number[]): number {
  for (const offset of offsets) if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Offsets must be non-negative safe integers');
  const values = [...offsets], scratch = new Array<number>(values.length);
  let inversions = 0;
  const merge = (start: number, end: number): void => {
    if (end - start < 2) return;
    const middle = start + Math.floor((end-start)/2);
    merge(start,middle); merge(middle,end);
    let left = start, right = middle, cursor = start;
    while (left < middle && right < end) {
      // Equal offsets are not inversions, including duplicate writes.
      if (values[left]! <= values[right]!) scratch[cursor++] = values[left++]!;
      else {
        const count = middle-left;
        if (count > Number.MAX_SAFE_INTEGER-inversions) throw new Error('Offset inversion count exceeds safe integer range');
        inversions += count; scratch[cursor++] = values[right++]!;
      }
    }
    while (left < middle) scratch[cursor++] = values[left++]!;
    while (right < end) scratch[cursor++] = values[right++]!;
    for (let index = start; index < end; index++) values[index] = scratch[index]!;
  };
  merge(0,values.length);
  return inversions;
}
