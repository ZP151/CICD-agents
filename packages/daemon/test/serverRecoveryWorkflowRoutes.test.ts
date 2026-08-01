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

function initRepo(prefix: string) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const git = (args: string[], expectedStatus = 0) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    expect(result.status, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(
      expectedStatus,
    );
    return result;
  };
  git(["init"]);
  git(["config", "user.email", "mergepilot@example.test"]);
  git(["config", "user.name", "MergePilot"]);
  git(["checkout", "-b", "main"]);
  fs.writeFileSync(path.join(repo, "app.config"), "base\n", "utf8");
  git(["add", "app.config"]);
  git(["commit", "-m", "chore: base"]);
  return { repo, git };
}

function createDivergedAppConfig(repo: string, git: ReturnType<typeof initRepo>["git"], branch: string) {
  git(["checkout", "-b", branch]);
  fs.writeFileSync(path.join(repo, "app.config"), "feature\n", "utf8");
  git(["commit", "-am", "feat: feature change"]);
  git(["checkout", "main"]);
  fs.writeFileSync(path.join(repo, "app.config"), "main\n", "utf8");
  git(["commit", "-am", "feat: main change"]);
}

function initRemoteRebaseConflictRepo(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "work");
  const other = path.join(root, "other");
  fs.mkdirSync(repo);
  fs.mkdirSync(other);
  const run = (cwd: string, args: string[], expectedStatus = 0) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    expect(result.status, `${cwd}\n${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(expectedStatus);
    return result;
  };
  run(root, ["init", "--bare", origin]);
  run(repo, ["init", "-b", "main"]);
  run(repo, ["config", "user.email", "mergepilot@example.test"]);
  run(repo, ["config", "user.name", "MergePilot"]);
  fs.writeFileSync(path.join(repo, "app.config"), "mode=base\nshared=base\n", "utf8");
  run(repo, ["add", "app.config"]);
  run(repo, ["commit", "-m", "chore: base"]);
  run(repo, ["remote", "add", "origin", origin]);
  run(repo, ["push", "-u", "origin", "main"]);

  run(root, ["clone", origin, other]);
  run(other, ["checkout", "main"]);
  run(other, ["config", "user.email", "mergepilot@example.test"]);
  run(other, ["config", "user.name", "MergePilot"]);

  fs.writeFileSync(path.join(repo, "app.config"), "mode=base\nshared=local\n", "utf8");
  run(repo, ["commit", "-am", "feat: local change"]);
  fs.writeFileSync(path.join(other, "app.config"), "mode=base\nshared=remote\n", "utf8");
  run(other, ["commit", "-am", "feat: remote change"]);
  run(other, ["push", "origin", "main"]);
  run(repo, ["fetch", "origin"]);
  return { repo, git: (args: string[], expectedStatus = 0) => run(repo, args, expectedStatus) };
}

describe("daemon recovery workflow routes", () => {
  it("blocks normal commit workflow actions while a merge conflict is unresolved", async () => {
    app = await buildApp();
    const { repo, git } = initRepo("cicd-chat-workflow-merge-conflict-");
    createDivergedAppConfig(repo, git, "feature/conflict");
    git(["merge", "feature/conflict"], 1);

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "prepare_commit",
        repoPath: repo,
        includeUnstaged: true,
        commitMode: "commit",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      ok: boolean;
      summary: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        currentStep?: string;
        pendingApproval?: unknown;
      };
      tools: Array<{ name: string }>;
    };
    expect(body.ok).toBe(false);
    expect(body.workflowState.status).toBe("blocked");
    expect(body.workflowState.workflowKind).toBe("git");
    expect(body.workflowState.workflowPhase).toBe("merge_conflict");
    expect(body.workflowState.currentStep).toContain("unresolved conflicts");
    expect(body.summary).toContain("app.config");
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.tools.map((tool) => tool.name)).not.toContain("git_add");
  });

  it("creates and completes a structured rebase abort recovery approval", async () => {
    app = await buildApp();
    const { repo, git } = initRepo("cicd-chat-workflow-rebase-abort-");
    createDivergedAppConfig(repo, git, "feature/rebase-conflict");
    git(["checkout", "feature/rebase-conflict"]);
    git(["rebase", "main"], 1);

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: { action: "abort_rebase", repoPath: repo },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      sessionId: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: {
          action: { tool: string; args: Record<string, unknown>; workflow?: unknown };
        };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.workflowKind).toBe("git");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_abort_rebase_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_rebase");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({ action: "abort" });
    expect(body.workflowState.pendingApproval?.action.workflow).toMatchObject({
      kind: "git",
      phase: "abort_rebase",
    });

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${body.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const workflowEvent = events.findLast((entry) => entry.event === "turn.workflow.updated")?.data as
      | { workflow?: { status?: string; workflowKind?: string; workflowPhase?: string } }
      | undefined;
    const done = events.find((entry) => entry.event === "turn.final.completed")?.data as
      | { finalText?: string }
      | undefined;
    expect(workflowEvent?.workflow?.workflowKind).toBe("git");
    expect(workflowEvent?.workflow?.workflowPhase).toBe("rebase_aborted");
    expect(done?.finalText).toContain("rebase was aborted");
  });

  it("creates and completes a structured merge abort recovery approval", async () => {
    app = await buildApp();
    const { repo, git } = initRepo("cicd-chat-workflow-merge-abort-");
    createDivergedAppConfig(repo, git, "feature/merge-conflict");
    git(["checkout", "feature/merge-conflict"]);
    git(["merge", "main"], 1);

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: { action: "abort_merge", repoPath: repo },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      sessionId: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: {
          action: { tool: string; args: Record<string, unknown>; workflow?: unknown };
        };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.workflowKind).toBe("git");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_abort_merge_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_merge");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({ action: "abort" });
    expect(body.workflowState.pendingApproval?.action.workflow).toMatchObject({
      kind: "git",
      phase: "abort_merge",
    });

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${body.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const workflowEvent = events.findLast((entry) => entry.event === "turn.workflow.updated")?.data as
      | { workflow?: { status?: string; workflowKind?: string; workflowPhase?: string } }
      | undefined;
    const done = events.find((entry) => entry.event === "turn.final.completed")?.data as
      | { finalText?: string }
      | undefined;
    expect(workflowEvent?.workflow?.workflowKind).toBe("git");
    expect(workflowEvent?.workflow?.workflowPhase).toBe("merge_aborted");
    expect(done?.finalText).toContain("merge was aborted");
  });

  it("creates and completes a selected conflict-file staging approval", async () => {
    app = await buildApp();
    const { repo, git } = initRepo("cicd-chat-workflow-conflict-stage-");
    fs.writeFileSync(path.join(repo, "unrelated.txt"), "keep\n", "utf8");
    git(["add", "unrelated.txt"]);
    git(["commit", "-m", "chore: add unrelated file"]);
    createDivergedAppConfig(repo, git, "feature/stage-conflict");
    fs.writeFileSync(path.join(repo, "unrelated.txt"), "unrelated local edit\n", "utf8");
    git(["commit", "-am", "feat: main unrelated change"]);
    git(["checkout", "feature/stage-conflict"]);
    git(["merge", "main"], 1);
    fs.writeFileSync(path.join(repo, "app.config"), "resolved\n", "utf8");

    const missingPaths = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: { action: "stage_resolved_conflicts", repoPath: repo },
    });
    expect(missingPaths.statusCode, missingPaths.body).toBe(500);
    expect(missingPaths.body).toContain("At least one conflict file path is required");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "stage_resolved_conflicts",
        repoPath: repo,
        paths: ["app.config"],
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      sessionId: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: {
          action: { tool: string; args: Record<string, unknown>; workflow?: unknown };
        };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.workflowKind).toBe("git");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_stage_conflicts_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_add");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({ paths: ["app.config"] });
    expect(body.workflowState.pendingApproval?.action.workflow).toMatchObject({
      kind: "git",
      phase: "stage_conflicts",
      message: "merge",
    });

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${body.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const workflowEvent = events.findLast((entry) => entry.event === "turn.workflow.updated")?.data as
      | { workflow?: { status?: string; workflowKind?: string; workflowPhase?: string } }
      | undefined;
    const done = events.find((entry) => entry.event === "turn.final.completed")?.data as
      | { finalText?: string }
      | undefined;
    expect(workflowEvent?.workflow?.workflowKind).toBe("git");
    expect(workflowEvent?.workflow?.workflowPhase).toBe("merge_conflicts_staged");
    expect(done?.finalText).toContain("conflict file");
    expect(git(["status", "--porcelain=v1"]).stdout).toContain("M  app.config");
  });

  it("marks a failed approved pull rebase as blocked recovery state", async () => {
    app = await buildApp();
    const { repo, git } = initRemoteRebaseConflictRepo("cicd-chat-workflow-pull-rebase-conflict-");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: { action: "sync_branch_rebase", repoPath: repo, branch: "main" },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      sessionId: string;
      workflowState: {
        status: string;
        pendingApproval?: { action: { tool: string; args: Record<string, unknown> } };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_pull");
    expect(body.workflowState.pendingApproval?.action.args).toMatchObject({
      remote: "origin",
      branch: "main",
      rebase: true,
    });

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${body.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const workflowEvent = events.findLast((entry) => entry.event === "turn.workflow.updated")?.data as
      | { workflow?: { status?: string; workflowKind?: string; workflowPhase?: string; currentStep?: string } }
      | undefined;
    const done = events.find((entry) => entry.event === "turn.final.completed")?.data as
      | { finalText?: string }
      | undefined;
    expect(workflowEvent?.workflow?.status).toBe("blocked");
    expect(workflowEvent?.workflow?.workflowKind).toBe("git");
    expect(workflowEvent?.workflow?.workflowPhase).toBe("rebase_conflict");
    expect(workflowEvent?.workflow?.currentStep).toContain("unresolved conflicts");
    expect(done?.finalText).toContain("unresolved conflicts");
    expect(git(["status", "--porcelain=v1"]).stdout).toContain("UU app.config");
    git(["rebase", "--abort"]);
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
