import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import { runDiscovery, loadDiscoveryPlan } from "../src/discovery.js";
import { resolveDiscoveryPlan } from "../src/discovery-plan.js";
import { acquireRange } from "../src/range-input.js";
import { publicErrorMessage, publicRpcEndpoint, rpcUrlHasOmittedParts } from "../src/rpc-provenance.js";
import { htmlReport } from "../src/report.js";

const endpoint = "https://username-secret:password-secret@rpc.example/path-secret?api-key=query-secret#fragment-secret";
const secrets = ["username-secret", "password-secret", "path-secret", "query-secret", "fragment-secret"];
const block = { blockhash: "11111111111111111111111111111111", previousBlockhash: "11111111111111111111111111111111", parentSlot: 6, blockTime: null, blockHeight: 7, transactions: [] };
const run = promisify(execFile);
function noSecrets(text: string): void { for (const secret of secrets) assert.ok(!text.includes(secret), `Leaked ${secret}`); }
async function directory(): Promise<string> { await mkdir("output", { recursive: true }); return mkdtemp(resolve("output", "rpc-provenance-test-")); }
async function allFileText(path: string): Promise<string> {
  const parts = await Promise.all((await readdir(path, { withFileTypes: true })).map(async (entry) => entry.isDirectory() ? allFileText(join(path, entry.name)) : readFile(join(path, entry.name), "utf8")));
  return parts.join("\n");
}

test("endpoint provenance retains only HTTP origin and never guesses malformed connection strings", () => {
  assert.equal(publicRpcEndpoint(endpoint), "https://rpc.example");
  assert.equal(publicRpcEndpoint("https://api.devnet.solana.com"), "https://api.devnet.solana.com");
  assert.equal(publicRpcEndpoint("http://[::1]:8899/path-secret"), "http://[::1]:8899");
  for (const value of [undefined, null, "", "query-secret", "file:///path-secret", "https://"]) assert.equal(publicRpcEndpoint(value), null);
  assert.equal(rpcUrlHasOmittedParts(endpoint), true);
  assert.equal(rpcUrlHasOmittedParts("https://rpc.example/v2/public"), true);
  assert.equal(rpcUrlHasOmittedParts("https://rpc.example/"), false);
  assert.equal(rpcUrlHasOmittedParts("https://rpc.example"), false);
});

test("saved diagnostics strip full connection URLs while preserving useful rate-limit information", () => {
  const message = publicErrorMessage(new Error(`429 rate limited at ${endpoint}; retry later`));
  noSecrets(message);
  assert.match(message, /429 rate limited at https:\/\/rpc.example/);
  assert.equal(publicErrorMessage(new Error("RPC returned no block for slot 7")), "RPC returned no block for slot 7");
});

test("fixture report JSON and embedded HTML omit endpoint secrets without changing analysis evidence or input", async () => {
  const fixture = JSON.parse(await readFile("fixtures/cross-payer-application-state-teaching.json", "utf8"));
  fixture.provenance.endpoint = endpoint;
  const original = JSON.stringify(fixture);
  const safe = analyzeBlock(fixture.block, fixture.slot, "fixture", fixture.provenance);
  const withoutEndpoint = analyzeBlock(fixture.block, fixture.slot, "fixture", { ...fixture.provenance, endpoint: null });
  noSecrets(JSON.stringify(safe)); noSecrets(htmlReport(safe));
  assert.equal(safe.provenance.endpoint, "https://rpc.example");
  assert.deepEqual({ ...safe, provenance: withoutEndpoint.provenance }, withoutEndpoint);
  assert.equal(JSON.stringify(fixture), original);
});

