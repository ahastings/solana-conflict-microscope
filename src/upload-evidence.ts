import type { NormalizedTransaction } from "./types.js";

export function uploadEvidenceIssues(transactions: NormalizedTransaction[]): string[] {
  return transactions.flatMap(tx => tx.instructions.flatMap(ix => ix.uploadEvidenceIssue
    ? [`Slot ${tx.slot}, transaction #${tx.index}, ${ix.location} instruction ${ix.instructionIndex}${ix.parentInstructionIndex === null ? "" : ` (parent ${ix.parentInstructionIndex})`}: excluded from upload byte-range evidence. ${ix.uploadEvidenceIssue}`]
    : []));
}
