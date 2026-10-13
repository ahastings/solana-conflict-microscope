import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeBase58Bytes, parseEd25519Instruction } from "./ed25519.js";
import type { RpcBlock } from "./types.js";

export const NATIVE_BUNDLE_PINS = {
  snapshot: { path: "cache/research/candidate-043c938568ad5e15/account-snapshots.raw.json", sha256: "49bf9f3880a931c3656e44e5b8c684b09978ec5743fc93eb7ce274978a673391" },
  block: { path: "fixtures/reviewer/slot-489572998.json", sha256: "c64b519554b772cd5384916bd6cb058e1eebe3aae502a01df02c4845adf38e18" },
  plan: { path: "research-plans/velocity-equality-replay-milestone-2.3.json", sha256: "3e4bcdb26178813f02dcf551d747825162016a2add8c909c94aea27c22368008" },
} as const;
const PROGRAM = "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P";
const PROGRAM_DATA = "HkRf36jvUB32dnHjHqpMnPcKJhUP2TUKJTH7RDTifJm7";
const ELF = "89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c";
const SYSVAR = "Sysvar1nstructions1111111111111111111111111";
const ORACLES = ["2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV", "J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ", "6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH"];
const NEXT_TIMESTAMP = 1787953585800000n;
const SIGNATURES = ["4rK8SP59vrAd4v7KpcYh4S8HD9iuSWKQJyroV9VRWTHvSmEmXvXqscwMur5jxjRFnrf1ZBhK7xJnvRpdDUbxNNs2", "5zayDMLz4wu8pKQXYbiucUsRWY3cSsmvVzKGTTZnBqnLSNXG694GoA6mkzHG4Y4LKmXH3MVb5fTYMEhJ4w8cDzxd", "3pktjLUnpv77XJfFB51PSdDjeC1KRc8LLQ3Lo5wafz2Fb3CkdMsFUppjTQwGeC4AwnhSb3nGqUnV9hTWdaCgA6wU"];
type Role = "anchor-A" | "anchor-B" | "anchor-C";
interface AccountValue { owner: string; lamports: number | string; executable: boolean; rentEpoch: number | string; data: [string, string]; space: number }
export interface CapturedBundleSnapshot {
  retrievedAt: string;
  endpoint: string;
  commitment: string;
  addresses: string[];
  response: { result: { context: { slot: number }; value: Array<AccountValue | null> } };
}
export interface CapturedBundleBlock { slot: number; provenance: unknown; block: RpcBlock }
export interface NativeBundleAccount { address: string; owner: string; lamports: string; executable: boolean; rentEpoch: string; dataBase64: string; dataSha256: string }
export interface NativeBundleInstruction { programId: string; dataHex: string; accounts: Array<{ address: string; signer: boolean; writable: boolean }> }
interface Mutation { address: string; byteRange: { start: 16; endExclusive: 24 }; originalValue: string; newValue: string; originalDataSha256: string; newDataSha256: string; originalBytesHex: string; newBytesHex: string }
interface Scenario { id: string; clock: { slot: number; unixTimestamp: number }; instructionCount: 4 | 5; accounts: NativeBundleAccount[]; order: Role[]; mutations: Mutation[]; classification: "constructed-fixture"; purpose: string }
export interface NativeBundleFixture {
  schemaVersion: "full-bundle-fixture-1";
  programId: string;
  elfSha256: string;
  provenance: {
    classification: "constructed-current-state-derived-fixture";
    historicalPrestate: false;
    sourcePinsVerified: boolean;
    nativeExecutionPerformed: false;
    snapshot: { slot: number; retrievedAt: string; endpoint: string; commitment: string };
    observedBlock: { slot: number; provenance: unknown };
    sourceFiles: Array<{ kind: string; path: string; sha256: string }>;
    mutationEvidence: string;
    instructionsSysvar: string;
    computeUnitLimit: number;
    nextTimestamp: string;
    originalOracleTimestamp: string;
  };
  transactions: Array<{ id: Role; instructions: NativeBundleInstruction[] }>;
  scenarios: Scenario[];
}
const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Native bundle fixture rejected: ${message}`); }
function decimal(value: number | string, field: string): string {
  check(typeof value === "string" ? /^\d+$/.test(value) : Number.isSafeInteger(value) && value >= 0, `invalid ${field}`);
  const integer = BigInt(value); check(integer >= 0n && integer <= 18446744073709551615n, `${field} exceeds u64`); return integer.toString();
}

/** Pure transformation; file pins are verified only by prepareNativeBundleFixture. */
export function buildNativeBundleFixture(snapshot: CapturedBundleSnapshot, cached: CapturedBundleBlock): NativeBundleFixture {
  check(cached.slot === 489572998 && snapshot.response.result.context.slot === 490041839, "slot identity changed");
  check(snapshot.addresses.length === snapshot.response.result.value.length && new Set(snapshot.addresses).size === snapshot.addresses.length, "duplicate or mismatched snapshot entries");
  const transactions = (["anchor-A", "anchor-B", "anchor-C"] as const).map((id, position) => {
    const transaction = cached.block.transactions[position + 1];
    check(transaction && transaction.transaction.signatures[0] === SIGNATURES[position] && transaction.meta?.err === null, `transaction identity/status changed for ${id}`);
    const message = transaction.transaction.message, raw = transaction.rawTransaction?.message.instructions, parsed = message.instructions;
    check(raw?.length === 5 && parsed?.length === 5, `five instructions required for ${id}`);
    check(new Set(message.accountKeys.map((account) => account.pubkey)).size === message.accountKeys.length, "duplicate transaction account key");
    const instructions = raw.map((instruction, index) => {
      const described = parsed[index]!, program = message.accountKeys[instruction.programIdIndex];
      check(program && "programId" in described && described.programId === program.pubkey && described.data === instruction.data, "raw/parsed instruction identity changed");
      const accounts = instruction.accounts.map((accountIndex) => {
        const account = message.accountKeys[accountIndex]; check(account && typeof account.signer === "boolean" && typeof account.writable === "boolean", "invalid instruction account reference");
        return { address: account.pubkey, signer: account.signer, writable: account.writable };
      });
      check(JSON.stringify(described.accounts) === JSON.stringify(accounts.map((account) => account.address)), "raw/parsed instruction account list changed");
      return { programId: program.pubkey, dataHex: Buffer.from(decodeBase58Bytes(instruction.data)).toString("hex"), accounts };
    });
    const limit = Buffer.from(instructions[0]!.dataHex, "hex");
    check(instructions[0]!.programId === "ComputeBudget111111111111111111111111111111" && limit.length === 5 && limit[0] === 2 && limit.readUInt32LE(1) === 200000, "observed compute-unit limit differs from harness 200000");
    check(instructions[2]!.programId === "Ed25519SigVerify111111111111111111111111111" && instructions[3]!.programId === PROGRAM && instructions[4]!.programId === PROGRAM, "program identity changed");
    check(instructions[3]!.dataHex.startsWith("daedaaf5278fa621") && instructions[4]!.dataHex === "f717ff41d45addc2", "Post/TWAP discriminator changed");
    const verified = parseEd25519Instruction(instructions.map((instruction) => Buffer.from(instruction.dataHex, "hex")), 2);
    check(verified.status === "decoded" && verified.signatures.length === 1 && verified.signatures[0]!.locallyVerified, "public Ed25519 signature verification failed");
    const nextLogs = transaction.meta!.logMessages?.filter((line) => line.includes("next_timestamp")) ?? [];
    check(nextLogs.length === 3 && nextLogs.every((line) => line.includes(NEXT_TIMESTAMP.toString())), "message timestamp log evidence changed");
    return { id, instructions };
  });
  check(new Set(transactions.map((transaction) => transaction.instructions[3]!.dataHex)).size === 1, "Post payload reuse changed");
  const addresses = [...new Set(transactions.flatMap((transaction) => transaction.instructions.flatMap((instruction) => instruction.accounts.map((account) => account.address))))].filter((address) => address !== SYSVAR).sort();
  const accounts = addresses.map((address): NativeBundleAccount => {
    const index = snapshot.addresses.indexOf(address), source = index < 0 ? null : snapshot.response.result.value[index];
    check(source, `missing ordinary account ${address}`);
    check(typeof source.owner === "string" && typeof source.executable === "boolean" && source.data[1] === "base64", `invalid account metadata ${address}`);
    const data = Buffer.from(source.data[0], "base64");
    check(data.toString("base64") === source.data[0] && data.length === source.space, `account data length/encoding changed ${address}`);
    return { address, owner: source.owner, lamports: decimal(source.lamports, "lamports"), executable: source.executable, rentEpoch: decimal(source.rentEpoch, "rentEpoch"), dataBase64: source.data[0], dataSha256: sha256(data) };
  });
  const oracleAccounts = ORACLES.map((address) => { const account = accounts.find((item) => item.address === address); check(account, "missing oracle"); const bytes = Buffer.from(account.dataBase64, "base64"); check(account.owner === PROGRAM && !account.executable && bytes.length === 48 && bytes.subarray(0, 8).toString("hex") === "9f07a1f922517985", "oracle owner/size/discriminator changed"); return bytes; });
  const originalTimestamp = oracleAccounts[0]!.readBigUInt64LE(16);
  check(oracleAccounts.every((data) => data.readBigUInt64LE(16) === originalTimestamp) && originalTimestamp > NEXT_TIMESTAMP, "snapshot oracle timestamps no longer agree or exceed the message");
  const mutated = accounts.map((account) => {
    if (!ORACLES.includes(account.address)) return { ...account };
    const data = Buffer.from(account.dataBase64, "base64"); data.writeBigUInt64LE(NEXT_TIMESTAMP - 1n, 16);
    return { ...account, dataBase64: data.toString("base64"), dataSha256: sha256(data) };
  });
  const mutations: Mutation[] = ORACLES.map((address) => {
    const before = accounts.find((item) => item.address === address)!, after = mutated.find((item) => item.address === address)!;
    const original = Buffer.from(before.dataBase64, "base64"), next = Buffer.from(after.dataBase64, "base64");
    check(original.subarray(0, 16).equals(next.subarray(0, 16)) && original.subarray(24).equals(next.subarray(24)), "mutation escaped timestamp range");
    return { address, byteRange: { start: 16, endExclusive: 24 }, originalValue: originalTimestamp.toString(), newValue: (NEXT_TIMESTAMP - 1n).toString(), originalDataSha256: before.dataSha256, newDataSha256: after.dataSha256, originalBytesHex: original.subarray(16, 24).toString("hex"), newBytesHex: next.subarray(16, 24).toString("hex") };
  });
  const messageClock = { slot: cached.slot, unixTimestamp: Number(NEXT_TIMESTAMP / 1000000n + 1n) };
  const snapshotClock = { slot: snapshot.response.result.context.slot, unixTimestamp: Number(originalTimestamp / 1000000n + 1n) };
  check(Number.isSafeInteger(messageClock.unixTimestamp) && Number.isSafeInteger(snapshotClock.unixTimestamp), "Clock timestamp exceeds safe integer");
  const scenario = (id: string, clock: Scenario["clock"], instructionCount: 4 | 5, order: Role[], change: boolean, purpose: string): Scenario => ({ id, clock, instructionCount, accounts: structuredClone(change ? mutated : accounts), order, mutations: change ? structuredClone(mutations) : [], classification: "constructed-fixture", purpose });
  return {
    schemaVersion: "full-bundle-fixture-1", programId: PROGRAM, elfSha256: ELF,
    provenance: { classification: "constructed-current-state-derived-fixture", historicalPrestate: false, sourcePinsVerified: false, nativeExecutionPerformed: false, snapshot: { slot: snapshot.response.result.context.slot, retrievedAt: snapshot.retrievedAt, endpoint: snapshot.endpoint, commitment: snapshot.commitment }, observedBlock: { slot: cached.slot, provenance: cached.provenance }, sourceFiles: [], mutationEvidence: "Oracle [16,24) is the deployed-branch-validated field from the frozen Milestone 2.3 plan/experiment; only these eight input bytes are changed.", instructionsSysvar: "Excluded from supplied accounts; runtime must construct each role's instruction context and current index. The four-instruction controls intentionally omit trailing TWAP.", computeUnitLimit: 200000, nextTimestamp: NEXT_TIMESTAMP.toString(), originalOracleTimestamp: originalTimestamp.toString() },
    transactions,
    scenarios: [
      scenario("unchanged-snapshot-full", snapshotClock, 5, ["anchor-A", "anchor-B", "anchor-C"], false, "Unchanged captured ordinary account bytes with explicitly constructed snapshot-derived Clock; no historical prestate claim."),
      scenario("timestamp-mutated-clock-zero-guard", { slot: 0, unixTimestamp: 0 }, 4, ["anchor-A"], true, "Post-only future-message guard control; a successful return need not mean an oracle write."),
      scenario("timestamp-mutated-post-write-control", messageClock, 4, ["anchor-A"], true, "Post-only candidate successful-write control; observer must prove actual oracle changes before interpreting the full sequence."),
      scenario("timestamp-mutated-full-message-clock", messageClock, 5, ["anchor-A", "anchor-B", "anchor-C"], true, "Complete observed order using message-derived Clock and later captured market/maker state; failures are evidence."),
      scenario("timestamp-mutated-full-snapshot-clock", snapshotClock, 5, ["anchor-A", "anchor-B", "anchor-C"], true, "Complete observed order using snapshot-derived Clock; old-message acceptance and TWAP behavior are unproven."),
      scenario("timestamp-mutated-full-snapshot-clock-swapped-consumers", snapshotClock, 5, ["anchor-A", "anchor-C", "anchor-B"], true, "Constructed consumer-order comparison after producer; no permutation-invariance assumption."),
    ],
  };
}

export const NATIVE_BUNDLE_ELF_PATH = "cache/research/velocity-equality-replay/velocity-deployed.so";

async function guardedWorkspacePath(workspaceRoot: string, target: string) {
  const root = await realpath(resolve(workspaceRoot));
  const part = relative(root, target);
  check(part !== "" && !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`), "output must remain inside this workspace");
  const components = part.split(sep);
  let current = root;
  for (let index = 0; index < components.length; index++) {
    current = resolve(current, components[index]!);
    let info;
    try { info = await lstat(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    check(!info.isSymbolicLink(), `refusing linked output path: ${current}`);
    const canonical = relative(root, await realpath(current));
    check(!isAbsolute(canonical) && canonical !== ".." && !canonical.startsWith(`..${sep}`), "output escapes this workspace");
    if (index < components.length - 1) check(info.isDirectory(), `output ancestor is not a directory: ${current}`);
    else return info;
  }
  return null;
}

/** Copies only bytes matching the supplied pin; production passes the verified ProgramData payload and frozen ELF hash. */
export async function materializeVerifiedNativeElf(bytes: Uint8Array, expectedSha256: string, workspaceRoot: string): Promise<{ path: string; status: "created" | "reused" }> {
  check(sha256(bytes) === expectedSha256, "ELF bytes do not match the expected SHA-256");
  const root = resolve(workspaceRoot), path = resolve(root, NATIVE_BUNDLE_ELF_PATH);
  const verifyExisting = async () => {
    const info = await guardedWorkspacePath(root, path);
    check(info?.isFile(), "existing ELF is not a regular file");
    const existing = await readFile(path);
    check(sha256(existing) === expectedSha256 && existing.equals(Buffer.from(bytes)), "existing ELF differs from verified bytes; refusing to overwrite");
    return { path, status: "reused" as const };
  };
  if (await guardedWorkspacePath(root, path)) return verifyExisting();
  await mkdir(dirname(path), { recursive: true });
  await guardedWorkspacePath(root, path);
  try { await writeFile(path, bytes, { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return verifyExisting();
    throw error;
  }
  return { path, status: "created" };
}
export async function prepareNativeBundleFixture(options: { snapshotPath?: string; blockPath?: string; planPath?: string; outputPath?: string } = {}) {
  const paths = { snapshot: options.snapshotPath ?? NATIVE_BUNDLE_PINS.snapshot.path, block: options.blockPath ?? NATIVE_BUNDLE_PINS.block.path, plan: options.planPath ?? NATIVE_BUNDLE_PINS.plan.path };
  const bytes = await Promise.all((["snapshot", "block", "plan"] as const).map(async (kind) => { const data = await readFile(resolve(paths[kind])); check(sha256(data) === NATIVE_BUNDLE_PINS[kind].sha256, `${kind} SHA-256 mismatch`); return data; }));
  const snapshot = JSON.parse(bytes[0]!.toString("utf8")) as CapturedBundleSnapshot;
  const fixture = buildNativeBundleFixture(snapshot, JSON.parse(bytes[1]!.toString("utf8")) as CapturedBundleBlock);
  const plan = JSON.parse(bytes[2]!.toString("utf8")) as { expectedExecutableSha256: string; representative: { slot: number; transactionSignature: string }; instructionFixture: { instructions: NativeBundleInstruction[] } };
  check(plan.expectedExecutableSha256 === ELF && plan.representative.slot === 489572998 && plan.representative.transactionSignature === SIGNATURES[0], "historical plan identity changed");
  const normalizedPlan = plan.instructionFixture.instructions.map(({ programId, dataHex, accounts }) => ({ programId, dataHex, accounts: accounts.map(({ address, signer, writable }) => ({ address, signer, writable })) }));
  check(JSON.stringify(normalizedPlan) === JSON.stringify(fixture.transactions[0]!.instructions), "observed Anchor-A differs from historical five-instruction fixture");
  const programData = snapshot.response.result.value[snapshot.addresses.indexOf(PROGRAM_DATA)]; check(programData, "missing exact ELF source account");
  const deployed = Buffer.from(programData.data[0], "base64");
  check(deployed.length > 45 && deployed.readUInt32LE(0) === 3 && deployed[12] === 1 && sha256(deployed.subarray(45)) === ELF, "deployed ELF identity mismatch");
  fixture.provenance.sourcePinsVerified = true;
  fixture.provenance.sourceFiles = (["snapshot", "block", "plan"] as const).map((kind) => ({ kind, path: paths[kind], sha256: NATIVE_BUNDLE_PINS[kind].sha256 }));
  const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
  const outputPath = resolve(options.outputPath ?? resolve(workspaceRoot, "output/native-full-bundle/fixture.json")), serialized = `${JSON.stringify(fixture, null, 2)}\n`;
  check(await guardedWorkspacePath(workspaceRoot, outputPath) === null, "fixture output already exists; refusing to overwrite");
  const elf = await materializeVerifiedNativeElf(deployed.subarray(45), ELF, workspaceRoot);
  await guardedWorkspacePath(workspaceRoot, outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await guardedWorkspacePath(workspaceRoot, outputPath);
  await writeFile(outputPath, serialized, { flag: "wx" });
  return { fixture, outputPath, sha256: sha256(serialized), elf };
}
