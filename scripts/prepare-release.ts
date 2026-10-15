#!/usr/bin/env node
import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const rootFiles = ["package.json", "package-lock.json", "tsconfig.json", "README.md", "AGENTS.md", ".gitignore", ".gitattributes", "CONTRIBUTING.md", "HANDOFF.md"];
const nativeRoot = "tools/milestone23-linux-runtime";
const nativeFiles = ["Cargo.toml", "Cargo.lock", "README.md", "mollusk-0.13.1-cross-instruction.patch", ".gitignore", "src/main.rs"].map((path) => `${nativeRoot}/${path}`);
nativeFiles.push(...["Cargo.toml", "Cargo.lock", "README.md", ".gitignore", "cross-instruction.patch", "run.sh", "src/main.rs"].map((path) => "tools/full-bundle-runtime/" + path));
nativeFiles.push(...["Cargo.toml", "Cargo.lock", "README.md", ".gitignore", "run.sh", "src/main.rs"].map((path) => "tools/current-bundle-runtime/" + path));
const optionalFiles = ["LICENSE", "NOTICE", "CHANGELOG.md", ".github/workflows/pages.yml", ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/evidence_question.yml", ".github/ISSUE_TEMPLATE/config.yml"];
const trees = [
  { path: "src", extension: ".ts" }, { path: "scripts", extension: ".ts" }, { path: "test", extension: ".ts" },
  { path: "fixtures", extension: ".json" }, { path: "research-plans", extension: ".json" }, { path: "discovery-plans", extension: ".json" },
  { path: "docs/research", extension: ".md" }, { path: "docs/handoffs", extension: ".md" }, { path: "docs/guides", extension: ".md" },
];
const excludedNames = new Set(["node_modules", "target", "dist", "cache", "output", "checkpoints", "backup", "backups", "credentials", "secrets"]);
const selectionPolicy = "Required root and native harness files are copied explicitly. Source trees include only .ts, fixture/plan trees only .json, and documentation trees only .md. Hidden entries and dependency, build, cache, output, backup, credentials, and secrets directories are skipped. Other extensions are intentionally skipped. Missing required paths, links in selected paths or their ancestors, and nonregular selected files fail closed. This selection policy is not a content-level secrets audit.";

function inside(root: string, path: string): boolean {
  const part = relative(root, path);
  return part === "" || (!isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`));
}

/** Check each ancestor, including parents of nested allowlist entries such as docs/research. */
async function unlinkedPath(root: string, path: string, allowMissing = false): Promise<Stats | null> {
  const absolute = resolve(root, path);
  if (!inside(root, absolute)) throw new Error(`Path escapes the real workspace: ${path}`);
  const parts = relative(root, absolute).split(sep).filter(Boolean);
  let current = root;
  let info = await lstat(root);
  for (let index = 0; index < parts.length; index++) {
    current = resolve(current, parts[index]!);
    try { info = await lstat(current); }
    catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link or junction in source/output path: ${current}`);
    if (index < parts.length - 1 && !info.isDirectory()) throw new Error(`Path ancestor is not a directory: ${current}`);
    if (!inside(root, await realpath(current))) throw new Error(`Path escapes the real workspace: ${current}`);
  }
  return info;
}

export interface ReleasePreview {
  target: string;
  licensed: boolean;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

/** Creates a local source preview. The CLI always uses its real working directory as the root. */
export async function prepareRelease(options: { root?: string; outputDir?: string } = {}): Promise<ReleasePreview> {
  const root = await realpath(resolve(options.root ?? process.cwd()));
  const target = resolve(root, options.outputDir ?? "output/release-preview");
  const within = relative(root, target);
  if (!inside(root, target) || !within.startsWith(`output${sep}`)) throw new Error("Choose a new directory under output/ inside the real workspace for the release preview.");
  if (await unlinkedPath(root, target, true)) throw new Error(`Release preview already exists; refusing to overwrite: ${target}`);
  const paths: string[] = [];
  async function collectFile(path: string, optional = false): Promise<void> {
    const info = await unlinkedPath(root, path, optional);
    if (!info) return;
    if (!info.isFile()) throw new Error(`Not a regular source file: ${path}`);
    paths.push(path);
  }
  async function collectTree(path: string, extension: string, requiredRoot = false): Promise<void> {
    const info = await unlinkedPath(root, path);
    if (info!.isDirectory()) {
      for (const name of (await readdir(resolve(root, path))).sort()) {
        // Explicit root dotfiles are handled above; nested .env/.git and similar entries are never traversed.
        if (name.startsWith(".") || excludedNames.has(name.toLowerCase())) continue;
        await collectTree(`${path}/${name}`, extension);
      }
    } else if (requiredRoot) throw new Error(`Expected a source directory: ${path}`);
    else if (extname(basename(path)) === extension) {
      if (!info!.isFile()) throw new Error(`Not a regular source file: ${path}`);
      paths.push(path);
    }
  }
  for (const path of [...rootFiles, ...nativeFiles]) await collectFile(path);
  for (const tree of trees) await collectTree(tree.path, tree.extension, true);
  for (const path of optionalFiles) await collectFile(path, true);
  // Complete required reads before creating any output. Recheck links immediately before each read.
  const entries = await Promise.all(paths.sort().map(async (path) => {
    const info = await unlinkedPath(root, path);
    if (!info!.isFile()) throw new Error(`Not a regular source file: ${path}`);
    const data = await readFile(resolve(root, path));
    return { path, data, sha256: createHash("sha256").update(data).digest("hex") };
  }));
  await unlinkedPath(root, target, true);
  await mkdir(dirname(target), { recursive: true });
  await unlinkedPath(root, dirname(target));
  await mkdir(target); // Exclusive creation: never replace an existing preview.
  for (const entry of entries) {
    const destination = resolve(target, entry.path);
    await unlinkedPath(root, destination, true);
    await mkdir(dirname(destination), { recursive: true });
    await unlinkedPath(root, destination, true);
    await writeFile(destination, entry.data, { flag: "wx" });
  }
  const licensed = paths.includes("LICENSE");
  const files = entries.map(({ path, data, sha256 }) => ({ path, bytes: data.length, sha256 }));
  const manifestPath = resolve(target, "SOURCE-MANIFEST.json");
  await unlinkedPath(root, manifestPath, true);
  await writeFile(manifestPath, JSON.stringify({
    format: "microscope-source-preview-v1", status: "local-preview-not-published",
    licenseStatus: licensed ? "license-file-included" : "undecided-do-not-describe-as-open-source-yet",
    selectionPolicy,
    verification: "Run npm ci then npm run verify:portable in this folder. Full research replay additionally requires separately pinned historical caches and generated artifacts. Native reexecution has separate Rust/Mollusk prerequisites documented with the included harness source.",
    files,
  }, null, 2) + "\n", { flag: "wx" });
  return { target, licensed, files };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--output-dir" || !args[1] || args[1].startsWith("--"))) throw new Error("Usage: npm run release:prepare -- [--output-dir DIR]");
  const preview = await prepareRelease(args[1] ? { outputDir: args[1] } : {});
  console.log(`Prepared ${preview.files.length} source files at ${preview.target}`);
  console.log(preview.licensed ? "License file included; review before publication." : "License remains undecided. This is a local preview, not a published release.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
