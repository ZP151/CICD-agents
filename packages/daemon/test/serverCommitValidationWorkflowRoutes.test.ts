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

function initRepo(prefix: string): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
  return repo;
}

function commitAll(repo: string, message: string): void {
  spawnSync("git", ["config", "user.email", "mergepilot@example.test"], {
    cwd: repo,
    encoding: "utf8",
  });
  spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["add", "."], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", message], { cwd: repo, encoding: "utf8" });
}

function projectLink(
  repo: string,
  overrides: Partial<{
    buildCommand: string;
    testCommand: string;
  }> = {},
) {
  return {
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
    buildCommand: overrides.buildCommand ?? "",
    testCommand: overrides.testCommand ?? "",
  };
}

describe("daemon commit and validation workflow routes", () => {
  it("inspects staged changes as a read-only workflow action", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-staged-diff-");
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");
    commitAll(repo, "docs: initial");
    fs.appendFileSync(path.join(repo, "README.md"), "staged line\n", "utf8");
    fs.writeFileSync(path.join(repo, "notes.txt"), "unstaged note\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_staged_changes",
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
    expect(body.action).toBe("inspect_staged_changes");
    expect(body.workflowState.status).toBe("done");
    expect(body.workflowState.currentStep).toBe("inspect_staged_changes complete");
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("Changed files: README.md");
    expect(body.summary).not.toContain("notes.txt");
    expect(body.tools.map((tool) => tool.name)).toEqual([
      "git_status",
      "git_dir",
      "git_diff_staged",
      "git_diff_staged_name_only",
    ]);
    expect(body.tools.find((tool) => tool.name === "git_diff_staged")?.command).toBe("git diff --cached --stat");
  });

  it("drafts commit messages as a read-only workflow action", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-draft-message-");
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");
    commitAll(repo, "docs: initial");
    fs.appendFileSync(path.join(repo, "README.md"), "draft line\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "draft_commit_message",
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
    expect(body.action).toBe("draft_commit_message");
    expect(body.workflowState.status).toBe("done");
    expect(body.workflowState.currentStep).toBe("draft_commit_message complete");
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("Suggested commit message: `docs: update documentation`");
    expect(body.tools.map((tool) => tool.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_dir",
      "git_diff",
      "git_diff_name_only",
      "git_diff_staged",
      "git_diff_staged_name_only",
      "git_log",
    ]);
  });

  it("explains change scope as a read-only workflow action", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-change-scope-");
    fs.mkdirSync(path.join(repo, "packages", "daemon", "src"), { recursive: true });
    fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
    fs.writeFileSync(path.join(repo, "packages", "daemon", "src", "server.ts"), "export const value = 1;\n", "utf8");
    fs.writeFileSync(path.join(repo, "docs", "guide.md"), "# Guide\n", "utf8");
    commitAll(repo, "chore: initial");
    fs.appendFileSync(path.join(repo, "packages", "daemon", "src", "server.ts"), "export const next = 2;\n", "utf8");
    fs.appendFileSync(path.join(repo, "docs", "guide.md"), "More docs\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "explain_change_scope",
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
    expect(body.action).toBe("explain_change_scope");
    expect(body.workflowState.status).toBe("done");
    expect(body.workflowState.currentStep).toBe("explain_change_scope complete");
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("Change scope: 2 area(s), 2 file(s).");
    expect(body.summary).toContain("- daemon service: packages/daemon/src/server.ts");
    expect(body.summary).toContain("- documentation: docs/guide.md");
    expect(body.tools.map((tool) => tool.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_dir",
      "git_diff",
      "git_diff_name_only",
      "git_diff_staged",
      "git_diff_staged_name_only",
    ]);
  });

  it("prepares commit workflow actions as a staged approval instead of a chat prompt", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-commit-");
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
        pendingApproval?: {
          action: { tool: string; args: Record<string, unknown>; nextHint?: string };
        };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.workflowKind).toBe("commit");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_stage_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("git_add");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({ all: true });
    expect(body.workflowState.pendingApproval?.action.nextHint).toContain(
      "generate a concise commit message",
    );
  });

  it("prepares test validation workflow actions as approval proposals", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-validation-");
    fs.writeFileSync(
      path.join(repo, "src.test.ts"),
      "test('demo', () => expect(true).toBe(true));\n",
      "utf8",
    );

    const testCommand = ".\\scripts\\windows\\pnpm-project.ps1 --filter @mergepilot/desktop test";
    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "run_tests",
        repoPath: repo,
        projectLink: projectLink(repo, {
          buildCommand: ".\\scripts\\windows\\pnpm-project.ps1 --filter @mergepilot/desktop build",
          testCommand,
        }),
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: {
          action: {
            tool: string;
            args: Record<string, unknown>;
            workflow?: unknown;
            preflight?: unknown;
          };
        };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.workflowKind).toBe("ci");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_test_approval");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("validation_command");
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      command: testCommand,
      kind: "test",
    });
    expect(body.workflowState.pendingApproval?.action.workflow).toMatchObject({
      kind: "ci",
      phase: "test",
      message: testCommand,
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      kind: "validation",
      status: "ready",
      validationKind: "test",
      commandSource: "project_link",
      changedFiles: ["src.test.ts"],
    });
  });

  it("derives focused validation commands from changed package ownership", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-validation-derived-");
    fs.mkdirSync(path.join(repo, "packages", "core"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "packages", "core", "package.json"),
      JSON.stringify({ name: "@demo/core", scripts: { test: "vitest run" } }),
      "utf8",
    );
    commitAll(repo, "chore: add package");
    fs.writeFileSync(
      path.join(repo, "packages", "core", "src.test.ts"),
      "test('demo', () => expect(true).toBe(true));\n",
      "utf8",
    );

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: { action: "run_tests", repoPath: repo, projectLink: projectLink(repo) },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: {
          action: { args: Record<string, unknown>; preflight?: Record<string, unknown> };
        };
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
    const repo = initRepo("cicd-chat-workflow-validation-derived-multi-");
    fs.mkdirSync(path.join(repo, "packages", "core"), { recursive: true });
    fs.mkdirSync(path.join(repo, "apps", "desktop"), { recursive: true });
    fs.mkdirSync(path.join(repo, "scripts", "windows"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n  - apps/*\n",
      "utf8",
    );
    fs.writeFileSync(path.join(repo, "scripts", "windows", "pnpm-project.ps1"), "# test\n");
    fs.writeFileSync(
      path.join(repo, "packages", "core", "package.json"),
      JSON.stringify({ name: "@demo/core", scripts: { test: "vitest run" } }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(repo, "apps", "desktop", "package.json"),
      JSON.stringify({ name: "@demo/desktop", scripts: { test: "vitest run" } }),
      "utf8",
    );
    commitAll(repo, "chore: add workspace packages");
    fs.writeFileSync(path.join(repo, "packages", "core", "src.test.ts"), "test('core');\n");
    fs.writeFileSync(path.join(repo, "apps", "desktop", "ui.test.ts"), "test('ui');\n");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: { action: "run_tests", repoPath: repo, projectLink: projectLink(repo) },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      workflowState: {
        pendingApproval?: {
          action: { args: Record<string, unknown>; preflight?: Record<string, unknown> };
        };
      };
    };
    const command =
      ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/desktop --filter @demo/core test";
    expect(body.workflowState.pendingApproval?.action.args).toEqual({
      command,
      kind: "test",
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      kind: "validation",
      status: "ready",
      validationKind: "test",
      commandSource: "derived",
      command,
      changedFileCount: 2,
      selectedScript: "test",
      packageFilters: ["@demo/desktop", "@demo/core"],
      packageRoots: ["apps/desktop", "packages/core"],
      selectionReason: "derived from 2 changed packages using script test",
    });
    expect(body.workflowState.pendingApproval?.action.preflight?.changedFiles).toEqual(
      expect.arrayContaining(["apps/desktop/ui.test.ts", "packages/core/src.test.ts"]),
    );
  });

});
