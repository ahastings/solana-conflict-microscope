/** Sum recorded compute without silently rounding integer evidence. */
export function sumComputeUnits(values: Iterable<number | null>): number {
  let total = 0;
  for (const value of values) {
    if (value === null) continue;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Compute Units must be non-negative safe integers");
    if (value > Number.MAX_SAFE_INTEGER - total) throw new Error("Compute Units total exceeds the safe-integer range");
    total += value;
  }
  return total;
}
