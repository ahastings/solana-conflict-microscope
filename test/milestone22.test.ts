import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MILESTONE_22_HEADER, MILESTONE_22_STOP, validateMilestone22Handoff } from "../src/handoff.js";
import { analyzeTimestampConditions, chooseMilestone22Outcome, decodePythLazerMessage, loadMilestone22Plan, runMilestone22 } from "../src/milestone22.js";

const PLAN_PATH = "research-plans/velocity-anchor-bundle-milestone-2.2.json";
const fileHash = async (path: string): Promise<string> => createHash("sha256").update(await readFile(path)).digest("hex");
const planPromise = loadMilestone22Plan(PLAN_PATH);
const resultPromise = planPromise.then((plan) => runMilestone22(plan, { offline: true }));

test("Milestone 2.2 handoff validator rejects stale identifiers and mismatched snapshots", () => {
  const valid = `${MILESTONE_22_HEADER}\nVelocity Anchor Bundle Semantics and Repeated-Update Proof on base 7d3399d.\nOutcome repeated-update-structure-established-semantics-incomplete; native-prefix-discriminator-2 remains unresolved.\n${MILESTONE_22_STOP}\n`;
  assert.deepEqual(validateMilestone22Handoff(valid, valid), []);
  assert.ok(validateMilestone22Handoff(valid, valid + "changed").some((error) => /byte-identical/.test(error)));
  assert.ok(validateMilestone22Handoff(valid.replace(MILESTONE_22_HEADER, "# Milestone 2.1 handoff"), valid).some((error) => /begin exactly|stale/.test(error)));
  assert.ok(validateMilestone22Handoff(valid.replace(MILESTONE_22_STOP, "Stop after Milestone 2.1."), valid).some((error) => /end with|stale/.test(error)));
});

test("classifies exactly three Anchor paths plus one excluded native path in all six blocks", async () => {
  const result = await resultPromise;
  assert.equal(result.dossier.bundles.length, 6);
  for (const bundle of result.dossier.bundles) {
    assert.deepEqual(bundle.anchors.map((item) => item.role).sort(), ["anchor-A", "anchor-B", "anchor-C"]);
    assert.equal(bundle.native.semanticScope, "excluded-unresolved");
  }
});

test("preserves the six exact slot/component topology references", async () => {
  const result = await resultPromise;
  assert.deepEqual(result.dossier.bundles.map((item) => [item.slot, item.componentId]), [[489572998,1],[489593012,17],[489602971,14],[489603031,16],[489612991,11],[489613051,17]]);
  assert.ok(result.dossier.bundles.every((item) => item.topologyRepeats));
});

test("maps one signed message to exactly three Anchor transactions per block", async () => {
  const result = await resultPromise;
  assert.equal(result.messageReuse.distinctMessageCount, 6);
  assert.equal(result.messageReuse.anyCrossBlockReuse, false);
  assert.equal(new Set(result.messageReuse.blocks.map((item) => item.messageSha256)).size, 6);
  assert.ok(result.messageReuse.blocks.every((item) => item.occurrenceCount === 3 && item.allMessageBytesIdentical));
});

test("preserves signer/message/reference mapping without cross-fee-payer overclaim", async () => {
  const result = await resultPromise;
  assert.equal(result.messageReuse.signerPublicKey, "9gKEEcFzSd1PDYBKWAKZi4Sq4ZCUaVX5oTr8kEjdwsfR");
  for (const block of result.messageReuse.blocks) {
    assert.equal(block.sameSigner, true);
    assert.equal(block.identicalOffsetReferenceStructure, true);
    assert.equal(block.transactionSignaturesDiffer, true);
    assert.equal(block.feePayersDiffer, false);
    assert.equal(block.crossFeePayerReuse, "not-observed");
  }
});

test("distinguishes byte-identical Post updates from account-wrapper-different TWAP paths", async () => {
  const result = await resultPromise;
  for (const block of result.instructionEquivalence.blocks) {
    assert.equal(block.classification, "byte-identical-update");
    assert.equal(new Set(block.postPythPayloadHashes).size, 1);
    assert.equal(new Set(block.postPythAccountListHashes).size, 1);
    assert.equal(new Set(block.updateTwapPayloadHashes).size, 1);
    assert.equal(block.updateTwapWrappersDifferByAccounts, true);
  }
});

