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
  it("inspects ClaimBot_API pipeline #117 and prepares trigger approval as structured CI workflow actions", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/pipelines/117/runs?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 4665,
                name: "20260705.1",
                state: "completed",
                result: "failed",
                createdDate: "2026-07-05T02:00:00Z",
                finishedDate: "2026-07-05T02:01:04Z",
                _links: { web: { href: "https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4665" } },
                resources: { repositories: { self: { refName: "refs/heads/main" } } },
              },
              {
                id: 4667,
                name: "20260705.3",
                state: "completed",
                result: "succeeded",
                createdDate: "2026-07-05T03:00:00Z",
                finishedDate: "2026-07-05T03:02:00Z",
                _links: { web: { href: "https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4667" } },
                resources: { repositories: { self: { refName: "refs/heads/main" } } },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/builds/4665/timeline?")) {
        return new Response(
          JSON.stringify({
            records: [
              {
                id: "task-1",
                type: "Task",
                name: "VSBuild",
                state: "completed",
                result: "failed",
                startTime: "2026-07-05T02:00:10Z",
                finishTime: "2026-07-05T02:01:00Z",
                log: { id: 9, url: "https://ado/log/9" },
                issues: [
                  {
                    type: "error",
                    category: "General",
                    message: "Copying file images\\Gojek\\.DS_Store failed. Authorization: Bearer pipeline-token-1234567890",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/builds/4665/logs/9?")) {
        return new Response(
          [
            "Starting VSBuild",
            "AZURE_OPENAI_API_KEY=raw-aoai-secret-1234567890",
            "client_secret=raw-client-secret-1234567890",
            "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\MSBuild\\Microsoft\\VisualStudio\\v17.0\\Web\\Microsoft.Web.Publishing.targets(2672,5): Error : Copying file images\\Gojek\\.DS_Store to obj\\Release\\Package\\PackageTmp\\images\\Gojek\\.DS_Store failed. Could not find file 'images\\Gojek\\.DS_Store'.",
            "##[error]Process 'msbuild.exe' exited with code '1'.",
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
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      adoPipelineId: "117",
      adoPipelineName: "ClaimBot_API",
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
    expect(inspect.json().summary).toContain("Pipeline #117 latest run #4665");
    expect(inspect.json().summary).toContain("Failed or canceled: 1");
    expect(inspect.json().summary).not.toContain("Pipeline #108");
    expect(JSON.stringify(inspect.json())).not.toContain("pipeline-token-1234567890");
    expect(JSON.stringify(inspect.json())).not.toContain("raw-aoai-secret-1234567890");
    expect(JSON.stringify(inspect.json())).not.toContain("raw-client-secret-1234567890");
    expect(JSON.stringify(inspect.json())).toContain("***REDACTED***");
    expect(inspect.json().artifacts).toEqual([
      expect.objectContaining({
        type: "artifact",
        artifactId: "pipeline-117-run-4665-failed",
        title: "Pipeline #117 run #4665 failure",
        artifactType: "markdown",
        status: "error",
        content: expect.stringContaining("Candidate next actions:"),
      }),
    ]);
    expect(inspect.json().artifacts[0].content).toContain("VSBuild");
    expect(inspect.json().artifacts[0].content).toContain("images\\Gojek\\.DS_Store");
    expect(inspect.json().artifacts[0].content).toContain("msbuild.exe");
    expect(inspect.json().artifacts[0].content).toContain("## Log excerpts");

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
      pipeline_id: 117,
      branch: "main",
    });
    expect(JSON.stringify(body)).not.toContain("108");
  });

  it("resolves a stored Project Link for read-only pipeline Chat requests", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/pipelines/117/runs?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 4665,
                name: "20260705.1",
                state: "completed",
                result: "failed",
                createdDate: "2026-07-05T02:00:00Z",
                finishedDate: "2026-07-05T02:01:04Z",
                _links: { web: { href: "https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4665" } },
                resources: { repositories: { self: { refName: "refs/heads/main" } } },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/builds/4665/timeline?")) {
        return new Response(
          JSON.stringify({
            records: [
              {
                id: "task-1",
                type: "Task",
                name: "VSBuild",
                state: "completed",
                result: "failed",
                log: { id: 9, url: "https://ado/log/9" },
                issues: [
                  {
                    type: "error",
                    category: "General",
                    message: "Copying file images\\Gojek\\.DS_Store failed.",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/builds/4665/logs/9?")) {
        return new Response(
          [
            "Starting VSBuild",
            "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\MSBuild\\Microsoft\\VisualStudio\\v17.0\\Web\\Microsoft.Web.Publishing.targets(2672,5): Error : Copying file images\\Gojek\\.DS_Store to obj\\Release\\Package\\PackageTmp\\images\\Gojek\\.DS_Store failed. Could not find file 'images\\Gojek\\.DS_Store'.",
            "##[error]Process 'msbuild.exe' exited with code '1'.",
          ].join("\n"),
          { status: 200, headers: { "content-type": "text/plain" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const created = await app.inject({
      method: "POST",
      url: "/project-links",
      payload: {
        name: "ClaimBot_API pipeline",
        repoPath: process.cwd(),
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
        adoPipelineId: "117",
        adoPipelineName: "ClaimBot_API",
        adoPat: "test-pat",
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const projectLinkId = (created.json() as { id: string }).id;

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Inspect pipeline 117 and summarize recent failed run evidence. Read-only only. Do not queue, trigger, or rerun anything.",
        repoPath: process.cwd(),
        projectLinkId,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    expect(events.some((entry) => entry.event === "turn.started")).toBe(true);
    expect(events.some((entry) => entry.event === "turn.phase")).toBe(true);
    expect(events.some((entry) => entry.event === "turn.final.completed")).toBe(true);
    expect(events.some((entry) => entry.event === "turn.finished")).toBe(true);
    expect(events.some((entry) => entry.event === "tool_start" || entry.event === "tool.started")).toBe(false);
    expect(response.body).toContain("Selected model is temporarily unavailable");
    expect(response.body).toContain("Inspect pipeline 117 and summarize recent failed run evidence");
    expect(response.body).not.toContain("Pipeline #117 latest run #4665");
    expect(response.body).not.toContain("ado_trigger_pipeline");
  });

  it("guides pipeline selection instead of failing when a Project Link has no pipeline ID", async () => {
    app = await buildApp();
    const seenUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      seenUrls.push(url);
      if (url.includes("/_apis/git/repositories?")) {
        return new Response(
          JSON.stringify({
            value: [{ id: "repo-guid", name: "mergepilot" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/definitions?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 117,
                name: "ClaimBot_API",
                repository: { id: "repo-guid", name: "mergepilot", type: "TfsGit" },
                process: { yamlFilename: "/azure-pipelines.yml" },
                _links: { web: { href: "https://ado/pipelines/117" } },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
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
      adoPipelineId: "",
      adoPipelineName: "",
      adoPat: "test-pat",
    };

    const inspect = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_pipeline",
        repoPath: process.cwd(),
        projectLink,
      },
    });
    expect(inspect.statusCode, inspect.body).toBe(200);
    expect(inspect.json()).toMatchObject({
      ok: true,
      workflowState: {
        status: "done",
        workflowKind: "ci",
        workflowPhase: "pipeline_setup_required",
        completedTools: ["ado_discover_pipelines"],
      },
    });
    expect(inspect.json().summary).toContain("No Azure Pipeline is configured");
    expect(inspect.json().summary).toContain("#117 ClaimBot_API");
    expect(inspect.json().workflowState.pendingApproval).toBeUndefined();

    const trigger = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "trigger_pipeline",
        repoPath: process.cwd(),
        branch: "main",
        projectLink,
      },
    });
    expect(trigger.statusCode, trigger.body).toBe(200);
    expect(trigger.json()).toMatchObject({
      workflowState: {
        status: "done",
        workflowKind: "ci",
        workflowPhase: "pipeline_setup_required",
        completedTools: ["ado_discover_pipelines"],
      },
    });
    expect(trigger.json().summary).toContain("I did not trigger a pipeline");
    expect(trigger.json().workflowState.pendingApproval).toBeUndefined();
    expect(seenUrls.some((url) => url.includes("/_apis/pipelines/"))).toBe(false);
  });

  it("creates a stored approval proposal before linking a work item to a pull request", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/projects?")) {
        return new Response(
          JSON.stringify({ value: [{ id: "project-guid", name: "Agents" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/git/repositories?")) {
        return new Response(
          JSON.stringify({ value: [{ id: "repo-guid", name: "mergepilot" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
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
    expect(workflowEvent?.workflow).toMatchObject({
      status: "done",
      workflowKind: "pr",
      workflowPhase: "work_item_linked",
    });
    expect(workflowEvent?.workflow?.pendingApproval).toBeUndefined();
    expect(done?.finalText).toContain("Work item 123 is linked to pull request #42");
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
