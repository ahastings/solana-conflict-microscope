import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { address, getProgramDerivedAddress } from "@solana/kit";
import { decodeBase58Bytes, ED25519_PROGRAM_ID } from "./ed25519.js";
import { loadSourceabilityPlan, loadVelocityResearchPlan, runMilestone20 } from "./milestone20.js";
import type { VelocityOccurrence, VelocityResearchPlan, VelocityTransactionEvidence } from "./milestone20-types.js";
import { decodeProgramData, extractDeterministicStrings, loadMilestone21Plan, parseElf64, runMilestone21 } from "./milestone21.js";
import type { Milestone21Plan } from "./milestone21-types.js";
import { normalizeBlock } from "./normalize.js";
import type { NormalizedInstruction, NormalizedTransaction } from "./types.js";
import { milestone22Html, milestone22Markdown } from "./milestone22-report.js";
import type {
  AnchorBinaryCorrespondence,
  AnchorBundleDossier,
  AnchorBundleEvidence,
  AnchorBundleRole,
  AnchorConflictAttribution,
  AnchorSemanticEvidence,
  AnchorTransactionEvidence,
  BundlePin,
  BundleTransactionPin,
  DecodedPythFeed,
  DecodedPythMessage,
  DecodedPythProperty,
  InstructionEquivalenceArtifact,
  InstructionPin,
  LogBranchMatrix,
  MessageReuseMatrix,
  Milestone22Input,
  Milestone22Outcome,
  Milestone22Plan,
  Milestone22Result,
  SourceBlobPin,
} from "./milestone22-types.js";

const VELOCITY_PROGRAM = "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P";
const POST_DISCRIMINATOR = "daedaaf5278fa621";
const TWAP_DISCRIMINATOR = "f717ff41d45addc2";
const POST_VARIANT = "post-pyth-lazer-oracle-update";
const TWAP_VARIANT = "update-perp-bid-ask-twap";
const NATIVE_VARIANT = "native-prefix-discriminator-2";
const PYTH_MAGIC = 2479346549;
const SIGNER = "9gKEEcFzSd1PDYBKWAKZi4Sq4ZCUaVX5oTr8kEjdwsfR";
const ORACLES = [
  "2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV",
  "J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ",
  "6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH",
] as const;
const ROLE_MARKETS: Record<AnchorBundleRole, { market: string; oracle: string }> = {
  "anchor-A": { market: "Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg", oracle: ORACLES[2] },
  "anchor-B": { market: "7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t", oracle: ORACLES[1] },
  "anchor-C": { market: "FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY", oracle: ORACLES[0] },
};
const POSTING = "Program log: Posting new lazer update.";
const SKIPPING = "Program log: Skipping lazer price update.";
const DEPLOYED_POST_LOG = "Posting new lazer update. current ts {} < next_timestamp {}";
const DEPLOYED_SKIP_LOG = "Skipping lazer price update. next_timestamp {} <= current_timestamp {}";
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const slash = (value: string): string => value.replaceAll("\\", "/");
export const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

async function fileSha256(path: string): Promise<string> {
  return sha256(await readFile(resolve(path)));
}

async function assertFileSha256(path: string, expected: string, label: string): Promise<void> {
  let observed = "";
  for (let attempt = 0; attempt < 24; attempt += 1) {
    observed = await fileSha256(path);
    if (observed === expected) return;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`${label} changed: ${path}; expected ${expected}, observed ${observed}`);
}

function gitBlob(repository: string, commit: string, path: string): Buffer {
  const result = spawnSync("git", ["-C", resolve(repository), "show", `${commit}:${path}`], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0 || !(result.stdout instanceof Buffer)) {
    throw new Error(`Cannot read pinned source blob ${repository}@${commit}:${path}: ${String(result.stderr)}`);
  }
  return result.stdout;
}

function outer(transaction: NormalizedTransaction): NormalizedInstruction[] {
  return transaction.instructions.filter((instruction) => instruction.location === "outer").sort((a, b) => a.instructionIndex - b.instructionIndex);
}

function raw(instruction: NormalizedInstruction): Buffer | null {
  return instruction.data === null ? null : Buffer.from(decodeBase58Bytes(instruction.data));
}

function accountList(transaction: NormalizedTransaction, instruction: NormalizedInstruction) {
  return instruction.accountAddresses.map((entry, position) => {
    const account = transaction.accounts.find((item) => item.pubkey === entry);
    return { position, address: entry, signer: account?.signer ?? false, writable: account?.writable ?? false };
  });
}

function instructionPins(transaction: NormalizedTransaction): InstructionPin[] {
  return outer(transaction).map((instruction) => {
    const bytes = raw(instruction);
    return {
      instructionIndex: instruction.instructionIndex,
      programId: instruction.programId,
      byteLength: bytes?.length ?? null,
      dataSha256: bytes ? sha256(bytes) : null,
      accountListSha256: sha256(canonical(accountList(transaction, instruction))),
    };
  });
}

function velocityInstruction(transaction: VelocityTransactionEvidence, variant: string) {
  const found = transaction.velocityInstructions.find((instruction) => instruction.observedVariant === variant);
  if (!found) throw new Error(`Transaction ${transaction.index} lacks ${variant}`);
  return found;
}

function roleForTransaction(transaction: VelocityTransactionEvidence): AnchorBundleRole {
  const twap = velocityInstruction(transaction, TWAP_VARIANT);
  const market = twap.accounts[1]?.address;
  const found = (Object.entries(ROLE_MARKETS) as Array<[AnchorBundleRole, { market: string; oracle: string }]>).find(([, value]) => value.market === market);
  if (!found) throw new Error(`Transaction ${transaction.index} has unknown Anchor market ${market ?? "missing"}`);
  return found[0];
}

function relevantLogs(logs: string[]): string[] {
  return logs.filter((line) => line.includes(VELOCITY_PROGRAM) || line.startsWith("Program log:") || line.startsWith("Program data:"));
}

function countStarts(logs: string[], prefix: string): number {
  return logs.filter((line) => line.startsWith(prefix)).length;
}

function classifyBranch(logs: string[]): AnchorTransactionEvidence["branch"] {
  const posts = countStarts(logs, POSTING);
  const skips = countStarts(logs, SKIPPING);
  if (posts > 0 && skips === 0) return "posting";
  if (skips > 0 && posts === 0) return "skipping";
  if (posts > 0 && skips > 0) return "mixed";
  return "unresolved";
}

function requireSignature(transaction: VelocityTransactionEvidence): string {
  if (!transaction.signature) throw new Error(`Transaction ${transaction.index} has no signature`);
  return transaction.signature;
}

function matchingNormalized(normalized: NormalizedTransaction[], index: number): NormalizedTransaction {
  const transaction = normalized[index];
  if (!transaction || transaction.index !== index) throw new Error(`Normalized transaction ${index} is missing`);
  return transaction;
}

