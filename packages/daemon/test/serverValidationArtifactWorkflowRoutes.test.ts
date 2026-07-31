import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getSettings, resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-validation-artifacts-"));
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

function projectLink(repo: string) {
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
    buildCommand: "npm run build",
    testCommand: "npm test",
  };
}

function writeArtifactSession(
  sessionId: string,
  repo: string,
  artifacts: Array<Record<string, unknown>>,
): void {
  const storePath = path.join(getSettings().dataDir, "chat-history.json");
  const store = fs.existsSync(storePath)
    ? (JSON.parse(fs.readFileSync(storePath, "utf8")) as Record<string, unknown>)
    : {};
  store[sessionId] = {
    id: sessionId,
    createdAt: Date.now(),
    repoPath: repo,
    messages: [],
    bubbles: [
      {
        role: "assistant",
        content: "Workflow evidence is available.",
        timestamp: Date.now(),
        artifacts,
      },
    ],
  };
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function writeValidationArtifactSession(
  sessionId: string,
  repo: string,
  content: string,
): void {
  writeArtifactSession(sessionId, repo, [
    {
      type: "artifact",
      artifactId: "validation-test-failed-focused",
      title: "Test failure report",
      artifactType: "markdown",
      status: "error",
      content,
    },
  ]);
}

describe("daemon validation artifact workflow routes", () => {
  it("inspects the latest validation failure artifact without creating approval", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-validation-inspect-");
    const sessionId = "session-validation-failure-inspect";
    writeValidationArtifactSession(
      sessionId,
      repo,
      [
        "# Test Failure Report",
        "",
        "## Recovery Signals",
        "- Framework: vitest",
        "- Failing files: `src/app.test.ts`",
        "- Candidate rerun: `npm test -- src/app.test.ts`",
        "",
        "FAIL src/app.test.ts > renders status",
        "AssertionError: expected true to be false",
      ].join("\n"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_validation_failure",
        sessionId,
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
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: unknown;
      };
      tools: Array<{ name: string; ok: boolean; stdout: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("inspect_validation_failure");
    expect(body.workflowState).toMatchObject({
      status: "done",
      workflowKind: "ci",
      workflowPhase: "validation_failure_inspected",
    });
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("Validation failure artifact: Test failure report");
    expect(body.summary).toContain("Framework: vitest");
    expect(body.summary).toContain("Failing files: src/app.test.ts");
    expect(body.summary).toContain("Candidate rerun: npm test -- src/app.test.ts");
    expect(body.summary).toContain("AssertionError: expected true to be false");
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({ name: "validation_failure_artifact", ok: true });
  });

  it("inspects combined CI recovery context from validation and pipeline artifacts", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-ci-recovery-context-");
    const sessionId = "session-ci-recovery-context";
    writeArtifactSession(sessionId, repo, [
      {
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
          "- Failing files: `src/app.test.ts`",
          "- Candidate rerun: `npm test -- src/app.test.ts`",
          "",
          "FAIL src/app.test.ts > renders status",
          "AssertionError: expected true to be false",
        ].join("\n"),
      },
      {
        type: "artifact",
        artifactId: "pipeline-12-run-77-failed",
        title: "Pipeline #12 run #77 failure",
        artifactType: "markdown",
        status: "error",
        content: [
          "# Pipeline #12 failure",
          "",
          "## Failed timeline records",
          "- Build job: failed",
          "- Unit tests: failed",
          "",
          "## Log excerpts",
          "",
          "```text",
          "AssertionError: expected true to be false",
          "npm test exited with code 1",
          "```",
          "",
          "## Candidate next actions",
          "- Analyze pipeline failure",
          "- Run local validation",
        ].join("\n"),
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_ci_recovery_context",
        sessionId,
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
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: unknown;
      };
      tools: Array<{ name: string; ok: boolean; stdout: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("inspect_ci_recovery_context");
    expect(body.workflowState).toMatchObject({
      status: "done",
      workflowKind: "ci",
      workflowPhase: "ci_recovery_context_inspected",
    });
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("Validation failure artifact: Test failure report");
    expect(body.summary).toContain("Pipeline failure artifact: Pipeline #12 run #77 failure");
    expect(body.summary).toContain("Failed timeline records:");
    expect(body.summary).toContain("Build job: failed");
    expect(body.summary).toContain("Log excerpts:");
    expect(body.summary).toContain("npm test exited with code 1");
    expect(body.summary).toContain("Suggested structured checks:");
    expect(body.tools).toHaveLength(2);
    expect(body.tools.map((tool) => [tool.name, tool.ok])).toEqual([
      ["validation_failure_artifact", true],
      ["pipeline_failure_artifact", true],
    ]);
  });

  it("inspects saved source context without replaying a prompt", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-source-context-");
    const sessionId = "session-source-context";
    const storePath = path.join(getSettings().dataDir, "chat-history.json");
    const store = {
      [sessionId]: {
        id: sessionId,
        createdAt: Date.now(),
        repoPath: repo,
        messages: [],
        bubbles: [
          {
            role: "assistant",
            content: "Project structure explained with sources.",
            timestamp: Date.now(),
            sources: [
              {
                type: "source_document",
                sourceId: "src-1",
                title: "Project.cs",
                file: "BotToSharePoint/Models/Project.cs",
                line: 12,
                snippet: "public class Project",
              },
              {
                type: "source_url",
                sourceId: "docs-1",
                title: "Azure DevOps REST docs",
                url: "https://learn.microsoft.com/azure/devops/integrate/",
                domain: "learn.microsoft.com",
                snippet: "Use REST APIs to integrate with Azure DevOps.",
              },
            ],
          },
        ],
      },
    };
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_source_context",
        sessionId,
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
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: unknown;
      };
      tools: Array<{ name: string; ok: boolean; stdout: string; command: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("inspect_source_context");
    expect(body.workflowState).toMatchObject({
      status: "done",
      workflowKind: "git",
      workflowPhase: "source_context_inspected",
    });
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("Source context: 2 reference(s).");
    expect(body.summary).toContain("BotToSharePoint/Models/Project.cs:12");
    expect(body.summary).toContain("public class Project");
    expect(body.summary).toContain("learn.microsoft.com: Azure DevOps REST docs");
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({
      name: "source_context",
      command: "internal source_context",
      ok: true,
    });
    expect(body.tools[0]?.stdout).toContain("Referenced files:");
  });

  it("inspects repository architecture context without replaying a prompt", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-architecture-context-");
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "README.md"),
      "# Demo API\n\nA small service with HTTP entry points and domain models.\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(repo, "src", "server.ts"),
      "export function startServer() { return 'ready'; }\n",
      "utf8",
    );

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_architecture_context",
        sessionId: "session-architecture-context",
        repoPath: repo,
        projectLink: projectLink(repo),
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      ok: boolean;
      action: string;
      summary: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: unknown;
      };
      tools: Array<{ name: string; ok: boolean; stdout: string; command: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("inspect_architecture_context");
    expect(body.workflowState).toMatchObject({
      status: "done",
      workflowKind: "git",
      workflowPhase: "architecture_context_inspected",
    });
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("Architecture context prepared.");
    expect(body.summary).toContain("Project Link settings:");
    expect(body.summary).toContain("Build command: npm run build");
    expect(body.summary).not.toContain("# Test project");
    expect(body.summary).toContain("Test command: npm test");
    expect(body.summary).toContain("Project structure signals:");
    expect(body.summary).toContain("README.md");
    expect(body.summary).toContain("src/server.ts");
    expect(body.summary).toContain("Inspectable sources:");
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({
      name: "repository_context",
      command: "internal repository_context",
      ok: true,
    });
  });

  it("inspects Azure DevOps auth context without replaying a prompt", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-ado-auth-context-");
    const link = {
      ...projectLink(repo),
      adoOrgUrl: "https://example.visualstudio.com/",
      adoProject: "DemoProject",
      adoRepoName: "DemoRepo",
      adoPat: "inline-pat",
    };

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_ado_auth_context",
        sessionId: "session-ado-auth-context",
        repoPath: repo,
        projectLink: link,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      ok: boolean;
      action: string;
      summary: string;
      authStatus?: string;
      authMode?: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        authStatus?: string;
        authMode?: string;
      };
      tools: Array<{ name: string; ok: boolean; stdout: string; command: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("inspect_ado_auth_context");
    expect(body.authStatus).toBe("ok");
    expect(body.authMode).toBe("pat");
    expect(body.workflowState).toMatchObject({
      status: "done",
      workflowKind: "ado",
      workflowPhase: "auth_context_ready",
      authStatus: "ok",
      authMode: "pat",
    });
    expect(body.summary).toContain("Auth mode: PAT");
    expect(body.summary).toContain("Credential state: available");
    expect(body.summary).toContain("Repository: DemoRepo");
    expect(body.tools[0]).toMatchObject({
      name: "ado_auth_context",
      command: "internal ado_auth_context",
      ok: true,
    });
  });

  it("reports incomplete Project Link mapping in Azure DevOps auth context", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-ado-auth-context-missing-");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_ado_auth_context",
        sessionId: "session-ado-auth-context-missing",
        repoPath: repo,
        projectLink: {
          ...projectLink(repo),
          adoPat: "inline-pat",
        },
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
      };
      tools: Array<{ name: string; ok: boolean; returncode: number }>;
    };
    expect(body.ok).toBe(false);
    expect(body.workflowState).toMatchObject({
      status: "failed",
      workflowKind: "ado",
      workflowPhase: "auth_context_missing",
    });
    expect(body.summary).toContain("Project Link mapping is incomplete");
    expect(body.tools[0]).toMatchObject({
      name: "ado_auth_context",
      ok: false,
      returncode: 1,
    });
  });

  it("inspects PR plan context without creating push or PR approval", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-pr-plan-context-");
    spawnSync("git", ["config", "user.email", "mergepilot@example.test"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "MergePilot Test"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# Demo\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "Initial commit"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "feature.txt"), "pending work\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_pr_plan_context",
        sessionId: "session-pr-plan-context",
        repoPath: repo,
        projectLink: {
          ...projectLink(repo),
          adoOrgUrl: "https://example.visualstudio.com/",
          adoProject: "DemoProject",
          adoRepoName: "DemoRepo",
          targetBranch: "main",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      ok: boolean;
      action: string;
      summary: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: unknown;
      };
      tools: Array<{ name: string; ok: boolean; command: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("inspect_pr_plan_context");
    expect(body.workflowState).toMatchObject({
      status: "done",
      workflowKind: "pr",
      workflowPhase: "pr_plan_context_inspected",
    });
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.summary).toContain("PR plan context:");
    expect(body.summary).toContain("Target branch: main");
    expect(body.summary).toContain("Azure DevOps target: DemoProject/DemoRepo");
    expect(body.summary).toContain("Working tree:");
    expect(body.summary).toContain("Suggested sequence:");
    expect(body.summary).toContain("Use explicit approval cards");
    expect(body.tools.map((tool) => tool.name)).toContain("git_current_branch");
    expect(body.tools.map((tool) => tool.name)).toContain("git_status");
  });

  it("uses focused rerun candidates from the latest matching validation artifact", async () => {
    app = await buildApp();
    const repo = initRepo("cicd-chat-workflow-validation-artifact-");
    fs.writeFileSync(path.join(repo, "src.test.ts"), "test('demo');\n", "utf8");
    const sessionId = "session-focused-validation-rerun";
    writeValidationArtifactSession(
      sessionId,
      repo,
      [
        "# Test Failure Report",
        "",
        "## Recovery Signals",
        "- Framework: vitest",
        "- Failing files: `src.test.ts`",
        "- Candidate rerun: `npm test -- src.test.ts`",
      ].join("\n"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "run_tests",
        sessionId,
        repoPath: repo,
        projectLink: projectLink(repo),
      },
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
    const repo = initRepo("cicd-chat-workflow-validation-artifact-kind-");
    fs.writeFileSync(path.join(repo, "src.test.ts"), "test('demo');\n", "utf8");
    const sessionId = "session-validation-kind-mismatch";
    writeValidationArtifactSession(
      sessionId,
      repo,
      "- Candidate rerun: `npm test -- src.test.ts`",
    );

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "run_build",
        sessionId,
        repoPath: repo,
        projectLink: projectLink(repo),
      },
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
      command: "npm run build",
      kind: "build",
    });
    expect(body.workflowState.pendingApproval?.action.preflight).toMatchObject({
      kind: "validation",
      validationKind: "build",
      commandSource: "project_link",
      command: "npm run build",
    });
  });
});
