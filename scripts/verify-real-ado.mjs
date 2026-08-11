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
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const RUNTIME = "http://localhost:8787";
const PROJECT_LINK_ID = "eb2f6c876f53b33d";
const REPO_PATH = process.env.MERGEPILOT_CLAIMBOT_REPO
  ? path.resolve(process.env.MERGEPILOT_CLAIMBOT_REPO)
  : path.resolve(repoRoot, "..", "..", "ClaimBot_API");
const EVIDENCE_PATH = path.join(repoRoot, "docs", "manual-testing", "2026-08-05", "verification", "real-ado-evidence.json");

function gitValue(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function gitSha(cwd) {
  return gitValue(cwd, ["rev-parse", "HEAD"]);
}

function gitBranch(cwd) {
  return gitValue(cwd, ["branch", "--show-current"]);
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

async function readHealth() {
  try {
    const r = await fetchJson("GET", `${RUNTIME}/healthz`);
    return r.ok ? r.body : null;
  } catch {
    return null;
  }
}

async function ensureDaemon(expectedSha, expectedVersion) {
  const existing = await readHealth();
  if (existing) {
    if (existing.version !== expectedVersion || existing.buildSha !== expectedSha) {
      throw new Error(
        `daemon mismatch: expected ${expectedVersion} @ ${expectedSha}, ` +
        `got ${existing.version ?? "unknown"} @ ${existing.buildSha ?? "unknown"}`,
      );
    }
    return { started: false, pid: undefined, health: existing };
  }
  const child = spawn(
    path.join(repoRoot, ".tools", "node-v22.11.0-win-x64", "node.exe"),
    ["packages/daemon/dist/bin.js", "--port", "8787"],
    {
      cwd: repoRoot,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        MERGEPILOT_BUILD_SHA: expectedSha,
        MERGEPILOT_DAEMON_VERSION: expectedVersion,
      },
    },
  );
  child.unref();
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const health = await readHealth();
    if (health) {
      if (health.version !== expectedVersion || health.buildSha !== expectedSha) {
        try { process.kill(child.pid); } catch {}
        throw new Error(
          `started daemon mismatch: expected ${expectedVersion} @ ${expectedSha}, ` +
          `got ${health.version ?? "unknown"} @ ${health.buildSha ?? "unknown"}`,
        );
      }
      return { started: true, pid: child.pid, health };
    }
  }
  return { started: true, pid: child.pid, error: "daemon did not become healthy in 30s" };
}

async function stopStartedDaemon(daemon) {
  if (!daemon?.started || !daemon.pid) return;
  try { process.kill(daemon.pid); } catch {}
  for (let i = 0; i < 20; i += 1) {
    if (!(await readHealth())) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
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
  const mergePilotSha = gitSha(repoRoot);
  const mergePilotBranch = gitBranch(repoRoot);
  const claimBotSha = gitSha(REPO_PATH);
  const expectedVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
  let daemon;

  try {
    daemon = await ensureDaemon(mergePilotSha, expectedVersion);
    if (daemon.error) throw new Error(daemon.error);
    steps.push({
      step: "daemon-health",
      ok: true,
      daemonStarted: daemon.started,
      version: daemon.health.version,
      buildSha: daemon.health.buildSha,
    });

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
      schemaVersion: 2,
      runId,
      mergePilot: {
        sha: mergePilotSha,
        branch: mergePilotBranch,
        version: expectedVersion,
        daemonBuildSha: daemon.health.buildSha,
        daemonVersion: daemon.health.version,
        modelProvider: daemon.health.llmProvider ?? "unknown",
        modelDeployment: daemon.health.azureDeployment ?? "unknown",
      },
      claimBotFixture: { name: "ClaimBot_API", sha: claimBotSha },
      projectLinkId: PROJECT_LINK_ID,
      adoResources: { workItemId: wiId },
      startedAt,
      finishedAt,
      steps,
      status: steps.every((s) => s.ok) ? "PASS" : "FAIL",
    };
    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    process.exitCode = evidence.status === "PASS" ? 0 : 1;
  } finally {
    await stopStartedDaemon(daemon);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