function outerByIndex(transaction: NormalizedTransaction, index: number): NormalizedInstruction {
  const instruction = outer(transaction).find((item) => item.instructionIndex === index);
  if (!instruction) throw new Error(`Outer instruction ${index} is missing from transaction ${transaction.index}`);
  return instruction;
}

function readU64(buffer: Buffer, offset: number): bigint {
  return buffer.readBigUInt64LE(offset);
}

function decodeOptionalI64(buffer: Buffer, offset: number): { value: string | null; next: number } {
  const value = buffer.readBigInt64LE(offset);
  return { value: value === 0n ? null : value.toString(), next: offset + 8 };
}

function decodeOptionalTaggedI64(buffer: Buffer, offset: number): { value: string | null; next: number } {
  const present = buffer.readUInt8(offset) !== 0;
  return present ? { value: buffer.readBigInt64LE(offset + 1).toString(), next: offset + 9 } : { value: null, next: offset + 1 };
}

function decodeOptionalTaggedU64(buffer: Buffer, offset: number): { value: string | null; next: number } {
  const present = buffer.readUInt8(offset) !== 0;
  return present ? { value: readU64(buffer, offset + 1).toString(), next: offset + 9 } : { value: null, next: offset + 1 };
}

const PROPERTY_NAMES = ["Price", "BestBidPrice", "BestAskPrice", "PublisherCount", "Exponent", "Confidence", "FundingRate", "FundingTimestamp", "FundingRateInterval", "MarketSession", "EmaPrice", "EmaConfidence", "FeedUpdateTimestamp"] as const;

function decodeProperty(buffer: Buffer, offset: number): { property: Omit<DecodedPythProperty, "sourceConfirmed">; next: number } {
  const id = buffer.readUInt8(offset);
  const name = PROPERTY_NAMES[id];
  if (!name) throw new Error(`Unknown Pyth Lazer property discriminator ${id}`);
  let next = offset + 1;
  let value: string | number | null;
  if ([0, 1, 2, 5, 10, 11].includes(id)) {
    const decoded = decodeOptionalI64(buffer, next); value = decoded.value; next = decoded.next;
  } else if (id === 3) { value = buffer.readUInt16LE(next); next += 2;
  } else if (id === 4 || id === 9) { value = buffer.readInt16LE(next); next += 2;
  } else if (id === 6) { const decoded = decodeOptionalTaggedI64(buffer, next); value = decoded.value; next = decoded.next;
  } else { const decoded = decodeOptionalTaggedU64(buffer, next); value = decoded.value; next = decoded.next; }
  return { property: { id, name, value }, next };
}

export async function decodePythLazerMessage(message: Buffer, programId = VELOCITY_PROGRAM): Promise<DecodedPythMessage> {
  if (message.length < 14) throw new Error("Pyth Lazer signed message is too short");
  const formatMagic = message.readUInt32LE(0);
  if (formatMagic !== PYTH_MAGIC) throw new Error(`Pyth Lazer magic mismatch: ${formatMagic}`);
  const timestampUs = readU64(message, 4).toString();
  const channelId = message.readUInt8(12);
  const feedCount = message.readUInt8(13);
  let offset = 14;
  const feeds: DecodedPythFeed[] = [];
  for (let feedIndex = 0; feedIndex < feedCount; feedIndex += 1) {
    if (offset + 5 > message.length) throw new Error("Pyth Lazer feed header exceeds signed bytes");
    const feedId = message.readUInt32LE(offset); offset += 4;
    const propertyCount = message.readUInt8(offset); offset += 1;
    const properties: DecodedPythProperty[] = [];
    for (let propertyIndex = 0; propertyIndex < propertyCount; propertyIndex += 1) {
      const decoded = decodeProperty(message, offset); offset = decoded.next;
      if (offset > message.length) throw new Error("Pyth Lazer property exceeds signed bytes");
      properties.push({ ...decoded.property, sourceConfirmed: true });
    }
    const seed = Buffer.alloc(4); seed.writeUInt32LE(feedId);
    const [oraclePda, oracleBump] = await getProgramDerivedAddress({ programAddress: address(programId), seeds: ["pyth_lazer", seed] });
    const oracleInstructionPosition = ORACLES.indexOf(oraclePda as typeof ORACLES[number]) + 3;
    if (oracleInstructionPosition < 3) throw new Error(`Feed ${feedId} derived unexpected oracle PDA ${oraclePda}`);
    feeds.push({ feedId, properties, oraclePda, oracleBump, oracleInstructionPosition });
  }
  return {
    rawHex: message.toString("hex"), rawSha256: sha256(message), byteLength: message.length,
    formatMagic, timestampUs, channelId,
    channelName: channelId === 1 ? "real-time" : channelId === 2 ? "fixed-rate-50ms" : channelId === 3 ? "fixed-rate-200ms" : channelId === 4 ? "fixed-rate-1000ms" : "unknown",
    feedCount, feeds, bytesConsumed: offset, completeRoundTripBoundary: offset === message.length,
    sourceAuthority: "Pyth-maintained pyth-lazer-public schema pinned by source blob; Velocity source-family PDA seed and exact program ID.",
  };
}

function transactionPin(role: BundleTransactionPin["role"], evidence: VelocityTransactionEvidence, normalized: NormalizedTransaction): BundleTransactionPin {
  const signed = evidence.ed25519.flatMap((item) => item.signatures)[0];
  return {
    role, transactionIndex: evidence.index, signature: requireSignature(evidence), feePayer: evidence.feePayer,
    ed25519InstructionIndexes: evidence.ed25519.map((item) => item.instructionIndex), bqsInstructionIndexes: [],
    velocityInstructionIndexes: evidence.velocityInstructions.map((item) => item.instructionIndex),
    postPythInstructionIndexes: evidence.velocityInstructions.filter((item) => item.observedVariant === POST_VARIANT).map((item) => item.instructionIndex),
    updateTwapInstructionIndexes: evidence.velocityInstructions.filter((item) => item.observedVariant === TWAP_VARIANT).map((item) => item.instructionIndex),
    instructionData: instructionPins(normalized), logSha256: sha256(canonical(evidence.logs)), signedMessageSha256: signed?.messageSha256 ?? null,
  };
}

async function readNormalizedOccurrence(occurrence: VelocityOccurrence): Promise<NormalizedTransaction[]> {
  const cached = JSON.parse(await readFile(resolve(occurrence.sourceCachePath), "utf8")) as { slot?: unknown; block?: unknown };
  if (Number(cached.slot) !== occurrence.slot || cached.block === undefined) throw new Error(`Malformed cache ${occurrence.sourceCachePath}`);
  return normalizeBlock(cached.block, occurrence.slot);
}

