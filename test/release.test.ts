import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { prepareRelease } from "../scripts/prepare-release.js";

// A source checkout containing only the required public inputs; no real caches or dependency installation.
const minimumFiles = [
  ...["Cargo.toml", "Cargo.lock", "README.md", ".gitignore", "run.sh", "src/main.rs"].map(path => "tools/current-bundle-runtime/" + path),
  ...["Cargo.toml", "Cargo.lock", "README.md", ".gitignore", "cross-instruction.patch", "run.sh", "src/main.rs"].map(path => "tools/full-bundle-runtime/" + path),
  "package.json", "package-lock.json", "tsconfig.json", "README.md", "AGENTS.md", ".gitignore", ".gitattributes", "CONTRIBUTING.md", "HANDOFF.md",
  "src/main.ts", "scripts/demo.ts", "test/basic.test.ts", "fixtures/block.json", "research-plans/plan.json", "discovery-plans/plan.json",
  "docs/research/evidence.md", "docs/handoffs/MILESTONE-3.0.md", "docs/guides/START.md",
  "tools/milestone23-linux-runtime/Cargo.toml", "tools/milestone23-linux-runtime/Cargo.lock", "tools/milestone23-linux-runtime/README.md",
  "tools/milestone23-linux-runtime/.gitignore", "tools/milestone23-linux-runtime/mollusk-0.13.1-cross-instruction.patch", "tools/milestone23-linux-runtime/src/main.rs",
];

async function write(root: string, path: string, contents: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}

async function checkout(t: TestContext): Promise<{ base: string; root: string }> {
  const base = await mkdtemp(join(tmpdir(), "microscope-release-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "workspace");
  for (const path of minimumFiles) await write(root, path, `fixture for ${path}\n`);
  return { base, root };
}

async function directoryLink(t: TestContext, destination: string, path: string): Promise<boolean> {
  try { await symlink(destination, path, process.platform === "win32" ? "junction" : "dir"); return true; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(code ?? "")) {
      t.skip(`This environment cannot create the directory link required by the boundary test (${code}).`);
      return false;
    }
    throw error;
  }
}

test("release preview contains required portable, handoff, and native source inputs with byte-verifiable manifest", async (t) => {
  const { root } = await checkout(t);
  const result = await prepareRelease({ root });
  assert.deepEqual(result.files.map((entry) => entry.path), [...minimumFiles].sort());
  assert.equal(result.licensed, false);
  const manifest = JSON.parse(await readFile(join(result.target, "SOURCE-MANIFEST.json"), "utf8")) as {
    status: string; licenseStatus: string; selectionPolicy: string; verification: string; files: typeof result.files;
  };
  assert.equal(manifest.status, "local-preview-not-published");
  assert.equal(manifest.licenseStatus, "undecided-do-not-describe-as-open-source-yet");
  assert.match(manifest.selectionPolicy, /Other extensions are intentionally skipped/);
  assert.match(manifest.verification, /caches and generated artifacts/);
  assert.deepEqual(manifest.files, result.files);
  for (const entry of manifest.files) {
    const bytes = await readFile(join(result.target, entry.path));
    assert.deepEqual(bytes, await readFile(join(root, entry.path)));
    assert.equal(entry.bytes, bytes.length);
    assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));
  }
});

test("missing handoff or native source fails before creating output", async (t) => {
  for (const path of ["HANDOFF.md", "tools/milestone23-linux-runtime/src/main.rs", "tools/full-bundle-runtime/src/main.rs", "tools/current-bundle-runtime/src/main.rs"]) {
    const { root } = await checkout(t);
    await rm(join(root, path));
    await assert.rejects(prepareRelease({ root }), { code: "ENOENT" });
    assert.equal((await readdir(root)).includes("output"), false);
  }
});

