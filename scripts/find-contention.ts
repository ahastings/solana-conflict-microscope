import { resolve } from "node:path";
import { scanContention } from "../src/scanner.js";

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
const startSlot = Number(value("--start-slot")); const count = Number(value("--count") ?? "200");
if (!Number.isSafeInteger(startSlot)) throw new Error("Usage: npm run find-contention -- --start-slot SLOT [--count 200] [--rpc-url URL] [--offline] [--fixture-dir DIR] [--cache-dir DIR]");
const result = await scanContention({ startSlot, count, rpcUrl: value("--rpc-url") ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", offline: args.includes("--offline"), fixtureDir: resolve(value("--fixture-dir") ?? "fixtures"), cacheDir: resolve(value("--cache-dir") ?? "cache/contention") });
console.log(`Scanned ${result.scannedSlots.length} cached or retrieved block(s); ${result.failedSlots.length} failed slot(s).`);
if (result.candidates.length === 0) console.log("No cross-payer shared writable-account contention candidates found in the bounded sample.");
else result.candidates.slice(0, 20).forEach((candidate, index) => console.log(`${index + 1}. slot ${candidate.slot} x ${candidate.label ?? candidate.account} x ${candidate.crossPayerPairCount} cross-payer pairs x ${candidate.payerCount} payers x ${candidate.affectedTransactionCount} transactions`));
console.log(`Cached results in ${resolve(value("--cache-dir") ?? "cache/contention")}`);