async function observedBundlePins(occurrences: VelocityOccurrence[]): Promise<BundlePin[]> {
  const result: BundlePin[] = [];
  for (const occurrence of occurrences) {
    const normalized = await readNormalizedOccurrence(occurrence);
    const transactions = occurrence.transactions.map((evidence) => {
      const isNative = evidence.velocityInstructions.some((item) => item.observedVariant === NATIVE_VARIANT);
      const role: BundleTransactionPin["role"] = isNative ? "native-unresolved" : roleForTransaction(evidence);
      return transactionPin(role, evidence, matchingNormalized(normalized, evidence.index));
    }).sort((a, b) => a.transactionIndex - b.transactionIndex);
    result.push({
      slot: occurrence.slot, componentId: occurrence.componentId, transactions,
      conflictEvidenceReference: `output/research/${"candidate-043c938568ad5e15"}/candidate-evidence.ndjson#${occurrence.evidenceId}`,
      sourceCachePath: slash(occurrence.sourceCachePath), sourceCacheSha256: occurrence.sourceCacheSha256,
    });
  }
  return result;
}

async function anchorEvidence(occurrence: VelocityOccurrence): Promise<AnchorBundleEvidence> {
  if (occurrence.blockTime === null) throw new Error(`Slot ${occurrence.slot} lacks block time`);
  const normalized = await readNormalizedOccurrence(occurrence);
  const native = occurrence.transactions.filter((transaction) => transaction.velocityInstructions.some((item) => item.observedVariant === NATIVE_VARIANT));
  const anchorRows = occurrence.transactions.filter((transaction) => transaction.velocityInstructions.some((item) => item.observedVariant === POST_VARIANT));
  if (native.length !== 1 || anchorRows.length !== 3) throw new Error(`Slot ${occurrence.slot} is not exactly three Anchor plus one native`);
  const anchors: AnchorTransactionEvidence[] = [];
  for (const evidence of anchorRows) {
    const role = roleForTransaction(evidence);
    const normalizedTransaction = matchingNormalized(normalized, evidence.index);
    const post = velocityInstruction(evidence, POST_VARIANT);
    const twap = velocityInstruction(evidence, TWAP_VARIANT);
    const postRaw = raw(outerByIndex(normalizedTransaction, post.instructionIndex));
    const twapRaw = raw(outerByIndex(normalizedTransaction, twap.instructionIndex));
    const ed = evidence.ed25519[0];
    const signature = ed?.signatures[0];
    if (!postRaw || !twapRaw || !ed || !signature || ed.status !== "decoded") throw new Error(`Slot ${occurrence.slot} Anchor transaction ${evidence.index} lacks exact byte evidence`);
    const logs = relevantLogs(evidence.logs);
    const postingLogCount = countStarts(logs, POSTING);
    const skippingLogCount = countStarts(logs, SKIPPING);
    anchors.push({
      role, transactionIndex: evidence.index, signature: requireSignature(evidence), payer: evidence.feePayer,
      computeUnits: evidence.computeUnitsConsumed ?? (() => { throw new Error("Anchor transaction has unknown compute units"); })(),
      instructionOrder: [...evidence.instructionProgramOrder], outerInstructions: instructionPins(normalizedTransaction),
      ed25519: {
        instructionIndex: ed.instructionIndex, instructionDataSha256: ed.instructionDataSha256,
        signerPublicKey: signature.publicKey, signedMessageSha256: signature.messageSha256,
        signedMessageHex: signature.messageHex, locallyVerified: signature.locallyVerified, offsets: signature.offsets,
        signatureReference: signature.signatureReference, publicKeyReference: signature.publicKeyReference, messageReference: signature.messageReference,
      },
      postPyth: { instructionIndex: post.instructionIndex, discriminatorHex: post.discriminatorHex ?? "", rawHex: postRaw.toString("hex"), rawSha256: sha256(postRaw), accountList: post.accounts, accountListSha256: sha256(canonical(post.accounts)) },
      updateTwap: {
        instructionIndex: twap.instructionIndex, discriminatorHex: twap.discriminatorHex ?? "", rawHex: twapRaw.toString("hex"), rawSha256: sha256(twapRaw),
        accountList: twap.accounts, accountListSha256: sha256(canonical(twap.accounts)),
        marketWritableAccount: twap.accounts[1]?.address ?? "", oracleWritableAccount: twap.accounts[2]?.address ?? "",
        makerInputs: twap.accounts.slice(5).map((item) => item.address),
      },
      relevantLogs: logs, logSha256: sha256(canonical(evidence.logs)), branch: classifyBranch(logs), postingLogCount, skippingLogCount,
      updateTwapLogCount: logs.filter((line) => line === "Program log: Instruction: UpdatePerpBidAskTwap").length,
      failureOrEarlyReturnLogs: logs.filter((line) => /failed|error|early return/i.test(line)),
    });
  }
  anchors.sort((a, b) => a.role.localeCompare(b.role));
  const firstMessage = Buffer.from(anchors[0]!.ed25519.signedMessageHex, "hex");
  const decodedMessage = await decodePythLazerMessage(firstMessage);
  return {
    slot: occurrence.slot, componentId: occurrence.componentId, blockTime: occurrence.blockTime,
    transactionsInBlockOrder: [...anchors].sort((a, b) => a.transactionIndex - b.transactionIndex).map((item) => item.role),
    anchors,
    native: { transactionIndex: native[0]!.index, signature: requireSignature(native[0]!), payer: native[0]!.feePayer, semanticScope: "excluded-unresolved" },
    decodedMessage, topologyRepeats: true,
  };
}

function assertBundleInvariants(bundles: AnchorBundleEvidence[]): void {
  if (bundles.length !== 6) throw new Error(`Expected six Anchor bundles, observed ${bundles.length}`);
  const messages = new Set<string>();
  for (const bundle of bundles) {
    if (bundle.anchors.length !== 3 || new Set(bundle.anchors.map((item) => item.role)).size !== 3) throw new Error(`Slot ${bundle.slot} does not contain stable A/B/C roles`);
    const hashes = new Set(bundle.anchors.map((item) => item.ed25519.signedMessageSha256));
    const signers = new Set(bundle.anchors.map((item) => item.ed25519.signerPublicKey));
    const postBytes = new Set(bundle.anchors.map((item) => item.postPyth.rawHex));
    const postAccounts = new Set(bundle.anchors.map((item) => item.postPyth.accountListSha256));
    const first = [...bundle.anchors].sort((a, b) => a.transactionIndex - b.transactionIndex);
    if (hashes.size !== 1 || signers.size !== 1 || !signers.has(SIGNER) || postBytes.size !== 1 || postAccounts.size !== 1) throw new Error(`Slot ${bundle.slot} repeated-update identity changed`);
    if (first[0]!.branch !== "posting" || first[0]!.postingLogCount !== 3 || first[1]!.branch !== "skipping" || first[2]!.branch !== "skipping" || first[1]!.skippingLogCount !== 3 || first[2]!.skippingLogCount !== 3) throw new Error(`Slot ${bundle.slot} posting/skip topology changed`);
    if (!bundle.decodedMessage.completeRoundTripBoundary || bundle.decodedMessage.feedCount !== 3 || canonical(bundle.decodedMessage.feeds.map((item) => item.oraclePda)) !== canonical(ORACLES)) throw new Error(`Slot ${bundle.slot} Pyth/PDA decoding changed`);
    messages.add([...hashes][0]!);
  }
  if (messages.size !== 6) throw new Error(`Expected six distinct block messages, observed ${messages.size}`);
}

