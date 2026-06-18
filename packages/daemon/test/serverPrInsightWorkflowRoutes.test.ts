import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-pr-insight-workflow-"));
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

function requestUrl(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Request) return input.url;
  return String(input);
}

function projectLink() {
  return {
    repoPath: process.cwd(),
    defaultBranch: "main",
    targetBranch: "main",
    adoOrgUrl: "https://dev.azure.com/demo-org",
    adoProject: "Agents",
    adoRepoName: "mergepilot",
    adoPat: "test-pat",
    adoPipelineId: "12",
  };
}

describe("daemon PR insight workflow routes", () => {
  it("inspects PR insight through structured workflow actions using the latest active PR by default", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("/_apis/git/repositories/mergepilot/pullrequests?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                pullRequestId: 42,
                title: "Improve agent",
                status: "active",
                sourceRefName: "refs/heads/feature/agent",
                targetRefName: "refs/heads/main",
                repository: { name: "mergepilot" },
                reviewers: [],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42?")) {
        return new Response(
          JSON.stringify({
            pullRequestId: 42,
            codeReviewId: 420,
            title: "Improve agent",
            description: "",
            status: "active",
            sourceRefName: "refs/heads/feature/agent",
            targetRefName: "refs/heads/main",
            repository: { name: "mergepilot", project: { id: "project-guid", name: "Agents" } },
            reviewers: [],
            workItemRefs: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42/threads?")) {
        return new Response(
          JSON.stringify({
            value: [{ id: 5, status: 1, comments: [{ id: 6, content: "Needs tests" }] }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42/iterations?")) {
        return new Response(
          JSON.stringify({
            value: [{ id: 3, sourceRefCommit: { commitId: "source-commit" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42/iterations/3/changes?")) {
        return new Response(
          JSON.stringify({
            changeEntries: [
              {
                changeId: 10,
                changeType: "edit",
                item: { path: "/src/app.ts", gitObjectType: "blob", commitId: "source-commit" },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42/workitems?")) {
        return new Response(JSON.stringify({ value: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/_apis/policy/evaluations?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                evaluationId: "policy-1",
                status: "failed",
                configuration: {
                  id: 9,
                  isBlocking: true,
                  settings: { displayName: "Minimum reviewers" },
                  type: { displayName: "Reviewer policy" },
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/builds?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 77,
                buildNumber: "20260610.1",
                definition: { name: "CI" },
                status: "completed",
                result: "failed",
                url: "https://ado/build/77",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_pr_insight",
        repoPath: process.cwd(),
        projectLink: projectLink(),
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      summary: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        completedTools: string[];
      };
      tools: Array<{ name: string; stdout: string }>;
    };
    expect(body.workflowState).toMatchObject({
      status: "done",
      workflowKind: "pr",
      workflowPhase: "inspected",
    });
    expect(body.workflowState.completedTools).toEqual(
      expect.arrayContaining([
        "ado_get_pull_request_by_id",
        "ado_list_pull_request_threads",
        "ado_get_pull_request_changes",
        "ado_list_pull_request_policy_evaluations",
      ]),
    );
    expect(body.summary).toContain("PR #42");
    expect(body.summary).toContain("failed/canceled build");
    expect(body.summary).toContain("Blocking builds: #77 20260610.1 CI: failed");
    expect(body.summary).toContain("Policy blockers: Minimum reviewers: failed (blocking)");
    expect(body.summary).toContain("Active threads: #5: Needs tests");
    expect(body.summary).toContain("Info: no linked work items were found.");
    expect(
      body.tools.find((tool) => tool.name === "ado_get_pull_request_changes")?.stdout,
    ).toContain("/src/app.ts");
  });
});
