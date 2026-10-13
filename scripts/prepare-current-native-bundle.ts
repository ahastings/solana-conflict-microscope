import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { decodeBase58Bytes } from "../src/ed25519.js";
import type { CapturedBundleBlock, NativeBundleAccount, NativeBundleInstruction } from "../src/native-bundle-fixture.js";

// An exact, separately captured experiment. Historical fixture/ELF pins remain untouched.
const CAPTURE = "output/current-bundle-capture-oaBfzh";
const PINS = {
  "snapshot-metadata.json": "0389e2b6a79bdad6e226e19710a0424b3863ae36996e5f9f083201cd1452acb4",
  "snapshot.response.json": "937e9ab7ea5f0af6373bacec749848b9ce77cc6acc7a49d6d263f69f4d43236b",
  "clock-and-deployment-after.response.json": "0e933d8e3699547b933721718ade826c30c8d896b6ab8aff578cb8a4320dd1e0",
  "capture.json": "2cf46acf0ad3a2273d1ae36f67ab5bbb57b0adf6f898d9327f149f35ad84ed99",
  "slot-503411001.json": "50a65f1c35fa88b31565781c34283369e7afe0a1e68d1bf7cceabc24e13f97d3",
  "offline-gates-v1.json": "f339694fec98b2a02b6bf2e950c2f85022b318c545c3fc4f7497ff5b61faa9cf",
  "validate-offline-gates-v1.mjs": "c34858ae54012022ff68729ef2a7dece9be044200491aae1ebacb1e2e47b6045",
  "current-deployed.so": "7fd13697bfc5bbd1dfd85648c28d80ebe8591052ecba7d8b2e00266a95f7a7cb",
} as const;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
interface Account { owner: string; lamports: number | string; executable: boolean; rentEpoch: number | string; data: [string, string]; space: number }
function exactJson<T>(bytes: Buffer): T {
  return JSON.parse(bytes.toString(), (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number" || !Number.isInteger(value) || Number.isSafeInteger(value)) return value;
    check(context?.source && /^\d+$/.test(context.source), "JSON integer precision unavailable; use Node 24");
    return context.source;
  }) as T;
}
function decimal(value: number | string): string {
  check(typeof value === "string" ? /^\d+$/.test(value) : Number.isSafeInteger(value), "unsafe account integer");
  const n = BigInt(value); check(n >= 0n && n <= 18446744073709551615n, "account integer outside u64"); return n.toString();
}
async function main() {
  const files = new Map<string, Buffer>();
  for (const [name, pin] of Object.entries(PINS)) {
    const bytes = await readFile(resolve(CAPTURE, name));
    check(hash(bytes) === pin, "Captured source hash mismatch: " + name); files.set(name, bytes);
  }
  const json = <T>(name: keyof typeof PINS) => exactJson<T>(files.get(name)!);
  const metadata = json<{ addresses: string[]; ordinaryAddresses: string[] }>("snapshot-metadata.json");
  const snapshot = json<{ result: { context: { slot: number }; value: Account[] } }>("snapshot.response.json");
  const after = json<{ result: { context: { slot: number }; value: Account[] } }>("clock-and-deployment-after.response.json");
  const block = json<CapturedBundleBlock>("slot-503411001.json");
  const audit = json<{ passed: number; failed: number }>("offline-gates-v1.json");
  check(audit.passed === 32 && audit.failed === 0, "Offline provenance gates did not pass");
  const clockBytes = Buffer.from(after.result.value[2]!.data[0], "base64");
  check(clockBytes.length === 40, "Full observed Clock required");
  const clock = Object.fromEntries(Object.entries({
    slot: Number(clockBytes.readBigUInt64LE(0)), epochStartTimestamp: Number(clockBytes.readBigInt64LE(8)),
    epoch: Number(clockBytes.readBigUInt64LE(16)), leaderScheduleEpoch: Number(clockBytes.readBigUInt64LE(24)),
    unixTimestamp: Number(clockBytes.readBigInt64LE(32)), dataBase64: clockBytes.toString("base64"), dataSha256: hash(clockBytes),
  }).sort(([a], [b]) => a.localeCompare(b))) as { slot: number; epochStartTimestamp: number; epoch: number; leaderScheduleEpoch: number; unixTimestamp: number; dataBase64: string; dataSha256: string };
  check([clock.slot, clock.epochStartTimestamp, clock.epoch, clock.leaderScheduleEpoch, clock.unixTimestamp].every(Number.isSafeInteger), "Clock exceeds safe JSON integer range");
  check(snapshot.result.context.slot < block.slot && block.slot <= clock.slot && clock.slot === after.result.context.slot, "Observed Clock ordering changed");
  const transactions = [19, 21, 22].map((index, role) => {
    const tx = block.block.transactions[index]!;
    const keys = tx.transaction.message.accountKeys;
    const instructions: NativeBundleInstruction[] = tx.rawTransaction!.message.instructions!.map(ix => ({
      programId: keys[ix.programIdIndex]!.pubkey, dataHex: Buffer.from(decodeBase58Bytes(ix.data)).toString("hex"),
      accounts: ix.accounts.map(i => ({ address: keys[i]!.pubkey, signer: keys[i]!.signer, writable: keys[i]!.writable })),
    }));
    return { id: ["anchor-A", "anchor-B", "anchor-C"][role]!, observedIndex: index, signature: tx.transaction.signatures[0]!, instructions };
  });
  const required = [...new Set(transactions.flatMap(tx => tx.instructions.flatMap(ix => ix.accounts.map(a => a.address))))].filter(a => a !== "Sysvar1nstructions1111111111111111111111111").sort();
  check(JSON.stringify(required) === JSON.stringify([...metadata.ordinaryAddresses].sort()), "Ordinary account coverage changed");
  const accounts: NativeBundleAccount[] = required.map(address => {
    const a = snapshot.result.value[metadata.addresses.indexOf(address)]!;
    check(a && a.data[1] === "base64", "Missing captured account: " + address);
    const bytes = Buffer.from(a.data[0], "base64");
    check(bytes.toString("base64") === a.data[0] && bytes.length === a.space, "Account encoding/length changed");
    return { address, owner: a.owner, lamports: decimal(a.lamports), executable: a.executable, rentEpoch: decimal(a.rentEpoch), dataBase64: a.data[0], dataSha256: hash(bytes) };
  });
  const fixture = {
    schemaVersion: "full-bundle-fixture-1", programId: "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P", elfSha256: PINS["current-deployed.so"],
    provenance: {
      classification: "constructed-current-state-sequence-not-historical-prestate", historicalPrestate: false, sourcePinsVerified: true,
      ordinaryAccountsUnmodified: true, nativeExecutionPerformed: false, snapshotSlot: snapshot.result.context.slot, blockSlot: block.slot,
      clockContextSlot: after.result.context.slot, sourceFiles: Object.entries(PINS).map(([path, sha256]) => ({ path: `${CAPTURE}/${path}`, sha256 })),
      computeUnitLimit: 200000, finalDeploymentCheck: "Program binding and ProgramData header stability; not a second full ELF hash",
      scope: "Selected complete bundles, unchanged earlier ordinary accounts, later observed full Clock. Intervening chain state, fees, transaction signature validation, other bank/sysvar state and validator scheduling are not reconstructed.",
    },
    transactions,
    scenarios: [["anchor-A", "anchor-B", "anchor-C"], ["anchor-A", "anchor-C", "anchor-B"]].map((order, i) => ({
      id: i === 0 ? "current-observed-order" : "current-swapped-consumers", clock, instructionCount: 5, accounts, order, mutations: [],
      classification: "constructed-fixture", purpose: "Test complete candidate producer and consumers with unchanged ordinary inputs; success and final-state equivalence are not assumed.",
    })),
  };
  for (const directory of ["output", "output/native-current-bundle"]) {
    await mkdir(directory, { recursive: true });
    check(!(await lstat(directory)).isSymbolicLink() && await realpath(directory) === resolve(directory), "Output directory must not be a link");
  }
  const bytes = Buffer.from(JSON.stringify(fixture, null, 2) + "\n");
  await writeFile("output/native-current-bundle/fixture.json", bytes, { flag: "wx" });
  console.log(JSON.stringify({ fixture: "output/native-current-bundle/fixture.json", sha256: hash(bytes), accounts: accounts.length, scenarios: fixture.scenarios.length, clock }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
