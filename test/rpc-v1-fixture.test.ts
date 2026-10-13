import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import { fetchParsedBlock } from "../src/rpc.js";
import type { RpcBlock } from "../src/types.js";

const root = "fixtures/rpc-v1", slot = 503405150;
const filenames = { parsed: "slot-503405150-jsonParsed-v1.response.json", raw: "slot-503405150-json-v1.response.json" };
interface RawEntry {
  version: "legacy" | 0 | 1;
  transaction: { signatures: string[]; message: { accountKeys: string[]; header: { numRequiredSignatures: number; numReadonlySignedAccounts: number; numReadonlyUnsignedAccounts: number }; transactionConfig?: { computeUnitLimit: number }; instructions: Array<{ accounts: number[]; programIdIndex: number; data: string }> } };
  meta: { computeUnitsConsumed: number; loadedAddresses: { writable: string[]; readonly: string[] } };
}
async function fixtures() {
  const parsed = JSON.parse(await readFile(join(root, filenames.parsed), "utf8")) as { result: RpcBlock };
  const raw = JSON.parse(await readFile(join(root, filenames.raw), "utf8")) as { result: { transactions: RawEntry[] } };
  return { parsed, raw };
}

// Independent of the analyzer: decode static privileges from the raw message header,
// append loaded v0 addresses, and enumerate shared read/write account pairs directly.
function rawAccess(entry: RawEntry) {
  const { accountKeys, header } = entry.transaction.message;
  const write = new Set<string>(), read = new Set<string>();
  accountKeys.forEach((key, index) => {
    const writable = index < header.numRequiredSignatures
      ? index < header.numRequiredSignatures - header.numReadonlySignedAccounts
      : index < accountKeys.length - header.numReadonlyUnsignedAccounts;
    (writable ? write : read).add(key);
  });
  entry.meta.loadedAddresses.writable.forEach(key => write.add(key));
  entry.meta.loadedAddresses.readonly.forEach(key => read.add(key));
  for (const key of write) read.delete(key);
  return { write, read, payer: accountKeys[0]! };
}

test("mixed-version devnet responses retain their captured byte hashes and all 29 transactions", async () => {
  const captures = JSON.parse(await readFile(join(root, "v1-capture.json"), "utf8")) as Array<{ filename: string; sha256: string; request: { params: [number, { commitment: string; maxSupportedTransactionVersion: number }] } }>;
  for (const capture of captures) {
    const bytes = await readFile(join(root, capture.filename));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), capture.sha256);
    assert.equal(capture.request.params[0], slot);
    assert.equal(capture.request.params[1].commitment, "finalized");
    assert.equal(capture.request.params[1].maxSupportedTransactionVersion, 1);
  }
  const { parsed, raw } = await fixtures();
  const versions = raw.result.transactions.map(entry => entry.version);
  assert.equal(versions.filter(version => version === "legacy").length, 21);
  assert.equal(versions.filter(version => version === 0).length, 6);
  assert.equal(versions.filter(version => version === 1).length, 2);
  assert.deepEqual(parsed.result.transactions.map(entry => entry.transaction.signatures), raw.result.transactions.map(entry => entry.transaction.signatures));
});

test("v1-capable transport and offline CLI preserve raw-header account conflicts and measured compute", async () => {
  const { parsed, raw } = await fixtures();
  const requests: Array<{ encoding: string; maxSupportedTransactionVersion: number }> = [];
  const server = createServer(async (request, response) => {
    let bytes = ""; for await (const chunk of request) bytes += chunk;
    const body = JSON.parse(bytes), config = body.params[1]; requests.push(config);
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...(config.maxSupportedTransactionVersion < 1
      ? { error: { code: -32015, message: "Transaction version (1) is not supported by the requesting client" } }
      : { result: config.encoding === "jsonParsed" ? parsed.result : raw.result }) }));
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  await mkdir("output", { recursive: true }); const directory = await mkdtemp(resolve("output", "v1-block-test-"));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const block = await fetchParsedBlock(slot, `http://127.0.0.1:${address.port}`) as RpcBlock;
    assert.equal(requests.length, 2); assert.ok(requests.every(request => request.maxSupportedTransactionVersion === 1));
    assert.deepEqual(requests.map(request => request.encoding).sort(), ["json", "jsonParsed"]);
    const packaged = JSON.parse(await readFile(join(root, "slot-503405150.json"), "utf8"));
    const plainBlock = JSON.parse(JSON.stringify(block, (_key, value: unknown) => typeof value === "bigint" ? Number(value) : value));
    assert.deepEqual(packaged.block, plainBlock); // Packaged CLI fixture matches both independently captured encodings.
    assert.equal(packaged.provenance.request.maxSupportedTransactionVersion, 1);
    const analysis = analyzeBlock(block, slot, "rpc");
    assert.equal(analysis.transactions.length, 29);
    const expected = raw.result.transactions.map(rawAccess);
    for (const [index, transaction] of analysis.transactions.entries()) {
      assert.deepEqual(transaction.writeSet, [...expected[index]!.write].sort());
      assert.deepEqual(transaction.readSet, [...expected[index]!.read].sort());
      assert.equal(transaction.feePayer, expected[index]!.payer);
      assert.equal(transaction.computeUnitsConsumed, raw.result.transactions[index]!.meta.computeUnitsConsumed);
    }
    const edges = [];
    for (let a = 0; a < expected.length; a++) for (let b = a + 1; b < expected.length; b++) {
      const left = expected[a]!, right = expected[b]!;
      const shared = new Set([...left.write].filter(key => right.write.has(key) || right.read.has(key)));
      for (const key of right.write) if (left.read.has(key)) shared.add(key);
      if (shared.size) edges.push({ source: a, target: b, accounts: [...shared].sort() });
    }
    assert.deepEqual(analysis.conflictEdges.map(({ source, target, accounts }) => ({ source, target, accounts })), edges);
    const v1 = raw.result.transactions.flatMap((entry, index) => entry.version === 1 ? [{ entry, index }] : []);
    assert.deepEqual(v1.map(({ index }) => analysis.transactions[index]!.computeUnitsConsumed), [519, 409]);
    for (const { entry, index } of v1) assert.notEqual(analysis.transactions[index]!.computeUnitsConsumed, entry.transaction.message.transactionConfig!.computeUnitLimit);

    const path = join(directory, "fixture.json");
    await writeFile(path, JSON.stringify({ slot, block }, (_key, value: unknown) => typeof value === "bigint" ? (Number.isSafeInteger(Number(value)) ? Number(value) : value.toString()) : value));
    const output = join(directory, "report");
    await promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", "--fixture", path, "--output-dir", output], { env: { ...process.env, SOLANA_RPC_URL: "http://127.0.0.1:1" } });
    const saved = JSON.parse(await readFile(join(output, "analysis.json"), "utf8"));
    assert.deepEqual(saved.conflictEdges, analysis.conflictEdges);
    assert.equal(saved.summary.transactionCount, 29);
    assert.match(await readFile(join(output, "report.html"), "utf8"), /Solana Conflict Microscope/);
  } finally {
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    await rm(directory, { recursive: true, force: true });
  }
});
