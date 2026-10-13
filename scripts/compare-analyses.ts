import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { parseJsonFileText } from "../src/json-text.js";
import { publicErrorMessage } from "../src/rpc-provenance.js";
import { compareAnalyses, comparisonHtml } from "../src/compare-analyses.js";

async function main(): Promise<void> {
  const { values, tokens } = parseArgs({ strict: true, allowPositionals: false, tokens: true, options: { left: { type: "string" }, right: { type: "string" }, "output-dir": { type: "string" }, help: { type: "boolean", short: "h" } } });
  const seen = new Set<string>();
  for (const token of tokens) if (token.kind === "option") {
    if (seen.has(token.name)) throw new Error("Duplicate option --" + token.name);
    seen.add(token.name);
  }
  if (values.help) { console.log("Usage: npm run compare:analyses -- --left FILE --right FILE [--output-dir NEW_DIR]\nVerify and compare two saved block analyses offline. Writes comparison.json and comparison.html to a new directory (default output/comparison). Existing output directories are never overwritten. Differences do not establish causal or runtime improvements."); return; }
  if (!values.left?.trim() || !values.right?.trim()) throw new Error("--left and --right require saved analysis JSON paths");
  if (values["output-dir"] !== undefined && !values["output-dir"].trim()) throw new Error("--output-dir requires a nonempty new directory");
  const left = await readFile(resolve(values.left)), right = await readFile(resolve(values.right));
  const result = compareAnalyses(parseJsonFileText(left.toString("utf8")), parseJsonFileText(right.toString("utf8")));
  const describe = (name: string, bytes: Buffer) => ({ name: basename(name), sha256: createHash("sha256").update(bytes).digest("hex") });
  result.files = { left: describe(values.left, left), right: describe(values.right, right) };
  const json = JSON.stringify(result, null, 2) + "\n", html = comparisonHtml(result), output = resolve(values["output-dir"] ?? "output/comparison");
  await mkdir(dirname(output), { recursive: true });
  try { await mkdir(output); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Output directory already exists; choose a new --output-dir: " + output);
    throw error;
  }
  await writeFile(resolve(output, "comparison.json"), json, { flag: "wx" });
  await writeFile(resolve(output, "comparison.html"), html, { flag: "wx" });
  console.log("Compared verified block evidence. Open " + resolve(output, "comparison.html"));
}
main().catch((error: unknown) => { console.error(publicErrorMessage(error)); process.exitCode = 1; });
