#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateMilestone30Handoff } from "../src/handoff.js";

const rootPath = resolve(process.argv[2] ?? "HANDOFF.md");
const versionedPath = resolve(process.argv[3] ?? "docs/handoffs/MILESTONE-3.0.md");
const [root, versioned] = await Promise.all([readFile(rootPath, "utf8"), readFile(versionedPath, "utf8")]);
const errors = validateMilestone30Handoff(root, versioned);
if (errors.length) { errors.forEach((error) => console.error(error)); process.exitCode = 1; }
else console.log("Milestone 3.0 handoff validation passed: root and versioned snapshots are byte-identical and current.");
