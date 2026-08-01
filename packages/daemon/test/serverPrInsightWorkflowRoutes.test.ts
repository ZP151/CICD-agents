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

function mockPrInsightFetch(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = requestUrl(input);
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
      return new Response(JSON.stringify({ value: [{ id: 3 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/pullrequests/42/iterations/3/changes?")) {
      return new Response(
        JSON.stringify({
          changeEntries: [
            {
              changeId: 10,
              changeType: "edit",
              item: { path: "/src/app.ts", gitObjectType: "blob" },
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
}

function mockSeededPrInsightFetch(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = requestUrl(input);
    if (url.includes("/pullrequests/84?")) {
      return new Response(
        JSON.stringify({
          pullRequestId: 84,
          codeReviewId: 840,
          title: "Add policy-aware PR insight",
          description: "Connects PR readiness to CI, policy, discussions, and work items.",
          status: "active",
          sourceRefName: "refs/heads/feature/pr-insight-quality",
          targetRefName: "refs/heads/main",
          repository: { name: "mergepilot", project: { id: "project-guid", name: "Agents" } },
          reviewers: [],
          workItemRefs: [{ id: "501", url: "https://ado/workItems/501" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/pullrequests/84/threads?")) {
      return new Response(
        JSON.stringify({
          value: [
            { id: 12, status: 1, comments: [{ id: 1, content: "Please add coverage for linked work item summaries." }] },
            { id: 13, status: 2, comments: [{ id: 2, content: "Resolved thread should not block readiness." }] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/pullrequests/84/iterations?")) {
      return new Response(JSON.stringify({ value: [{ id: 4, sourceRefCommit: { commitId: "source-commit" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/pullrequests/84/iterations/4/changes?")) {
      return new Response(
        JSON.stringify({
          changeEntries: [
            { changeId: 1, changeType: "edit", item: { path: "/packages/daemon/src/workflows/prWorkflow.ts", gitObjectType: "blob", commitId: "source-commit" } },
            { changeId: 2, changeType: "edit", item: { path: "/packages/daemon/src/workflows/prWorkflowInsight.ts", gitObjectType: "blob", commitId: "source-commit" } },
            { changeId: 3, changeType: "edit", item: { path: "/packages/daemon/test/prWorkflow.test.ts", gitObjectType: "blob", commitId: "source-commit" } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/pullrequests/84/workitems?")) {
      return new Response(
        JSON.stringify({ value: [{ id: "501", url: "https://ado/workItems/501" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/_apis/wit/workitems?ids=501")) {
      return new Response(
        JSON.stringify({
          value: [{
            id: 501,
            url: "https://ado/workItems/501",
            fields: {
              "System.WorkItemType": "User Story",
              "System.Title": "Improve PR insight quality signals",
              "System.State": "Active",
              "System.Tags": "mergepilot;quality",
            },
          }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/_apis/policy/evaluations?")) {
      return new Response(
        JSON.stringify({
          value: [
            {
              evaluationId: "policy-reviewers",
              status: "failed",
              configuration: {
                id: 11,
                isBlocking: true,
                settings: { displayName: "Minimum reviewers" },
                type: { displayName: "Reviewer policy" },
              },
            },
            {
              evaluationId: "policy-build",
              status: "queued",
              configuration: {
                id: 12,
                isBlocking: true,
                settings: { displayName: "Build validation" },
                type: { displayName: "Build policy" },
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
              id: 901,
              buildNumber: "20260705.1",
              definition: { name: "CI Validation" },
              status: "completed",
              result: "failed",
              url: "https://ado/build/901",
            },
            {
              id: 902,
              buildNumber: "20260705.2",
              definition: { name: "Lint" },
              status: "completed",
              result: "succeeded",
              url: "https://ado/build/902",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
  });
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

  it("preserves seeded PR insight quality signals from files, builds, policies, threads, and work items", async () => {
    app = await buildApp();
    mockSeededPrInsightFetch();

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_pr_insight",
        repoPath: process.cwd(),
        projectLink: projectLink(),
        pullRequestId: 84,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      summary: string;
      workflowState: { completedTools: string[] };
      tools: Array<{ name: string; stdout: string }>;
    };

    expect(body.summary).toContain("PR #84: Add policy-aware PR insight");
    expect(body.summary).toContain(
      "Readiness: blocked. 3 changed file(s), 1 active thread(s), 1 failed/canceled build(s), 1 failed/error policy evaluation(s), 1 linked work item(s).",
    );
    expect(body.summary).toContain(
      "Touched areas: /packages/daemon/src/workflows/prWorkflow.ts, /packages/daemon/src/workflows/prWorkflowInsight.ts, /packages/daemon/test/prWorkflow.test.ts.",
    );
    expect(body.summary).toContain("Blocking builds: #901 20260705.1 CI Validation: failed.");
    expect(body.summary).toContain("Policy blockers: Minimum reviewers: failed (blocking).");
    expect(body.summary).toContain("Active threads: #12: Please add coverage for linked work item summaries.");
    expect(body.summary).toContain("Linked work items: #501 User Story [Active]: Improve PR insight quality signals.");
    expect(body.summary).toContain("Waiting: 1 policy evaluation(s) are pending/running.");
    expect(body.summary).not.toContain("Info: no linked work items were found.");
    expect(body.summary).not.toContain("Risk signal: PR description is empty.");

    expect(body.workflowState.completedTools).toEqual(
      expect.arrayContaining([
        "ado_get_pull_request_by_id",
        "ado_list_pull_request_threads",
        "ado_get_pull_request_changes",
        "ado_pipelines_get_builds",
        "ado_list_pull_request_work_items",
        "ado_list_pull_request_policy_evaluations",
      ]),
    );
    expect(body.tools.find((tool) => tool.name === "ado_list_pull_request_work_items")?.stdout).toContain(
      "Improve PR insight quality signals",
    );
  });

  it("keeps explicit read-only PR chat requests in the formal planner conversation", async () => {
    app = await buildApp();
    mockPrInsightFetch();

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Analyze PR 42 for this repo. Read-only only. Do not modify anything or request approval.",
        repoPath: process.cwd(),
        projectLink: projectLink(),
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    expect(events.some((entry) => entry.event === "turn.approval.requested")).toBe(false);
    expect(events.some((entry) => entry.event === "turn.started")).toBe(true);
    expect(events.some((entry) => entry.event === "turn.finished")).toBe(true);
    expect(events.some((entry) => entry.event === "tool_start" || entry.event === "tool.started")).toBe(false);
    const finalWorkflow = events.findLast((entry) => entry.event === "turn.workflow.updated")?.data as
      | { workflow?: { status?: string; workflowKind?: string; workflowPhase?: string; completedTools?: string[] } }
      | undefined;
    expect(finalWorkflow?.workflow).toMatchObject({
      status: "done",
    });
    expect(finalWorkflow?.workflow?.completedTools).toEqual([]);
    expect(response.body).toContain("Selected model is temporarily unavailable");
    expect(response.body).toContain("Analyze PR 42 for this repo");
  });
});
