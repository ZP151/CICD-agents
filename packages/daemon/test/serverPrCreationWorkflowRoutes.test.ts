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

describe("daemon PR creation workflow routes", () => {
  it("creates a stored approval proposal for structured pull request workflow actions", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-pr-"));
    initCommittedRepo(repo, "feature/pr-flow", "# pr\n", "docs: prepare pr");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "create_pr",
        repoPath: repo,
        branch: "feature/pr-flow",
        targetBranch: "main",
        title: "docs: prepare pr",
        projectLink: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "mergepilot",
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
            preflight?: {
              kind?: string;
              status?: string;
              sourceBranch?: string;
              targetBranch?: string;
              summary?: string;
            };
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
      repository: "mergepilot",
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
    expect(body.workflowState.pendingApproval?.action.preflight?.summary).toContain(
      "Ready to create PR",
    );
    expect(body.tools.map((tool) => tool.name)).not.toContain("ado_create_pr");
  });

  it("warns before structured pull request creation when the working tree is dirty", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-pr-dirty-"));
    initCommittedRepo(repo, "feature/pr-dirty", "# pr\n", "docs: prepare pr");
    fs.writeFileSync(path.join(repo, "README.md"), "# dirty pr\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "create_pr",
        repoPath: repo,
        projectLink: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "mergepilot",
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
    expect(body.workflowState.pendingApproval?.action.preflight?.summary).toContain(
      "Uncommitted changes will not be included",
    );
  });

  it("finishes structured pull request workflow after confirmed ADO create PR succeeds", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-pr-confirm-"));
    initCommittedRepo(repo, "feature/pr-confirm", "# pr confirm\n", "docs: confirm pr");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string"
          ? input
          : typeof (input as { url?: unknown }).url === "string"
            ? String((input as { url: string }).url)
            : String(input);
      if (url.includes("/_apis/git/repositories/mergepilot/pullrequests?")) {
        return new Response(
          JSON.stringify({
            pullRequestId: 42,
            status: "active",
            createdBy: { displayName: "Ada" },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
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
        projectLink: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "mergepilot",
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
    const toolEnd = events.find((entry) => entry.event === "turn.tool.completed")?.data as
      | { name?: string; ok?: boolean; summary?: string }
      | undefined;
    const workflowEvent = events.findLast((entry) => entry.event === "turn.workflow.updated")?.data as
      | {
          workflow?: {
            status?: string;
            workflowKind?: string;
            workflowPhase?: string;
            currentStep?: string;
            pendingApproval?: unknown;
          };
        }
      | undefined;
    const done = events.find((entry) => entry.event === "turn.final.completed")?.data as
      | { finalText?: string }
      | undefined;
    expect(toolEnd).toMatchObject({
      name: "ado_create_pr",
      ok: true,
    });
    expect(workflowEvent?.workflow).toMatchObject({
      status: "done",
      workflowKind: "pr",
      workflowPhase: "created",
      currentStep: "Pull request #42 created",
    });
    expect(workflowEvent?.workflow?.pendingApproval).toBeUndefined();
    expect(done?.finalText).toContain("Pull request #42 is created");
    expect(events.some((entry) => entry.event === "approval_required")).toBe(false);
  });
});

function initCommittedRepo(repo: string, branch: string, readme: string, message: string) {
  spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["checkout", "-b", branch], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "mergepilot@example.test"], {
    cwd: repo,
    encoding: "utf8",
  });
  spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
  fs.writeFileSync(path.join(repo, "README.md"), readme, "utf8");
  spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", message], { cwd: repo, encoding: "utf8" });
}

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
