import { publicErrorMessage } from "../src/rpc-provenance.js";
import { parseJsonFileText } from "../src/json-text.js";
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { verifyRangeAnalysis } from '../src/verify-range.js';
async function main(): Promise<void> {
  const {values,tokens} = parseArgs({strict:true,allowPositionals:false,tokens:true,options:{analysis:{type:'string'},help:{type:'boolean',short:'h'}}});
  const seen = new Set<string>();for(const token of tokens)if(token.kind==='option'){if(seen.has(token.name))throw new Error('Duplicate option --'+token.name);seen.add(token.name)}
  if(values.help){console.log('Usage: npm run verify:range -- --analysis FILE\nOffline verification of the slot ledger and embedded declared block evidence. Cross-block upload reconstruction and counterfactual semantics are not certified. Reads only; no RPC or native execution.');process.exit(0)}
  if(!values.analysis?.trim())throw new Error('--analysis requires a nonempty JSON file path');
  const bytes=await readFile(values.analysis);
  console.log(JSON.stringify({...verifyRangeAnalysis(parseJsonFileText(bytes.toString('utf8'))),analysisSha256:createHash('sha256').update(bytes).digest('hex')},null,2));
}

main().catch((error: unknown) => {
  console.error(publicErrorMessage(error));
  process.exitCode = 1;
});
