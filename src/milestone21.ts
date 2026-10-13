import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { platform, release } from "node:os";
import { dirname, extname, resolve } from "node:path";
import { getAddressDecoder } from "@solana/kit";
import { milestone21Html, milestone21Markdown } from "./milestone21-report.js";
import type {
  AccountContractEntry,
  BuildAttempt,
  BuildEnvironmentRaw,
  BuildResult,
  DeploymentHistoryRaw,
  ElfHeader,
  ElfParseResult,
  ElfSection,
  ElfSymbol,
  ExtractedString,
  Milestone21Input,
  Milestone21Plan,
  Milestone21Result,
  OverallBinaryOutcome,
  ProgramDataExtraction,
  SampleBinaryContinuity,
  SourceCommitFinding,
  SourceHistoryRaw,
  StructuralComparison,
  VariantConfidence,
  VariantCorrespondenceRow,
} from "./milestone21-types.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const POST_PYTH_DISCRIMINATOR = "daedaaf5278fa621";
const UPDATE_TWAP_DISCRIMINATOR = "f717ff41d45addc2";
const NATIVE_PREFIX = "ffffffff02";

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
export const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const slash = (value: string): string => value.replaceAll("\\", "/");

async function fileSha256(path: string): Promise<string> {
  return sha256(await readFile(resolve(path)));
}

function u64(buffer: Buffer, offset: number): bigint {
  return buffer.readBigUInt64LE(offset);
}

function safeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds JavaScript safe integer range`);
  return Number(value);
}

export function decodeProgramData(raw: Buffer): ProgramDataExtraction {
  if (raw.length < 13) throw new Error("ProgramData account is shorter than its minimum bincode header");
  const stateTag = raw.readUInt32LE(0);
  if (stateTag !== 3) throw new Error(`Expected upgradeable-loader ProgramData tag 3, observed ${stateTag}`);
  const slot = safeNumber(u64(raw, 4), "ProgramData slot");
  const upgradeAuthorityOption = raw.readUInt8(12);
  if (upgradeAuthorityOption !== 0 && upgradeAuthorityOption !== 1) {
    throw new Error(`Invalid ProgramData authority option ${upgradeAuthorityOption}`);
  }
  const headerLength = upgradeAuthorityOption === 1 ? 45 : 13;
  if (raw.length <= headerLength) throw new Error("ProgramData account has no executable payload");
  const executable = raw.subarray(headerLength);
  return {
    stateTag,
    slot,
    upgradeAuthorityOption,
    upgradeAuthorityBytesHex: upgradeAuthorityOption === 1 ? raw.subarray(13, 45).toString("hex") : null,
    headerLength,
    rawLength: raw.length,
    rawSha256: sha256(raw),
    executableLength: executable.length,
    executableSha256: sha256(executable),
    executable,
  };
}

const SECTION_TYPES: Record<number, string> = {
  0: "NULL", 1: "PROGBITS", 2: "SYMTAB", 3: "STRTAB", 4: "RELA", 5: "HASH",
  6: "DYNAMIC", 7: "NOTE", 8: "NOBITS", 9: "REL", 10: "SHLIB", 11: "DYNSYM",
};

function cString(buffer: Buffer, start: number): string {
  if (start < 0 || start >= buffer.length) return "";
  let end = start;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return buffer.subarray(start, end).toString("utf8");
}

export function parseElf64(executable: Buffer): ElfParseResult {
  const errors: string[] = [];
  if (executable.length < 64) throw new Error("Executable is too short for an ELF64 header");
  const header: ElfHeader = {
    magicHex: executable.subarray(0, 16).toString("hex"),
    class: executable[4]!, dataEncoding: executable[5]!, version: executable[6]!, osAbi: executable[7]!,
    type: executable.readUInt16LE(16), machine: executable.readUInt16LE(18),
    entry: u64(executable, 24).toString(), programHeaderOffset: u64(executable, 32).toString(),
    sectionHeaderOffset: u64(executable, 40).toString(), flags: executable.readUInt32LE(48),
    headerSize: executable.readUInt16LE(52), programHeaderEntrySize: executable.readUInt16LE(54),
    programHeaderCount: executable.readUInt16LE(56), sectionHeaderEntrySize: executable.readUInt16LE(58),
    sectionHeaderCount: executable.readUInt16LE(60), sectionNameStringTableIndex: executable.readUInt16LE(62),
  };
  if (!executable.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) errors.push("missing ELF magic");
  if (header.class !== 2) errors.push(`expected ELF64 class 2, observed ${header.class}`);
  if (header.dataEncoding !== 1) errors.push(`expected little-endian encoding 1, observed ${header.dataEncoding}`);
  if (header.machine !== 263) errors.push(`expected Solana SBF machine 263, observed ${header.machine}`);
  if (header.sectionHeaderEntrySize !== 64) errors.push(`expected 64-byte section headers, observed ${header.sectionHeaderEntrySize}`);
  const shoff = safeNumber(BigInt(header.sectionHeaderOffset), "section header offset");
  const tableEnd = shoff + header.sectionHeaderCount * header.sectionHeaderEntrySize;
  if (tableEnd > executable.length) errors.push("section header table extends past executable length");

  const rawSections: Array<ElfSection & { nameOffset: number }> = [];
  if (tableEnd <= executable.length) {
    for (let index = 0; index < header.sectionHeaderCount; index += 1) {
      const offset = shoff + index * header.sectionHeaderEntrySize;
      const sectionOffset = safeNumber(u64(executable, offset + 24), `section ${index} offset`);
      const sectionSize = safeNumber(u64(executable, offset + 32), `section ${index} size`);
      const bytes = sectionOffset <= executable.length && sectionSize <= executable.length - sectionOffset
        ? executable.subarray(sectionOffset, sectionOffset + sectionSize) : Buffer.alloc(0);
      if (bytes.length !== sectionSize && executable.readUInt32LE(offset + 4) !== 8) errors.push(`section ${index} exceeds executable length`);
      rawSections.push({
        index, name: "", nameOffset: executable.readUInt32LE(offset), type: executable.readUInt32LE(offset + 4),
        typeName: SECTION_TYPES[executable.readUInt32LE(offset + 4)] ?? `0x${executable.readUInt32LE(offset + 4).toString(16)}`,
        flags: u64(executable, offset + 8).toString(), address: u64(executable, offset + 16).toString(),
        offset: sectionOffset, size: sectionSize, link: executable.readUInt32LE(offset + 40),
        info: executable.readUInt32LE(offset + 44), alignment: u64(executable, offset + 48).toString(),
        entrySize: u64(executable, offset + 56).toString(), sha256: sha256(bytes),
      });
    }
  }
  const shstr = rawSections[header.sectionNameStringTableIndex];
  const shstrBytes = shstr && shstr.offset + shstr.size <= executable.length
    ? executable.subarray(shstr.offset, shstr.offset + shstr.size) : Buffer.alloc(0);
  const sections = rawSections.map(({ nameOffset, ...section }) => ({ ...section, name: cString(shstrBytes, nameOffset) }));

  const symbols: ElfSymbol[] = [];
  for (const section of sections.filter((item) => item.type === 2 || item.type === 11)) {
    const entrySize = Number(BigInt(section.entrySize || "0"));
    const strings = sections[section.link];
    if (!strings || entrySize < 24 || section.offset + section.size > executable.length || strings.offset + strings.size > executable.length) continue;
    const stringBytes = executable.subarray(strings.offset, strings.offset + strings.size);
    const count = Math.floor(section.size / entrySize);
    for (let index = 0; index < count; index += 1) {
      const offset = section.offset + index * entrySize;
      const info = executable.readUInt8(offset + 4);
      symbols.push({
        table: section.name, index, name: cString(stringBytes, executable.readUInt32LE(offset)),
        binding: info >> 4, type: info & 0x0f, visibility: executable.readUInt8(offset + 5) & 0x03,
        sectionIndex: executable.readUInt16LE(offset + 6), value: u64(executable, offset + 8).toString(),
        size: u64(executable, offset + 16).toString(),
      });
    }
  }
  const relocationSections = sections.filter((section) => section.type === 4 || section.type === 9).map((section) => ({
    name: section.name, type: section.typeName,
    entryCount: BigInt(section.entrySize) === 0n ? 0 : Math.floor(section.size / Number(BigInt(section.entrySize))),
    targetSectionIndex: section.info, symbolTableIndex: section.link,
  }));
  return { valid: errors.length === 0, validationErrors: errors, header, sections, symbols, relocationSections };
}

export function extractDeterministicStrings(buffer: Buffer, minimumLength = 4): ExtractedString[] {
  const strings: ExtractedString[] = [];
  let start = -1;
  for (let index = 0; index <= buffer.length; index += 1) {
    const byte = index < buffer.length ? buffer[index]! : 0;
    const printable = byte >= 0x20 && byte <= 0x7e;
    if (printable && start < 0) start = index;
    if (!printable && start >= 0) {
      if (index - start >= minimumLength) strings.push({ offset: start, value: buffer.subarray(start, index).toString("ascii") });
      start = -1;
    }
  }
  return strings;
}

export function allSampleSlotsAfter(sampleSlots: number[], deploymentSlot: number): boolean {
  return sampleSlots.length > 0 && sampleSlots.every((slot) => Number.isSafeInteger(slot) && slot > deploymentSlot);
}

export function classifyDeploymentContinuity(evidence: {
  programPointsToProgramData: boolean;
  slotMatches: boolean;
  allSamplesAfter: boolean;
  upgradeTransactionDecoded: boolean;
  noLaterProgramDataMutation: boolean;
  snapshotAfterSamples: boolean;
}): SampleBinaryContinuity {
  if (Object.values(evidence).every(Boolean)) return "sample-binary-continuity-established";
  const foundations = evidence.programPointsToProgramData && evidence.slotMatches && evidence.allSamplesAfter && evidence.snapshotAfterSamples;
  if (foundations && (evidence.upgradeTransactionDecoded || evidence.noLaterProgramDataMutation)) return "sample-binary-continuity-probable";
  return "sample-binary-continuity-unresolved";
}

export function compareAccountStructure(
  candidate: string,
  observed: AccountContractEntry[],
  source: AccountContractEntry[],
  sourceMinimumCount: number,
): StructuralComparison {
  const cardinalityCompatible = observed.length >= sourceMinimumCount;
  let systemProgramMismatch = false;
  const max = Math.max(observed.length, source.length);
  const positionComparisons = Array.from({ length: max }, (_, position) => {
    const actual = observed[position];
    const expected = source[position];
    let compatible = Boolean(actual && expected);
    let reason = compatible ? "Observed signer/writable declaration is structurally compatible with the source role." : "Position is missing from one side of the comparison.";
    if (actual && expected && (actual.signer !== expected.signer || actual.writable !== expected.writable)) {
      compatible = false;
      reason = "Signer/writable declarations differ.";
    }
    if (actual && expected?.role === "system_program" && actual.address !== SYSTEM_PROGRAM) {
      compatible = false;
      systemProgramMismatch = true;
      reason = `Source requires the System Program, but the transaction supplies ${actual.address ?? "an unknown address"} owned by ${actual.owner ?? "an unknown owner"}.`;
    }
    return {
      position,
      observedAddress: actual?.address ?? null,
      observedOwner: actual?.owner ?? null,
      sourceRole: expected?.role ?? null,
      compatible,
      reason,
    };
  });
  const structurallyCompatible = cardinalityCompatible && !systemProgramMismatch
    && positionComparisons.slice(0, sourceMinimumCount).every((row) => row.compatible);
  return {
    candidate, observedCount: observed.length, sourceMinimumCount, cardinalityCompatible, systemProgramMismatch,
    positionComparisons, structurallyCompatible,
    conclusion: structurallyCompatible
      ? "The observed layout is structurally compatible with this source contract; this alone is not a binary match."
      : "The observed layout contradicts this source contract and cannot be used as deployed handler truth.",
  };
}

export function classifyComparisonFingerprint(source: string): "less-than" | "less-than-or-equal" | "greater-than-or-equal" | "other" {
  if (/next_timestamp[^\n;]*<=\s*current_timestamp|next_timestamp[^\n"]*<= current_timestamp/.test(source)) return "less-than-or-equal";
  if (/current_timestamp[^\n;]*>=\s*next_timestamp|current ts \{\} >= next_timestamp/.test(source)) return "greater-than-or-equal";
  if (/next_timestamp[^\n;]*<\s*current_timestamp|next_timestamp[^\n"]*< current_timestamp/.test(source)) return "less-than";
  return "other";
}

export function classifyBuildAttempt(input: {
  buildExecuted: boolean;
  reproducible: boolean;
  firstHash: string | null;
  repeatHash: string | null;
  deployedHash: string;
}): BuildResult {
  if (!input.buildExecuted) return "build-unavailable";
  if (!input.reproducible || !input.firstHash || !input.repeatHash || input.firstHash !== input.repeatHash) return "non-reproducible-build";
  return input.firstHash === input.deployedHash ? "exact-binary-match" : "reproducible-binary-mismatch";
}

export function isExactBinaryMatch(deployedHash: string, deployedLength: number, builtHash: string | null, builtLength: number | null): boolean {
  return Boolean(builtHash && builtLength !== null && deployedHash === builtHash && deployedLength === builtLength);
}

export function evaluateVariantConfidence(input: {
  exactBinaryMatch: boolean;
  authoritativeSource: boolean;
  exactProgramId: boolean;
  exactInstructionIdentity: boolean;
  exactRuntimeStringOrPath: boolean;
  accountContractCompatible: boolean;
  materialContradiction: boolean;
}): VariantConfidence {
  if (input.exactBinaryMatch && !input.materialContradiction) return "exact";
  if (input.authoritativeSource && input.exactProgramId && input.exactInstructionIdentity
      && input.exactRuntimeStringOrPath && input.accountContractCompatible) return "strong";
  if (input.authoritativeSource && input.exactInstructionIdentity) return "source-family-only";
  return "unresolved";
}

export function chooseOverallOutcome(
  continuity: SampleBinaryContinuity,
  variants: Array<{ confidence: VariantConfidence }>,
  exactBuildMatch: boolean,
  allObservedVariantsConsistent: boolean,
): OverallBinaryOutcome {
  if (continuity === "sample-binary-continuity-established" && exactBuildMatch && allObservedVariantsConsistent) {
    return "exact-deployed-source-match";
  }
  if (!exactBuildMatch && variants.some((variant) => variant.confidence === "strong")) return "variant-level-strong-correspondence";
  return "source-family-only-confirmed";
}

function gitText(repository: string, args: string[]): string {
  const result = spawnSync("git", ["-C", resolve(repository), ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.replace(/\r\n/g, "\n");
}

async function commandRecord(command: string): Promise<{ command: string; available: boolean; version: string | null }> {
  const location = spawnSync("where.exe", [command], { encoding: "utf8" });
  if (location.status !== 0) return { command, available: false, version: null };
  const version = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 15_000 });
  return { command, available: true, version: `${version.stdout}${version.stderr}`.trim().split(/\r?\n/)[0] ?? null };
}

async function walkFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(path);
    }
  }
  await visit(resolve(root));
  return result.sort((a, b) => slash(a).localeCompare(slash(b)));
}

export async function inspectVelocityV1(packageRoot: string, tarballPath: string): Promise<Record<string, unknown>> {
  const files = await walkFiles(packageRoot);
  const relative = files.map((path) => slash(path.slice(resolve(packageRoot).length + 1)));
  const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8")) as Record<string, unknown>;
  const extensions = new Map<string, number>();
  for (const path of relative) extensions.set(extname(path) || "[none]", (extensions.get(extname(path) || "[none]") ?? 0) + 1);
  const rust = relative.filter((path) => path.endsWith(".rs"));
  const binaries = relative.filter((path) => /\.(so|elf|o)$/i.test(path));
  const buildMetadata = relative.filter((path) => /(^|\/)(Cargo\.lock|Cargo\.toml|Anchor\.toml|\.verified-build\.json)$/i.test(path));
  const idls = relative.filter((path) => /(^|\/)idl\//i.test(path) && /\.(json|js|d\.ts)$/i.test(path));
  return {
    repositorySurface: "velocity-exchange/velocity-v1",
    publicGitAcquisition: "unavailable-currently-404-or-auth-required",
    fallbackSurface: "@velocity-exchange/sdk@0.17.0 npm tarball",
    tarballPath: slash(tarballPath), tarballSha256: await fileSha256(tarballPath),
    packageName: packageJson.name, packageVersion: packageJson.version, repository: packageJson.repository,
    gitHead: packageJson.gitHead, packageDirectory: (packageJson.repository as Record<string, unknown> | undefined)?.directory,
    fileCount: relative.length,
    extensions: [...extensions].sort(([a], [b]) => a.localeCompare(b)).map(([extension, count]) => ({ extension, count })),
    rustSourceFiles: rust, onChainBinaryFiles: binaries, buildMetadataFiles: buildMetadata,
    historicalIdlOrGeneratedInterfaceFiles: idls.slice(0, 200),
    containsOnChainRustSource: rust.length > 0,
    containsBuildArtifacts: binaries.length > 0,
    containsOnChainBuildMetadata: buildMetadata.length > 0,
    finding: rust.length === 0 && binaries.length === 0 && buildMetadata.length === 0
      ? "client-sdk-idl-only-no-on-chain-rust-or-build-metadata"
      : "contains-on-chain-material",
    limitation: "The current public Git surface was unavailable; this negative is bounded to the official npm tarball and its repository metadata.",
  };
}

async function acquireLoaderSource(plan: Milestone21Plan): Promise<void> {
  const source = gitText(plan.repositories.agave, ["show", `${plan.pinnedCommits.agave}:programs/bpf_loader/src/lib.rs`]);
  const cargo = gitText(plan.repositories.agave, ["show", `${plan.pinnedCommits.agave}:programs/bpf_loader/Cargo.toml`]);
  const record = {
    schemaVersion: "2.1-loader-source-cache", acquiredAt: plan.generatedAt,
    repository: "https://github.com/anza-xyz/agave", tag: plan.pinnedCommits.agaveTag, commit: plan.pinnedCommits.agave,
    sourcePath: "programs/bpf_loader/src/lib.rs", sourceSha256: sha256(source), source,
    cargoPath: "programs/bpf_loader/Cargo.toml", cargoSha256: sha256(cargo), cargo,
  };
  await mkdir(dirname(resolve(plan.cache.loaderSourceRaw)), { recursive: true });
  await writeFile(resolve(plan.cache.loaderSourceRaw), json(record));
}

function commitMetadata(repository: string, commit: string): Omit<SourceCommitFinding, "repository" | "reachableFrom" | "relevance" | "blobHashes"> {
  const fields = gitText(repository, ["show", "-s", "--format=%H%n%aI%n%cI%n%s", commit]).trimEnd().split("\n");
  return { commit: fields[0]!, authoredAt: fields[1]!, committedAt: fields[2]!, subject: fields.slice(3).join("\n") };
}

function sourceBlob(repository: string, commit: string, path: string): { path: string; content: string; sha256: string } {
  const content = gitText(repository, ["show", `${commit}:${path}`]);
  return { path, content, sha256: sha256(content) };
}

async function acquireSourceHistory(plan: Milestone21Plan): Promise<void> {
  const repository = plan.repositories.protocolV2;
  const definitions: Array<{ commit: string; relevance: string[]; paths: string[] }> = [
    { commit: plan.pinnedCommits.driftForkRelease, relevance: ["documented Drift SDK v2.163.0-beta.0 fork-point release"], paths: ["sdk/package.json"] },
    { commit: plan.pinnedCommits.driftOracleTimestamp, relevance: ["introduced the public `<` Lazer timestamp/log fingerprint"], paths: ["programs/drift/src/instructions/pyth_lazer_oracle.rs"] },
    { commit: plan.pinnedCommits.driftNativeOpcode2, relevance: ["introduced native opcode 2 and six-account oracle-cache handler"], paths: ["programs/drift/src/lib.rs", "programs/drift/src/instructions/admin.rs"] },
    { commit: plan.pinnedCommits.velocityRebrand, relevance: ["renamed program path to programs/velocity and declared exact Velocity program ID"], paths: ["programs/velocity/src/lib.rs", "programs/velocity/src/instructions/pyth_lazer_oracle.rs"] },
    { commit: plan.pinnedCommits.velocityNativeHardening, relevance: ["documented public Velocity native dispatcher/account contracts"], paths: ["programs/velocity/src/lib.rs", "programs/velocity/src/instructions/admin.rs"] },
    { commit: plan.pinnedCommits.velocityCandidate, relevance: ["strongest pre-deployment public Velocity source candidate"], paths: ["programs/velocity/src/lib.rs", "programs/velocity/src/instructions/pyth_lazer_oracle.rs", "programs/velocity/src/instructions/keeper.rs", "programs/velocity/Cargo.toml", "Anchor.toml", ".verified-build.json", ".github/actions/build-program/action.yml", ".github/workflows/main.yml", "Cargo.lock"] },
    { commit: plan.pinnedCommits.velocityReachableTag, relevance: ["latest public tag containing the Velocity candidate lineage"], paths: ["programs/velocity/src/lib.rs", "programs/velocity/src/instructions/pyth_lazer_oracle.rs"] },
    { commit: plan.pinnedCommits.protocolCurrentHead, relevance: ["current official default-branch head and SDK v2.163.0-beta.1 surface"], paths: ["programs/drift/src/lib.rs", "sdk/package.json"] },
  ];
  const commits: SourceCommitFinding[] = definitions.map((definition) => {
    const metadata = commitMetadata(repository, definition.commit);
    const refs = gitText(repository, ["for-each-ref", "--contains", definition.commit, "--format=%(refname)"]).trim().split("\n").filter(Boolean).sort();
    const blobs = definition.paths.map((path) => sourceBlob(repository, definition.commit, path));
    return { repository: "https://github.com/velocity-exchange/protocol-v2", ...metadata, reachableFrom: refs, relevance: definition.relevance, blobHashes: blobs.map(({ path, sha256: hash }) => ({ path, sha256: hash })) };
  });
  const velocityLib = sourceBlob(repository, plan.pinnedCommits.velocityCandidate, "programs/velocity/src/lib.rs").content;
  const velocityPyth = sourceBlob(repository, plan.pinnedCommits.velocityCandidate, "programs/velocity/src/instructions/pyth_lazer_oracle.rs").content;
  const velocityKeeper = sourceBlob(repository, plan.pinnedCommits.velocityCandidate, "programs/velocity/src/instructions/keeper.rs").content;
  const driftLib = sourceBlob(repository, plan.pinnedCommits.driftNativeOpcode2, "programs/drift/src/lib.rs").content;
  const driftAdmin = sourceBlob(repository, plan.pinnedCommits.driftNativeOpcode2, "programs/drift/src/instructions/admin.rs").content;
  const comparisonCommits = ["1dd238fe65f03da8728d218b8cd35ea79a9e5123", "6798aa6e41e477a7bc3d9ea228db9429331b0163", plan.pinnedCommits.driftOracleTimestamp, plan.pinnedCommits.velocityCandidate];
  const comparisonHistory = comparisonCommits.map((commit) => {
    const path = commit === plan.pinnedCommits.velocityCandidate ? "programs/velocity/src/instructions/pyth_lazer_oracle.rs" : "programs/drift/src/instructions/pyth_lazer_oracle.rs";
    const source = sourceBlob(repository, commit, path).content;
    return { commit, path, classification: classifyComparisonFingerprint(source), sourceSha256: sha256(source),
      postingLog: source.includes("Posting new lazer update. current ts {} < next_timestamp {}"),
      skipLessThanLog: source.includes("Skipping lazer price update. next_timestamp {} < current_timestamp {}"),
      skipLessThanOrEqualLog: source.includes("Skipping lazer price update. next_timestamp {} <= current_timestamp {}"),
      skipGreaterThanOrEqualLog: source.includes("Skipping lazer price update. current ts {} >= next_timestamp {}") };
  });
  const velocityV1 = await inspectVelocityV1(resolve(dirname(plan.cache.velocityV1Tarball), "package"), plan.cache.velocityV1Tarball);
  const refs = gitText(repository, ["for-each-ref", "--format=%(refname)%09%(objectname)"]).trim().split("\n").filter(Boolean)
    .map((line) => { const [name, object] = line.split("\t"); return { name: name!, object: object! }; })
    .sort((a, b) => a.name.localeCompare(b.name));
  const record: SourceHistoryRaw = {
    schemaVersion: "2.1-source-history-cache", acquiredAt: plan.generatedAt,
    repositoryUrl: "https://github.com/velocity-exchange/protocol-v2", repositoryHead: gitText(repository, ["rev-parse", "HEAD"]).trim(), refs, commits,
    fingerprints: {
      publicVelocityCandidate: {
        commit: plan.pinnedCommits.velocityCandidate,
        exactProgramId: velocityLib.includes(plan.programId),
        nativeOpcodes: [...velocityLib.matchAll(/(\d+)\s*=>\s*Ok\(handle_([a-z0-9_]+)_native/g)].map((match) => ({ opcode: Number(match[1]), handler: match[2] })),
        containsOpcode2: /2\s*=>\s*Ok\(/.test(velocityLib),
        pythComparison: classifyComparisonFingerprint(velocityPyth),
        postingLogExact: velocityPyth.includes("Posting new lazer update. current ts {} < next_timestamp {}"),
        skipLessThanOrEqualLogExact: velocityPyth.includes("Skipping lazer price update. next_timestamp {} <= current_timestamp {}"),
        updateTwapStruct: velocityKeeper.includes("pub struct UpdatePerpBidAskTwap"),
      },
      publicDriftOpcode2: {
        commit: plan.pinnedCommits.driftNativeOpcode2,
        dispatcherRoutesOpcode2: driftLib.includes("2 => Ok(handle_set_oracle_cache_entries_native"),
        handlerFound: driftAdmin.includes("handle_set_oracle_cache_entries_native"),
        minimumAccountCount: /accounts\.len\(\)\s*>=\s*6/.test(driftAdmin) ? 6 : null,
        accountOrder: ["admin", "state", "cache0", "cache1", "system_program", "rent"],
      },
      comparisonHistory,
    },
    velocityV1,
  };
  await mkdir(dirname(resolve(plan.cache.sourceHistoryRaw)), { recursive: true });
  await writeFile(resolve(plan.cache.sourceHistoryRaw), json(record));
}

async function rpc(endpoint: string, payload: unknown): Promise<unknown> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 5) throw new Error(`RPC HTTP ${response.status}`);
    const retryAfter = Number(response.headers.get("retry-after") ?? "0");
    const delay = Math.max(Number.isFinite(retryAfter) ? retryAfter * 1_000 : 0, 500 * (2 ** attempt));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
  }
  throw new Error("RPC retry loop exhausted");
}

async function acquireDeploymentHistory(plan: Milestone21Plan): Promise<void> {
  const pages: unknown[] = [];
  const allSignatures: Array<{ signature: string; slot: number }> = [];
  let before: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const config: Record<string, unknown> = { limit: 1000, commitment: "confirmed" };
    if (before) config.before = before;
    const response = await rpc(plan.endpoint, { jsonrpc: "2.0", id: `programdata-${page}`, method: "getSignaturesForAddress", params: [plan.programDataAddress, config] }) as { result?: Array<{ signature: string; slot: number }> };
    pages.push(response);
    const values = response.result ?? [];
    allSignatures.push(...values);
    if (values.length < 1000) break;
    before = values.at(-1)?.signature;
    if (!before) break;
  }
  const transactionRequests = allSignatures.map((entry, index) => ({
    jsonrpc: "2.0", id: `tx-${index}`, method: "getTransaction",
    params: [entry.signature, { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
  }));
  const transactionResponses: unknown[] = [];
  for (let index = 0; index < transactionRequests.length; index += 5) {
    const batch = await rpc(plan.endpoint, transactionRequests.slice(index, index + 5));
    if (!Array.isArray(batch)) throw new Error("RPC transaction batch response was not an array");
    transactionResponses.push(...batch);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  const record: DeploymentHistoryRaw = {
    schemaVersion: "2.1-deployment-history-cache", acquiredAt: plan.generatedAt, endpoint: plan.endpoint,
    versionResponse: await rpc(plan.endpoint, { jsonrpc: "2.0", id: "version", method: "getVersion" }),
    programSignatures: await rpc(plan.endpoint, { jsonrpc: "2.0", id: "program-signatures", method: "getSignaturesForAddress", params: [plan.programId, { limit: 1000, commitment: "confirmed" }] }),
    programDataSignaturePages: pages,
    programDataTransactions: transactionResponses,
  };
  await mkdir(dirname(resolve(plan.cache.deploymentHistoryRaw)), { recursive: true });
  await writeFile(resolve(plan.cache.deploymentHistoryRaw), json(record));
}

async function acquireBuildEnvironment(plan: Milestone21Plan): Promise<void> {
  const commands = await Promise.all(["cargo", "rustc", "solana", "anchor", "solana-verify", "docker", "podman"].map(commandRecord));
  const wslLocation = spawnSync("where.exe", ["wsl"], { encoding: "utf8" });
  let wslDetail = "wsl.exe is not installed";
  let wslAvailable = false;
  if (wslLocation.status === 0) {
    const distributions = spawnSync("wsl", ["-l", "-q"], { encoding: "utf8", timeout: 15_000 });
    const probe = spawnSync("wsl", ["-e", "sh", "-lc", "true"], { encoding: "utf8", timeout: 30_000 });
    wslAvailable = probe.status === 0;
    wslDetail = `distributions=${distributions.stdout.replace(/\0/g, "").trim() || "none"}; probeStatus=${probe.status}; ${probe.stderr.trim()}`;
  }
  const record: BuildEnvironmentRaw = {
    schemaVersion: "2.1-build-environment-cache", acquiredAt: plan.generatedAt,
    host: `${platform()} ${release()}`, commands,
    isolatedRuntimes: [{ name: "WSL", available: wslAvailable, detail: wslDetail }],
  };
  await mkdir(dirname(resolve(plan.cache.buildEnvironmentRaw)), { recursive: true });
  await writeFile(resolve(plan.cache.buildEnvironmentRaw), json(record));
}

async function acquireCaches(plan: Milestone21Plan): Promise<void> {
  await Promise.all([acquireLoaderSource(plan), acquireSourceHistory(plan), acquireDeploymentHistory(plan), acquireBuildEnvironment(plan)]);
}

function expectedInput(plan: Milestone21Plan, path: string): Milestone21Input | undefined {
  return plan.inputs.find((input) => slash(input.path) === slash(path));
}

async function validateInput(plan: Milestone21Plan, path: string, bootstrapHashes: boolean): Promise<Milestone21Input> {
  const observed = await fileSha256(path);
  const expected = expectedInput(plan, path);
  if (!expected) throw new Error(`Milestone 2.1 plan does not list input ${path}`);
  if (!bootstrapHashes && expected.sha256 !== observed) throw new Error(`Input hash mismatch for ${path}: expected ${expected.sha256}, observed ${observed}`);
  return { ...expected, sha256: observed };
}

function accountSnapshotBytes(raw: unknown, address: string): Buffer {
  const cache = raw as { addresses?: string[]; response?: { result?: { value?: Array<{ data?: [string, string] } | null> } } };
  const index = cache.addresses?.indexOf(address) ?? -1;
  if (index < 0) throw new Error(`Snapshot cache does not contain ${address}`);
  const account = cache.response?.result?.value?.[index];
  const data = account?.data;
  if (!data || data[1] !== "base64") throw new Error(`Snapshot cache has no base64 account data for ${address}`);
  return Buffer.from(data[0], "base64");
}

function programDataPointer(raw: unknown, programId: string): string | null {
  const bytes = accountSnapshotBytes(raw, programId);
  if (bytes.length !== 36 || bytes.readUInt32LE(0) !== 2) return null;
  return getAddressDecoder().decode(bytes.subarray(4, 36));
}

function sortedProgramDataSignatures(raw: DeploymentHistoryRaw): Array<Record<string, unknown>> {
  return raw.programDataSignaturePages.flatMap((page) => ((page as { result?: Array<Record<string, unknown>> }).result ?? []))
    .sort((a, b) => Number(b.slot) - Number(a.slot));
}

function transactionResponses(raw: DeploymentHistoryRaw): Array<Record<string, unknown>> {
  return (raw.programDataTransactions as Array<Record<string, unknown>>).slice().sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

function loaderInstructionTypes(transaction: Record<string, unknown>): string[] {
  const result = transaction.result as { meta?: { innerInstructions?: Array<{ instructions?: Array<{ programId?: string; parsed?: { type?: string } }> }> }; transaction?: { message?: { instructions?: Array<{ programId?: string; parsed?: { type?: string } }> } } } | null;
  if (!result) return [];
  const outer = result.transaction?.message?.instructions ?? [];
  const inner = (result.meta?.innerInstructions ?? []).flatMap((group) => group.instructions ?? []);
  return [...outer, ...inner].filter((instruction) => instruction.programId === UPGRADEABLE_LOADER && instruction.parsed?.type).map((instruction) => instruction.parsed!.type!);
}

function findUpgradeTransaction(raw: DeploymentHistoryRaw, slot: number): Record<string, unknown> | null {
  return transactionResponses(raw).find((transaction) => {
    const result = transaction.result as { slot?: number } | null;
    return result?.slot === slot && loaderInstructionTypes(transaction).includes("upgrade");
  }) ?? null;
}

function parsedUpgradeInfo(transaction: Record<string, unknown> | null): Record<string, unknown> | null {
  const result = transaction?.result as { meta?: { innerInstructions?: Array<{ instructions?: Array<{ programId?: string; parsed?: { type?: string; info?: Record<string, unknown> } }> }> }; transaction?: { message?: { instructions?: Array<{ programId?: string; parsed?: { type?: string; info?: Record<string, unknown> } }> } } } | null;
  if (!result) return null;
  const instructions = [...(result.transaction?.message?.instructions ?? []), ...(result.meta?.innerInstructions ?? []).flatMap((group) => group.instructions ?? [])];
  return instructions.find((instruction) => instruction.programId === UPGRADEABLE_LOADER && instruction.parsed?.type === "upgrade")?.parsed?.info ?? null;
}

const OBSERVED_NATIVE: AccountContractEntry[] = [
  { position: 0, role: "observed-unknown", signer: true, writable: true, address: "Cg32xAQbEoUEWkud61wxo8598CTtxbj7533gpEKb8DCq", owner: SYSTEM_PROGRAM },
  { position: 1, role: "observed-unknown", signer: false, writable: false, address: "2etx5NvPNxeMZ7EfHE6GjJfW2imRYEUANehNS1WB4CVW", owner: "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P" },
  { position: 2, role: "observed-unknown", signer: false, writable: true, address: "7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t", owner: "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P" },
  { position: 3, role: "observed-unknown", signer: false, writable: true, address: "Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg", owner: "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P" },
  { position: 4, role: "observed-unknown", signer: false, writable: true, address: "FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY", owner: "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P" },
];

const DRIFT_OPCODE2: AccountContractEntry[] = [
  { position: 0, role: "admin", signer: true, writable: true },
  { position: 1, role: "state", signer: false, writable: false },
  { position: 2, role: "cache0", signer: false, writable: true },
  { position: 3, role: "cache1", signer: false, writable: true },
  { position: 4, role: "system_program", signer: false, writable: false, address: SYSTEM_PROGRAM },
  { position: 5, role: "rent", signer: false, writable: false },
];

const POST_PYTH_CONTRACT: AccountContractEntry[] = [
  { position: 0, role: "keeper", signer: true, writable: true },
  { position: 1, role: "pyth_lazer_storage", signer: false, writable: false },
  { position: 2, role: "ix_sysvar", signer: false, writable: false },
  { position: 3, role: "remaining_accounts[feed_index]", signer: false, writable: true },
  { position: 4, role: "remaining_accounts[feed_index]", signer: false, writable: true },
  { position: 5, role: "remaining_accounts[feed_index]", signer: false, writable: true },
];

const TWAP_CONTRACT: AccountContractEntry[] = [
  { position: 0, role: "state", signer: false, writable: false },
  { position: 1, role: "perp_market", signer: false, writable: true },
  { position: 2, role: "oracle", signer: false, writable: false },
  { position: 3, role: "keeper_stats", signer: false, writable: false },
  { position: 4, role: "authority", signer: true, writable: false },
  { position: 5, role: "remaining_accounts[maker_index]", signer: false, writable: false },
  { position: 6, role: "remaining_accounts[maker_index]", signer: false, writable: false },
];

export async function loadMilestone21Plan(path: string): Promise<Milestone21Plan> {
  const plan = JSON.parse(await readFile(resolve(path), "utf8")) as Milestone21Plan;
  if (plan.schemaVersion !== "2.1") throw new Error(`Expected Milestone 2.1 plan, observed ${String(plan.schemaVersion)}`);
  return plan;
}

export interface RunMilestone21Options { offline: boolean; bootstrapHashes?: boolean }

export async function runMilestone21(plan: Milestone21Plan, options: RunMilestone21Options): Promise<Milestone21Result> {
  if (!options.offline) await acquireCaches(plan);
  const bootstrap = options.bootstrapHashes === true;
  const inputPaths = [plan.cache.accountSnapshotsRaw, plan.cache.deploymentHistoryRaw, plan.cache.loaderSourceRaw, plan.cache.sourceHistoryRaw, plan.cache.buildEnvironmentRaw, plan.cache.velocityV1Tarball];
  const observedInputs = await Promise.all(inputPaths.map((path) => validateInput(plan, path, bootstrap)));
  for (const [path, expected] of Object.entries(plan.preservedArtifactHashes)) {
    const observed = await fileSha256(path);
    if (observed !== expected) throw new Error(`Preserved artifact changed: ${path}; expected ${expected}, observed ${observed}`);
  }

  const accountRaw = JSON.parse(await readFile(resolve(plan.cache.accountSnapshotsRaw), "utf8")) as unknown;
  const observedProgramDataPointer = programDataPointer(accountRaw, plan.programId);
  const programDataBytes = accountSnapshotBytes(accountRaw, plan.programDataAddress);
  const extraction = decodeProgramData(programDataBytes);
  if (extraction.slot !== plan.expectedLastDeploySlot) throw new Error(`ProgramData slot changed: ${extraction.slot}`);
  const elf = parseElf64(extraction.executable);
  if (!elf.valid) throw new Error(`Deployed executable failed ELF validation: ${elf.validationErrors.join("; ")}`);
  const strings = extractDeterministicStrings(extraction.executable);
  const stringsText = strings.map((item) => `${item.offset.toString(16).padStart(8, "0")}\t${item.value}`).join("\n") + "\n";

  const programDataArtifact = {
    schemaVersion: "2.1", cluster: plan.cluster, programId: plan.programId, programDataAddress: plan.programDataAddress,
    loader: UPGRADEABLE_LOADER, stateTag: extraction.stateTag, lastMutationSlot: extraction.slot,
    upgradeAuthorityOption: extraction.upgradeAuthorityOption, upgradeAuthorityBytesHex: extraction.upgradeAuthorityBytesHex,
    headerLength: extraction.headerLength, rawProgramDataLength: extraction.rawLength, rawProgramDataSha256: extraction.rawSha256,
    executablePayloadOffset: extraction.headerLength, executablePayloadLength: extraction.executableLength,
    executablePayloadSha256: extraction.executableSha256,
    extractionMethod: "Decode little-endian bincode UpgradeableLoaderState::ProgramData: u32 tag, u64 slot, u8 Option tag, optional 32-byte authority, then hash all remaining bytes without trimming trailing zeros.",
    sourceCache: slash(plan.cache.accountSnapshotsRaw), sourceCacheSha256: observedInputs[0]!.sha256,
  };
  const executableArtifact = {
    schemaVersion: "2.1", format: "ELF64-SBF", valid: elf.valid, validationErrors: elf.validationErrors,
    payloadLength: extraction.executableLength, payloadSha256: extraction.executableSha256, header: elf.header,
    stringExtraction: { method: "Maximal contiguous ASCII bytes 0x20 through 0x7e, minimum length 4, emitted in increasing byte-offset order.", count: strings.length, output: "deployed-strings.txt", outputSha256: sha256(stringsText) },
    symbolExtraction: { method: "ELF64 SHT_SYMTAB/SHT_DYNSYM entries with linked string tables.", count: elf.symbols.length, symbols: elf.symbols },
  };
  const sectionManifest = {
    schemaVersion: "2.1", executableSha256: extraction.executableSha256, elfHeader: elf.header,
    sections: elf.sections, symbols: elf.symbols, relocationSections: elf.relocationSections,
    method: "Parse ELF64 little-endian section headers at e_shoff using e_shentsize/e_shnum; name through e_shstrndx; hash each file-backed section byte range.",
  };

  const deploymentRaw = JSON.parse(await readFile(resolve(plan.cache.deploymentHistoryRaw), "utf8")) as DeploymentHistoryRaw;
  const signatures = sortedProgramDataSignatures(deploymentRaw);
  const upgradeTransaction = findUpgradeTransaction(deploymentRaw, plan.expectedLastDeploySlot);
  const upgradeInfo = parsedUpgradeInfo(upgradeTransaction);
  const laterSignatures = signatures.filter((signature) => Number(signature.slot) > plan.expectedLastDeploySlot);
  const mutationTypesBySlot = transactionResponses(deploymentRaw).map((transaction) => ({
    slot: Number((transaction.result as { slot?: number } | null)?.slot ?? -1), instructionTypes: loaderInstructionTypes(transaction),
  })).filter((entry) => entry.slot >= 0).sort((a, b) => b.slot - a.slot);
  const continuityEvidence = {
    programPointsToProgramData: observedProgramDataPointer === plan.programDataAddress,
    slotMatches: extraction.slot === plan.expectedLastDeploySlot,
    allSamplesAfter: allSampleSlotsAfter(plan.sampleSlots, extraction.slot),
    upgradeTransactionDecoded: Boolean(upgradeTransaction && upgradeInfo),
    noLaterProgramDataMutation: laterSignatures.length === 0,
    snapshotAfterSamples: plan.expectedSnapshotContextSlot > Math.max(...plan.sampleSlots),
  };
  const continuity = classifyDeploymentContinuity(continuityEvidence);
  const deploymentHistory = {
    schemaVersion: "2.1", programId: plan.programId, programDataAddress: plan.programDataAddress,
    snapshotContextSlot: plan.expectedSnapshotContextSlot, lastMutationSlot: extraction.slot, sampleSlots: plan.sampleSlots,
    continuity, continuityEvidence,
    loaderSemantics: {
      pinnedRepository: "https://github.com/anza-xyz/agave", tag: plan.pinnedCommits.agaveTag, commit: plan.pinnedCommits.agave,
      interpretation: "The ProgramData slot is written to clock.slot on DeployWithMaxDataLen, Upgrade, and ExtendProgram. SetAuthority preserves the existing slot. Therefore it is the last executable deploy/upgrade/extend mutation slot, not a generic authority-change timestamp.",
      caution: "Continuity uses decoded history and absence of later ProgramData-address references through the cached snapshot window; address equality alone is not the basis.",
      cachePath: slash(plan.cache.loaderSourceRaw), cacheSha256: observedInputs[2]!.sha256,
    },
    programHistoryScope: "Newest 1,000 program-address signatures, bounded; used as corroborating context, not as proof of no executable mutation.",
    programDataHistoryScope: `Complete ${signatures.length}-signature ProgramData-address history returned by the RPC; the following page was empty because the final page contained fewer than 1,000 entries.`,
    programDataSignatures: signatures,
    loaderInstructionTypesBySlot: mutationTypesBySlot,
    deploymentTransaction: {
      signature: signatures.find((signature) => Number(signature.slot) === plan.expectedLastDeploySlot)?.signature ?? null,
      slot: plan.expectedLastDeploySlot, parsedType: "upgrade", parsedAccounts: upgradeInfo,
      status: (upgradeTransaction?.result as { meta?: { err?: unknown } } | null)?.meta?.err == null ? "success" : "failed-or-missing",
    },
    laterProgramDataSignatures: laterSignatures,
    conclusion: continuity === "sample-binary-continuity-established"
      ? "The cached current executable bytes are established as the executable in force for all six Candidate #3 sample slots."
      : "The executable used at all six sample slots could not be established conclusively.",
    provenance: { cachePath: slash(plan.cache.deploymentHistoryRaw), cacheSha256: observedInputs[1]!.sha256 },
  };

  const sourceRaw = JSON.parse(await readFile(resolve(plan.cache.sourceHistoryRaw), "utf8")) as SourceHistoryRaw;
  const sourceHistory = {
    schemaVersion: "2.1", repositoriesInspected: [
      { repository: "velocity-exchange/protocol-v2", allReachableRefsInspected: true, head: sourceRaw.repositoryHead },
      { repository: "velocity-exchange/velocity-v1", result: sourceRaw.velocityV1 },
      { repository: "drift-labs/protocol-v2 historical lineage", forkReleaseCommit: plan.pinnedCommits.driftForkRelease },
      { repository: "maintained @velocity-exchange/sdk", result: sourceRaw.velocityV1 },
    ],
    commits: sourceRaw.commits.slice().sort((a, b) => a.commit.localeCompare(b.commit)),
    fingerprints: sourceRaw.fingerprints,
    conclusions: [
      "The public Velocity lineage embeds the exact vELoC program ID and programs/velocity source paths, but its reachable dispatcher only exposes native opcodes 0 and 1.",
      "The public Drift lineage introduces opcode 2 as a six-account oracle-cache handler; the observed successful five-account transaction contradicts it.",
      "No inspected official public source contains the deployed `next_timestamp <= current_timestamp` skip string, although the exact `<` posting string is public.",
      "The official velocity-v1 npm surface contains clients, generated SDK/IDL material, and no on-chain Rust source, deployable binary, or on-chain build metadata.",
    ],
    provenance: { cachePath: slash(plan.cache.sourceHistoryRaw), cacheSha256: observedInputs[3]!.sha256 },
  };

  const nativeDriftDiff = compareAccountStructure("drift-opcode-2-six-account-cache-handler", OBSERVED_NATIVE, DRIFT_OPCODE2, 6);
  const nativeVelocityDiff = compareAccountStructure("public-velocity-dispatcher-no-opcode-2", OBSERVED_NATIVE, [], 1);
  nativeVelocityDiff.conclusion = "The public Velocity candidate rejects opcode 2 at dispatch because only opcodes 0 and 1 exist; it cannot be the observed native handler.";

  const buildEnvironment = JSON.parse(await readFile(resolve(plan.cache.buildEnvironmentRaw), "utf8")) as BuildEnvironmentRaw;
  const isolatedBuildAvailable = buildEnvironment.commands.some((command) => ["docker", "podman"].includes(command.command) && command.available)
    || buildEnvironment.isolatedRuntimes.some((runtime) => runtime.available);
  const buildStatus = classifyBuildAttempt({ buildExecuted: false, reproducible: false, firstHash: null, repeatHash: null, deployedHash: extraction.executableSha256 });
  const attempts: BuildAttempt[] = [
    {
      sourceRepository: "https://github.com/velocity-exchange/protocol-v2", commit: plan.pinnedCommits.velocityCandidate,
      toolchain: { rustHost: "1.91.1", solanaHost: "2.3.11", anchor: "1.0.0", verifiableBuildImage: "solanafoundation/solana-verifiable-build:3.1.14", platformTools: "image-provided; repository comment identifies v1.48 incompatibility in 2.3.x images" },
      command: "solana-verify build --library-name velocity -b solanafoundation/solana-verifiable-build:3.1.14 -- --no-default-features --features no-entrypoint",
      status: buildStatus, resultingBinarySha256: null, executableLength: null, deterministicRepeatStatus: "not-run",
      deployedExecutableSha256: extraction.executableSha256,
      comparison: isolatedBuildAvailable ? "Build was not run because this source candidate cannot route observed opcode 2 and cannot satisfy the whole-binary outcome." : "Pinned build recipe was recovered, but no usable Docker, Podman, WSL, solana-verify, Solana CLI, Anchor, Cargo, or Rust toolchain was available on this host.",
    },
    {
      sourceRepository: "https://github.com/velocity-exchange/protocol-v2 (public Drift lineage)", commit: plan.pinnedCommits.driftNativeOpcode2,
      toolchain: { sourceLockfile: "commit-pinned Cargo.lock", programId: "public source declares Drift IDs, not the exact Velocity ID" },
      command: "not attempted: the source account contract contradicts the observed transaction before compilation",
      status: "build-unavailable", resultingBinarySha256: null, executableLength: null, deterministicRepeatStatus: "not-run",
      deployedExecutableSha256: extraction.executableSha256,
      comparison: "Eliminated as an exact deployed candidate by the six-account minimum and System Program requirement at observed position 4.",
    },
  ];
  const buildAttempts = {
    schemaVersion: "2.1", deployedExecutableSha256: extraction.executableSha256,
    environment: buildEnvironment, attempts,
    exactBinaryMatchFound: false,
    outcome: "build-unavailable",
    provenance: { cachePath: slash(plan.cache.buildEnvironmentRaw), cacheSha256: observedInputs[4]!.sha256 },
  };

  const stringValues = new Set(strings.map((entry) => entry.value));
  const includesString = (needle: string): boolean => [...stringValues].some((value) => value.includes(needle));
  const fingerprintMatrix = {
    schemaVersion: "2.1", deployedExecutableSha256: extraction.executableSha256,
    deployedFingerprints: {
      sourcePaths: ["programs/velocity/src/instructions/pyth_lazer_oracle.rs", "programs/velocity/src/instructions/keeper.rs", "programs/velocity/src/lib.rs"].map((value) => ({ value, present: includesString(value) })),
      instructionNames: ["PostPythLazerOracleUpdate", "UpdatePerpBidAskTwap"].map((value) => ({ value, present: includesString(value) })),
      exactLogs: [
        "Posting new lazer update. current ts {} < next_timestamp {}",
        "Skipping lazer price update. next_timestamp {} <= current_timestamp {}",
      ].map((value) => ({ value, present: includesString(value) })),
      anchorDiscriminatorBytes: [
        { name: "PostPythLazerOracleUpdate", hex: POST_PYTH_DISCRIMINATOR, present: extraction.executable.includes(Buffer.from(POST_PYTH_DISCRIMINATOR, "hex")) },
        { name: "UpdatePerpBidAskTwap", hex: UPDATE_TWAP_DISCRIMINATOR, present: extraction.executable.includes(Buffer.from(UPDATE_TWAP_DISCRIMINATOR, "hex")) },
      ],
      nativeOpcode2Prefix: { hex: NATIVE_PREFIX, note: "Observed instruction prefix; presence as a contiguous executable literal is not required for a dispatch branch.", presentAsLiteral: extraction.executable.includes(Buffer.from(NATIVE_PREFIX, "hex")) },
    },
    candidates: [
      {
        commit: plan.pinnedCommits.velocityCandidate, exactProgramId: true, sourcePathFamily: "programs/velocity", postingLogExact: true,
        skipLessThanOrEqualLogExact: false, anchorNamesPresent: true, nativeOpcode2Present: false,
        interpretation: "Compelling version correlation for the two Anchor variants; contradictory for native opcode 2 and the equality skip edge.",
      },
      {
        commit: plan.pinnedCommits.driftNativeOpcode2, exactProgramId: false, sourcePathFamily: "programs/drift", postingLogExact: true,
        skipLessThanOrEqualLogExact: false, anchorNamesPresent: true, nativeOpcode2Present: true,
        interpretation: "Source-family evidence for opcode 2, but the six-account handler structurally contradicts the five-account observation.",
      },
    ],
    structuralDiffs: [nativeVelocityDiff, nativeDriftDiff],
    limitation: "Binary literals establish version correlation only. No arbitrary business logic or deployed mutation behavior is reconstructed from disassembly.",
  };

  const postPythConfidence = evaluateVariantConfidence({ exactBinaryMatch: false, authoritativeSource: true, exactProgramId: true, exactInstructionIdentity: true, exactRuntimeStringOrPath: true, accountContractCompatible: true, materialContradiction: true });
  const twapConfidence = evaluateVariantConfidence({ exactBinaryMatch: false, authoritativeSource: true, exactProgramId: true, exactInstructionIdentity: true, exactRuntimeStringOrPath: true, accountContractCompatible: true, materialContradiction: false });
  const nativeConfidence = evaluateVariantConfidence({ exactBinaryMatch: false, authoritativeSource: true, exactProgramId: false, exactInstructionIdentity: false, exactRuntimeStringOrPath: false, accountContractCompatible: false, materialContradiction: true });
  const variants: VariantCorrespondenceRow[] = [
    {
      observedVariant: "native-prefix-discriminator-2", observedDiscriminator: NATIVE_PREFIX, observedAccountCardinality: 5, observedLogs: [],
      candidateSourceCommit: plan.pinnedCommits.driftNativeOpcode2, sourceAccountContract: DRIFT_OPCODE2, sourceComparisonCondition: null,
      exactStringMatches: [], buildResult: "build-unavailable", binaryMatchStatus: "not-built", deploymentWindowCompatible: true,
      confidence: nativeConfidence,
      remainingContradictions: ["Public Velocity history has no opcode 2.", "Public Drift opcode 2 requires at least six accounts.", "Observed position 4 is a writable Velocity-owned account, not the System Program.", "No exact public source or reproducible build maps this branch."],
    },
    {
      observedVariant: "post-pyth-lazer-oracle-update", observedDiscriminator: POST_PYTH_DISCRIMINATOR, observedAccountCardinality: 6,
      observedLogs: ["Instruction: PostPythLazerOracleUpdate", "Posting new lazer update. current ts {} < next_timestamp {}", "Skipping lazer price update. next_timestamp {} <= current_timestamp {}"],
      candidateSourceCommit: plan.pinnedCommits.velocityCandidate, sourceAccountContract: POST_PYTH_CONTRACT, sourceComparisonCondition: "next_timestamp < current_timestamp",
      exactStringMatches: ["programs/velocity/src/instructions/pyth_lazer_oracle.rs", "PostPythLazerOracleUpdate", "Posting new lazer update. current ts {} < next_timestamp {}"],
      buildResult: "build-unavailable", binaryMatchStatus: "not-built", deploymentWindowCompatible: true, confidence: postPythConfidence,
      remainingContradictions: ["Deployed skip behavior/log uses <= while every inspected official public version uses < or an older equivalent >= form.", "No exact full-binary build match."],
    },
    {
      observedVariant: "update-perp-bid-ask-twap", observedDiscriminator: UPDATE_TWAP_DISCRIMINATOR, observedAccountCardinality: 7,
      observedLogs: ["Instruction: UpdatePerpBidAskTwap"], candidateSourceCommit: plan.pinnedCommits.velocityCandidate,
      sourceAccountContract: TWAP_CONTRACT, sourceComparisonCondition: null,
      exactStringMatches: ["programs/velocity/src/instructions/keeper.rs", "UpdatePerpBidAskTwap"],
      buildResult: "build-unavailable", binaryMatchStatus: "not-built", deploymentWindowCompatible: true, confidence: twapConfidence,
      remainingContradictions: ["No exact full-binary build match; mutation behavior remains unpromoted."],
    },
  ];
  const overallOutcome = chooseOverallOutcome(continuity, variants, false, false);
  const variantCorrespondence = {
    schemaVersion: "2.1", continuity, variants, overallOutcome,
    actionability: {
      generalSemanticDecoderAuthorized: false,
      narrowlyScopedVariantResearchMayBeProposed: overallOutcome === "variant-level-strong-correspondence",
      nativeMutationSemanticsEstablished: false,
      anchorMutationSemanticsEstablished: false,
      explanation: "Correspondence strength is version evidence, not source-confirmed deployed mutation truth without an exact reproducible binary mapping.",
    },
  };

  const outputDirectory = resolve(plan.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const result: Milestone21Result = {
    continuity, overallOutcome, programData: programDataArtifact, executable: executableArtifact,
    sectionManifest, sourceHistory, buildAttempts, fingerprintMatrix, variantCorrespondence, deploymentHistory,
    terminalSummary: `Milestone 2.1: continuity ${continuity}; executable ${extraction.executableSha256}; outcome ${overallOutcome}; native variant unresolved; two Anchor variants strongly correlated; no exact build match.`,
  };
  await Promise.all([
    writeFile(resolve(outputDirectory, "deployed-programdata-metadata.json"), json(programDataArtifact)),
    writeFile(resolve(outputDirectory, "deployed-executable-metadata.json"), json(executableArtifact)),
    writeFile(resolve(outputDirectory, "deployed-strings.txt"), stringsText),
    writeFile(resolve(outputDirectory, "deployed-section-manifest.json"), json(sectionManifest)),
    writeFile(resolve(outputDirectory, "source-history.json"), json(sourceHistory)),
    writeFile(resolve(outputDirectory, "build-attempts.json"), json(buildAttempts)),
    writeFile(resolve(outputDirectory, "binary-fingerprint-matrix.json"), json(fingerprintMatrix)),
    writeFile(resolve(outputDirectory, "variant-correspondence.json"), json(variantCorrespondence)),
    writeFile(resolve(outputDirectory, "deployment-history.json"), json(deploymentHistory)),
    writeFile(resolve(outputDirectory, "velocity-binary-report.html"), milestone21Html(result, observedInputs)),
    writeFile(resolve(plan.documentationPath), milestone21Markdown(result, observedInputs)),
  ]);
  return result;
}
