import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

describe("daemon ADO workflow routes", () => {
  it("inspects pipeline runs and prepares trigger approval as structured CI workflow actions", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/pipelines/12/runs?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 77,
                name: "20260613.1",
                state: "completed",
                result: "failed",
                createdDate: "2026-06-13T08:00:00Z",
                finishedDate: "2026-06-13T08:08:00Z",
                _links: { web: { href: "https://ado/run/77" } },
                resources: { repositories: { self: { refName: "refs/heads/main" } } },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/builds/77/timeline?")) {
        return new Response(
          JSON.stringify({
            records: [
              {
                id: "task-1",
                type: "Task",
                name: "npm test",
                state: "completed",
                result: "failed",
                startTime: "2026-06-13T08:02:00Z",
                finishTime: "2026-06-13T08:07:00Z",
                log: { id: 9, url: "https://ado/log/9" },
                issues: [
                  {
                    type: "error",
                    category: "General",
                    message: "Test suite failed in apps/desktop/src/App.test.tsx",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/builds/77/logs/9?")) {
        return new Response(
          [
            "Starting npm test",
            "Running apps/desktop/src/App.test.tsx",
            "FAIL apps/desktop/src/App.test.tsx > App > renders",
            "AssertionError: expected true to be false",
            "##[error]Test suite failed",
            "npm ERR! Test failed. See above for more details.",
          ].join("\n"),
          { status: 200, headers: { "content-type": "text/plain" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });
    const projectLink = {
      repoPath: process.cwd(),
      defaultBranch: "main",
      targetBranch: "main",
      adoOrgUrl: "https://dev.azure.com/demo-org",
      adoProject: "Agents",
      adoRepoName: "mergepilot",
      adoPipelineId: "12",
      adoPipelineName: "CI",
      adoPat: "test-pat",
    };

    const inspect = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_pipeline",
        repoPath: process.cwd(),
        projectLink: projectLink,
      },
    });
    expect(inspect.statusCode, inspect.body).toBe(200);
    expect(inspect.json()).toMatchObject({
      workflowState: {
        status: "done",
        workflowKind: "ci",
        workflowPhase: "pipeline_inspected",
        completedTools: [
          "ado_list_pipeline_runs",
          "ado_get_build_timeline",
          "ado_get_build_log_excerpt",
        ],
      },
    });
    expect(inspect.json().summary).toContain("Pipeline #12 latest run #77");
    expect(inspect.json().summary).toContain("Failed or canceled: 1");
    expect(inspect.json().artifacts).toEqual([
      expect.objectContaining({
        type: "artifact",
        artifactId: "pipeline-12-run-77-failed",
        title: "Pipeline #12 run #77 failure",
        artifactType: "markdown",
        status: "error",
        content: expect.stringContaining("Candidate next actions:"),
      }),
    ]);
    expect(inspect.json().artifacts[0].content).toContain("npm test");
    expect(inspect.json().artifacts[0].content).toContain("Test suite failed");
    expect(inspect.json().artifacts[0].content).toContain("## Log excerpts");
    expect(inspect.json().artifacts[0].content).toContain(
      "AssertionError: expected true to be false",
    );

    const trigger = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "trigger_pipeline",
        repoPath: process.cwd(),
        branch: "main",
        projectLink: projectLink,
      },
    });
    expect(trigger.statusCode, trigger.body).toBe(200);
    const body = trigger.json() as {
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: {
          riskLevel?: string;
          action: { tool: string; args: Record<string, unknown> };
        };
      };
    };
    expect(body.workflowState.status).toBe("waiting_for_approval");
    expect(body.workflowState.workflowKind).toBe("ci");
    expect(body.workflowState.workflowPhase).toBe("waiting_for_pipeline_trigger_approval");
    expect(body.workflowState.pendingApproval?.riskLevel).toBe("high");
    expect(body.workflowState.pendingApproval?.action.tool).toBe("ado_trigger_pipeline");
    expect(body.workflowState.pendingApproval?.action.args).toMatchObject({
      pipeline_id: 12,
      branch: "main",
    });
  });

  it("creates a stored approval proposal before linking a work item to a pull request", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/wit/workitems/123?") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ id: 123 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
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
        projectLink: {
          repoPath: process.cwd(),
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "mergepilot",
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
      repository: "mergepilot",
    });

    const prepared = response.json() as { sessionId: string };
    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${prepared.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | {
          state?: {
            status?: string;
            workflowKind?: string;
            workflowPhase?: string;
            currentStep?: string;
            pendingApproval?: unknown;
          };
        }
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
    expect(done?.result?.suggestions).toEqual(
      expect.arrayContaining(["List linked work items", "Check policy status"]),
    );
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
