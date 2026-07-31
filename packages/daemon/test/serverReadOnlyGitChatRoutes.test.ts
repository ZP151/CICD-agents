import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-readonly-git-chat-"));
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

describe("daemon read-only Git chat routing", () => {
  it("routes current-branch questions to local branch inspection without fetch approval", async () => {
    app = await buildApp();
    const repo = initRepo("mergepilot-readonly-branch-");

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "What's on this branch? Reply briefly. Do not fetch or modify files.",
        repoPath: repo,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    expect(events.some((entry) => entry.event === "approval_required" || entry.event === "approval.required")).toBe(false);
    expect(response.body).not.toContain("git_fetch");
    expect(response.body).toContain("git_current_branch");
    expect(response.body).toContain("git_status");
    const finalWorkflow = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string; completedTools?: string[] } }
      | undefined;
    expect(finalWorkflow?.state).toMatchObject({
      status: "done",
      workflowKind: "git",
      workflowPhase: "refresh_branch",
    });
    expect(finalWorkflow?.state?.completedTools).toEqual(
      expect.arrayContaining(["git_current_branch", "git_status"]),
    );

    const turnStartedIndex = events.findIndex((entry) => entry.event === "turn.started");
    const preparingIndex = events.findIndex(
      (entry) => entry.event === "progress" && (entry.data as { message?: string }).message === "Preparing conversation",
    );
    const turnCompletedIndex = events.findIndex((entry) => entry.event === "turn.completed");
    expect(turnStartedIndex).toBeGreaterThanOrEqual(0);
    expect(preparingIndex).toBeGreaterThan(turnStartedIndex);
    expect(turnCompletedIndex).toBeGreaterThan(preparingIndex);
    const started = events[turnStartedIndex]?.data as { turnId?: string; sequence?: number };
    const completed = events[turnCompletedIndex]?.data as { turnId?: string; status?: string };
    expect(started.turnId).toMatch(/^turn_/);
    expect(started.sequence).toBe(0);
    expect(completed).toMatchObject({ turnId: started.turnId, status: "completed" });
  });

  it("routes review-only change requests to local change inspection without staging approval", async () => {
    app = await buildApp();
    const repo = initRepo("mergepilot-readonly-changes-");
    fs.appendFileSync(path.join(repo, "README.md"), "changed line\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Review my changes. Do not stage, commit, push, or fetch remote state.",
        repoPath: repo,
        projectLink: null,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    expect(events.some((entry) => entry.event === "approval_required" || entry.event === "approval.required")).toBe(false);
    expect(response.body).not.toContain("git_fetch");
    expect(response.body).not.toContain("git_add");
    expect(response.body).not.toContain("git_commit");
    expect(response.body).toContain("git_diff");
    expect(response.body).toContain("README.md");
    const finalWorkflow = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string; completedTools?: string[] } }
      | undefined;
    expect(finalWorkflow?.state).toMatchObject({
      status: "done",
      workflowKind: "git",
      workflowPhase: "inspect_changes",
    });
    expect(finalWorkflow?.state?.completedTools).toEqual(
      expect.arrayContaining(["git_status", "git_diff", "git_diff_name_only"]),
    );
  });

  it("routes staged-scope questions to staged diff inspection without commit approval", async () => {
    app = await buildApp();
    const repo = initRepo("mergepilot-readonly-staged-");
    fs.appendFileSync(path.join(repo, "README.md"), "staged line\n", "utf8");
    fs.writeFileSync(path.join(repo, "notes.txt"), "unstaged note\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "What will be committed? Read-only only. Do not stage, commit, or push.",
        repoPath: repo,
        projectLink: null,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    expect(events.some((entry) => entry.event === "approval_required" || entry.event === "approval.required")).toBe(false);
    expect(response.body).not.toContain("git_add");
    expect(response.body).not.toContain("git_commit");
    expect(response.body).toContain("git_diff_staged");
    expect(response.body).toContain("README.md");
    const finalWorkflow = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string; completedTools?: string[] } }
      | undefined;
    expect(finalWorkflow?.state).toMatchObject({
      status: "done",
      workflowKind: "git",
      workflowPhase: "inspect_staged_changes",
    });
    expect(finalWorkflow?.state?.completedTools).toEqual(
      expect.arrayContaining(["git_status", "git_diff_staged", "git_diff_staged_name_only"]),
    );
  });

  it("routes remote-target questions to redacted read-only remote inspection", async () => {
    app = await buildApp();
    const repo = initRepo("mergepilot-readonly-remote-");
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-readonly-remote-bare-"));
    const currentBranch = spawnSync("git", ["branch", "--show-current"], { cwd: repo, encoding: "utf8" }).stdout.trim();
    spawnSync("git", ["init", "--bare"], { cwd: remote, encoding: "utf8" });
    spawnSync("git", ["remote", "add", "origin", remote], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["push", "-u", "origin", currentBranch], { cwd: repo, encoding: "utf8" });
    spawnSync("git", [
      "remote",
      "set-url",
      "origin",
      "https://mergepilot:supersecrettoken@example.visualstudio.com/Claims/_git/Repo",
    ], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Where will this push go? Read-only only. Do not fetch, push, stage, or commit.",
        repoPath: repo,
        projectLink: null,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    expect(events.some((entry) => entry.event === "approval_required" || entry.event === "approval.required")).toBe(false);
    expect(response.body).toContain("inspect_remote_target");
    expect(response.body).toContain("git_remote");
    expect(response.body).toContain("https://***REDACTED***@example.visualstudio.com/Claims/_git/Repo");
    expect(response.body).not.toContain("supersecrettoken");
    expect(response.body).not.toContain("mergepilot:supersecrettoken");
    const finalWorkflow = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string; completedTools?: string[] } }
      | undefined;
    expect(finalWorkflow?.state).toMatchObject({
      status: "done",
      workflowKind: "git",
      workflowPhase: "inspect_remote_target",
    });
  });
});

function initRepo(prefix: string): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "mergepilot@example.test"], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
  fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");
  spawnSync("git", ["add", "."], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "docs: initial"], { cwd: repo, encoding: "utf8" });
  return repo;
}

function parseSse(body: string): Array<{ event: string; data: unknown }> {
  return body
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\n/);
      const event = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length) ?? "message";
      const dataLine = lines.find((line) => line.startsWith("data: "));
      return {
        event,
        data: dataLine ? JSON.parse(dataLine.slice("data: ".length)) : undefined,
      };
    });
}
