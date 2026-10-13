import { inspectUploadWrite } from "./upload-payload.js";
import { isKnownSysvar, knownAccountLabel, programLabel } from "./known.js";
import { verifiedSemanticFootprints } from "./semantic.js";
import { MAX_SUPPORTED_TRANSACTION_VERSION } from "./types.js";
import type { NormalizedAccount, NormalizedInstruction, NormalizedTransaction, RoleInference, RpcBlock, RpcCompiledInstruction, RpcInnerInstructions, RpcInstruction, RpcParsedInstruction } from "./types.js";

function finiteNumber(value: number | bigint | null | undefined, field: string, nonnegative = true): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" && typeof value !== "bigint") throw new Error(`Malformed ${field}: expected a numeric integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`Numeric RPC value is outside JavaScript safe-integer range: ${String(value)}`);
  if (nonnegative && number < 0) throw new Error(`Malformed ${field}: expected a non-negative integer`);
  return number;
}

export function validateBlock(value: unknown): asserts value is RpcBlock {
  if (!value || typeof value !== "object") throw new Error("Malformed block: expected an object");
  const block = value as Partial<RpcBlock>;
  if (typeof block.blockhash !== "string" || typeof block.previousBlockhash !== "string") throw new Error("Malformed block: missing block hashes");
  if ((typeof block.parentSlot !== "number" && typeof block.parentSlot !== "bigint") || !Array.isArray(block.transactions)) throw new Error("Malformed block: missing parentSlot or transactions");
  finiteNumber(block.parentSlot, "parentSlot");
  finiteNumber(block.blockHeight, "blockHeight");
  finiteNumber(block.blockTime, "blockTime", false);
}

function isCompiled(value: RpcInstruction | undefined): value is RpcCompiledInstruction {
  return Boolean(value && "programIdIndex" in value && typeof value.programIdIndex === "number" && "data" in value);
}

function isParsed(value: RpcInstruction | undefined): value is RpcParsedInstruction {
  return Boolean(value && "programId" in value && typeof value.programId === "string");
}

function collectInfoAddresses(value: unknown, known: Set<string>, path = "info", out: Array<{ address: string; field: string }> = []): Array<{ address: string; field: string }> {
  if (typeof value === "string" && known.has(value)) out.push({ address: value, field: path.split(".").at(-1) ?? "account" });
  else if (Array.isArray(value)) value.forEach((item, index) => collectInfoAddresses(item, known, `${path}[${index}]`, out));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) collectInfoAddresses(item, known, `${path}.${key}`, out);
  return out;
}

function roleForField(field: string, programId: string | null, parsedType: string | null): string {
  const normalized = field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  if (programId === "BPFLoaderUpgradeab1e11111111111111111111111" && parsedType === "write" && field === "account") return "program buffer target";
  const roles: Record<string, string> = { source: "source", destination: "destination", authority: "authority", owner: "owner", mint: "token mint", voteAccount: "vote account", voteAuthority: "vote authority", nonceAccount: "nonce account", nonceAuthority: "nonce authority", account: "instruction account" };
  return roles[field] ?? normalized;
}

function addRole(account: NormalizedAccount | undefined, role: RoleInference): void {
  if (!account) return;
  if (!account.roles.some((existing) => existing.role === role.role && existing.evidence === role.evidence)) account.roles.push(role);
}

function validateInstructionReferences(value: RpcInstruction | undefined, accounts: NormalizedAccount[], context: string): void {
  if (value === undefined) return;
  const validIndex = (index: unknown): boolean => typeof index === "number" && Number.isSafeInteger(index) && index >= 0 && index < accounts.length;
  if ("programIdIndex" in value && !validIndex(value.programIdIndex)) throw new Error(`Malformed ${context}: programIdIndex does not resolve to a message account`);
  if (!("accounts" in value)) return;
  if (!Array.isArray(value.accounts)) throw new Error(`Malformed ${context}: instruction accounts must be an array`);
  for (const operand of value.accounts) {
    const resolved = typeof operand === "number" ? validIndex(operand)
      : !("programIdIndex" in value) && typeof operand === "string" && accounts.some((account) => account.pubkey === operand);
    if (!resolved) throw new Error(`Malformed ${context}: instruction account operand does not resolve to a message account`);
  }
}

