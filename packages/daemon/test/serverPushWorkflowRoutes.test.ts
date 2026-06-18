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
});
