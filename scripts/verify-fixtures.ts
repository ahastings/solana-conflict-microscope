#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

async function main(): Promise<void> {
  const root = resolve("fixtures");
  const manifest: unknown = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  if (!manifest || typeof manifest !== "object" || !("files" in manifest) || !Array.isArray(manifest.files)) throw new Error("Invalid public fixture manifest");
  const seen = new Set<string>();
  for (const entry of manifest.files as unknown[]) {
    if (!entry || typeof entry !== "object" || !("path" in entry) || typeof entry.path !== "string" || !("sha256" in entry) || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Invalid fixture pin");
    const path = resolve(root, entry.path);
    if (!path.startsWith(root + sep) || seen.has(path)) throw new Error(`Invalid or duplicate fixture path: ${entry.path}`);
    seen.add(path);
    const hash = createHash("sha256").update(await readFile(path)).digest("hex");
    if (hash !== entry.sha256) throw new Error(`Public fixture hash mismatch: ${entry.path}`);
  }
  if (seen.size === 0) throw new Error("Public fixture manifest is empty");
  console.log(`Verified ${seen.size} pinned public fixtures. Reviewer inputs have their own manifest.`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
