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

describe("daemon branch workflow routes", () => {
  it("warns before structured branch checkout when the working tree is dirty", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-checkout-"));
    initCommittedRepo(repo, "main", "# clean\n");
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
    expect(body.workflowState.pendingApproval?.action.description).toContain(
      "Working tree has 1 pending change",
    );
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
        sessionId: null,
        branch: "feature/current",
        projectLink: null,
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
    initCommittedRepo(repo, "main", "# branch\n");
    spawnSync("git", ["update-ref", "refs/remotes/origin/feature/remote-only", "HEAD"], {
      cwd: repo,
      encoding: "utf8",
    });

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
          action: {
            tool: string;
            args: Record<string, unknown>;
            preflight?: { status?: string; remoteBranch?: string; summary?: string };
          };
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
    expect(body.workflowState.pendingApproval?.action.preflight?.summary).toContain(
      "tracking origin/feature/remote-only",
    );
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
});

function initCommittedRepo(repo: string, branch: string, readme: string) {
  spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["checkout", "-b", branch], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "mergepilot@example.test"], {
    cwd: repo,
    encoding: "utf8",
  });
  spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
  fs.writeFileSync(path.join(repo, "README.md"), readme, "utf8");
  spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "docs: initial"], { cwd: repo, encoding: "utf8" });
}
