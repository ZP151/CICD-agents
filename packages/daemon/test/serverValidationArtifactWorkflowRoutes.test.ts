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

function writeValidationArtifactSession(
  sessionId: string,
  repo: string,
  content: string,
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
        content: "Test validation failed.",
        timestamp: Date.now(),
        artifacts: [
          {
            type: "artifact",
            artifactId: "validation-test-failed-focused",
            title: "Test failure report",
            artifactType: "markdown",
            status: "error",
            content,
          },
        ],
      },
    ],
  };
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

describe("daemon validation artifact workflow routes", () => {
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