function normalizeInstruction(parsed: RpcInstruction | undefined, raw: RpcInstruction | undefined, accounts: NormalizedAccount[], location: "outer" | "inner", parentInstructionIndex: number | null, instructionIndex: number): NormalizedInstruction {
  const context = `${location} instruction ${instructionIndex}${parentInstructionIndex === null ? "" : ` (parent ${parentInstructionIndex})`}`;
  validateInstructionReferences(parsed, accounts, context);
  validateInstructionReferences(raw, accounts, context);
  const parsedIx = isParsed(parsed) ? parsed : undefined;
  const parsedFields = parsedIx?.parsed && typeof parsedIx.parsed === "object" ? parsedIx.parsed : null;
  const rawIx = isCompiled(raw) ? raw : isCompiled(parsed) ? parsed : undefined;
  const programId = parsedIx?.programId ?? (rawIx ? accounts[rawIx.programIdIndex]?.pubkey ?? null : null);
  const directAddresses = parsedIx?.accounts?.map((item) => typeof item === "number" ? accounts[item]?.pubkey : item).filter((item): item is string => Boolean(item)) ?? [];
  const rawIndexes = rawIx?.accounts ?? [];
  const infoAddresses = collectInfoAddresses(parsedFields?.info, new Set(accounts.map((a) => a.pubkey))).map((item) => item.address);
  const accountAddresses = [...new Set([...directAddresses, ...rawIndexes.map((i) => accounts[i]?.pubkey).filter((item): item is string => Boolean(item)), ...infoAddresses])];
  const accountIndexes = [...new Set([...rawIndexes, ...accountAddresses.map((address) => accounts.findIndex((a) => a.pubkey === address)).filter((i) => i >= 0)])];
  const data = rawIx?.data ?? parsedIx?.data ?? null;
  const parsedType = parsedFields?.type ?? null;
  const parsedProgram = parsedIx?.program ?? null;
  const semanticFootprints = verifiedSemanticFootprints(programId, parsedType, parsedFields?.info ?? null);
  const uploadEvidence = programId === "BPFLoaderUpgradeab1e11111111111111111111111" && parsedType === "write" ? inspectUploadWrite(parsedFields?.info) : null;
  const hasOperandList = Array.isArray(rawIx?.accounts) || Array.isArray(parsedIx?.accounts);
  // Parsed fields identify roles but do not prove that the decoder exposed every
  // operand. Only an explicit list can establish absence of another account touch.
  const incompleteAccountOperandEvidence = !hasOperandList
    ? "Instruction account operands are unknown: no explicit raw or direct account list is available; decoded fields do not establish an exhaustive operand list."
    : null;
  return {
    location, parentInstructionIndex, instructionIndex, programId,
    programLabel: programLabel(programId, parsedProgram), stackHeight: finiteNumber(parsedIx?.stackHeight ?? rawIx?.stackHeight, "stackHeight"),
    accountAddresses, accountIndexes, data, dataEncoding: data === null ? null : "base58",
    parsedProgram, parsedType, parsedInfo: parsedFields?.info ?? null,
    parsedRepresentation: parsedIx ?? null, rawRepresentation: rawIx ?? null,
    decodeStatus: parsedType ? "parsed" : parsedIx?.data ? "partially-decoded" : rawIx ? "raw-only" : "unknown",
    ...(uploadEvidence && !uploadEvidence.valid ? { uploadEvidenceIssue: uploadEvidence.reason } : {}),
    ...(semanticFootprints.length ? { semanticFootprints } : {}),
    ...(incompleteAccountOperandEvidence ? { incompleteAccountOperandEvidence } : {}),
  };
}

