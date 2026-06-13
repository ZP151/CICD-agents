import { describe, expect, it, afterEach, beforeAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { AzureAuthenticationRequiredError, getSettings, resetSettingsForTests, type TaskHandle } from "@cicd-agent/core";
import { buildApp, workflowActionFailureResponse } from "../src/server.js";

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
    expect(body.workflowState.pendingApproval?.action.args).toEqual({ branch: "main", setUpstream: true });
    expect(body.workflowState.pendingApproval?.action.readiness?.status).toBe("no_upstream");
    expect(body.workflowState.pendingApproval?.action.description).toContain("No upstream branch is configured");
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
    spawnSync("git", ["config", "user.email", "dev-agent@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Dev Agent"], { cwd: repo, encoding: "utf8" });
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
    expect(body.workflowState.pendingApproval?.action.description).toContain("ahead of origin/main by 1 commit");
  });

  it("prepares commit workflow actions as a staged approval instead of a chat prompt", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-commit-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");

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
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: { action: { tool: string; args: Record<string, unknown>; nextHint?: string } };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.workflowKind).toBe("commit");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_stage_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_add");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({ all: true });
    expect(body.workflowState.pendingApproval?.action.nextHint).toContain("generate a concise commit message");
  });

  it("prepares test validation workflow actions as approval proposals", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-validation-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "src.test.ts"), "test('demo', () => expect(true).toBe(true));\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "run_tests",
        repoPath: repo,
        profile: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "",
          adoProject: "",
          adoRepoName: "",
          adoPat: "",
          adoPipelineId: "",
          adoPipelineName: "",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "repositories,pipelines,work-items",
          buildCommand: ".\\scripts\\windows\\pnpm-project.ps1 --filter @cicd-agent/desktop build",
          testCommand: ".\\scripts\\windows\\pnpm-project.ps1 --filter @cicd-agent/desktop test",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: { action: { tool: string; args: Record<string, unknown>; workflow?: unknown; preflight?: unknown } };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.workflowKind).toBe("ci");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_test_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("validation_command");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @cicd-agent/desktop test",
      kind: "test",
    });
    expect(body.workflowState.pendingApproval?.action.workflow).toMatchObject({
      kind: "ci",
      phase: "test",
      message: ".\\scripts\\windows\\pnpm-project.ps1 --filter @cicd-agent/desktop test",
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      kind: "validation",
      status: "ready",
      validationKind: "test",
      commandSource: "profile",
      changedFiles: ["src.test.ts"],
    });
  });

  it("derives focused validation commands from changed package ownership", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-validation-derived-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "dev-agent@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Dev Agent"], { cwd: repo, encoding: "utf8" });
    fs.mkdirSync(path.join(repo, "packages", "core"), { recursive: true });
    fs.writeFileSync(path.join(repo, "packages", "core", "package.json"), JSON.stringify({
      name: "@demo/core",
      scripts: {
        test: "vitest run",
      },
    }), "utf8");
    spawnSync("git", ["add", "packages/core/package.json"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "chore: add package"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "packages", "core", "src.test.ts"), "test('demo', () => expect(true).toBe(true));\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "run_tests",
        repoPath: repo,
        profile: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "",
          adoProject: "",
          adoRepoName: "",
          adoPat: "",
          adoPipelineId: "",
          adoPipelineName: "",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "repositories,pipelines,work-items",
          buildCommand: "",
          testCommand: "",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: { action: { args: Record<string, unknown>; preflight?: Record<string, unknown> } };
      };
    };
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      command: "npm --prefix packages/core run test",
      kind: "test",
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      kind: "validation",
      status: "ready",
      validationKind: "test",
      commandSource: "derived",
      command: "npm --prefix packages/core run test",
      changedFiles: ["packages/core/src.test.ts"],
      changedFileCount: 1,
      selectedScript: "test",
      packageRoots: ["packages/core"],
      selectionReason: "derived from packages/core/package.json script test",
    });
  });

  it("derives multi-package pnpm validation commands from changed workspace packages", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-validation-derived-multi-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "dev-agent@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Dev Agent"], { cwd: repo, encoding: "utf8" });
    fs.mkdirSync(path.join(repo, "packages", "core"), { recursive: true });
    fs.mkdirSync(path.join(repo, "apps", "desktop"), { recursive: true });
    fs.mkdirSync(path.join(repo, "scripts", "windows"), { recursive: true });
    fs.writeFileSync(path.join(repo, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n  - apps/*\n", "utf8");
    fs.writeFileSync(path.join(repo, "scripts", "windows", "pnpm-project.ps1"), "# test wrapper\n", "utf8");
    fs.writeFileSync(path.join(repo, "packages", "core", "package.json"), JSON.stringify({
      name: "@demo/core",
      scripts: {
        test: "vitest run",
      },
    }), "utf8");
    fs.writeFileSync(path.join(repo, "apps", "desktop", "package.json"), JSON.stringify({
      name: "@demo/desktop",
      scripts: {
        test: "vitest run",
      },
    }), "utf8");
    spawnSync("git", ["add", "pnpm-workspace.yaml", "scripts/windows/pnpm-project.ps1", "packages/core/package.json", "apps/desktop/package.json"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "chore: add workspace packages"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "packages", "core", "src.test.ts"), "test('core', () => expect(true).toBe(true));\n", "utf8");
    fs.writeFileSync(path.join(repo, "apps", "desktop", "ui.test.ts"), "test('desktop', () => expect(true).toBe(true));\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "run_tests",
        repoPath: repo,
        profile: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "",
          adoProject: "",
          adoRepoName: "",
          adoPat: "",
          adoPipelineId: "",
          adoPipelineName: "",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "repositories,pipelines,work-items",
          buildCommand: "",
          testCommand: "",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: { action: { args: Record<string, unknown>; preflight?: Record<string, unknown> } };
      };
    };
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/desktop --filter @demo/core test",
      kind: "test",
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      kind: "validation",
      status: "ready",
      validationKind: "test",
      commandSource: "derived",
      command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/desktop --filter @demo/core test",
      changedFileCount: 2,
      selectedScript: "test",
      packageFilters: ["@demo/desktop", "@demo/core"],
      packageRoots: ["apps/desktop", "packages/core"],
      selectionReason: "derived from 2 changed packages using script test",
    });
    expect(body.workflowState.pendingApproval?.action.preflight?.changedFiles).toEqual(expect.arrayContaining([
      "apps/desktop/ui.test.ts",
      "packages/core/src.test.ts",
    ]));
  });

  it("uses focused rerun candidates from the latest matching validation artifact", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-validation-artifact-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "src.test.ts"), "test('demo', () => expect(true).toBe(false));\n", "utf8");
    const sessionId = "session-focused-validation-rerun";
    const storePath = path.join(getSettings().dataDir, "chat-history.json");
    const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, "utf8")) as Record<string, unknown> : {};
    store[sessionId] = {
      id: sessionId,
      createdAt: Date.now(),
      repoPath: repo,
      messages: [],
      bubbles: [{
        role: "assistant",
        content: "Test validation failed.",
        timestamp: Date.now(),
        artifacts: [{
          type: "artifact",
          artifactId: "validation-test-failed-focused",
          title: "Test failure report",
          artifactType: "markdown",
          status: "error",
          content: [
            "# Test Failure Report",
            "",
            "## Recovery Signals",
            "- Framework: vitest",
            "- Failing files: `src.test.ts`",
            "- Candidate rerun: `npm test -- src.test.ts`",
          ].join("\n"),
        }],
      }],
    };
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "run_tests",
        sessionId,
        repoPath: repo,
        profile: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "",
          adoProject: "",
          adoRepoName: "",
          adoPat: "",
          adoPipelineId: "",
          adoPipelineName: "",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "repositories,pipelines,work-items",
          buildCommand: "npm run build",
          testCommand: "npm test",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: { action: { args: Record<string, unknown>; preflight?: Record<string, unknown> } };
      };
    };
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      command: "npm test -- src.test.ts",
      kind: "test",
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      kind: "validation",
      status: "ready",
      validationKind: "test",
      commandSource: "artifact",
      command: "npm test -- src.test.ts",
      selectionReason: "selected from the latest test failure artifact candidate rerun",
      changedFiles: ["src.test.ts"],
    });
  });

  it("ignores validation artifacts that do not match the requested validation kind", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-validation-artifact-kind-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "src.test.ts"), "test('demo', () => expect(true).toBe(false));\n", "utf8");
    const sessionId = "session-validation-kind-mismatch";
    const storePath = path.join(getSettings().dataDir, "chat-history.json");
    const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, "utf8")) as Record<string, unknown> : {};
    store[sessionId] = {
      id: sessionId,
      createdAt: Date.now(),
      repoPath: repo,
      messages: [],
      bubbles: [{
        role: "assistant",
        content: "Test validation failed.",
        timestamp: Date.now(),
        artifacts: [{
          type: "artifact",
          artifactId: "validation-test-failed-focused",
          title: "Test failure report",
          artifactType: "markdown",
          status: "error",
          content: "- Candidate rerun: `npm test -- src.test.ts`",
        }],
      }],
    };
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "run_build",
        sessionId,
        repoPath: repo,
        profile: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "",
          adoProject: "",
          adoRepoName: "",
          adoPat: "",
          adoPipelineId: "",
          adoPipelineName: "",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "repositories,pipelines,work-items",
          buildCommand: "npm run build",
          testCommand: "npm test",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: { action: { args: Record<string, unknown>; preflight?: Record<string, unknown> } };
      };
    };
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      command: "npm run build",
      kind: "build",
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      kind: "validation",
      validationKind: "build",
      commandSource: "profile",
      command: "npm run build",
    });
  });

  it("blocks normal commit workflow actions while a merge conflict is unresolved", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-merge-conflict-"));
    const git = (args: string[], expectedStatus = 0) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      expect(result.status, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(expectedStatus);
    };
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    git(["config", "user.email", "dev-agent@example.test"]);
    git(["config", "user.name", "Dev Agent"]);
    git(["checkout", "-b", "main"]);
    fs.writeFileSync(path.join(repo, "app.config"), "base\n", "utf8");
    git(["add", "app.config"]);
    git(["commit", "-m", "chore: base"]);
    git(["checkout", "-b", "feature/conflict"]);
    fs.writeFileSync(path.join(repo, "app.config"), "feature\n", "utf8");
    git(["commit", "-am", "feat: feature change"]);
    git(["checkout", "main"]);
    fs.writeFileSync(path.join(repo, "app.config"), "main\n", "utf8");
    git(["commit", "-am", "feat: main change"]);
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
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-rebase-abort-"));
    const git = (args: string[], expectedStatus = 0) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      expect(result.status, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(expectedStatus);
    };
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    git(["config", "user.email", "dev-agent@example.test"]);
    git(["config", "user.name", "Dev Agent"]);
    git(["checkout", "-b", "main"]);
    fs.writeFileSync(path.join(repo, "app.config"), "base\n", "utf8");
    git(["add", "app.config"]);
    git(["commit", "-m", "chore: base"]);
    git(["checkout", "-b", "feature/rebase-conflict"]);
    fs.writeFileSync(path.join(repo, "app.config"), "feature\n", "utf8");
    git(["commit", "-am", "feat: feature change"]);
    git(["checkout", "main"]);
    fs.writeFileSync(path.join(repo, "app.config"), "main\n", "utf8");
    git(["commit", "-am", "feat: main change"]);
    git(["checkout", "feature/rebase-conflict"]);
    git(["rebase", "main"], 1);

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "abort_rebase",
        repoPath: repo,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      sessionId: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: { action: { tool: string; args: Record<string, unknown>; workflow?: unknown } };
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
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string } }
      | undefined;
    const done = events.find((entry) => entry.event === "done")?.data as
      | { result?: { usedLlm?: boolean; response?: string } }
      | undefined;
    expect(workflowEvent?.state?.workflowKind).toBe("git");
    expect(workflowEvent?.state?.workflowPhase).toBe("rebase_aborted");
    expect(done?.result?.usedLlm).toBe(false);
    expect(done?.result?.response).toContain("rebase was aborted");
  });

  it("creates and completes a structured merge abort recovery approval", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-merge-abort-"));
    const git = (args: string[], expectedStatus = 0) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      expect(result.status, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(expectedStatus);
    };
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    git(["config", "user.email", "dev-agent@example.test"]);
    git(["config", "user.name", "Dev Agent"]);
    git(["checkout", "-b", "main"]);
    fs.writeFileSync(path.join(repo, "app.config"), "base\n", "utf8");
    git(["add", "app.config"]);
    git(["commit", "-m", "chore: base"]);
    git(["checkout", "-b", "feature/merge-conflict"]);
    fs.writeFileSync(path.join(repo, "app.config"), "feature\n", "utf8");
    git(["commit", "-am", "feat: feature change"]);
    git(["checkout", "main"]);
    fs.writeFileSync(path.join(repo, "app.config"), "main\n", "utf8");
    git(["commit", "-am", "feat: main change"]);
    git(["checkout", "feature/merge-conflict"]);
    git(["merge", "main"], 1);

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "abort_merge",
        repoPath: repo,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      sessionId: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: { action: { tool: string; args: Record<string, unknown>; workflow?: unknown } };
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
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string } }
      | undefined;
    const done = events.find((entry) => entry.event === "done")?.data as
      | { result?: { usedLlm?: boolean; response?: string } }
      | undefined;
    expect(workflowEvent?.state?.workflowKind).toBe("git");
    expect(workflowEvent?.state?.workflowPhase).toBe("merge_aborted");
    expect(done?.result?.usedLlm).toBe(false);
    expect(done?.result?.response).toContain("merge was aborted");
  });

  it("creates and completes a selected conflict-file staging approval", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-conflict-stage-"));
    const git = (args: string[], expectedStatus = 0) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      expect(result.status, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(expectedStatus);
      return result;
    };
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    git(["config", "user.email", "dev-agent@example.test"]);
    git(["config", "user.name", "Dev Agent"]);
    git(["checkout", "-b", "main"]);
    fs.writeFileSync(path.join(repo, "app.config"), "base\n", "utf8");
    fs.writeFileSync(path.join(repo, "unrelated.txt"), "keep\n", "utf8");
    git(["add", "app.config", "unrelated.txt"]);
    git(["commit", "-m", "chore: base"]);
    git(["checkout", "-b", "feature/stage-conflict"]);
    fs.writeFileSync(path.join(repo, "app.config"), "feature\n", "utf8");
    git(["commit", "-am", "feat: feature change"]);
    git(["checkout", "main"]);
    fs.writeFileSync(path.join(repo, "app.config"), "main\n", "utf8");
    fs.writeFileSync(path.join(repo, "unrelated.txt"), "unrelated local edit\n", "utf8");
    git(["commit", "-am", "feat: main change"]);
    git(["checkout", "feature/stage-conflict"]);
    git(["merge", "main"], 1);
    fs.writeFileSync(path.join(repo, "app.config"), "resolved\n", "utf8");

    const missingPaths = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "stage_resolved_conflicts",
        repoPath: repo,
      },
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
        pendingApproval?: { action: { tool: string; args: Record<string, unknown>; workflow?: unknown } };
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
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string } }
      | undefined;
    const done = events.find((entry) => entry.event === "done")?.data as
      | { result?: { usedLlm?: boolean; response?: string } }
      | undefined;
    expect(workflowEvent?.state?.workflowKind).toBe("git");
    expect(workflowEvent?.state?.workflowPhase).toBe("merge_conflicts_staged");
    expect(done?.result?.usedLlm).toBe(false);
    expect(done?.result?.response).toContain("conflict file");
    expect(git(["status", "--porcelain=v1"]).stdout).toContain("M  app.config");
  });

  it("continues structured commit workflow from stage approval to commit approval", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-commit-next-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/demo"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");

    const prepare = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "prepare_commit",
        repoPath: repo,
        includeUnstaged: true,
        commitMode: "commit",
        message: "docs: update readme",
      },
    });
    expect(prepare.statusCode, prepare.body).toBe(200);
    const prepared = prepare.json() as {
      sessionId: string;
      workflowState: { workflowKind?: string; workflowPhase?: string; pendingApproval?: { action: { tool: string; workflow?: unknown } } };
    };
    expect(prepared.workflowState.workflowKind).toBe("commit");
    expect(prepared.workflowState.workflowPhase).toBe("waiting_for_stage_approval");
    expect(prepared.workflowState.pendingApproval?.action.tool).toBe("git_add");
    expect(prepared.workflowState.pendingApproval?.action.workflow).toMatchObject({
      kind: "commit",
      phase: "stage",
      branch: "feature/demo",
      message: "docs: update readme",
    });

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${prepared.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const approval = events.find((entry) => entry.event === "approval_required")?.data as
      | { approval?: { action?: { tool?: string; args?: Record<string, unknown>; workflow?: unknown } } }
      | undefined;
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { workflowKind?: string; workflowPhase?: string } }
      | undefined;
    expect(workflowEvent?.state?.workflowKind).toBe("commit");
    expect(workflowEvent?.state?.workflowPhase).toBe("waiting_for_commit_approval");
    expect(approval?.approval?.action?.tool).toBe("git_commit");
    expect(approval?.approval?.action?.args).toEqual({ message: "docs: update readme" });
    expect(approval?.approval?.action?.workflow).toMatchObject({
      kind: "commit",
      phase: "commit",
      branch: "feature/demo",
      message: "docs: update readme",
      pushAfterCommit: false,
    });
  });

  it("generates a structured commit approval after staging when the commit message is blank", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-commit-generate-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/generated-message"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# generated\n", "utf8");

    const prepare = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "prepare_commit",
        repoPath: repo,
        includeUnstaged: true,
        commitMode: "commit",
      },
    });
    expect(prepare.statusCode, prepare.body).toBe(200);
    const prepared = prepare.json() as {
      sessionId: string;
      workflowState: { workflowPhase?: string; pendingApproval?: { action: { tool: string; nextHint?: string } } };
    };
    expect(prepared.workflowState.workflowPhase).toBe("waiting_for_stage_approval");
    expect(prepared.workflowState.pendingApproval?.action.tool).toBe("git_add");
    expect(prepared.workflowState.pendingApproval?.action.nextHint).toContain("generate a concise commit message");

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${prepared.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const approval = events.find((entry) => entry.event === "approval_required")?.data as
      | { approval?: { action?: { tool?: string; args?: Record<string, unknown>; description?: string; workflow?: unknown } } }
      | undefined;
    expect(approval?.approval?.action?.tool).toBe("git_commit");
    expect(approval?.approval?.action?.args).toEqual({ message: "docs: add readme" });
    expect(approval?.approval?.action?.description).toContain("generated message");
    expect(approval?.approval?.action?.workflow).toMatchObject({
      kind: "commit",
      phase: "commit",
      branch: "feature/generated-message",
      message: "docs: add readme",
      pushAfterCommit: false,
    });
  });

  it("continues structured commit-and-push workflow from commit approval to push approval", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-push-next-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/publish"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "dev-agent@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Dev Agent"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# publish\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });

    const prepare = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "prepare_commit",
        repoPath: repo,
        includeUnstaged: false,
        commitMode: "commit-push",
        message: "docs: publish readme",
      },
    });
    expect(prepare.statusCode, prepare.body).toBe(200);
    const prepared = prepare.json() as {
      sessionId: string;
      workflowState: { workflowKind?: string; workflowPhase?: string; pendingApproval?: { action: { tool: string; args?: Record<string, unknown> } } };
    };
    expect(prepared.workflowState.workflowKind).toBe("commit");
    expect(prepared.workflowState.workflowPhase).toBe("waiting_for_commit_approval");
    expect(prepared.workflowState.pendingApproval?.action.tool).toBe("git_commit");

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${prepared.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const approval = events.find((entry) => entry.event === "approval_required")?.data as
      | { approval?: { action?: { tool?: string; args?: Record<string, unknown>; readiness?: { status?: string; summary?: string }; description?: string } } }
      | undefined;
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { workflowKind?: string; workflowPhase?: string } }
      | undefined;
    expect(workflowEvent?.state?.workflowKind).toBe("commit");
    expect(workflowEvent?.state?.workflowPhase).toBe("waiting_for_push_approval");
    expect(approval?.approval?.action?.tool).toBe("git_push");
    expect(approval?.approval?.action?.args).toEqual({ branch: "feature/publish", setUpstream: true });
    expect(approval?.approval?.action?.readiness?.status).toBe("no_upstream");
    expect(approval?.approval?.action?.description).toContain("No upstream branch is configured");
  });

  it("warns before structured branch checkout when the working tree is dirty", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-checkout-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "main"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "dev-agent@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Dev Agent"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# clean\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: initial"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["branch", "feature/demo"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# dirty\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "checkout_branch",
        repoPath: repo,
        branch: "feature/demo",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: {
          riskLevel: string;
          action: { tool: string; description: string };
        };
      };
      tools: Array<{ name: string }>;
    };
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_checkout");
    expect(body.workflowState.pendingApproval?.riskLevel).toBe("high");
    expect(body.workflowState.pendingApproval?.action.description).toContain("Working tree has 1 pending change");
    expect(body.tools.map((tool) => tool.name)).not.toContain("git_checkout");
  });

  it("does not request approval when structured branch checkout targets the current branch", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-checkout-current-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/current"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "checkout_branch",
        repoPath: repo,
        branch: "feature/current",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: { status: string; pendingApproval?: unknown };
      tools: Array<{ name: string }>;
    };
    expect(body.workflowState.status).toBe("done");
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.tools.map((tool) => tool.name)).not.toContain("git_checkout");
    expect(body.tools.map((tool) => tool.name)).not.toContain("git_switch");
  });

  it("creates a tracking branch proposal when structured checkout targets a remote-only branch", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-checkout-remote-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "main"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "dev-agent@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Dev Agent"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# branch\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: initial"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["update-ref", "refs/remotes/origin/feature/remote-only", "HEAD"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "checkout_branch",
        repoPath: repo,
        branch: "feature/remote-only",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: {
          action: { tool: string; args: Record<string, unknown>; preflight?: { status?: string; remoteBranch?: string; summary?: string } };
        };
      };
      tools: Array<{ name: string }>;
    };
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_switch");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      branch: "feature/remote-only",
      create: true,
      startPoint: "origin/feature/remote-only",
      track: true,
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      status: "remote_only",
      remoteBranch: "origin/feature/remote-only",
    });
    expect(body.workflowState.pendingApproval?.action.preflight?.summary).toContain("tracking origin/feature/remote-only");
    expect(body.tools.map((tool) => tool.name)).not.toContain("git_switch");
  });

  it("does not request approval when structured branch creation targets an existing branch", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-create-existing-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/existing"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "create_branch",
        repoPath: repo,
        branch: "feature/existing",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: { status: string; pendingApproval?: unknown };
      tools: Array<{ name: string }>;
    };
    expect(body.workflowState.status).toBe("done");
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.tools.map((tool) => tool.name)).not.toContain("git_create_branch");
  });

  it("creates a stored approval proposal for structured pull request workflow actions", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-pr-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/pr-flow"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "dev-agent@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Dev Agent"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# pr\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: prepare pr"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "create_pr",
        repoPath: repo,
        branch: "feature/pr-flow",
        targetBranch: "main",
        title: "docs: prepare pr",
        profile: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "cicd-agent",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: {
          riskLevel: string;
          action: {
            tool: string;
            args: Record<string, unknown>;
            preflight?: { kind?: string; status?: string; sourceBranch?: string; targetBranch?: string; summary?: string };
            workflow?: unknown;
          };
        };
      };
      tools: Array<{ name: string }>;
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.workflowKind).toBe("pr");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_create_pr_approval");
    expect(body.workflowState.pendingApproval?.riskLevel).toBe("high");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("ado_create_pr");
    expect(body.workflowState.pendingApproval?.action.args).toMatchObject({
      organization: "https://dev.azure.com/demo-org",
      project: "Agents",
      repository: "cicd-agent",
      source_branch: "feature/pr-flow",
      target_branch: "main",
      title: "docs: prepare pr",
      draft: false,
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      kind: "pr",
      status: "ready",
      sourceBranch: "feature/pr-flow",
      targetBranch: "main",
    });
    expect(body.workflowState.pendingApproval?.action.workflow).toMatchObject({
      kind: "pr",
      phase: "create",
      branch: "feature/pr-flow",
      message: "docs: prepare pr",
    });
    expect(body.workflowState.pendingApproval?.action.preflight?.summary).toContain("Ready to create PR");
    expect(body.tools.map((tool) => tool.name)).not.toContain("ado_create_pr");
  });

  it("warns before structured pull request creation when the working tree is dirty", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-pr-dirty-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/pr-dirty"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "dev-agent@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Dev Agent"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# pr\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: prepare pr"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# dirty pr\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "create_pr",
        repoPath: repo,
        profile: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "cicd-agent",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: {
          riskLevel: string;
          action: { tool: string; preflight?: { status?: string; summary?: string } };
        };
      };
    };
    expect(body.workflowState.pendingApproval?.riskLevel).toBe("high");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("ado_create_pr");
    expect(body.workflowState.pendingApproval?.action.preflight?.status).toBe("dirty_worktree");
    expect(body.workflowState.pendingApproval?.action.preflight?.summary).toContain("Uncommitted changes will not be included");
  });

  it("finishes structured pull request workflow after confirmed ADO create PR succeeds", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-pr-confirm-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/pr-confirm"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "dev-agent@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Dev Agent"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# pr confirm\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "docs: confirm pr"], { cwd: repo, encoding: "utf8" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string"
        ? input
        : typeof (input as { url?: unknown }).url === "string"
          ? String((input as { url: string }).url)
          : String(input);
      if (url.includes("/_apis/git/repositories/cicd-agent/pullrequests?")) {
        return new Response(JSON.stringify({
          pullRequestId: 42,
          status: "active",
          createdBy: { displayName: "Ada" },
        }), { status: 201, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const prepare = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "create_pr",
        repoPath: repo,
        branch: "feature/pr-confirm",
        targetBranch: "main",
        title: "docs: confirm pr",
        profile: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "cicd-agent",
          adoPat: "test-pat",
        },
      },
    });
    expect(prepare.statusCode, prepare.body).toBe(200);
    const prepared = prepare.json() as { sessionId: string };

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${prepared.sessionId}/confirm-action`,
    });

    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const toolEnd = events.find((entry) => entry.event === "tool_end")?.data as
      | { name?: string; ok?: boolean; result?: { pull_request_id?: number; url?: string } }
      | undefined;
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string; currentStep?: string; pendingApproval?: unknown } }
      | undefined;
    const done = events.find((entry) => entry.event === "done")?.data as
      | { result?: { response?: string; usedLlm?: boolean; suggestions?: string[] } }
      | undefined;
    expect(toolEnd).toMatchObject({
      name: "ado_create_pr",
      ok: true,
      result: {
        pull_request_id: 42,
        url: "https://dev.azure.com/demo-org/Agents/_git/cicd-agent/pullrequest/42",
      },
    });
    expect(workflowEvent?.state).toMatchObject({
      status: "done",
      workflowKind: "pr",
      workflowPhase: "created",
      currentStep: "Pull request #42 created",
    });
    expect(workflowEvent?.state?.pendingApproval).toBeUndefined();
    expect(done?.result?.usedLlm).toBe(false);
    expect(done?.result?.response).toContain("Pull request #42 is created");
    expect(done?.result?.suggestions).toEqual(expect.arrayContaining(["Inspect PR insight", "Check policy status"]));
    expect(events.some((entry) => entry.event === "approval_required")).toBe(false);
  });

  it("inspects PR insight through structured workflow actions using the latest active PR by default", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/git/repositories/cicd-agent/pullrequests?")) {
        return new Response(JSON.stringify({
          value: [{
            pullRequestId: 42,
            title: "Improve agent",
            status: "active",
            sourceRefName: "refs/heads/feature/agent",
            targetRefName: "refs/heads/main",
            repository: { name: "cicd-agent" },
            reviewers: [],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42?")) {
        return new Response(JSON.stringify({
          pullRequestId: 42,
          codeReviewId: 420,
          title: "Improve agent",
          description: "",
          status: "active",
          sourceRefName: "refs/heads/feature/agent",
          targetRefName: "refs/heads/main",
          repository: { name: "cicd-agent", project: { id: "project-guid", name: "Agents" } },
          reviewers: [],
          workItemRefs: [],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/threads?")) {
        return new Response(JSON.stringify({
          value: [{ id: 5, status: 1, comments: [{ id: 6, content: "Needs tests" }] }],
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
      if (url.includes("/pullrequests/42/workitems?")) {
        return new Response(JSON.stringify({ value: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/policy/evaluations?")) {
        return new Response(JSON.stringify({
          value: [{
            evaluationId: "policy-1",
            status: "failed",
            configuration: {
              id: 9,
              isBlocking: true,
              settings: { displayName: "Minimum reviewers" },
              type: { displayName: "Reviewer policy" },
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/workitems?")) {
        return new Response(JSON.stringify({
          value: [{ id: "123", url: "https://ado/workItems/123" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/wit/workitems?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 123,
            url: "https://ado/workItems/123",
            fields: {
              "System.WorkItemType": "User Story",
              "System.Title": "Improve agent insight",
              "System.State": "Active",
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/policy/evaluations?")) {
        return new Response(JSON.stringify({
          value: [{
            evaluationId: "policy-1",
            status: "failed",
            configuration: {
              id: 9,
              isBlocking: true,
              settings: { displayName: "Minimum reviewers" },
              type: { displayName: "Reviewer policy" },
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/build/builds?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 77,
            buildNumber: "20260610.1",
            definition: { name: "CI" },
            status: "completed",
            result: "failed",
            url: "https://ado/build/77",
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_pr_insight",
        repoPath: process.cwd(),
        profile: {
          repoPath: process.cwd(),
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "cicd-agent",
          adoPat: "test-pat",
          adoPipelineId: "12",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      summary: string;
      workflowState: { status: string; workflowKind?: string; workflowPhase?: string; completedTools: string[] };
      tools: Array<{ name: string; stdout: string }>;
    };
    expect(body.workflowState).toMatchObject({
      status: "done",
      workflowKind: "pr",
      workflowPhase: "inspected",
    });
    expect(body.workflowState.completedTools).toEqual(expect.arrayContaining([
      "ado_get_pull_request_by_id",
      "ado_list_pull_request_threads",
      "ado_get_pull_request_changes",
      "ado_list_pull_request_policy_evaluations",
    ]));
    expect(body.summary).toContain("PR #42");
    expect(body.summary).toContain("failed/canceled build");
    expect(body.summary).toContain("Blocking builds: #77 20260610.1 CI: failed");
    expect(body.summary).toContain("Policy blockers: Minimum reviewers: failed (blocking)");
    expect(body.summary).toContain("Active threads: #5: Needs tests");
    expect(body.summary).toContain("Info: no linked work items were found.");
    expect(body.tools.find((tool) => tool.name === "ado_get_pull_request_changes")?.stdout).toContain("/src/app.ts");
  });

  it("checks PR policy and linked work items through latest active PR fallback", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/git/repositories/cicd-agent/pullrequests?")) {
        return new Response(JSON.stringify({
          value: [{
            pullRequestId: 42,
            title: "Improve agent",
            status: "active",
            sourceRefName: "refs/heads/feature/agent",
            targetRefName: "refs/heads/main",
            repository: { name: "cicd-agent" },
            reviewers: [],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42?")) {
        return new Response(JSON.stringify({
          pullRequestId: 42,
          codeReviewId: 420,
          title: "Improve agent",
          sourceRefName: "refs/heads/feature/agent",
          targetRefName: "refs/heads/main",
          repository: { name: "cicd-agent", project: { id: "project-guid", name: "Agents" } },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/policy/evaluations?")) {
        return new Response(JSON.stringify({
          value: [{
            evaluationId: "policy-1",
            status: "queued",
            configuration: {
              id: 9,
              isBlocking: true,
              settings: { displayName: "Minimum reviewers" },
              type: { displayName: "Reviewer policy" },
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/42/workitems?")) {
        return new Response(JSON.stringify({
          value: [{ id: "123", url: "https://ado/workItems/123" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/wit/workitems?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 123,
            url: "https://ado/workItems/123",
            fields: {
              "System.WorkItemType": "User Story",
              "System.Title": "Improve agent insight",
              "System.State": "Active",
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });
    const profile = {
      repoPath: process.cwd(),
      defaultBranch: "main",
      targetBranch: "main",
      adoOrgUrl: "https://dev.azure.com/demo-org",
      adoProject: "Agents",
      adoRepoName: "cicd-agent",
      adoPat: "test-pat",
    };

    const policy = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "check_pr_policy",
        repoPath: process.cwd(),
        profile,
      },
    });
    expect(policy.statusCode, policy.body).toBe(200);
    expect(policy.json()).toMatchObject({
      workflowState: { status: "done", workflowKind: "pr", workflowPhase: "policy_checked" },
    });
    expect(policy.json().summary).toContain("1 blocking");

    const workItems = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "list_pr_work_items",
        repoPath: process.cwd(),
        profile,
      },
    });
    expect(workItems.statusCode, workItems.body).toBe(200);
    expect(workItems.json()).toMatchObject({
      workflowState: { status: "done", workflowKind: "pr", workflowPhase: "work_items_listed" },
    });
    expect(workItems.json().summary).toContain("#123 User Story [Active]: Improve agent insight");
  });

  it("returns a clear failed workflow state when PR follow-up actions lack ADO mapping", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_pr_insight",
        repoPath: process.cwd(),
        profile: {
          repoPath: process.cwd(),
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "",
          adoProject: "",
          adoRepoName: "",
          adoPat: "",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(500);
    expect(response.json()).toMatchObject({
      ok: false,
      action: "inspect_pr_insight",
      workflowState: {
        status: "failed",
        currentStep: "Workflow action failed",
      },
    });
    expect(response.json().summary).toContain("Project Link is missing Azure DevOps organization URL, ADO project, ADO repository");
    expect(response.json().summary).toContain("before PR workflow actions can run");
  });

  it("returns structured OAuth diagnostics for PR workflow action auth failures", () => {
    const failure = workflowActionFailureResponse({
      action: "inspect_pr_insight",
      repoPath: process.cwd(),
      draft: false,
      paths: [],
      includeUnstaged: true,
      profile: {
        repoPath: process.cwd(),
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "cicd-agent",
        adoPat: "",
        adoPipelineId: "",
        adoPipelineName: "",
        adoMcpEnabled: false,
        adoMcpCommand: "",
        adoMcpAuthentication: "",
        adoMcpDomains: "repositories,pipelines,work-items",
        buildCommand: "",
        testCommand: "",
      },
    }, new AzureAuthenticationRequiredError(
      "Azure DevOps OAuth token is unavailable for the signed-in account. Sign in again with the account that has Azure DevOps access, then retry Azure DevOps consent.",
    ));

    expect(failure.httpStatus).toBe(401);
    expect(failure.body).toMatchObject({
      ok: false,
      action: "inspect_pr_insight",
      authMode: "oauth",
      authStatus: "oauth_unavailable",
      retryable: true,
      workflowState: {
        status: "failed",
        workflowKind: "pr",
        workflowPhase: "auth_required",
        currentStep: "Azure DevOps OAuth unavailable",
        authMode: "oauth",
        authStatus: "oauth_unavailable",
        retryable: true,
      },
    });
    expect(failure.body.authMessage).toContain("Sign in again with the account that has Azure DevOps access");
    expect(failure.body.authMessage).not.toContain("PAT fallback");
  });

  it("creates a stored approval proposal before linking a work item to a pull request", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/wit/workitems/123?") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ id: 123 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });
    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "link_work_item",
        repoPath: process.cwd(),
        pullRequestId: 42,
        workItemId: 123,
        profile: {
          repoPath: process.cwd(),
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "cicd-agent",
          adoPat: "test-pat",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        status: string;
        pendingApproval?: {
          riskLevel: string;
          action: { tool: string; args: Record<string, unknown> };
        };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.pendingApproval?.riskLevel).toBe("high");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("ado_link_work_item");
    expect(body.workflowState.pendingApproval?.action.args).toMatchObject({
      pull_request_id: 42,
      work_item_id: 123,
      repository: "cicd-agent",
    });

    const prepared = response.json() as { sessionId: string };
    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${prepared.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { status?: string; workflowKind?: string; workflowPhase?: string; currentStep?: string; pendingApproval?: unknown } }
      | undefined;
    const done = events.find((entry) => entry.event === "done")?.data as
      | { result?: { response?: string; usedLlm?: boolean; suggestions?: string[] } }
      | undefined;
    expect(workflowEvent?.state).toMatchObject({
      status: "done",
      workflowKind: "pr",
      workflowPhase: "work_item_linked",
    });
    expect(workflowEvent?.state?.pendingApproval).toBeUndefined();
    expect(done?.result?.usedLlm).toBe(false);
    expect(done?.result?.response).toContain("Work item 123 is linked to pull request #42");
    expect(done?.result?.suggestions).toEqual(expect.arrayContaining(["List linked work items", "Check policy status"]));
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
        signals: {
          fileCount: 4,
          threadCount: 1,
          failedBuildCount: 1,
          workItemCount: 1,
          failedPolicyCount: 1,
          buildBlockers: [{
            id: 77,
            buildNumber: "20260610.1",
            definitionName: "CI",
            status: "completed",
            result: "failed",
            url: "https://ado/build/77",
          }],
          policyBlockers: [{
            id: "policy-1",
            name: "Minimum reviewers",
            typeName: "Reviewer policy",
            status: "failed",
            isBlocking: true,
          }],
          activeThreads: [{
            id: 5,
            status: 1,
            author: "Ada",
            firstComment: "Needs tests",
          }],
          linkedWorkItems: [{
            id: 123,
            type: "User Story",
            title: "Improve agent insight",
            state: "Active",
            url: "https://ado/workItems/123",
          }],
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
        signals: {
          failedPolicyCount: 1,
          policyBlockers: [{
            name: "Minimum reviewers",
            status: "failed",
            isBlocking: true,
          }],
          linkedWorkItems: [{
            id: 123,
            title: "Improve agent insight",
          }],
        },
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
        signals: {
          failedBuildCount: 1,
          failedPolicyCount: 1,
          activeThreads: [{
            id: 5,
            firstComment: "Needs tests",
          }],
        },
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
        signals: {
          buildBlockers: [{
            id: 77,
            result: "failed",
          }],
          policyBlockers: [{
            name: "Minimum reviewers",
            status: "failed",
          }],
        },
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
      if (url.includes("/pullrequests/42/workitems?")) {
        return new Response(JSON.stringify({
          value: [{ id: "123", url: "https://ado/workItems/123" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/wit/workitems?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 123,
            url: "https://ado/workItems/123",
            fields: {
              "System.WorkItemType": "User Story",
              "System.Title": "Improve agent insight",
              "System.State": "Active",
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/policy/evaluations?")) {
        return new Response(JSON.stringify({
          value: [{
            evaluationId: "policy-1",
            status: "failed",
            configuration: {
              id: 9,
              isBlocking: true,
              settings: { displayName: "Minimum reviewers" },
              type: { displayName: "Reviewer policy" },
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/build/builds?")) {
        return new Response(JSON.stringify({
          value: [{
            id: 77,
            buildNumber: "20260610.1",
            definition: { name: "CI" },
            status: "completed",
            result: "failed",
            url: "https://ado/build/77",
          }],
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
      risks: ["1 failed/canceled build(s)", "1 active thread(s)", "1 failed/error policy evaluation(s)"],
      categories: {
        blocking: ["1 failed/canceled build(s)", "1 failed/error policy evaluation(s)"],
        warnings: ["1 active thread(s)"],
      },
      signals: {
        fileCount: 1,
        threadCount: 1,
        failedBuildCount: 1,
        failedPolicyCount: 1,
        workItemCount: 1,
        buildBlockers: [{
          id: 77,
          buildNumber: "20260610.1",
          definitionName: "CI",
          result: "failed",
        }],
        policyBlockers: [{
          id: "policy-1",
          name: "Minimum reviewers",
          status: "failed",
          isBlocking: true,
        }],
        activeThreads: [{
          id: 5,
          author: "Ada",
          firstComment: "Needs test coverage",
        }],
        linkedWorkItems: [{
          id: 123,
          type: "User Story",
          title: "Improve agent insight",
          state: "Active",
        }],
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
