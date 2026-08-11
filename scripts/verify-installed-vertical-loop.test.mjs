import test from "node:test";
import assert from "node:assert/strict";
import {
  fixtureCoverage,
  redactedActionEvidence,
  selectClaimBotProjectLink,
} from "./verify-installed-vertical-loop.mjs";

test("selects ClaimBot_API by portable repository basename", () => {
  const selected = selectClaimBotProjectLink([
    { id: "other", name: "Other", repoPath: "C:\\fixtures\\Other" },
    { id: "claimbot", name: "Claim fixture", repoPath: "C:\\fixtures\\ClaimBot_API" },
  ]);
  assert.equal(selected.id, "claimbot");
});

test("rejects ambiguous ClaimBot_API Project Links", () => {
  assert.throws(() => selectClaimBotProjectLink([
    { id: "one", name: "ClaimBot_API one", repoPath: "C:\\fixtures\\one" },
    { id: "two", name: "ClaimBot_API two", repoPath: "C:\\fixtures\\two" },
  ]), /expected one ClaimBot_API Project Link, found 2/);
});

test("uses the installed UI Context id to disambiguate duplicate fixture links", () => {
  const selected = selectClaimBotProjectLink([
    { id: "old", name: "ClaimBot_API old", repoPath: "C:\\fixtures\\ClaimBot_API" },
    { id: "active", name: "ClaimBot_API selected", repoPath: "C:\\fixtures\\ClaimBot_API" },
  ], "active");
  assert.equal(selected.id, "active");
});

test("rejects an active Context id that is not a ClaimBot_API link", () => {
  assert.throws(() => selectClaimBotProjectLink([
    { id: "other", name: "Other", repoPath: "C:\\fixtures\\Other" },
    { id: "claimbot", name: "ClaimBot_API", repoPath: "C:\\fixtures\\ClaimBot_API" },
  ], "other"), /Context does not select a ClaimBot_API/);
});

test("requires the recorded Work Item, PR and build fixture chain", () => {
  const result = fixtureCoverage({
    id: 10,
    revision: 7,
    title: "[MergePilot Fixture] installed loop",
    linkedPullRequests: [{ id: 20, status: "active" }],
    linkedBuilds: [{ id: 30, status: "completed", result: "succeeded" }],
  }, { workItemId: 10, pullRequestId: 20, buildId: 30 });
  assert.deepEqual(result, {
    workItemId: 10,
    workItemRevision: 7,
    pullRequestId: 20,
    pullRequestStatus: "active",
    buildId: 30,
    buildStatus: "completed",
    buildResult: "succeeded",
  });
});

test("rejects a non-fixture target before any mutation", () => {
  assert.throws(() => fixtureCoverage({
    id: 10,
    revision: 1,
    title: "Business work item",
    linkedPullRequests: [{ id: 20 }],
    linkedBuilds: [{ id: 30 }],
  }, { workItemId: 10, pullRequestId: 20, buildId: 30 }), /not a MergePilot fixture/);
});

test("redacts payload, identity and verification text from action evidence", () => {
  const evidence = redactedActionEvidence({
    id: "act-1",
    kind: "work_item.comment",
    status: "verified",
    target: { kind: "work_item", id: 42, projectLinkId: "private-link" },
    payload: { text: "secret comment" },
    verificationEvidence: ["comment contains secret comment"],
  });
  assert.deepEqual(evidence, {
    id: "act-1",
    kind: "work_item.comment",
    status: "verified",
    targetKind: "work_item",
    targetId: 42,
    verificationEvidenceCount: 1,
  });
  assert.equal(JSON.stringify(evidence).includes("secret comment"), false);
  assert.equal(JSON.stringify(evidence).includes("private-link"), false);
});
