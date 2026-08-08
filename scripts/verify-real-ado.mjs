#!/usr/bin/env node
/**
 * Real-ADO verification driver (tier: real-ado).
 *
 * Deterministic, model-free loop against ClaimBot_API via the live daemon's
 * verified action runtime. Natural language is never used as evidence:
 * every step asserts the persisted action record, the verification
 * evidence, and the authoritative re-read.
 *
 * Flow:
 *   1. health-check the source daemon (start it if absent)
 *   2. work_item.create  — fixture WI, verified by title field
 *   3. work_item.comment — verified by revision_gt + comment_contains
 *   4. re-read the artifact and assert the expected state
 *   5. work_item.delete  — fixture cleanup, verified by 404 re-read
 *
 * Evidence: docs/manual-testing/2026-08-05/verification/real-ado-evidence.json
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const RUNTIME = "http://localhost:8787";
const PROJECT_LINK_ID = "eb2f6c876f53b33d";
const REPO_PATH = "C:\\Users\\15492\\Develop\\ClaimBot_API";
const EVIDENCE_PATH = path.join(repoRoot, "docs", "manual-testing", "2026-08-05", "verification", "real-ado-evidence.json");

function sha() {
  try {
    return fs.readFileSync(path.join(repoRoot, ".git", "refs", "heads", "claudecode", "optimize-bugfix"), "utf8").trim();
  } catch {
    return "unknown";
  }
}

async function fetchJson(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
  return { ok: response.ok, status: response.status, body: parsed };
}

async function healthOk() {
  try {
    const r = await fetchJson("GET", `${RUNTIME}/healthz`);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureDaemon() {
  if (await healthOk()) return { started: false, pid: undefined };
  const child = spawn(
    path.join(repoRoot, ".tools", "node-v22.11.0-win-x64", "node.exe"),
    ["packages/daemon/dist/bin.js", "--port", "8787"],
    { cwd: repoRoot, stdio: "ignore", detached: true },
  );
  child.unref();
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await healthOk()) return { started: true, pid: child.pid };
  }
  return { started: true, pid: child.pid, error: "daemon did not become healthy in 30s" };
}

async function proposeAndApprove(label, proposal) {
  const proposed = await fetchJson("POST", `${RUNTIME}/delivery/actions`, proposal);
  if (!proposed.ok) throw new Error(`${label}: propose failed (${proposed.status}) ${JSON.stringify(proposed.body).slice(0, 300)}`);
  const actionId = proposed.body.id;
  const approved = await fetchJson("POST", `${RUNTIME}/delivery/actions/${actionId}/approve`);
  if (!approved.ok || approved.body.status !== "verified") {
    throw new Error(`${label}: not verified — ${JSON.stringify(approved.body).slice(0, 400)}`);
  }
  return { actionId, record: approved.body };
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function main() {
  const startedAt = new Date().toISOString();
  const runId = `real-ado-${Date.now().toString(36)}`;
  const steps = [];

  const daemon = await ensureDaemon();
  if (daemon.error) throw new Error(daemon.error);
  steps.push({ step: "daemon-health", ok: true, daemonStarted: daemon.started });

  // 2. create fixture WI
  const created = await proposeAndApprove("create", {
    turnId: runId,
    projectLinkId: PROJECT_LINK_ID,
    kind: "work_item.create",
    target: { kind: "work_item", projectLinkId: PROJECT_LINK_ID, id: 0, revision: 0 },
    basedOn: [],
    payload: { type: "Task", title: `[MergePilot Fixture] verify-real-ado ${runId}`, description: "Deterministic verification fixture; deleted at the end of the run." },
    risk: "medium",
    reason: "Real-ADO verification: create a fixture work item",
    expectedResult: [
      { artifact: { kind: "work_item", projectLinkId: PROJECT_LINK_ID, id: 0, revision: 0 }, condition: "field_eq", field: "System.Title", expected: `[MergePilot Fixture] verify-real-ado ${runId}` },
    ],
    idempotencyKey: `${runId}-create`,
    expiresAt: Date.now() + 3_600_000,
  });
  const wiId = Number(created.record.target?.id ?? 0);
  assert(wiId > 0, `created WI id should be positive, got ${wiId}`);
  steps.push({ step: "work_item.create", ok: true, actionId: created.actionId, workItemId: wiId });

  // 2b. authoritative re-read to learn the real revision (creation targets
  // carry revision 0 by design; the remote revision is the baseline).
  const createdRead = await fetchJson("GET", `${RUNTIME}/delivery/artifacts/work_item/${wiId}?projectLinkId=${PROJECT_LINK_ID}`);
  assert(createdRead.ok, "post-create re-read should succeed");
  const createdRevision = Number(createdRead.body.revision ?? 0);
  assert(createdRevision > 0, `post-create revision should be positive, got ${createdRevision}`);
  steps.push({ step: "post-create-re-read", ok: true, revision: createdRevision });

  // 3. comment
  const commentText = `[MergePilot Fixture] verified comment ${runId}`;
  const commentBase = { kind: "work_item", projectLinkId: PROJECT_LINK_ID, id: wiId, revision: createdRevision };
  const commented = await proposeAndApprove("comment", {
    turnId: runId,
    projectLinkId: PROJECT_LINK_ID,
    kind: "work_item.comment",
    target: commentBase,
    basedOn: [commentBase],
    payload: { text: commentText },
    risk: "low",
    reason: "Real-ADO verification: comment the fixture work item",
    expectedResult: [
      { artifact: { ...commentBase, revision: commentBase.revision + 1 }, condition: "revision_gt", expectedRevision: commentBase.revision },
      { artifact: { ...commentBase, revision: commentBase.revision + 1 }, condition: "comment_contains", expected: `verified comment ${runId}` },
    ],
    idempotencyKey: `${runId}-comment`,
    expiresAt: Date.now() + 3_600_000,
  });
  steps.push({ step: "work_item.comment", ok: true, actionId: commented.actionId });

  // 4. authoritative re-read
  const reRead = await fetchJson("GET", `${RUNTIME}/delivery/artifacts/work_item/${wiId}?projectLinkId=${PROJECT_LINK_ID}`);
  assert(reRead.ok, "re-read should succeed");
  const fields = reRead.body.fields ?? {};
  const comments = reRead.body.comments ?? [];
  assert(String(fields["System.Title"] ?? "") === `[MergePilot Fixture] verify-real-ado ${runId}`, "title should match after create");
  assert(comments.some((c) => c.includes(`verified comment ${runId}`)), "comment should be re-read from ADO");
  assert(Number(reRead.body.revision ?? 0) >= commentBase.revision + 1, "revision should have advanced");
  steps.push({ step: "artifact-re-read", ok: true, revision: reRead.body.revision, commentVisible: true });

  // 5. delete + verify gone (not_exists predicate on the authoritative re-read)
  const deleteRevision = Number(reRead.body.revision ?? commentBase.revision);
  const deleted = await proposeAndApprove("delete", {
    turnId: runId,
    projectLinkId: PROJECT_LINK_ID,
    kind: "work_item.delete",
    target: { ...commentBase, revision: deleteRevision },
    basedOn: [{ ...commentBase, revision: deleteRevision }],
    payload: {},
    risk: "high",
    reason: "Real-ADO verification: delete the fixture work item",
    expectedResult: [
      { artifact: { ...commentBase, revision: deleteRevision + 1 }, condition: "not_exists" },
    ],
    idempotencyKey: `${runId}-delete`,
    expiresAt: Date.now() + 3_600_000,
  });
  steps.push({ step: "work_item.delete", ok: true, actionId: deleted.actionId });

  const finishedAt = new Date().toISOString();
  const evidence = {
    schemaVersion: 1,
    runId,
    commit: { sha: sha() },
    appVersion: JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version,
    productModel: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT ?? "unknown",
    projectLinkId: PROJECT_LINK_ID,
    repoPath: REPO_PATH,
    adoResources: { workItemId: wiId },
    startedAt,
    finishedAt,
    steps,
    status: steps.every((s) => s.ok) ? "PASS" : "FAIL",
  };
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exit(evidence.status === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