test("decodes the complete Pyth Lazer signed-message structure deterministically", async () => {
  const result = await resultPromise;
  for (const bundle of result.dossier.bundles) {
    const message = bundle.decodedMessage;
    assert.equal(message.formatMagic, 2479346549);
    assert.equal(message.byteLength, 149);
    assert.equal(message.bytesConsumed, 149);
    assert.equal(message.completeRoundTripBoundary, true);
    assert.equal(message.channelId, 3);
    assert.equal(message.channelName, "fixed-rate-200ms");
    assert.deepEqual(message.feeds.map((item) => item.feedId), [6, 1, 2]);
    assert.ok(message.feeds.every((feed) => feed.properties.map((item) => item.name).join(",") === "Price,BestAskPrice,BestBidPrice,Exponent,FeedUpdateTimestamp"));
    assert.ok(message.feeds.every((feed) => !feed.properties.some((item) => item.name === "Confidence")));
  }
});

test("derives exact feed-ID-to-oracle-PDA mappings", async () => {
  const result = await resultPromise;
  const feeds = result.dossier.bundles[0]!.decodedMessage.feeds;
  assert.deepEqual(feeds.map((item) => [item.feedId, item.oraclePda, item.oracleBump, item.oracleInstructionPosition]), [
    [6, "2k3UHX6ehRFzx5fTVvbL6FwXhMjkucjJDL9MuVKLo8TV", 255, 3],
    [1, "J7Fp8iTKuKdCM7PnzqHXTdTo5Jr7ykAmiDyvpz58GJGZ", 254, 4],
    [2, "6wQ5RiQ7usJ3TqYZSiuAPZHrVCeSWNrvace84khDKEmH", 255, 5],
  ]);
  const replay = await decodePythLazerMessage(Buffer.from(result.dossier.bundles[0]!.decodedMessage.rawHex, "hex"));
  assert.deepEqual(replay, result.dossier.bundles[0]!.decodedMessage);
});

test("preserves exact ordered relevant logs and branch counts", async () => {
  const result = await resultPromise;
  assert.deepEqual(result.logBranches.totals, { postingLogs: 18, skippingLogs: 36, updateTwapInstructionLogs: 18, failuresOrEarlyReturns: 0 });
  assert.equal(result.logBranches.wordingNormalized, false);
  assert.ok(result.logBranches.blocks.every((block) => block.transactionOrder[0]!.branch === "posting" && block.transactionOrder[1]!.branch === "skipping" && block.transactionOrder[2]!.branch === "skipping"));
  assert.ok(result.logBranches.blocks.flatMap((block) => block.transactionOrder).every((row) => row.relevantLogs.some((line) => line === "Program log: Instruction: UpdatePerpBidAskTwap")));
});

test("handles deployed complementary predicates separately from the public equality mismatch", () => {
  const analysis = analyzeTimestampConditions();
  assert.equal(analysis.deployedPredicatesComplementary, true);
  assert.equal(analysis.publicAndDeployedDifferAtEquality, true);
  assert.equal(analysis.semanticMismatchEstablished, false);
  assert.equal(analysis.deployedPositivePredicate, "current_timestamp < next_timestamp");
});

test("attributes each Anchor-only clique to twelve exact atoms and 3-3 wave bounds", async () => {
  const result = await resultPromise;
  for (const block of result.conflictAttribution.blocks) {
    assert.equal(block.edgeCount, 3);
    assert.equal(block.pairEdges.length, 3);
    assert.equal(block.atomCount, 12);
    assert.equal(block.conflictAtoms.length, 12);
    assert.equal(block.conflictAtoms.filter((item) => item.cause === "shared-oracle").length, 9);
    assert.equal(block.conflictAtoms.filter((item) => item.cause === "fee-payer").length, 3);
    assert.equal(block.waveLowerBound, 3);
    assert.equal(block.waveUpperBound, 3);
    assert.equal(block.commonOracleSetAlonePreservesClique, true);
    assert.equal(block.feePayerIndependentlyPreservesClique, true);
  }
});

test("separates the unresolved native path while preserving its three market atoms", async () => {
  const result = await resultPromise;
  for (const block of result.conflictAttribution.blocks) {
    assert.equal(block.nativeContext.semanticStatus, "unresolved-excluded");
    assert.equal(block.nativeContext.atomCount, 3);
    assert.equal(block.nativeContext.conflicts.length, 3);
    assert.ok(block.nativeContext.conflicts.every((item) => item.accounts.length === 1));
  }
  assert.equal(result.binaryCorrespondence.nativeVariant.correspondence, "unresolved");
});