function buildMessageReuse(bundles: AnchorBundleEvidence[]): MessageReuseMatrix {
  return {
    schemaVersion: "2.2", signerPublicKey: SIGNER,
    blocks: bundles.map((bundle) => {
      const ordered = [...bundle.anchors].sort((a, b) => a.transactionIndex - b.transactionIndex);
      return {
        slot: bundle.slot, messageSha256: ordered[0]!.ed25519.signedMessageSha256, messageByteLength: bundle.decodedMessage.byteLength,
        roles: ordered.map((item) => item.role), transactionIndexes: ordered.map((item) => item.transactionIndex), transactionSignatures: ordered.map((item) => item.signature),
        feePayers: [...new Set(ordered.map((item) => item.payer))], occurrenceCount: 3 as const,
        allMessageBytesIdentical: true as const, sameSigner: true as const, identicalOffsetReferenceStructure: true as const,
        transactionSignaturesDiffer: true as const, feePayersDiffer: false as const, crossFeePayerReuse: "not-observed" as const,
      };
    }),
    distinctMessageCount: 6, anyCrossBlockReuse: false, oneMessagePerThreeAnchorTransactions: true,
    interpretation: "Each block contains one 149-byte signed Pyth Lazer payload copied into three distinct Anchor transactions. Transaction signatures differ, but all three Anchor fee payers are the same; cross-fee-payer message reuse is not observed. No payload hash is reused across blocks.",
  };
}

function buildInstructionEquivalence(bundles: AnchorBundleEvidence[]): InstructionEquivalenceArtifact {
  return {
    schemaVersion: "2.2",
    blocks: bundles.map((bundle) => ({
      slot: bundle.slot, classification: "byte-identical-update" as const,
      postPythPayloadHashes: bundle.anchors.map((item) => item.postPyth.rawSha256), postPythRawHex: bundle.anchors[0]!.postPyth.rawHex,
      postPythAccountListHashes: bundle.anchors.map((item) => item.postPyth.accountListSha256), postPythAccountListsIdentical: true,
      postPythBytesIdentical: true, updateTwapPayloadHashes: bundle.anchors.map((item) => item.updateTwap.rawSha256), updateTwapBytesIdentical: true,
      updateTwapWrappersDifferByAccounts: true as const, varyingFields: ["UpdatePerpBidAskTwap market account", "UpdatePerpBidAskTwap oracle account", "optional maker inputs"],
    })),
    allBlocksByteIdenticalPostPyth: true, updateTwapDiscriminatorOnlySha256: "c90864a15bf48d5725dc2a37666a5ad6bbf4eef4cfd93a3619ad6c89068aec2a",
  };
}

function buildLogBranches(bundles: AnchorBundleEvidence[]): LogBranchMatrix {
  const rows = bundles.map((bundle) => ({
    slot: bundle.slot, messageTimestampUs: bundle.decodedMessage.timestampUs, blockTime: bundle.blockTime,
    transactionOrder: [...bundle.anchors].sort((a, b) => a.transactionIndex - b.transactionIndex).map((item, index) => ({
      ordinal: (index + 1) as 1 | 2 | 3, role: item.role, transactionIndex: item.transactionIndex, branch: item.branch,
      relevantLogs: item.relevantLogs, postingLogCount: item.postingLogCount, skippingLogCount: item.skippingLogCount,
      updateTwapLogCount: item.updateTwapLogCount, targetMarket: item.updateTwap.marketWritableAccount, targetOracle: item.updateTwap.oracleWritableAccount,
    })),
    firstPostsAndLaterTwoSkip: true as const,
  }));
  return {
    schemaVersion: "2.2", blocks: rows,
    totals: {
      postingLogs: bundles.flatMap((item) => item.anchors).reduce((sum, item) => sum + item.postingLogCount, 0),
      skippingLogs: bundles.flatMap((item) => item.anchors).reduce((sum, item) => sum + item.skippingLogCount, 0),
      updateTwapInstructionLogs: bundles.flatMap((item) => item.anchors).reduce((sum, item) => sum + item.updateTwapLogCount, 0),
      failuresOrEarlyReturns: bundles.flatMap((item) => item.anchors).reduce((sum, item) => sum + item.failureOrEarlyReturnLogs.length, 0),
    },
    wordingNormalized: false,
    transactionOrderDisclaimer: "Ordinal means only the transaction's position in the block response. It is not arrival order, scheduler order, validator execution order, or a reconstruction of any private schedule.",
  };
}

function buildConflictAttribution(occurrences: VelocityOccurrence[], bundles: AnchorBundleEvidence[]): AnchorConflictAttribution {
  return {
    schemaVersion: "2.2",
    blocks: occurrences.map((occurrence) => {
      const bundle = bundles.find((item) => item.slot === occurrence.slot)!;
      const anchorIndexes = bundle.anchors.map((item) => item.transactionIndex).sort((a, b) => a - b);
      const set = new Set(anchorIndexes);
      const pairEdges = occurrence.conflictEdges.filter((edge) => set.has(edge.source) && set.has(edge.target)).map((edge) => ({ source: edge.source, target: edge.target, accounts: [...edge.accounts] }));
      const conflictAtoms = pairEdges.flatMap((edge) => edge.accounts.map((account) => ({
        source: edge.source, target: edge.target, account,
        cause: (ORACLES as readonly string[]).includes(account) ? "shared-oracle" as const : account === bundle.anchors[0]!.payer ? "fee-payer" as const : "other" as const,
      })));
      const nativeIndex = bundle.native.transactionIndex;
      const nativeEdges = occurrence.conflictEdges.filter((edge) => edge.source === nativeIndex || edge.target === nativeIndex);
      return {
        slot: occurrence.slot, anchorTransactionIndexes: anchorIndexes, pairEdges, conflictAtoms,
        edgeCount: 3 as const, atomCount: 12 as const, waveLowerBound: 3 as const, waveUpperBound: 3 as const,
        commonOracleSetAlonePreservesClique: true as const, feePayerIndependentlyPreservesClique: true as const,
        marketAccountsCauseAnchorPairConflict: false as const, otherCauses: [],
        nativeContext: {
          transactionIndex: nativeIndex,
          conflicts: nativeEdges.map((edge) => {
            const anchorTransactionIndex = edge.source === nativeIndex ? edge.target : edge.source;
            const anchorRole = bundle.anchors.find((item) => item.transactionIndex === anchorTransactionIndex)?.role;
            if (!anchorRole) throw new Error(`Slot ${occurrence.slot} native edge does not terminate at an Anchor transaction`);
            return { anchorRole, anchorTransactionIndex, accounts: [...edge.accounts] };
          }).sort((a, b) => a.anchorRole.localeCompare(b.anchorRole)),
          atomCount: 3 as const, semanticStatus: "unresolved-excluded" as const,
        },
      };
    }),
    authoritativeFullGraphUnchanged: true, observationalOnly: true,
  };
}