function innerGroupsByParent(groups: RpcInnerInstructions[] | null | undefined, outerLength: number, context: string): Map<number, RpcInstruction[]> {
  const result = new Map<number, RpcInstruction[]>();
  if (groups == null) return result;
  if (!Array.isArray(groups)) throw new Error(`Malformed ${context}: inner instruction groups must be an array`);
  for (const group of groups) {
    if (!group || !Number.isSafeInteger(group.index) || group.index < 0 || group.index >= outerLength) throw new Error(`Malformed ${context}: invalid inner instruction parent`);
    if (result.has(group.index)) throw new Error(`Malformed ${context}: duplicate inner instruction parent ${group.index}`);
    if (!Array.isArray(group.instructions)) throw new Error(`Malformed ${context}: inner instructions must be an array`);
    result.set(group.index, group.instructions);
  }
  return result;
}

export function normalizeBlock(blockValue: unknown, slot: number): NormalizedTransaction[] {
  if (!Number.isSafeInteger(slot) || slot < 0) throw new Error("Malformed slot: expected a non-negative safe integer");
  validateBlock(blockValue);
  return blockValue.transactions.map((entry, index) => {
    if (entry?.version !== undefined && entry.version !== "legacy" && (typeof entry.version !== "number" || !Number.isInteger(entry.version) || entry.version < 0 || entry.version > MAX_SUPPORTED_TRANSACTION_VERSION)) throw new Error(`Malformed block transaction ${index}: unsupported transaction version; supported versions are legacy through ${MAX_SUPPORTED_TRANSACTION_VERSION}`);
    if (!entry?.transaction?.message || !Array.isArray(entry.transaction.message.accountKeys)) throw new Error(`Malformed block transaction ${index}: jsonParsed accountKeys are required`);
    if (entry.meta != null && (typeof entry.meta !== "object" || Array.isArray(entry.meta))) throw new Error(`Malformed block transaction ${index}: meta must be an object or null`);
    const signatures = entry.transaction.signatures, logs = entry.meta?.logMessages;
    if (signatures != null && (!Array.isArray(signatures) || signatures.some(value => typeof value !== "string" || !value.trim()))) throw new Error(`Malformed block transaction ${index}: signatures must be an array of nonempty strings when supplied`);
    if (logs != null && (!Array.isArray(logs) || logs.some(value => typeof value !== "string"))) throw new Error(`Malformed block transaction ${index}: logMessages must be an array of strings when supplied`);
    const byAddress = new Map<string, NormalizedAccount>();
    for (const raw of entry.transaction.message.accountKeys) {
      if (!raw || typeof raw.pubkey !== "string" || !raw.pubkey.trim() || (raw.source !== undefined && raw.source !== "transaction" && raw.source !== "lookupTable") || typeof raw.signer !== "boolean" || typeof raw.writable !== "boolean") throw new Error(`Malformed block transaction ${index}: invalid parsed account entry`);
      const source = raw.source ?? "transaction"; const existing = byAddress.get(raw.pubkey);
      byAddress.set(raw.pubkey, { pubkey: raw.pubkey, signer: Boolean(existing?.signer || raw.signer), writable: Boolean(existing?.writable || raw.writable), source: existing?.source === "transaction" ? "transaction" : source, knownLabel: knownAccountLabel(raw.pubkey), roles: existing?.roles ?? [] });
    }
    const accounts = [...byAddress.values()];
    if (accounts.length === 0) throw new Error(`Malformed block transaction ${index}: at least one account is required`);
    // Compiled instruction indexes refer to original message positions, including
    // duplicate keys. Deduplication applies to access sets, not index resolution.
    const instructionAccounts = entry.transaction.message.accountKeys.map((account) => byAddress.get(account.pubkey)!);
    const feePayer = accounts[0]!.pubkey;
    addRole(accounts[0], { role: "fee payer", confidence: "high", evidence: "First account key in the transaction message", instructionIndex: null });
    accounts.forEach((account) => {
      if (isKnownSysvar(account.pubkey)) addRole(account, { role: "sysvar", confidence: "high", evidence: `Known address: ${account.knownLabel}`, instructionIndex: null });
    });
    const parsedOuter = entry.transaction.message.instructions ?? []; const rawOuter = entry.rawTransaction?.message.instructions ?? [];
    if (!Array.isArray(parsedOuter) || !Array.isArray(rawOuter)) throw new Error(`Malformed block transaction ${index}: outer instructions must be an array`);
    const incompleteInstructionEvidence = !Array.isArray(entry.transaction.message.instructions) && !Array.isArray(entry.rawTransaction?.message.instructions)
      ? "Outer instruction list is unavailable; absence of a represented instruction does not establish that an account is untouched." : undefined;
    const instructions: NormalizedInstruction[] = [];
    const outerLength = Math.max(parsedOuter.length, rawOuter.length);
    for (let i = 0; i < outerLength; i++) instructions.push(normalizeInstruction(parsedOuter[i], rawOuter[i], instructionAccounts, "outer", null, i));
    const parsedInnerByParent = innerGroupsByParent(entry.meta?.innerInstructions, outerLength, `transaction ${index} parsed metadata`);
    const rawInnerByParent = innerGroupsByParent(entry.rawInnerInstructions, outerLength, `transaction ${index} raw metadata`);
    for (const parent of [...new Set([...parsedInnerByParent.keys(), ...rawInnerByParent.keys()])].sort((a, b) => a - b)) {
      const parsedList = parsedInnerByParent.get(parent) ?? []; const rawList = rawInnerByParent.get(parent) ?? [];
      for (let i = 0; i < Math.max(parsedList.length, rawList.length); i++) instructions.push(normalizeInstruction(parsedList[i], rawList[i], instructionAccounts, "inner", parent, i));
    }
    for (const instruction of instructions) {
      const programAccount = accounts.find((account) => account.pubkey === instruction.programId);
      addRole(programAccount, { role: "invoked program", confidence: "high", evidence: `${instruction.location} instruction ${instruction.instructionIndex} invokes ${instruction.programLabel}`, instructionIndex: instruction.instructionIndex });
      for (const found of collectInfoAddresses(instruction.parsedInfo, new Set(accounts.map((a) => a.pubkey)))) addRole(accounts.find((account) => account.pubkey === found.address), { role: roleForField(found.field, instruction.programId, instruction.parsedType), confidence: "high", evidence: `RPC-decoded ${instruction.programLabel} ${instruction.parsedType ?? "instruction"} field '${found.field}'`, instructionIndex: instruction.instructionIndex });
    }
    const signature = entry.transaction.signatures?.[0] ?? null;
    const readSet = accounts.filter((a) => !a.writable).map((a) => a.pubkey).sort(); const writeSet = accounts.filter((a) => a.writable).map((a) => a.pubkey).sort();
    return {
      id: signature ?? `slot-${slot}-transaction-${index}`, signature, index,
      ...(incompleteInstructionEvidence ? { incompleteInstructionEvidence } : {}),
      ...(entry.meta?.err !== undefined && entry.meta.err !== null ? { executionError: entry.meta.err } : {}),
      status: entry.meta?.err === undefined ? "unknown" : entry.meta.err === null ? "success" : "failed", feePayer, accounts,
      staticAccountKeys: accounts.filter((a) => a.source === "transaction").map((a) => a.pubkey), loadedAccountKeys: accounts.filter((a) => a.source === "lookupTable").map((a) => a.pubkey),
      readSet, writeSet, nonFeePayerReadSet: readSet.filter((a) => a !== feePayer), nonFeePayerWriteSet: writeSet.filter((a) => a !== feePayer),
      invokedProgramIds: [...new Set(instructions.map((ix) => ix.programId).filter((id): id is string => id !== null))], instructions,
      logMessages: entry.meta?.logMessages ?? [], feeLamports: finiteNumber(entry.meta?.fee, "fee"), computeUnitsConsumed: finiteNumber(entry.meta?.computeUnitsConsumed, "computeUnitsConsumed"), slot,
    };
  });
}
