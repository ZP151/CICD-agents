import { describe, expect, it, afterEach, beforeAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getSettings, resetSettingsForTests, type TaskHandle } from "@cicd-agent/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-daemon-"));
  process.env.RUNTIME_DATA_DIR = tmp;
  process.env.RUNTIME_HOST = "127.0.0.1";
  process.env.RUNTIME_PORT = "0";
  process.env.AZURE_OPENAI_ENDPOINT = "";
  process.env.AZURE_OPENAI_API_KEY = "";
  process.env.AZURE_COSMOS_ENDPOINT = "";
  process.env.AZURE_STORAGE_ACCOUNT = "";
  process.env.AZURE_KEYVAULT_URL = "";
  resetSettingsForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (app) {
    await app.close();
    app = null;
  }
});

describe("daemon HTTP", () => {
  it("responds to /healthz", async () => {
    app = await buildApp();
    const r = await app.inject({ method: "GET", url: "/healthz" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("submits and observes a task", async () => {
    app = await buildApp({
      runner: async (h: TaskHandle) => {
        h.step("hi", "ok", "hello");
        return { ok: true };
      },
    });
    const submit = await app.inject({
      method: "POST",
      url: "/tasks/submit-pipeline",
      payload: { repoPath: process.cwd() },
    });
    expect(submit.statusCode).toBe(202);
    const { taskId } = submit.json() as { taskId: string };
    // Wait briefly for the worker.
    for (let i = 0; i < 20; i++) {
      const view = await app.inject({ method: "GET", url: `/tasks/${taskId}` });
      const body = view.json() as { status: string };
      if (body.status === "succeeded" || body.status === "failed") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const final = await app.inject({ method: "GET", url: `/tasks/${taskId}` });
    expect(final.statusCode).toBe(200);
    const body = final.json() as { status: string; steps: unknown[] };
    expect(body.status).toBe("succeeded");
    expect(body.steps.length).toBeGreaterThan(0);
  });

  it("rejects malformed submit-pipeline payloads", async () => {
    app = await buildApp();
    const r = await app.inject({
      method: "POST",
      url: "/tasks/submit-pipeline",
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it("returns 404 for unknown task", async () => {
    app = await buildApp();
    const r = await app.inject({ method: "GET", url: "/tasks/no-such-task" });
    expect(r.statusCode).toBe(404);
  });

  it("returns empty chat workflow state for an unknown session", async () => {
    app = await buildApp();
    const state = await app.inject({ method: "GET", url: "/chat/no-such-session/state" });
    expect(state.statusCode).toBe(200);
    const body = state.json() as { workflowState?: unknown };
    expect(body.workflowState).toBeUndefined();
  });

  it("streams OpenHarness-style UI chunks alongside legacy chat SSE events", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-ui-stream-"));
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "summarize current workspace",
        repoPath: repo,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    const uiChunks = events
      .filter((entry) => entry.event === "ui.chunk")
      .map((entry) => entry.data as { chunk?: { type?: string; delta?: string } })
      .map((entry) => entry.chunk);

    expect(events.some((entry) => entry.event === "session")).toBe(true);
    expect(events.some((entry) => entry.event === "final")).toBe(true);
    expect(uiChunks.map((chunk) => chunk?.type)).toEqual(
      expect.arrayContaining(["start", "progress", "text-start", "text-delta", "text-end", "finish"]),
    );
    expect(uiChunks.some((chunk) => chunk?.type === "text-delta" && typeof chunk.delta === "string" && chunk.delta.length > 0))
      .toBe(true);
  });

  it("previews stored Git checkpoints without requiring a repo mutation", async () => {
    app = await buildApp();
    const checkpointId = "git-2026-06-11T00-00-00-000Z";
    const checkpointDir = path.join(getSettings().dataDir, "checkpoints");
    fs.mkdirSync(checkpointDir, { recursive: true });
    fs.writeFileSync(path.join(checkpointDir, `${checkpointId}.json`), JSON.stringify({
      id: checkpointId,
      kind: "git_checkpoint",
      createdAt: "2026-06-11T00:00:00.000Z",
      repoPath: "C:/repo",
      reason: "before git_add",
      branch: "main",
      head: "abc123",
      status: "## main\n M README.md",
      diff: "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n before\n+after\n",
    }), "utf8");

    const preview = await app.inject({
      method: "GET",
      url: `/chat/checkpoints/${checkpointId}/preview?maxDiffChars=30`,
    });

    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json()).toMatchObject({
      ok: true,
      checkpointId,
      repoPath: "C:/repo",
      reason: "before git_add",
      statusLines: ["## main", " M README.md"],
      files: ["README.md"],
      diffTruncated: true,
    });
  });

  it("returns chat index status and triggers index refresh", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-index-repo-"));
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "chatSession.ts"), "export const ready = true;\n", "utf8");

    const status = await app.inject({
      method: "POST",
      url: "/chat/index-status",
      payload: { repoPath: repo },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      repoPath: repo,
      indexed: false,
      semanticReady: false,
      retrievalMode: "quick-scan",
    });

    const refresh = await app.inject({
      method: "POST",
      url: "/chat/index-refresh",
      payload: { repoPath: repo },
    });
    expect(refresh.statusCode, refresh.body).toBe(200);

    const refreshBody = refresh.json() as {
      ok: boolean;
      refresh: { filesSeen: number; filesIndexed: number; embedded: number };
      status: { indexed: boolean; semanticReady: boolean; stats: { filesIndexed: number; chunksIndexed: number } };
    };

    expect(refreshBody.ok).toBe(true);
    expect(refreshBody.refresh.filesSeen).toBeGreaterThan(0);
    expect(refreshBody.refresh.filesIndexed).toBeGreaterThan(0);
    expect(refreshBody.refresh.embedded).toBe(0);
    expect(refreshBody.status.indexed).toBe(true);
    expect(refreshBody.status.stats.filesIndexed).toBe(refreshBody.refresh.filesIndexed);

    const after = await app.inject({
      method: "POST",
      url: "/chat/index-status",
      payload: { repoPath: repo },
    });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toMatchObject({
      repoPath: repo,
      indexed: true,
      retrievalMode: "quick-scan",
    });
  });

  it("returns 400 for malformed chat index request payload", async () => {
    app = await buildApp();

    const status = await app.inject({
      method: "POST",
      url: "/chat/index-status",
      payload: { repoPath: 123 },
    });
    expect(status.statusCode).toBe(400);

    const refresh = await app.inject({
      method: "POST",
      url: "/chat/index-refresh",
      payload: { profile: "bad" },
    });
    expect(refresh.statusCode).toBe(400);
  });

  it("plans checkpoint rollback without executing it", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-checkpoint-plan-repo-"));
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    };
    git(["init"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
    git(["add", "README.md"]);
    git(["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"]);

    const checkpointId = "git-2026-06-11T00-00-00-001Z";
    const checkpointDir = path.join(getSettings().dataDir, "checkpoints");
    fs.mkdirSync(checkpointDir, { recursive: true });
    fs.writeFileSync(path.join(checkpointDir, `${checkpointId}.json`), JSON.stringify({
      id: checkpointId,
      kind: "git_checkpoint",
      createdAt: "2026-06-11T00:00:00.001Z",
      repoPath: repo,
      reason: "clean baseline",
      branch: "main",
      head: "abc123",
      status: "## main",
      diff: "",
    }), "utf8");
    fs.writeFileSync(path.join(repo, "README.md"), "before\nafter\n", "utf8");

    const plan = await app.inject({
      method: "GET",
      url: `/chat/checkpoints/${checkpointId}/rollback-plan`,
    });

    expect(plan.statusCode, plan.body).toBe(200);
    expect(plan.json()).toMatchObject({
      ok: true,
      checkpointId,
      supported: true,
      mode: "restore_tracked_to_clean_checkpoint",
      currentTrackedPaths: ["README.md"],
      proposal: {
        tool: "git_restore",
        args: { paths: ["README.md"], staged: false },
      },
    });
    expect(fs.readFileSync(path.join(repo, "README.md"), "utf8")).toContain("after");
  });

  it("infers Azure DevOps Project Link fields from a git remote", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-ado-remote-"));
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    };
    git(["init"]);
    git(["remote", "add", "origin", "https://dev.azure.com/demo-org/Demo%20Project/_git/cicd-agent"]);

    const r = await app.inject({
      method: "GET",
      url: `/git/azure-devops-remote?repoPath=${encodeURIComponent(repo)}`,
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      suggestion: {
        remoteName: "origin",
        remoteUrl: "https://dev.azure.com/demo-org/Demo%20Project/_git/cicd-agent",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Demo Project",
        adoRepoName: "cicd-agent",
      },
    });
  });

  it("reports cached auth status and clears local auth cache without Azure CLI", async () => {
    app = await buildApp();

    const status = await app.inject({ method: "GET", url: "/auth/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ authenticated: false, fromCache: true });

    const logout = await app.inject({ method: "POST", url: "/auth/logout" });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ ok: true });
  });

  it("persists review disposition audit events without ADO write-back", async () => {
    app = await buildApp();

    const profile = await app.inject({
      method: "POST",
      url: "/profiles",
      payload: {
        name: "Disposition Link",
        repoPath: process.cwd(),
        targetBranch: "main",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "cicd-agent-disposition",
        adoPat: "test-pat",
      },
    });
    expect(profile.statusCode).toBe(201);
    const { id } = profile.json() as { id: string };

    const disposition = await app.inject({
      method: "POST",
      url: `/profiles/${id}/review-disposition`,
      payload: {
        pullRequestId: 77,
        lastIterationId: 2,
        findingCount: 1,
        lastRunAt: "2026-06-11T00:00:00.000Z",
        sourceCommit: "abc123",
        decisionQueue: "blocked",
        decisionRiskLevel: "high",
        decisionReason: "Changes requested from Review Queue.",
        decisionReasonCodes: ["manual.changes_requested"],
        contextConfidence: "medium",
        autoApprovedAt: "",
        autoApprovalActor: "",
        discardedFindingCount: 0,
        hunkCoverageFiles: 1,
        wholeFileFallbackFiles: 0,
        changedHunkLines: 4,
        manualDisposition: "changes_requested",
        manualDispositionAt: "2026-06-11T00:01:00.000Z",
        manualDispositionActor: "desktop-user",
        manualDispositionNote: "Changes requested",
        manualDispositionEvents: [{
          disposition: "changes_requested",
          at: "2026-06-11T00:01:00.000Z",
          actor: "desktop-user",
          note: "Changes requested",
        }],
        writeBackToAdo: false,
      },
    });
    expect(disposition.statusCode).toBe(200);
    expect(disposition.json()).toMatchObject({
      ok: true,
      adoWriteBack: { attempted: false, ok: false },
      record: {
        pullRequestId: 77,
        manualDisposition: "changes_requested",
        manualDispositionWriteBackAttempted: false,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackError: "",
        manualDispositionWriteBackAt: "",
        manualDispositionWriteBackThreadId: "",
        manualDispositionWriteBackUrl: "",
        manualDispositionWriteBackEvents: [],
        manualDispositionEvents: [{
          disposition: "changes_requested",
          actor: "desktop-user",
          note: "Changes requested",
        }],
      },
    });

    const queue = await app.inject({ method: "GET", url: `/profiles/${id}/review-queue` });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({
      items: [{
        pullRequestId: 77,
        manualDisposition: "changes_requested",
        manualDispositionWriteBackAttempted: false,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackEvents: [],
        manualDispositionEvents: [{
          disposition: "changes_requested",
          actor: "desktop-user",
          note: "Changes requested",
        }],
      }],
    });
  });

  it("persists and lists review operation activity for a profile repository", async () => {
    app = await buildApp();

    const profile = await app.inject({
      method: "POST",
      url: "/profiles",
      payload: {
        name: "Activity Link",
        repoPath: process.cwd(),
        targetBranch: "main",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "cicd-agent-activity",
        adoPat: "test-pat",
      },
    });
    expect(profile.statusCode).toBe(201);
    const { id } = profile.json() as { id: string };

    const saved = await app.inject({
      method: "POST",
      url: `/profiles/${id}/review-operations`,
      payload: {
        kind: "rerun",
        at: "2026-06-11T00:00:00.000Z",
        pullRequestId: 88,
        actor: "desktop-user",
        label: "Rerun review",
        ok: true,
        details: "needs human review",
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      ok: true,
      storage: "local",
      record: {
        repository: "cicd-agent-activity",
        pullRequestId: 88,
        kind: "rerun",
        label: "Rerun review",
      },
    });

    const reviewRun = await app.inject({
      method: "POST",
      url: `/profiles/${id}/review-operations`,
      payload: {
        kind: "review_run",
        at: "2026-06-11T00:01:00.000Z",
        pullRequestId: 88,
        actor: "desktop-user",
        label: "#88 · Review run",
        ok: true,
        details: "queue=needs_human_review; risk=medium",
      },
    });
    expect(reviewRun.statusCode).toBe(200);
    expect(reviewRun.json()).toMatchObject({
      record: {
        repository: "cicd-agent-activity",
        pullRequestId: 88,
        kind: "review_run",
        details: "queue=needs_human_review; risk=medium",
      },
    });

    const listed = await app.inject({ method: "GET", url: `/profiles/${id}/review-operations` });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      storage: "local",
      items: [{
        repository: "cicd-agent-activity",
        pullRequestId: 88,
        kind: "review_run",
        ok: true,
      }, {
        repository: "cicd-agent-activity",
        pullRequestId: 88,
        kind: "rerun",
        ok: true,
      }],
    });

  });

  it("persists and lists PR insight artifacts for a profile repository", async () => {
    app = await buildApp();

    const profile = await app.inject({
      method: "POST",
      url: "/profiles",
      payload: {
        name: "Insight Link",
        repoPath: process.cwd(),
        targetBranch: "main",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "cicd-agent-insights",
        adoPat: "test-pat",
      },
    });
    expect(profile.statusCode).toBe(201);
    const { id } = profile.json() as { id: string };

    const saved = await app.inject({
      method: "POST",
      url: `/profiles/${id}/pr-insights`,
      payload: {
        kind: "review_run",
        at: "2026-06-11T00:10:00.000Z",
        pullRequestId: 88,
        title: "#88 · Review run",
        summary: "Full review summary.",
        readiness: "needs_attention",
        decisionQueue: "needs_human_review",
        decisionRiskLevel: "medium",
        contextConfidence: "high",
        iterationId: 5,
        sourceCommit: "abc123",
        risks: ["Missing tests"],
        categories: {
          blocking: [],
          warnings: ["Missing tests"],
          info: ["Small PR"],
        },
        findingCount: 2,
        discardedFindingCount: 1,
        tokensIn: 1000,
        tokensOut: 300,
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      ok: true,
      storage: "local",
      record: {
        profileId: id,
        repository: "cicd-agent-insights",
        pullRequestId: 88,
        kind: "review_run",
        summary: "Full review summary.",
        iterationId: 5,
        sourceCommit: "abc123",
      },
    });

    const listed = await app.inject({ method: "GET", url: `/profiles/${id}/pr-insights?pullRequestId=88` });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      storage: "local",
      items: [{
        profileId: id,
        repository: "cicd-agent-insights",
        pullRequestId: 88,
        kind: "review_run",
        decisionQueue: "needs_human_review",
        iterationId: 5,
        sourceCommit: "abc123",
      }],
      history: [{
        index: 0,
        total: 1,
        latest: true,
      }],
    });

    const savedBody = saved.json() as { record: { id: string } };
    const byId = await app.inject({
      method: "GET",
      url: `/profiles/${id}/pr-insights/artifact?artifactId=${encodeURIComponent(savedBody.record.id)}`,
    });
    expect(byId.statusCode).toBe(200);
    expect(byId.json()).toMatchObject({
      storage: "local",
      record: {
        id: savedBody.record.id,
        profileId: id,
        repository: "cicd-agent-insights",
        pullRequestId: 88,
        summary: "Full review summary.",
      },
    });
  });

  it("writes blocking review dispositions back to Azure DevOps PR threads", async () => {
    app = await buildApp();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 123 }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const profile = await app.inject({
      method: "POST",
      url: "/profiles",
      payload: {
        name: "Disposition Writeback Link",
        repoPath: process.cwd(),
        targetBranch: "main",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "cicd-agent-writeback",
        adoPat: "test-pat",
      },
    });
    expect(profile.statusCode).toBe(201);
    const { id } = profile.json() as { id: string };

    const disposition = await app.inject({
      method: "POST",
      url: `/profiles/${id}/review-disposition`,
      payload: {
        pullRequestId: 88,
        lastIterationId: 2,
        findingCount: 1,
        lastRunAt: "2026-06-11T00:00:00.000Z",
        sourceCommit: "abc123",
        decisionQueue: "blocked",
        decisionRiskLevel: "high",
        decisionReason: "Changes requested from Review Queue.",
        decisionReasonCodes: ["manual.changes_requested"],
        contextConfidence: "medium",
        autoApprovedAt: "",
        autoApprovalActor: "",
        discardedFindingCount: 0,
        hunkCoverageFiles: 1,
        wholeFileFallbackFiles: 0,
        changedHunkLines: 4,
        manualDisposition: "changes_requested",
        manualDispositionAt: "2026-06-11T00:01:00.000Z",
        manualDispositionActor: "desktop-user",
        manualDispositionNote: "Please address the Review Queue findings.",
        manualDispositionEvents: [{
          disposition: "changes_requested",
          at: "2026-06-11T00:01:00.000Z",
          actor: "desktop-user",
          note: "Please address the Review Queue findings.",
        }],
        writeBackToAdo: true,
      },
    });

    expect(disposition.statusCode).toBe(200);
    expect(disposition.json()).toMatchObject({
      ok: true,
      adoWriteBack: { attempted: true, ok: true },
      record: {
        pullRequestId: 88,
        manualDispositionWriteBackAttempted: true,
        manualDispositionWriteBackOk: true,
        manualDispositionWriteBackError: "",
        manualDispositionWriteBackThreadId: "123",
        manualDispositionWriteBackUrl: "https://dev.azure.com/demo-org/Agents/_git/cicd-agent-writeback/pullrequest/88?_a=files&discussionId=123",
        manualDispositionWriteBackEvents: [{
          disposition: "changes_requested",
          ok: true,
          actor: "desktop-user",
          note: "Please address the Review Queue findings.",
          error: "",
          threadId: "123",
          url: "https://dev.azure.com/demo-org/Agents/_git/cicd-agent-writeback/pullrequest/88?_a=files&discussionId=123",
        }],
      },
    });
    expect(disposition.json().record.manualDispositionWriteBackAt).toMatch(/^20/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/Agents/_apis/git/repositories/cicd-agent-writeback/pullRequests/88/threads");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      status: 1,
      comments: [{
        commentType: 1,
        content: expect.stringContaining("Review Queue disposition: changes requested"),
      }],
    });
  });

  it("records failed Azure DevOps disposition write-back attempts", async () => {
    app = await buildApp();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ADO unavailable", { status: 500, headers: { "content-type": "text/plain" } }),
    );

    const profile = await app.inject({
      method: "POST",
      url: "/profiles",
      payload: {
        name: "Disposition Failed Writeback Link",
        repoPath: process.cwd(),
        targetBranch: "main",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "cicd-agent-writeback-failure",
        adoPat: "test-pat",
      },
    });
    expect(profile.statusCode).toBe(201);
    const { id } = profile.json() as { id: string };

    const disposition = await app.inject({
      method: "POST",
      url: `/profiles/${id}/review-disposition`,
      payload: {
        pullRequestId: 89,
        lastIterationId: 2,
        findingCount: 1,
        lastRunAt: "2026-06-11T00:00:00.000Z",
        sourceCommit: "abc123",
        decisionQueue: "blocked",
        decisionRiskLevel: "high",
        decisionReason: "Blocked from Review Queue.",
        decisionReasonCodes: ["manual.marked_blocked"],
        contextConfidence: "medium",
        autoApprovedAt: "",
        autoApprovalActor: "",
        discardedFindingCount: 0,
        hunkCoverageFiles: 1,
        wholeFileFallbackFiles: 0,
        changedHunkLines: 4,
        manualDisposition: "marked_blocked",
        manualDispositionAt: "2026-06-11T00:01:00.000Z",
        manualDispositionActor: "desktop-user",
        manualDispositionNote: "Do not merge until the deployment risk is resolved.",
        manualDispositionEvents: [{
          disposition: "marked_blocked",
          at: "2026-06-11T00:01:00.000Z",
          actor: "desktop-user",
          note: "Do not merge until the deployment risk is resolved.",
        }],
        writeBackToAdo: true,
      },
    });

    expect(disposition.statusCode).toBe(200);
    expect(disposition.json()).toMatchObject({
      ok: true,
      adoWriteBack: {
        attempted: true,
        ok: false,
        error: expect.stringContaining("createThread failed: HTTP 500"),
      },
      record: {
        pullRequestId: 89,
        manualDispositionWriteBackAttempted: true,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackError: expect.stringContaining("createThread failed: HTTP 500"),
        manualDispositionWriteBackThreadId: "",
        manualDispositionWriteBackUrl: "",
        manualDispositionWriteBackEvents: [{
          disposition: "marked_blocked",
          ok: false,
          actor: "desktop-user",
          note: "Do not merge until the deployment risk is resolved.",
          error: expect.stringContaining("createThread failed: HTTP 500"),
          threadId: "",
          url: "",
        }],
      },
    });
    expect(disposition.json().record.manualDispositionWriteBackAt).toMatch(/^20/);
    expect(disposition.json().record.manualDispositionWriteBackEvents[0].at).toMatch(/^20/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const queue = await app.inject({ method: "GET", url: `/profiles/${id}/review-queue` });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({
      items: [{
        pullRequestId: 89,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackEvents: [{
          disposition: "marked_blocked",
          ok: false,
          error: expect.stringContaining("createThread failed: HTTP 500"),
        }],
      }],
    });
  });

  it("discovers Project Link Azure DevOps options through internal ADO logic", async () => {
    app = await buildApp();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          value: [
            {
              id: "project-1",
              name: "DemoProject",
              description: "Demo project",
              url: "https://dev.azure.com/demo-org/DemoProject",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const r = await app.inject({
      method: "POST",
      url: "/profiles/discover",
      payload: {
        kind: "projects",
        profile: {
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoPat: "test-pat",
        },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      source: "internal",
      kind: "projects",
      items: [
        {
          id: "project-1",
          name: "DemoProject",
          description: "Demo project",
          url: "https://dev.azure.com/demo-org/DemoProject",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/_apis/projects?%24top=100&api-version=7.1-preview.4",
      expect.objectContaining({ redirect: "manual" }),
    );
    fetchMock.mockRestore();
  });

  it("discovers Project Link pipelines by resolving the repository name internally", async () => {
    app = await buildApp();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/_apis/git/repositories?")) {
        return new Response(
          JSON.stringify({
            value: [{
              id: "repo-1",
              name: "cicd-agent",
              defaultBranch: "refs/heads/main",
              webUrl: "https://dev.azure.com/demo-org/Agents/_git/cicd-agent",
            }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/definitions?")) {
        expect(url).toContain("repositoryId=repo-1");
        return new Response(
          JSON.stringify({
            value: [{
              id: 12,
              name: "CICD Agent CI",
              path: "\\",
              repository: { id: "repo-1", name: "cicd-agent", type: "TfsGit" },
              process: { yamlFilename: "azure-pipelines.yml" },
              _links: { web: { href: "https://dev.azure.com/demo-org/Agents/_build?definitionId=12" } },
            }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const r = await app.inject({
      method: "POST",
      url: "/profiles/discover",
      payload: {
        kind: "pipelines",
        profile: {
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "cicd-agent",
          adoPat: "test-pat",
        },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      source: "internal",
      kind: "pipelines",
      items: [{
        id: "12",
        name: "CICD Agent CI",
        description: "\\ · repo:cicd-agent · type:TfsGit · yaml:azure-pipelines.yml",
        url: "https://dev.azure.com/demo-org/Agents/_build?definitionId=12",
      }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("checks internal Project Link Azure DevOps tool availability", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ value: [{ id: "project-1", name: "DemoProject" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const r = await app.inject({
      method: "POST",
      url: "/profiles/check-ado-tools",
      payload: {
        profile: {
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoPat: "test-pat",
        },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      ok: true,
      source: "internal",
      authMode: "pat",
      projectCount: 1,
    });
    expect((r.json() as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)).toContain("ado_core_list_projects");
    vi.restoreAllMocks();
  });

  it("returns structured ADO auth diagnostics when tool health fails", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    const r = await app.inject({
      method: "POST",
      url: "/profiles/check-ado-tools",
      payload: {
        profile: {
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoPat: "bad-pat",
        },
      },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      ok: false,
      source: "internal",
      authMode: "pat",
      authStatus: "pat_invalid_or_missing_scope",
      retryable: false,
    });
  });

  it("returns internal pull request context for a Project Link", async () => {
    app = await buildApp();
    const profileResponse = await app.inject({
      method: "POST",
      url: "/profiles",
      payload: {
        name: "Demo Link",
        repoPath: process.cwd(),
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "cicd-agent",
        adoPat: "test-pat",
        adoPipelineId: "12",
      },
    });
    expect(profileResponse.statusCode).toBe(201);
    const profile = profileResponse.json() as { id: string };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string"
        ? input
        : typeof (input as { url?: unknown }).url === "string"
          ? String((input as { url: string }).url)
          : String(input);
      if (url.includes("/pullrequests/42?")) {
        return new Response(JSON.stringify({
          pullRequestId: 42,
          codeReviewId: 1001,
          title: "Improve agent",
          description: "Detailed body",
          status: "active",
          sourceRefName: "refs/heads/feature/agent",
          targetRefName: "refs/heads/main",
          repository: { name: "cicd-agent", project: { name: "Agents" } },
          reviewers: [{ vote: 10 }],
          workItemRefs: [{ id: "123", url: "https://ado/workitems/123" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/threads?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 5,
            status: 1,
            comments: [{ id: 6, author: { displayName: "Ada", uniqueName: "ada@example.com" }, content: "Looks good" }],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/iterations?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 3,
            sourceRefCommit: { commitId: "source-commit" },
            targetRefCommit: { commitId: "target-commit" },
            commonRefCommit: { commitId: "common-commit" },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/iterations/3/changes?")) {
        return new Response(JSON.stringify({
          changeEntries: [{
            changeId: 10,
            changeType: "edit",
            item: { path: "/src/app.ts", gitObjectType: "blob", commitId: "source-commit" },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/build/builds?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 77,
            buildNumber: "20260610.1",
            status: "completed",
            result: "succeeded",
            sourceBranch: "refs/heads/feature/agent",
            definition: { name: "CI" },
            _links: { web: { href: "https://ado/build/77" } },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const context = await app.inject({
      method: "GET",
      url: `/profiles/${profile.id}/pull-requests/42/context`,
    });

    expect(context.statusCode).toBe(200);
    expect(context.json()).toMatchObject({
      source: "internal",
      pullRequest: {
        id: 42,
        title: "Improve agent",
        sourceBranch: "feature/agent",
        workItemRefs: [{ id: "123", url: "https://ado/workitems/123" }],
      },
      threads: [{ id: 5, comments: [{ id: 6, content: "Looks good" }] }],
      changes: { iterationId: 3, fileCount: 1, changes: [{ path: "/src/app.ts" }] },
      builds: [{ id: 77, buildNumber: "20260610.1", result: "succeeded" }],
    });
  });

  it("lists pull requests using an inline browser-local Project Link", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string"
        ? input
        : typeof (input as { url?: unknown }).url === "string"
          ? String((input as { url: string }).url)
          : String(input);
      if (url.includes("/_apis/git/repositories/cicd-agent/pullrequests?")) {
        return new Response(JSON.stringify({
          value: [{
            pullRequestId: 42,
            title: "Improve agent",
            status: "active",
            isDraft: false,
            sourceRefName: "refs/heads/feature/agent",
            targetRefName: "refs/heads/main",
            creationDate: "2026-06-10T00:00:00.000Z",
            createdBy: { displayName: "Ada" },
            repository: { name: "cicd-agent" },
            reviewers: [{ vote: 10 }, { vote: 0 }],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/pipelines/12/runs?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 77,
            name: "20260610.1",
            state: "completed",
            result: "succeeded",
            createdDate: "2026-06-10T00:00:00.000Z",
            finishedDate: "2026-06-10T00:05:00.000Z",
            resources: { repositories: { self: { refName: "refs/heads/feature/agent" } } },
            _links: { web: { href: "https://ado/build/77" } },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const r = await app.inject({
      method: "POST",
      url: "/profiles/browser-only-profile/pull-requests?status=active",
      payload: {
        profile: {
          name: "Browser Link",
          repoPath: process.cwd(),
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "cicd-agent",
          adoPat: "test-pat",
          adoPipelineId: "12",
        },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      pullRequests: [{
        id: 42,
        title: "Improve agent",
        sourceBranch: "feature/agent",
        pipelineRun: {
          id: 77,
          result: "succeeded",
          sourceBranch: "feature/agent",
        },
      }],
    });
  });

  it("returns a non-mutating heuristic PR insight preview", async () => {
    app = await buildApp();
    const profileResponse = await app.inject({
      method: "POST",
      url: "/profiles",
      payload: {
        name: "Demo Link",
        repoPath: process.cwd(),
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "cicd-agent",
        adoPat: "test-pat",
        adoPipelineId: "12",
      },
    });
    expect(profileResponse.statusCode).toBe(201);
    const profile = profileResponse.json() as { id: string };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/pullrequests/42?")) {
        return new Response(JSON.stringify({
          pullRequestId: 42,
          title: "Improve agent",
          description: "Adds PR insight",
          status: "active",
          sourceRefName: "refs/heads/feature/agent",
          targetRefName: "refs/heads/main",
          repository: { name: "cicd-agent", project: { name: "Agents" } },
          reviewers: [],
          workItemRefs: [{ id: "123", url: "https://ado/workitems/123" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/threads?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 5,
            status: 1,
            comments: [{ id: 6, author: { displayName: "Ada" }, content: "Needs test coverage" }],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/iterations?")) {
        return new Response(JSON.stringify({
          value: [{ id: 3, sourceRefCommit: { commitId: "source-commit" } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/iterations/3/changes?")) {
        return new Response(JSON.stringify({
          changeEntries: [{
            changeId: 10,
            changeType: "edit",
            item: { path: "/src/app.ts", gitObjectType: "blob", commitId: "source-commit" },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/build/builds?")) {
        return new Response(JSON.stringify({
          value: [{ id: 77, buildNumber: "20260610.1", status: "completed", result: "failed" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const preview = await app.inject({
      method: "POST",
      url: `/profiles/${profile.id}/pull-requests/42/insight-preview`,
      payload: {},
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      source: "heuristic",
      readiness: "blocked",
      risks: ["1 failed/canceled build(s)", "1 active thread(s)"],
      categories: {
        blocking: ["1 failed/canceled build(s)"],
        warnings: ["1 active thread(s)"],
      },
      signals: {
        fileCount: 1,
        threadCount: 1,
        failedBuildCount: 1,
        workItemCount: 1,
      },
      tokensIn: 0,
      tokensOut: 0,
    });
    expect((preview.json() as { summary: string }).summary).toContain("1 changed file");
  });

  it("returns full AI insight metadata and compression boundaries from review-run", async () => {
    app = await buildApp();
    let requestedFileDiffs = false;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string"
        ? input
        : typeof (input as { url?: unknown }).url === "string"
          ? String((input as { url: string }).url)
          : String(input);
      if (url.includes("/pullrequests/42/iterations?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 3,
            description: "latest",
            sourceRefCommit: { commitId: "source-commit" },
            commonRefCommit: { commitId: "base-commit" },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/iterations/3/changes?")) {
        return new Response(JSON.stringify({
          changeEntries: [
            { changeType: "edit", item: { path: "/src/auth/tokenService.ts" } },
            { changeType: "edit", item: { path: "/docs/generated-api.md" } },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/git/repositories/cicd-agent/items?")) {
        const parsed = new URL(url);
        const pathInRepo = parsed.searchParams.get("path");
        const body = pathInRepo?.includes("generated-api")
          ? "x".repeat(14000)
          : "export function validateToken() { return true; }\n";
        return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
      }
      if (url.includes("/diffs/filediffs?")) {
        requestedFileDiffs = true;
        return new Response(JSON.stringify([{
          path: "src/auth/tokenService.ts",
          lineDiffBlocks: [{
            changeType: "edit",
            originalLineNumberStart: 1,
            originalLinesCount: 1,
            modifiedLineNumberStart: 1,
            modifiedLinesCount: 1,
            originalLines: ["export function validateToken() { return false; }"],
            modifiedLines: ["export function validateToken() { return true; }"],
          }],
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42?")) {
        return new Response(JSON.stringify({
          pullRequestId: 42,
          codeReviewId: 420,
          title: "Harden token validation",
          status: "active",
          isDraft: false,
          sourceRefName: "refs/heads/auth-hardening",
          targetRefName: "refs/heads/main",
          createdBy: { displayName: "Ada Lovelace" },
          creationDate: "2026-06-11T00:00:00Z",
          repository: { name: "cicd-agent", project: { name: "Agents" } },
          description: "Tightens token validation rules.",
          reviewers: [
            { vote: 10 },
            { vote: 0 },
            { vote: -10 },
          ],
          _links: { web: { href: "https://dev.azure.com/demo-org/Agents/_git/cicd-agent/pullrequest/42" } },
          workItemRefs: [{ id: "123", url: "https://dev.azure.com/demo-org/_apis/wit/workItems/123" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/threads?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 1,
            status: 1,
            comments: [{
              id: 1,
              content: "Please verify token expiry.",
              author: { displayName: "Reviewer", uniqueName: "reviewer@example.com" },
            }],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/build/builds?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 99,
            buildNumber: "20260611.1",
            status: "completed",
            result: "failed",
            sourceBranch: "refs/heads/auth-hardening",
            definition: { name: "CI" },
            repository: { name: "cicd-agent" },
            _links: { web: { href: "https://dev.azure.com/demo-org/Agents/_build/results?buildId=99" } },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/connectionData?")) {
        return new Response(JSON.stringify({
          authenticatedUser: {
            id: "reviewer-1",
            displayName: "Review Bot",
            uniqueName: "review@example.com",
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const review = await app.inject({
      method: "POST",
      url: "/profiles/demo-link/review-run",
      payload: {
        pullRequestId: 42,
        profile: {
          name: "Demo Link",
          repoPath: process.cwd(),
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "cicd-agent",
          adoPat: "test-pat",
          adoPipelineId: "77",
        },
      },
    });

    expect(review.statusCode).toBe(200);
    expect(requestedFileDiffs).toBe(true);
    expect(review.json()).toMatchObject({
      ok: true,
      pullRequestId: 42,
      repository: "cicd-agent",
      iterationId: 3,
      decisionQueue: "needs_human_review",
      decisionReasonCodes: ["review.no_llm", "context.whole_file_fallback"],
      contextConfidence: "low",
      readiness: "needs_attention",
      metadata: {
        estimatedEffort: 1,
        testsRequired: false,
        securityConcern: false,
        canBeSplit: false,
        keyIssues: [],
      },
      compression: {
        compressed: false,
        includedFiles: ["/src/auth/tokenService.ts", "/docs/generated-api.md"],
        omittedFiles: [],
      },
      coverage: {
        totalFiles: 2,
        filesWithHunks: 1,
        wholeFileOnlyFiles: 1,
        hunkCount: 1,
        changedHunkLines: 1,
      },
    });
  });

});

function parseSse(body: string): Array<{ event: string; data: unknown }> {
  return body
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1] ?? "";
      const dataText = block.match(/^data: (.+)$/m)?.[1] ?? "null";
      return { event, data: JSON.parse(dataText) as unknown };
    });
}