function allOffsets(buffer: Buffer, needle: Buffer): number[] {
  const offsets: number[] = [];
  let start = 0;
  while (start <= buffer.length - needle.length) {
    const found = buffer.indexOf(needle, start);
    if (found < 0) break;
    offsets.push(found); start = found + 1;
  }
  return offsets;
}

function sectionsFor(offsets: number[], sections: Array<{ name: string; offset: number; size: number }>): string[] {
  return [...new Set(offsets.map((offset) => sections.find((section) => offset >= section.offset && offset < section.offset + section.size)?.name ?? "outside-file-backed-section"))];
}

function boundedNearbyStrings(executable: Buffer, skipOffset: number): Array<{ offset: number; value: string }> {
  const strings = extractDeterministicStrings(executable, 12);
  const candidates: Array<{ offset: number; value: string }> = [];
  for (const entry of strings) {
    const end = entry.offset + entry.value.length;
    if (end < skipOffset - 4096 || entry.offset > skipOffset + 4096) continue;
    const center = Math.max(0, Math.min(entry.value.length, skipOffset - entry.offset));
    const start = Math.max(0, center - 140);
    const value = entry.value.slice(start, Math.min(entry.value.length, center + DEPLOYED_SKIP_LOG.length + 180));
    candidates.push({ offset: entry.offset + start, value });
  }
  return candidates.slice(0, 6);
}

export function analyzeTimestampConditions(): {
  deployedSkipPredicate: string;
  deployedPositivePredicate: string;
  publicSkipPredicate: string;
  deployedPredicatesComplementary: true;
  publicAndDeployedDifferAtEquality: true;
  semanticMismatchEstablished: false;
} {
  return {
    deployedSkipPredicate: "next_timestamp <= current_timestamp",
    deployedPositivePredicate: "current_timestamp < next_timestamp",
    publicSkipPredicate: "next_timestamp < current_timestamp",
    deployedPredicatesComplementary: true,
    publicAndDeployedDifferAtEquality: true,
    semanticMismatchEstablished: false,
  };
}

function sourceHistoryRows(binaryResult: Awaited<ReturnType<typeof runMilestone21>>) {
  const history = binaryResult.sourceHistory as { fingerprints: { comparisonHistory: Array<Record<string, unknown>> } };
  return history.fingerprints.comparisonHistory.map((row) => ({
    commit: String(row.commit), predicate: String(row.classification),
    classification: row.skipLessThanOrEqualLog === true ? "exact-deployed-wording" : row.skipLessThanLog === true ? "public-less-than-skip" : row.skipGreaterThanOrEqualLog === true ? "older-inverse-form" : "unresolved",
  }));
}

function buildBinaryCorrespondence(plan: Milestone22Plan, binaryResult: Awaited<ReturnType<typeof runMilestone21>>, sourceBlobs: SourceBlobPin[], programDataRaw: Buffer): AnchorBinaryCorrespondence {
  const extraction = decodeProgramData(programDataRaw);
  const executable = extraction.executable;
  const elf = parseElf64(executable);
  const sections = elf.sections.map((item) => ({ name: item.name, offset: item.offset, size: item.size }));
  const exact = (value: string) => {
    const offsets = allOffsets(executable, Buffer.from(value, "ascii"));
    return { value, count: offsets.length, offsets, sections: sectionsFor(offsets, sections) };
  };
  const formatFingerprint = (value: string, compiledPrefix: string) => {
    const offsets = allOffsets(executable, Buffer.from(compiledPrefix, "ascii"));
    return { value, count: offsets.length, offsets, sections: sectionsFor(offsets, sections) };
  };
  const splitFormatFingerprint = (value: string, compiledPrefix: string, nearbySuffix: string) => {
    const suffix = Buffer.from(nearbySuffix, "ascii");
    const offsets = allOffsets(executable, Buffer.from(compiledPrefix, "ascii")).filter((offset) => executable.subarray(offset, Math.min(executable.length, offset + 256)).includes(suffix));
    return { value, count: offsets.length, offsets, sections: sectionsFor(offsets, sections) };
  };
  const postName = allOffsets(executable, Buffer.from("PostPythLazerOracleUpdate", "ascii"));
  const twapName = allOffsets(executable, Buffer.from("UpdatePerpBidAskTwap", "ascii"));
  const postPathValue = "programs/velocity/src/instructions/pyth_lazer_oracle.rs";
  const twapPathValue = "programs/velocity/src/instructions/keeper.rs";
  const postPath = allOffsets(executable, Buffer.from(postPathValue, "ascii"));
  const twapPath = allOffsets(executable, Buffer.from(twapPathValue, "ascii"));
  const skip = splitFormatFingerprint(DEPLOYED_SKIP_LOG, "Skipping lazer price update. next_timestamp ", " <= current_timestamp ");
  if (skip.count !== 1) throw new Error(`Expected exactly one deployed <= skip format prefix, observed ${skip.count}`);
  const relevantVelocity = (path: string) => sourceBlobs.filter((item) => item.repository === plan.repositories.velocity && item.path === path);
  const commonLimits = ["No exact reproducible build maps the public handler to this executable.", "The ELF has no bounded symbol/relocation reference that proves the exact deployed mutation branch."];
  return {
    schemaVersion: "2.2", executableSha256: extraction.executableSha256, boundedAnalysis: true,
    variants: [
      {
        variant: POST_VARIANT, discriminatorHex: POST_DISCRIMINATOR,
        discriminatorOffsets: allOffsets(executable, Buffer.from(POST_DISCRIMINATOR, "hex")), instructionName: "PostPythLazerOracleUpdate", instructionNameOffsets: postName,
        sourcePath: postPathValue, sourcePathOffsets: postPath,
        exactLogFingerprints: [formatFingerprint(DEPLOYED_POST_LOG, "Posting new lazer update. current ts "), skip], accountCardinalities: [6],
        sourceBlobPins: [...relevantVelocity("programs/velocity/src/instructions/pyth_lazer_oracle.rs"), ...relevantVelocity("programs/velocity/src/state/pyth_lazer_oracle.rs")],
        evidenceLevel: 4, correspondence: "strong-deployed-fingerprint", level5Reached: false,
        limitations: [...commonLimits, "Rust formatting arguments compile as literal fragments; the binary count uses the exact stable format prefix and nearby <= suffix, while transaction logs preserve the fully rendered wording.", "The public source-family skip predicate differs from the deployed observed equality branch exactly at equal timestamps."],
      },
      {
        variant: TWAP_VARIANT, discriminatorHex: TWAP_DISCRIMINATOR,
        discriminatorOffsets: allOffsets(executable, Buffer.from(TWAP_DISCRIMINATOR, "hex")), instructionName: "UpdatePerpBidAskTwap", instructionNameOffsets: twapName,
        sourcePath: twapPathValue, sourcePathOffsets: twapPath,
        exactLogFingerprints: [formatFingerprint("after amm bid twap = {} -> {}", "after amm bid twap = ")], accountCardinalities: [5, 7],
        sourceBlobPins: relevantVelocity("programs/velocity/src/instructions/keeper.rs"), evidenceLevel: 4,
        correspondence: "strong-deployed-fingerprint", level5Reached: false, limitations: commonLimits,
      },
    ],
    deployedSkipInvestigation: {
      exactString: DEPLOYED_SKIP_LOG, occurrenceCount: skip.count, offsets: skip.offsets, sections: skip.sections,
      nearbyStrings: boundedNearbyStrings(executable, skip.offsets[0]!), boundedCodeReferenceEstablished: false,
      publicHistory: sourceHistoryRows(binaryResult), stringVersionMismatch: true, controlConditionMismatchAtEquality: true,
      deployedPredicatesComplementary: true, semanticMismatchEstablished: false,
      explanation: "The compiled ELF contains one exact skip format prefix with the nearby <= suffix; Rust formatting arguments are separate fragments, while all rendered transaction logs preserve the complete wording. The deployed skip predicate (next <= current) is the logical complement of the deployed positive/posting predicate (current < next), so those two deployed formulations are not contradictory. The public source-family skip predicate (next < current) differs at equality and would admit the equality case that the deployed observations skip. That is a version/control-condition mismatch; without an exact build or code reference it does not establish a broader state-transition semantic mismatch.",
    },
    nativeVariant: { correspondence: "unresolved", excludedFromPromotion: true },
  };
}

