import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeBlock } from "../src/analyze.js";
import type { RpcTransactionEntry, RpcInnerInstructions } from "../src/types.js";

test("captured mainnet System Program privilege demotion is retained when raw evidence is merged", async () => {
  const fixture = JSON.parse(await readFile("fixtures/mainnet-privilege-demotion.json", "utf8")) as {
    capture: { slot: number; transactionIndex: number };
    blockContext: { blockhash: string; previousBlockhash: string; parentSlot: number };
    parsedEntry: RpcTransactionEntry;
    rawEntry: { transaction: NonNullable<RpcTransactionEntry["rawTransaction"]> & { message: { accountKeys: string[]; header: { numRequiredSignatures: number; numReadonlyUnsignedAccounts: number } } }; meta: { innerInstructions: RpcInnerInstructions[] } };
  };
  const system = "11111111111111111111111111111111";
  const raw = fixture.rawEntry.transaction.message, index = raw.accountKeys.indexOf(system);
  assert.equal(fixture.capture.transactionIndex, 911);
  assert.equal(index, 1);
  assert.ok(index >= raw.header.numRequiredSignatures && index < raw.accountKeys.length - raw.header.numReadonlyUnsignedAccounts, "raw header requests writable access");
  assert.equal(fixture.parsedEntry.transaction.message.accountKeys.find(account => account.pubkey === system)!.writable, false);
  const captured = { ...fixture.parsedEntry, rawTransaction: fixture.rawEntry.transaction, rawInnerInstructions: fixture.rawEntry.meta.innerInstructions };
  // Synthetic peer isolates the consequence of wrongly treating the System Program as writable.
  const peer: RpcTransactionEntry = { transaction: { signatures: ["synthetic-peer"], message: { accountKeys: [{ pubkey: "SyntheticPayer", signer: true, writable: true }, { pubkey: system, signer: false, writable: false }], instructions: [] } }, meta: { err: null, fee: 0 } };
  const analysis = analyzeBlock({ ...fixture.blockContext, transactions: [captured, peer] }, fixture.capture.slot, "fixture", { dataKind: "curated-teaching" });
  assert.ok(analysis.transactions[0]!.readSet.includes(system));
  assert.ok(!analysis.transactions[0]!.writeSet.includes(system));
  assert.deepEqual(analysis.conflictEdges, []);
  assert.deepEqual(analysis.transactions[0]!.executionError, { InstructionError: [4, { Custom: 1000 }] });
});