test("release preparation never replaces an existing output directory", async (t) => {
  const { root } = await checkout(t);
  const target = join(root, "output", "release-preview");
  await write(target, "sentinel.txt", "keep exactly this\n");
  await assert.rejects(prepareRelease({ root }), /already exists; refusing to overwrite/);
  assert.deepEqual(await readdir(target), ["sentinel.txt"]);
  assert.equal(await readFile(join(target, "sentinel.txt"), "utf8"), "keep exactly this\n");
});

test("source selection omits nested hidden files, unlisted extensions, build products, and caches", async (t) => {
  const { root } = await checkout(t);
  const excluded = [
    "tools/current-bundle-runtime/target/native", "tools/current-bundle-runtime/private.key", "tools/full-bundle-runtime/target/native", "tools/full-bundle-runtime/private.key", ".env", "src/.env", "fixtures/.env.json", "src/.git/config", "src/.private/secret.ts", "src/node_modules/injected.ts",
    "src/cache/cached.ts", "src/backups/old.ts", "src/secrets/secret.ts", "src/private.pem", "test/debug.log",
    "fixtures/notes.md", "docs/guides/credentials.json", "tools/milestone23-linux-runtime/target/native", "tools/milestone23-linux-runtime/rust-toolchain.toml",
    "tools/milestone23-linux-runtime/src/unlisted.rs", "cache/private.json", "CHECKPOINTS/PRIVATE.md",
  ];
  for (const path of excluded) await write(root, path, "MUST NOT BE COPIED");
  await write(root, "src/nested/kept.ts", "export const kept = true;\n");
  const result = await prepareRelease({ root, outputDir: "output/preview with spaces" });
  assert.deepEqual(result.files.map((entry) => entry.path), [...minimumFiles, "src/nested/kept.ts"].sort());
  for (const entry of result.files) assert.ok(!(await readFile(join(result.target, entry.path), "utf8")).includes("MUST NOT BE COPIED"));
});

test("release preparation rejects traversal, output root, and absolute destinations outside the workspace", async (t) => {
  const { base, root } = await checkout(t);
  for (const outputDir of ["output", "src/preview", "output/../../escaped", join(base, "outside")]) {
    await assert.rejects(prepareRelease({ root, outputDir }), /under output\/ inside the real workspace/);
  }
  assert.deepEqual(await readdir(base), ["workspace"]);
  assert.equal((await readdir(root)).includes("output"), false);
});

test("release preparation rejects a source ancestor junction before copying external documentation", async (t) => {
  const { base, root } = await checkout(t);
  const externalDocs = join(base, "external-docs");
  await rename(join(root, "docs"), externalDocs);
  if (!await directoryLink(t, externalDocs, join(root, "docs"))) return;
  await assert.rejects(prepareRelease({ root }), /Refusing symbolic link or junction/);
  assert.equal((await readdir(root)).includes("output"), false);
  assert.equal(await readFile(join(externalDocs, "guides", "START.md"), "utf8"), "fixture for docs/guides/START.md\n");
});

test("release preparation rejects an output ancestor junction before creating files outside the workspace", async (t) => {
  const { base, root } = await checkout(t);
  const externalOutput = join(base, "external-output");
  await mkdir(externalOutput);
  await mkdir(join(root, "output"));
  if (!await directoryLink(t, externalOutput, join(root, "output", "linked"))) return;
  await assert.rejects(prepareRelease({ root, outputDir: "output/linked/new-preview" }), /Refusing symbolic link or junction/);
  assert.deepEqual(await readdir(externalOutput), []);
});

test("release preparation rejects source junctions even when they point inside the real workspace", async (t) => {
  const { root } = await checkout(t);
  const parked = join(root, "parked-src");
  await rename(join(root, "src"), parked);
  if (!await directoryLink(t, parked, join(root, "src"))) return;
  await assert.rejects(prepareRelease({ root }), /Refusing symbolic link or junction/);
  assert.equal((await readdir(root)).includes("output"), false);
});