export function chooseMilestone22Outcome(evidence: { structureEstablished: boolean; bothVariantsSufficient: boolean; relevantStateTransitionsEstablished: boolean }): Milestone22Outcome {
  if (evidence.structureEstablished && evidence.bothVariantsSufficient && evidence.relevantStateTransitionsEstablished) return "anchor-variant-semantics-established";
  if (evidence.structureEstablished) return "repeated-update-structure-established-semantics-incomplete";
  return "no-additional-semantic-bridge";
}

function buildSemanticEvidence(bundles: AnchorBundleEvidence[]): AnchorSemanticEvidence {
  const outcome = chooseMilestone22Outcome({ structureEstablished: bundles.length === 6, bothVariantsSufficient: false, relevantStateTransitionsEstablished: false });
  return {
    schemaVersion: "2.2", outcome,
    variants: [
      {
        variant: POST_VARIANT, reachedLevels: [1, 2, 3, 4], highestLevel: 4, level5Reached: false,
        observedStructure: ["Exact six-account declarations and ordered posting/skip logs", "One locally verified 149-byte signed payload repeated three times per block", "Feed IDs 6/1/2 derive to the exact three writable oracle PDAs", "Exact deployed <= string occurs once in the established executable"],
        sourceFamilyBehavior: ["The public handler validates the preceding Ed25519 instruction, decodes feeds, derives PDAs, and continues on its skip branch before field writes.", "The public source-family skip predicate uses <, while the deployed equality observations use <=."],
        deployedMutationConclusion: "incomplete", blockers: ["No exact reproducible build", "No bounded code reference to the deployed branch", "Material equality-edge control mismatch with public source"],
      },
      {
        variant: TWAP_VARIANT, reachedLevels: [1, 2, 3, 4], highestLevel: 4, level5Reached: false,
        observedStructure: ["Exact discriminator-only payload in all 18 transactions", "Three stable market/oracle paths, with maker inputs on two paths", "Ordered before-to-after TWAP logs in every Anchor transaction"],
        sourceFamilyBehavior: ["The public keeper handler mutably loads one perpetual market and enters its bid/ask TWAP and funding-related path."],
        deployedMutationConclusion: "incomplete", blockers: ["No exact reproducible build", "Logs and source-family correspondence do not alone prove the exact deployed field writes"],
      },
    ],
    repeatedUpdate: {
      sameSignedMessagePerBlock: true, sameOraclePdaSetPerBlock: true, firstObservedPath: "posting-logs", laterObservedPaths: "equal-timestamp-skip-logs",
      exactDeployedNoOpEstablished: false, classification: "state-dependent-below-level-5",
      reason: "The later two transactions visibly emit three equal-timestamp skip logs, but the word skip is not used as mutation proof. The source-family continue-before-write behavior is Level 4 only and differs at the observed equality edge, so no deployed no-op/overwrite conclusion is promoted.",
    },
    twapTargets: { distinctMarketStatePerBundle: true, markets: Object.values(ROLE_MARKETS).map((item) => item.market).sort(), observedTwapLogsOnAllTransactions: true, exactDeployedMutationEstablished: false },
    authorization: { anchorVariantSemanticDecoderAllowed: false, laterAnchorCounterfactualMilestoneAllowed: false, optimizationImplemented: false },
    nonClaims: ["No semantic decoder or counterfactual was added.", "No account was removed, reflagged, or deduplicated.", "Block transaction order is not execution or arrival order.", "No current schedulability, throughput, validator schedule, trading, wallet, or MEV claim is made."],
  };
}

