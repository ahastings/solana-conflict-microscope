import { publicErrorMessage } from "../src/rpc-provenance.js";
import { resolve } from 'node:path';
import { verifyDemoArtifacts } from '../src/verify-demo.js';
async function main(): Promise<void> {
  const args=process.argv.slice(2);
  if(args.length===1 && (args[0]==='--help'||args[0]==='-h')){console.log('Usage: npm run verify:demo -- [--demo-dir DIR]\nIndependently verify the saved demo block analyses without regenerating them.');process.exit(0)}
  if(args.length!==0 && (args.length!==2 || args[0]!=='--demo-dir' || !args[1]?.trim() || args[1].startsWith('--')))throw new Error('Usage: npm run verify:demo -- [--demo-dir DIR]');
  console.log(JSON.stringify(await verifyDemoArtifacts(resolve(args[1]??'output/demo')),null,2));
}

main().catch((error: unknown) => {
  console.error(publicErrorMessage(error));
  process.exitCode = 1;
});
