import { prepareNativeBundleFixture } from "../src/native-bundle-fixture.js";
const args = process.argv.slice(2);
if (args.length !== 0 && !(args.length === 2 && args[0] === "--output" && args[1])) throw new Error("Usage: prepare-native-bundle [--output NEW_FILE_INSIDE_WORKSPACE]; existing fixtures are never overwritten and an existing ELF must match its pin.");
const result = await prepareNativeBundleFixture(args[1] ? { outputPath: args[1] } : {});
console.log(`Prepared ${result.fixture.scenarios.length} constructed scenarios; source pins verified; no execution performed.\n${result.outputPath}\nSHA-256 ${result.sha256}\nVerified ELF ${result.elf.status}: ${result.elf.path}`);