function inputPaths(candidatePlan: VelocityResearchPlan, binaryPlan: Milestone21Plan, base: Milestone22Plan): Array<{ path: string; purpose: string }> {
  const fixed = [
    { path: base.priorPlans.sourceability, purpose: "Milestone 2.0 sourceability manifest" },
    { path: base.priorPlans.candidate, purpose: "Candidate #3 exact-occurrence manifest" },
    { path: base.priorPlans.binary, purpose: "Milestone 2.1 executable/source manifest" },
    { path: "output/research/candidate-043c938568ad5e15/candidate-dossier.json", purpose: "Prior Candidate #3 decision" },
    { path: "output/research/candidate-043c938568ad5e15/candidate-evidence.ndjson", purpose: "Prior exact occurrence evidence" },
    { path: "output/research/candidate-043c938568ad5e15/instruction-layout.json", purpose: "Prior instruction/account layout" },
    { path: "output/research/candidate-043c938568ad5e15/signer-message-summary.json", purpose: "Prior signer/message totals" },
    { path: "output/research/sourceability/sourceability-index.json", purpose: "Protected sourceability ordering" },
    { path: "output/research/velocity-binary/deployed-programdata-metadata.json", purpose: "Established executable extraction" },
    { path: "output/research/velocity-binary/deployed-section-manifest.json", purpose: "ELF section boundaries" },
    { path: "output/research/velocity-binary/deployed-strings.txt", purpose: "Deterministic deployed strings" },
    { path: "output/research/velocity-binary/source-history.json", purpose: "Bounded public source history" },
    { path: "output/research/velocity-binary/binary-fingerprint-matrix.json", purpose: "Prior binary fingerprints" },
    { path: "output/research/velocity-binary/variant-correspondence.json", purpose: "Prior per-variant correspondence" },
    { path: "output/research/velocity-binary/deployment-history.json", purpose: "Established sample binary continuity" },
  ];
  const merged = [...fixed, ...candidatePlan.inputEvidence.map((item) => ({ path: item.path, purpose: `Candidate dossier input: ${item.kind}` })), ...binaryPlan.inputs.map((item) => ({ path: item.path, purpose: item.purpose }))];
  const byPath = new Map<string, { path: string; purpose: string }>();
  for (const item of merged) if (!byPath.has(slash(item.path))) byPath.set(slash(item.path), { path: slash(item.path), purpose: item.purpose });
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

const SOURCE_DEFINITIONS = [
  { owner: "velocity" as const, path: "programs/velocity/src/instructions/pyth_lazer_oracle.rs", purpose: "Velocity source-family PostPyth handler and comparison/write branch" },
  { owner: "velocity" as const, path: "programs/velocity/src/instructions/keeper.rs", purpose: "Velocity source-family UpdatePerpBidAskTwap handler" },
  { owner: "velocity" as const, path: "programs/velocity/src/state/pyth_lazer_oracle.rs", purpose: "Velocity oracle account layout, PDA seed, and storage ID" },
  { owner: "velocity" as const, path: "programs/pyth-lazer/src/lib.rs", purpose: "Historical source-family property discriminants and channel IDs" },
  { owner: "velocity" as const, path: "programs/pyth-lazer/src/payload.rs", purpose: "Historical source-family payload serialization" },
  { owner: "pyth" as const, path: "sdk/rust/protocol/src/lib.rs", purpose: "Pyth-maintained property discriminants and channel IDs" },
  { owner: "pyth" as const, path: "sdk/rust/protocol/src/payload.rs", purpose: "Pyth-maintained payload serialization including FeedUpdateTimestamp" },
  { owner: "pyth" as const, path: "sdk/rust/protocol/src/message.rs", purpose: "Pyth-maintained Solana signed-message envelope" },
];

async function sourcePins(base: Milestone22Plan): Promise<SourceBlobPin[]> {
  return SOURCE_DEFINITIONS.map((definition) => {
    const repository = base.repositories[definition.owner];
    const commit = base.pinnedCommits[definition.owner];
    return {
      repository: slash(repository),
      repositoryUrl: definition.owner === "velocity" ? "https://github.com/velocity-exchange/protocol-v2" : "https://github.com/pyth-network/pyth-lazer-public",
      commit, path: definition.path, sha256: sha256(gitBlob(repository, commit, definition.path)), purpose: definition.purpose,
    };
  });
}

export async function bootstrapMilestone22Plan(base: Milestone22Plan): Promise<Milestone22Plan> {
  const sourceabilityPlan = await loadSourceabilityPlan(base.priorPlans.sourceability);
  const candidatePlan = await loadVelocityResearchPlan(base.priorPlans.candidate);
  const binaryPlan = await loadMilestone21Plan(base.priorPlans.binary);
  const candidateResult = await runMilestone20(sourceabilityPlan, candidatePlan, { offline: true });
  await runMilestone21(binaryPlan, { offline: true });
  const paths = inputPaths(candidatePlan, binaryPlan, base);
  const inputs: Milestone22Input[] = await Promise.all(paths.map(async (item) => ({ ...item, sha256: await fileSha256(item.path) })));
  const criticalPrior = Object.fromEntries((await Promise.all([
    "output/research/candidate-043c938568ad5e15/candidate-dossier.json",
    "output/research/candidate-043c938568ad5e15/candidate-evidence.ndjson",
    "output/research/candidate-043c938568ad5e15/instruction-layout.json",
    "output/research/candidate-043c938568ad5e15/signer-message-summary.json",
    "output/research/sourceability/sourceability-index.json",
    "output/research/sourceability/program-family-map.json",
    "output/research/velocity-binary/deployed-programdata-metadata.json",
    "output/research/velocity-binary/deployed-executable-metadata.json",
    "output/research/velocity-binary/deployed-section-manifest.json",
    "output/research/velocity-binary/deployed-strings.txt",
    "output/research/velocity-binary/source-history.json",
    "output/research/velocity-binary/build-attempts.json",
    "output/research/velocity-binary/binary-fingerprint-matrix.json",
    "output/research/velocity-binary/variant-correspondence.json",
    "output/research/velocity-binary/deployment-history.json",
  ].map(async (path) => [path, await fileSha256(path)] as const))));
  return {
    ...base, expectedBundles: await observedBundlePins(candidateResult.occurrences), inputs, sourceBlobs: await sourcePins(base),
    preservedArtifactHashes: { ...binaryPlan.preservedArtifactHashes, ...criticalPrior },
  };
}

export async function loadMilestone22Plan(path: string): Promise<Milestone22Plan> {
  const plan = JSON.parse(await readFile(resolve(path), "utf8")) as Milestone22Plan;
  if (plan.schemaVersion !== "2.2" || plan.programId !== VELOCITY_PROGRAM) throw new Error("Unsupported Milestone 2.2 plan");
  return plan;
}

async function programDataSnapshotBytes(binaryPlan: Milestone21Plan): Promise<Buffer> {
  const rawSnapshot = JSON.parse(await readFile(resolve(binaryPlan.cache.accountSnapshotsRaw), "utf8")) as {
    addresses?: string[];
    response?: { result?: { value?: Array<{ data?: [string, string] } | null> } };
  };
  const index = rawSnapshot.addresses?.indexOf(binaryPlan.programDataAddress) ?? -1;
  const data = index >= 0 ? rawSnapshot.response?.result?.value?.[index]?.data : undefined;
  if (!data || data[1] !== "base64") throw new Error("ProgramData snapshot bytes are missing");
  return Buffer.from(data[0], "base64");
}

function assertPrior(candidateResult: Awaited<ReturnType<typeof runMilestone20>>, binaryResult: Awaited<ReturnType<typeof runMilestone21>>, plan: Milestone22Plan): void {
  if (candidateResult.dossier.decision !== plan.expectedPriorDecision || candidateResult.dossier.exactIdentity.recurrenceBlockCount !== 6) throw new Error("Candidate #3 prior decision changed");
  if (binaryResult.overallOutcome !== plan.expectedBinaryOutcome || binaryResult.continuity !== plan.expectedContinuity) throw new Error("Milestone 2.1 outcome/continuity changed");
  const executable = binaryResult.executable as { payloadSha256: string };
  if (executable.payloadSha256 !== plan.expectedExecutableSha256) throw new Error("Velocity executable hash changed");
  const variants = (binaryResult.variantCorrespondence as { variants: Array<{ observedVariant: string; confidence: string }> }).variants;
  const expected = new Map([[POST_VARIANT, "strong"], [TWAP_VARIANT, "strong"], [NATIVE_VARIANT, "unresolved"]]);
  for (const [variant, confidence] of expected) if (!variants.some((item) => item.observedVariant === variant && item.confidence === confidence)) throw new Error(`Prior variant status changed: ${variant}`);
  if (candidateResult.sourceabilityIndex.candidates.find((item) => item.candidateId === plan.candidateId)?.discoveryRank !== 3) throw new Error("Candidate #3 discovery rank changed");
}

export interface RunMilestone22Options { offline: boolean }

export async function runMilestone22(plan: Milestone22Plan, options: RunMilestone22Options): Promise<Milestone22Result> {
  if (!options.offline) throw new Error("Milestone 2.2 is a cache-only bounded replay; pass --offline");
  for (const [path, expected] of Object.entries(plan.preservedArtifactHashes)) {
    await assertFileSha256(path, expected, "Protected artifact");
  }
  await Promise.all(plan.inputs.map((input) => assertFileSha256(input.path, input.sha256, "Milestone 2.2 input")));
  for (const source of plan.sourceBlobs) {
    const observed = sha256(gitBlob(source.repository, source.commit, source.path));
    if (observed !== source.sha256) throw new Error(`Pinned source blob changed: ${source.repository}@${source.commit}:${source.path}`);
  }
  const sourceabilityPlan = await loadSourceabilityPlan(plan.priorPlans.sourceability);
  const candidatePlan = await loadVelocityResearchPlan(plan.priorPlans.candidate);
  const binaryPlan = await loadMilestone21Plan(plan.priorPlans.binary);
  const candidateResult = await runMilestone20(sourceabilityPlan, candidatePlan, { offline: true });
  const binaryResult = await runMilestone21(binaryPlan, { offline: true });
  assertPrior(candidateResult, binaryResult, plan);
  const pins = await observedBundlePins(candidateResult.occurrences);
  if (canonical(pins) !== canonical(plan.expectedBundles)) throw new Error("Anchor-bundle manifest pins no longer match the six cached occurrences");
  const bundles = await Promise.all(candidateResult.occurrences.map(anchorEvidence));
  assertBundleInvariants(bundles);
  const messageReuse = buildMessageReuse(bundles);
  const instructionEquivalence = buildInstructionEquivalence(bundles);
  const logBranches = buildLogBranches(bundles);
  const conflictAttribution = buildConflictAttribution(candidateResult.occurrences, bundles);
  const binaryCorrespondence = buildBinaryCorrespondence(plan, binaryResult, plan.sourceBlobs, await programDataSnapshotBytes(binaryPlan));
  const semanticEvidence = buildSemanticEvidence(bundles);
  const dossier: AnchorBundleDossier = {
    schemaVersion: "2.2", generatedAt: plan.generatedAt, outcome: semanticEvidence.outcome,
    executiveFinding: "All six Candidate #3 components repeat one exact three-transaction Anchor bundle around an excluded native transaction. One signed Pyth Lazer message and byte-identical Post instruction occur three times per block; the first block-position Anchor path emits three posting logs and the later two emit three equal-timestamp skip logs. Exact deployed mutation/no-op semantics remain below Level 5.",
    counts: { blocks: 6, componentTransactions: 24, anchorTransactions: 18, nativeTransactions: 6, locallyVerifiedSignatures: 18, distinctSignedMessages: 6, postingLogs: logBranches.totals.postingLogs, skippingLogs: logBranches.totals.skippingLogs, updateTwapInstructionLogs: logBranches.totals.updateTwapInstructionLogs, anchorEdges: 18, anchorAtoms: 72, nativeAtoms: 18 },
    stableRoleDefinition: (Object.entries(ROLE_MARKETS) as Array<[AnchorBundleRole, { market: string; oracle: string }]>).map(([role, value]) => ({ role, ...value, makerInputs: bundles[0]!.anchors.find((item) => item.role === role)!.updateTwap.makerInputs })),
    bundles, topologyFinding: "A/B/C are stable market-identity labels, not transaction ordinals. Their order rotates, but each block contains each role once, one common signed payload/Post account set, and three distinct TWAP market paths.",
    nativeBoundary: "The five-account native discriminator-2 transaction is included only for full-component graph context. It contributes one market-account atom to each Anchor path and remains semantically unresolved.",
    actionability: semanticEvidence.authorization,
    artifactPaths: {
      dossier: "anchor-bundle-dossier.json", report: "anchor-bundle-report.html", messageReuse: "message-reuse-matrix.json", instructionEquivalence: "instruction-equivalence.json", logBranches: "log-branch-matrix.json", conflictAttribution: "anchor-conflict-attribution.json", binaryCorrespondence: "anchor-binary-correspondence.json", semanticEvidence: "anchor-semantic-evidence.json",
    },
    inputProvenance: { files: plan.inputs, sourceBlobs: plan.sourceBlobs },
  };
  const result: Milestone22Result = {
    outcome: semanticEvidence.outcome, dossier, messageReuse, instructionEquivalence, logBranches, conflictAttribution, binaryCorrespondence, semanticEvidence,
    terminalSummary: `Milestone 2.2: ${semanticEvidence.outcome}; 6/6 bundles preserve one message across three Anchor transactions; observed first-post/later-skip topology established; mutation/no-op semantics remain Level 4; native path unresolved and excluded.`,
  };
  const output = resolve(plan.outputDirectory);
  await Promise.all([mkdir(output, { recursive: true }), mkdir(dirname(resolve(plan.documentationPath)), { recursive: true })]);
  await Promise.all([
    writeFile(resolve(output, "anchor-bundle-dossier.json"), json(dossier)),
    writeFile(resolve(output, "anchor-bundle-report.html"), milestone22Html(result)),
    writeFile(resolve(output, "message-reuse-matrix.json"), json(messageReuse)),
    writeFile(resolve(output, "instruction-equivalence.json"), json(instructionEquivalence)),
    writeFile(resolve(output, "log-branch-matrix.json"), json(logBranches)),
    writeFile(resolve(output, "anchor-conflict-attribution.json"), json(conflictAttribution)),
    writeFile(resolve(output, "anchor-binary-correspondence.json"), json(binaryCorrespondence)),
    writeFile(resolve(output, "anchor-semantic-evidence.json"), json(semanticEvidence)),
    writeFile(resolve(plan.documentationPath), milestone22Markdown(result)),
  ]);
  for (const [path, expected] of Object.entries(plan.preservedArtifactHashes)) {
    await assertFileSha256(path, expected, "Protected artifact during replay");
  }
  return result;
}