test("retains both Anchor variants at Level 4 and below deployed mutation truth", async () => {
  const result = await resultPromise;
  assert.ok(result.binaryCorrespondence.variants.every((item) => item.correspondence === "strong-deployed-fingerprint" && item.evidenceLevel === 4 && !item.level5Reached));
  assert.ok(result.semanticEvidence.variants.every((item) => item.highestLevel === 4 && !item.level5Reached && item.deployedMutationConclusion === "incomplete"));
  assert.equal(result.binaryCorrespondence.deployedSkipInvestigation.occurrenceCount, 1);
  assert.equal(result.binaryCorrespondence.deployedSkipInvestigation.boundedCodeReferenceEstablished, false);
});

test("selects all three terminal outcomes from their exact gates", () => {
  assert.equal(chooseMilestone22Outcome({ structureEstablished: true, bothVariantsSufficient: true, relevantStateTransitionsEstablished: true }), "anchor-variant-semantics-established");
  assert.equal(chooseMilestone22Outcome({ structureEstablished: true, bothVariantsSufficient: false, relevantStateTransitionsEstablished: false }), "repeated-update-structure-established-semantics-incomplete");
  assert.equal(chooseMilestone22Outcome({ structureEstablished: false, bothVariantsSufficient: false, relevantStateTransitionsEstablished: false }), "no-additional-semantic-bridge");
});

test("requires cache-only replay and produces the conservative successful outcome", async () => {
  const plan = await planPromise;
  await assert.rejects(() => runMilestone22(plan, { offline: false }), /cache-only/);
  const result = await resultPromise;
  assert.equal(result.outcome, "repeated-update-structure-established-semantics-incomplete");
  assert.equal(plan.offlineReplay.networkRequestsWhenOffline, 0);
});

test("preserves all protected Milestone 2.1 and legacy artifacts", async () => {
  const plan = await planPromise;
  await resultPromise;
  for (const [path, expected] of Object.entries(plan.preservedArtifactHashes)) assert.equal(await fileHash(path), expected, path);
});

test("preserves discovery and sourceability ordering plus Candidate #1/#2 dispositions", async () => {
  await resultPromise;
  const sourceability = JSON.parse(await readFile("output/research/sourceability/sourceability-index.json", "utf8")) as { discoveryRankPreserved: boolean; candidates: Array<{ candidateId: string; discoveryRank: number; disposition: string }> };
  assert.equal(sourceability.discoveryRankPreserved, true);
  assert.equal(sourceability.candidates.find((item) => item.candidateId === "candidate-ff30780de8479976")?.disposition, "preserved-prior-dossier");
  assert.equal(sourceability.candidates.find((item) => item.candidateId === "candidate-e5d929864077a76b")?.disposition, "deferred-not-rejected");
  assert.equal(sourceability.candidates.find((item) => item.candidateId === "candidate-043c938568ad5e15")?.discoveryRank, 3);
  const candidateOne = JSON.parse(await readFile("output/research/candidate-ff30780de8479976/candidate-dossier.json", "utf8")) as { decision: string };
  assert.equal(candidateOne.decision, "black-box-structure-only");
  const discovery = JSON.parse(await readFile("output/discovery-devnet/discovery-index.json", "utf8")) as { coverage: { requested: number; observed: number }; candidates: unknown[] };
  assert.equal(discovery.coverage.requested, 500);
  assert.equal(discovery.coverage.observed, 500);
});

test("contains no mutation, scheduling, throughput, or redesign overclaim", async () => {
  const result = await resultPromise;
  assert.equal(result.semanticEvidence.repeatedUpdate.exactDeployedNoOpEstablished, false);
  assert.equal(result.semanticEvidence.twapTargets.exactDeployedMutationEstablished, false);
  assert.deepEqual(result.semanticEvidence.authorization, { anchorVariantSemanticDecoderAllowed: false, laterAnchorCounterfactualMilestoneAllowed: false, optimizationImplemented: false });
  const text = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["safe to parallelize", "validator's exact", "throughput recovered", "implemented optimization", "semantic decoder authorized"]) assert.equal(text.includes(forbidden), false, forbidden);
});
