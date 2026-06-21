import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-"));
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

describe("daemon push workflow routes", () => {
  it("creates a stored approval proposal for structured push workflow actions", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-push-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "push_branch",
        repoPath: repo,
        branch: "main",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      sessionId: string;
      workflowState: {
        status: string;
        pendingApproval?: {
          action: {
            tool: string;
            args: Record<string, unknown>;
            description?: string;
            readiness?: { status?: string; summary?: string };
          };
        };
      };
      tools: Array<{ name: string }>;
    };
    expect(body.sessionId).toMatch(/^chat_/);
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_push");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      branch: "main",
      setUpstream: true,
    });
    expect(body.workflowState.pendingApproval?.action.readiness?.status).toBe("no_upstream");
    expect(body.workflowState.pendingApproval?.action.description).toContain(
      "No upstream branch is configured",
    );
    expect(body.tools.map((tool) => tool.name)).not.toContain("git_push");

    const state = await app.inject({ method: "GET", url: `/chat/${body.sessionId}/state` });
    expect(state.statusCode).toBe(200);
    const stateBody = state.json() as {
      workflowState?: { pendingApproval?: { action: { tool: string } } };
    };
    expect(stateBody.workflowState?.pendingApproval?.action.tool).toBe("git_push");
  });

  it("includes ahead/behind readiness in structured push workflow approvals", async () => {
    app = await buildApp();
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-remote-"));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-push-ahead-"));
    spawnSync("git", ["init", "--bare"], { cwd: remote, encoding: "utf8" });
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "main"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "mergepilot@example.test"], {
      cwd: repo,
      encoding: "utf8",
    });
    spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: initial"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["remote", "add", "origin", remote], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["push", "-u", "origin", "main"], { cwd: repo, encoding: "utf8" });
    fs.appendFileSync(path.join(repo, "README.md"), "more\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: update"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "push_branch",
        repoPath: repo,
        branch: "main",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: {
          action: {
            description?: string;
            readiness?: {
              status?: string;
              upstream?: string;
              ahead?: number;
              behind?: number;
            };
          };
        };
      };
    };
    expect(body.workflowState.pendingApproval?.action.readiness).toMatchObject({
      status: "ahead",
      upstream: "origin/main",
      ahead: 1,
      behind: 0,
    });
    expect(body.workflowState.pendingApproval?.action.description).toContain(
      "ahead of origin/main by 1 commit",
    );
  });

  it("inspects remote push target as a read-only workflow action", async () => {
    app = await buildApp();
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-target-remote-"));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-target-local-"));
    spawnSync("git", ["init", "--bare"], { cwd: remote, encoding: "utf8" });
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "main"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "mergepilot@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: initial"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["remote", "add", "origin", remote], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["push", "-u", "origin", "main"], { cwd: repo, encoding: "utf8" });
    fs.appendFileSync(path.join(repo, "README.md"), "local update\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: local update"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_remote_target",
        repoPath: repo,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      ok: boolean;
      action: string;
      summary: string;
      workflowState: {
        status: string;
        currentStep: string;
        pendingApproval?: unknown;
      };
      tools: Array<{ name: string; command: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("inspect_remote_target");
    expect(body.workflowState.status).toBe("done");
    expect(body.workflowState.currentStep).toBe("inspect_remote_target complete");
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("Remote target: origin/main");
    expect(body.summary).toContain("Branch is ahead of origin/main by 1 commit");
    expect(body.summary).toContain("Divergence: ahead 1, behind 0.");
    expect(body.tools.map((tool) => tool.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_remote",
      "git_upstream",
      "git_divergence",
    ]);
  });

  it("inspects latest commit after push as a read-only workflow action", async () => {
    app = await buildApp();
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-latest-remote-"));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-latest-local-"));
    spawnSync("git", ["init", "--bare"], { cwd: remote, encoding: "utf8" });
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "main"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "mergepilot@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: initial"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["remote", "add", "origin", remote], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["push", "-u", "origin", "main"], { cwd: repo, encoding: "utf8" });
    fs.appendFileSync(path.join(repo, "README.md"), "local update\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: local update"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["push", "origin", "main"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_latest_commit",
        repoPath: repo,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      ok: boolean;
      action: string;
      summary: string;
      workflowState: {
        status: string;
        currentStep: string;
        pendingApproval?: unknown;
      };
      tools: Array<{ name: string; command: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("inspect_latest_commit");
    expect(body.workflowState.status).toBe("done");
    expect(body.workflowState.currentStep).toBe("inspect_latest_commit complete");
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("Latest commit:");
    expect(body.summary).toContain("docs: local update");
    expect(body.summary).toContain("Remote status: Branch is up to date with origin/main.");
    expect(body.summary).toContain("Commit stat:");
    expect(body.tools.map((tool) => tool.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_remote",
      "git_upstream",
      "git_log_subject",
      "git_show_head_stat",
      "git_divergence",
    ]);
  });

  it("creates and completes a structured pull-rebase sync approval", async () => {
    app = await buildApp();
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-sync-remote-"));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-sync-local-"));
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-sync-other-"));
    spawnSync("git", ["init", "--bare"], { cwd: remote, encoding: "utf8" });
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "main"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "mergepilot@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: initial"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["remote", "add", "origin", remote], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["push", "-u", "origin", "main"], { cwd: repo, encoding: "utf8" });

    spawnSync("git", ["clone", remote, other], { encoding: "utf8" });
    spawnSync("git", ["checkout", "main"], { cwd: other, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "mergepilot@example.test"], { cwd: other, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: other, encoding: "utf8" });
    fs.appendFileSync(path.join(other, "README.md"), "remote update\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: other, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: remote update"], { cwd: other, encoding: "utf8" });
    spawnSync("git", ["push", "origin", "main"], { cwd: other, encoding: "utf8" });
    spawnSync("git", ["fetch", "origin"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "sync_branch_rebase",
        repoPath: repo,
        branch: "main",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      sessionId: string;
      workflowState: {
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: {
          action: {
            tool: string;
            args: Record<string, unknown>;
            workflow?: unknown;
            readiness?: { status?: string; upstream?: string; behind?: number };
          };
        };
      };
    };
    expect(body.workflowState.workflowKind).toBe("git");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_sync_branch_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_pull");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      remote: "origin",
      branch: "main",
      rebase: true,
    });
    expect(body.workflowState.pendingApproval?.action.workflow).toMatchObject({
      kind: "git",
      phase: "sync_branch",
      branch: "main",
    });
    expect(body.workflowState.pendingApproval?.action.readiness).toMatchObject({
      status: "behind",
      upstream: "origin/main",
      behind: 1,
    });

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${body.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string; pendingApproval?: unknown } }
      | undefined;
    const done = events.find((entry) => entry.event === "done")?.data as
      | { result?: { response?: string; suggestions?: string[] } }
      | undefined;
    expect(workflowEvent?.state).toMatchObject({
      status: "done",
      workflowKind: "git",
      workflowPhase: "synced",
    });
    expect(workflowEvent?.state?.pendingApproval).toBeUndefined();
    expect(done?.result?.response).toContain("Branch main has been updated with rebase");
    expect(done?.result?.suggestions).toContain("Refresh branch status");
  });

  it("creates and completes a structured fetch-remotes approval", async () => {
    app = await buildApp();
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-fetch-remote-"));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-fetch-local-"));
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-fetch-other-"));
    spawnSync("git", ["init", "--bare"], { cwd: remote, encoding: "utf8" });
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "main"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "mergepilot@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: initial"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["remote", "add", "origin", remote], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["push", "-u", "origin", "main"], { cwd: repo, encoding: "utf8" });

    spawnSync("git", ["clone", remote, other], { encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/remote-only"], { cwd: other, encoding: "utf8" });
    fs.writeFileSync(path.join(other, "feature.txt"), "remote branch\n", "utf8");
    spawnSync("git", ["config", "user.email", "mergepilot@example.test"], { cwd: other, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: other, encoding: "utf8" });
    spawnSync("git", ["add", "feature.txt"], { cwd: other, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "feat: remote branch"], { cwd: other, encoding: "utf8" });
    spawnSync("git", ["push", "origin", "feature/remote-only"], { cwd: other, encoding: "utf8" });

    const beforeFetch = spawnSync("git", ["branch", "-r"], { cwd: repo, encoding: "utf8" });
    expect(beforeFetch.stdout).not.toContain("origin/feature/remote-only");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "fetch_remotes",
        repoPath: repo,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      sessionId: string;
      workflowState: {
        status?: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: {
          action: {
            tool: string;
            args: Record<string, unknown>;
            description?: string;
            workflow?: unknown;
          };
        };
      };
      tools: Array<{ name: string }>;
    };
    expect(body.workflowState).toMatchObject({
      status: "waiting_for_approval",
      workflowKind: "git",
      workflowPhase: "waiting_for_fetch_remotes_approval",
    });
    expect(body.workflowState.pendingApproval?.action).toMatchObject({
      tool: "git_fetch",
      args: { remote: "origin", prune: true },
      workflow: { kind: "git", phase: "fetch_remotes", branch: "main" },
    });
    expect(body.workflowState.pendingApproval?.action.description).toContain("Fetch latest remote refs from origin");
    expect(body.tools.map((tool) => tool.name)).not.toContain("git_fetch");

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${body.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string; pendingApproval?: unknown } }
      | undefined;
    const done = events.find((entry) => entry.event === "done")?.data as
      | { result?: { response?: string; suggestions?: string[] } }
      | undefined;
    expect(workflowEvent?.state).toMatchObject({
      status: "done",
      workflowKind: "git",
      workflowPhase: "fetched",
    });
    expect(workflowEvent?.state?.pendingApproval).toBeUndefined();
    expect(done?.result?.response).toContain("Fetched latest refs from origin");
    expect(done?.result?.suggestions).toContain("Refresh branch status");

    const afterFetch = spawnSync("git", ["branch", "-r"], { cwd: repo, encoding: "utf8" });
    expect(afterFetch.stdout).toContain("origin/feature/remote-only");
  });
});

function parseSse(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of body.trim().split(/\n\n+/)) {
    const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const dataLine = block.match(/^data:\s*(.+)$/m)?.[1];
    if (!event || !dataLine) continue;
    events.push({ event, data: JSON.parse(dataLine) });
  }
  return events;
}
