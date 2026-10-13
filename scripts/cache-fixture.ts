import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { publicRpcEndpoint } from "../src/rpc-provenance.js";
import { fetchParsedBlock, MAX_SUPPORTED_TRANSACTION_VERSION } from "../src/rpc.js";

const slot = Number(process.argv[2]);
const target = resolve(process.argv[3] ?? `fixtures/real-devnet-${slot}.json`);
const rpcUrl = process.argv[4] ?? "https://api.devnet.solana.com";
if (!Number.isSafeInteger(slot) || slot < 0) throw new Error("Usage: tsx scripts/cache-fixture.ts SLOT [TARGET] [RPC_URL]");
const block = await fetchParsedBlock(slot, rpcUrl);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify({
  provenance: { cluster: rpcUrl.includes("devnet") ? "devnet" : rpcUrl.includes("testnet") ? "testnet" : "mainnet-beta-or-custom", endpoint: publicRpcEndpoint(rpcUrl), retrievedAt: new Date().toISOString(), sourceMode: "fixture", dataKind: "real-network", request: { method: "getBlock", slot, encodings: ["jsonParsed", "json"], transactionDetails: "full", rewards: false, maxSupportedTransactionVersion: MAX_SUPPORTED_TRANSACTION_VERSION } },
  slot,
  block,
}, (_key, value: unknown) => typeof value === "bigint" ? Number(value) : value, 2) + "\n");
console.log(`Cached slot ${slot} at ${target}`);
