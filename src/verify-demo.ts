import { isDeepStrictEqual } from "node:util";
import { compareAnalyses } from "./compare-analyses.js";
import { verifyRangeAnalysis } from './verify-range.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { verifyDeclaredAnalysis } from './verify-analysis.js';

/** Verify saved demo bytes, without regenerating or rewriting them. */
export async function verifyDemoArtifacts(directory: string) {
  const reports = [];
  const inputs: unknown[] = [];
  for (const name of ['real-loader','real-funding','synthetic-teaching']) {
    const file = name + '/analysis.json', bytes = await readFile(join(directory,file));
    inputs.push(JSON.parse(bytes.toString('utf8')));
    reports.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),verification:verifyDeclaredAnalysis(JSON.parse(bytes.toString('utf8')))});
  }
  const file = 'multi-block-upload/range-analysis.json', bytes = await readFile(join(directory,file));
  const range = JSON.parse(bytes.toString('utf8')) as {slots?: Array<{slot?:unknown;status?:unknown;analysis?:{context?:{slot?:unknown}}}>};
  if (!Array.isArray(range?.slots) || range.slots.length !== 9) throw new Error('Demo verification failed: expected nine observed range blocks');
  range.slots.forEach((record,index) => {
    const slot = 488638500 + index;
    if (record?.slot !== slot || record.status !== 'observed' || record.analysis?.context?.slot !== slot) throw new Error('Demo verification failed: range slot identity or observation status changed');
  });
  const blocks = verifyRangeAnalysis(range).blocks;
  const comparisonFile = 'comparison/comparison.json';
  const comparisonBytes = await readFile(join(directory, comparisonFile));
  const comparison = JSON.parse(comparisonBytes.toString('utf8')) as unknown;
  const expected = compareAnalyses(inputs[0], inputs[1]);
  expected.files = { left: { name: reports[0]!.file, sha256: reports[0]!.sha256 }, right: { name: reports[1]!.file, sha256: reports[1]!.sha256 } };
  if (!isDeepStrictEqual(comparison, expected)) throw new Error('Demo verification failed: saved comparison does not match its source analyses and original file hashes');
  return {reports,comparison:{file:comparisonFile,sha256:createHash('sha256').update(comparisonBytes).digest('hex'),status:'verified'},range:{file,sha256:createHash('sha256').update(bytes).digest('hex'),blocks},verifiedBlockAnalyses:reports.length+blocks.length,
    scope:'Declared block evidence only; cross-block upload reconstruction and counterfactual semantics are not certified.'};
}