test("range acquisition uses the original endpoint but caches and replays origin-only provenance", async () => {
  const root = await directory();
  try {
    const options = { startSlot: 7, endSlot: 7, cacheDir: root, rpcUrl: endpoint, offline: false, fetchMissing: true, now: () => "2026-01-01T00:00:00.000Z" };
    const acquired = await acquireRange({ ...options, fetchBlock: async (slot, url) => { assert.equal(slot, 7); assert.equal(url, endpoint); return block; } });
    assert.equal(acquired.slots[0]?.status, "observed");
    noSecrets(JSON.stringify(acquired)); noSecrets(await allFileText(root));
    const replay = await acquireRange({ ...options, offline: true, fetchMissing: false, fetchBlock: async () => { throw new Error("offline replay contacted RPC"); } });
    noSecrets(JSON.stringify(replay));
    assert.deepEqual(replay.slots[0]?.analysis?.summary, acquired.slots[0]?.analysis?.summary);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("old cache provenance is sanitized on read without rewriting its frozen bytes", async () => {
  const root = await directory();
  try {
    const frozen = JSON.stringify({ slot: 7, block, provenance: { endpoint, dataKind: "real-network" } });
    const path = join(root, "slot-7.json"); await writeFile(path, frozen);
    const result = await acquireRange({ startSlot: 7, endSlot: 7, cacheDir: root, rpcUrl: endpoint, offline: true, fetchMissing: false });
    assert.equal(result.slots[0]?.status, "observed"); noSecrets(JSON.stringify(result));
    assert.equal(await readFile(path, "utf8"), frozen);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unavailable sidecars, failed diagnostics, and their offline replay omit connection URL secrets", async () => {
  const root = await directory();
  try {
    const options = { startSlot: 7, endSlot: 7, cacheDir: root, rpcUrl: endpoint, offline: false, fetchMissing: true, maxRetries: 0 };
    const unavailable = await acquireRange({ ...options, fetchBlock: async () => { throw new Error(`RPC returned no block for slot 7 at ${endpoint}`); } });
    assert.equal(unavailable.slots[0]?.status, "unavailable"); noSecrets(JSON.stringify(unavailable)); noSecrets(await allFileText(root));
    const replay = await acquireRange({ ...options, offline: true, fetchMissing: false }); noSecrets(JSON.stringify(replay));
    const failed = await acquireRange({ ...options, startSlot: 8, endSlot: 8, fetchBlock: async () => { throw new Error(`429 rate limit from ${endpoint}`); } });
    assert.equal(failed.slots[0]?.status, "failed"); noSecrets(JSON.stringify(failed));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("saved discovery plans replay offline and require explicit full endpoint for online reuse", async () => {
  const root = await directory();
  try {
    const plan = resolveDiscoveryPlan({ cluster: "devnet", rpcUrl: endpoint, cacheDir: join(root, "cache"), outputDir: join(root, "reports"), resolvedAt: "2026-01-01T00:00:00.000Z", startSlot: 7, endSlot: 7, delayMs: 0, top: 0 });
    await runDiscovery(plan, { offline: false, fetchBlock: async (_slot, url) => { assert.equal(url, endpoint); return block; } });
    noSecrets(await allFileText(root));
    const saved = await loadDiscoveryPlan(join(plan.outputDir, "discovery-plan.json"));
    assert.equal(saved.rpcUrl, "https://rpc.example"); assert.equal(saved.rpcUrlRequiresOverride, true);
    await runDiscovery(saved, { offline: true, fetchBlock: async () => { throw new Error("Unexpected network"); } });
    await assert.rejects(runDiscovery(saved, { offline: false }), /omits RPC connection details/);
    assert.equal(plan.rpcUrl, endpoint); // The caller's runtime configuration is unchanged.
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("public CLI workflows preserve RPC routing and omit connection secrets from generated artifacts", async () => {
  const root = await directory();
  const paths: string[] = [];
  const server = createServer(async (request, response) => {
    paths.push(request.url!);
    let data = ""; for await (const chunk of request) data += chunk;
    const rpc = JSON.parse(data);
    assert.equal(rpc.method, "getBlock");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: block }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const rpcUrl = `http://127.0.0.1:${address.port}/path-secret?api-key=query-secret`;
    const env = { ...process.env, SOLANA_RPC_URL: rpcUrl };
    const commands = [
      ["src/cli.ts", "--slot", "7", "--output-dir", join(root, "block")],
      ["src/range-cli.ts", "--start-slot", "7", "--end-slot", "7", "--fetch-missing", "--cache-dir", join(root, "range-cache"), "--output-dir", join(root, "range")],
      ["scripts/cache-fixture.ts", "7", join(root, "captured.json"), rpcUrl],
      ["scripts/find-contention.ts", "--start-slot", "7", "--count", "1", "--rpc-url", rpcUrl, "--cache-dir", join(root, "scan-cache")],
      ["src/discovery-cli.ts", "--start-slot", "7", "--end-slot", "7", "--top", "0", "--cache-dir", join(root, "discovery-cache"), "--output-dir", join(root, "discovery")],
    ];
    for (const args of commands) {
      const result = await run(process.execPath, ["--import", "tsx", ...args], { env });
      noSecrets(result.stdout); noSecrets(result.stderr);
    }
    assert.equal(paths.length, 10);
    assert.ok(paths.every((path) => path === "/path-secret?api-key=query-secret"));
    noSecrets(await allFileText(root));
    // A cold-cache replay proves the override actually routes the request.
    const saved = await loadDiscoveryPlan(join(root, "discovery", "discovery-plan.json"));
    const coldPlan = { ...saved, cacheDir: join(root, "replay-cache"), outputDir: join(root, "replay-report") };
    const coldPath = join(root, "cold-plan.json"); await writeFile(coldPath, JSON.stringify(coldPlan));
    const unrelatedEnv = { ...env, SOLANA_RPC_URL: "http://127.0.0.1:1/unrelated-secret" };
    const replay = await run(process.execPath, ["--import", "tsx", "src/discovery-cli.ts", "--plan", coldPath, "--rpc-url", rpcUrl], { env: unrelatedEnv });
    assert.equal(paths.length, 12);
    assert.ok(paths.every((path) => path === "/path-secret?api-key=query-secret"));
    noSecrets(replay.stdout); noSecrets(await allFileText(root));
    // Offline replay must not replace recorded provenance with an unrelated environment URL.
    const replayPath = join(coldPlan.outputDir, "discovery-plan.json");
    const before = await readFile(replayPath, "utf8");
    await run(process.execPath, ["--import", "tsx", "src/discovery-cli.ts", "--plan", replayPath, "--offline"], { env: unrelatedEnv });
    assert.equal(paths.length, 12); assert.equal(await readFile(replayPath, "utf8"), before);
    assert.ok(!(await allFileText(root)).includes("unrelated-secret"));
  } finally {
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    await rm(root, { recursive: true, force: true });
  }
});
