import { describe, expect, it } from "vitest";
import {
  classifyInspectFailure,
  extractPipelineRunsFromInspectResult,
  pickLatestPipelineRun,
  type AdoPipelineRunSummary,
} from "./adoVerifier";

const run = (id: number): AdoPipelineRunSummary => ({
  id,
  name: `2026070${id % 10}.${id}`,
  state: "completed",
  result: "failed",
  createdDate: `2026-08-0${id % 10}T00:00:00Z`,
  finishedDate: `2026-08-0${id % 10}T00:05:00Z`,
  sourceBranch: "refs/heads/main",
  url: `https://tebssg.visualstudio.com/TeBS-ClaimBot/_apis/build/builds/${id}`,
});

function inspectBody(runs: AdoPipelineRunSummary[], count?: number): unknown {
  return {
    ok: true,
    action: "inspect_pipeline",
    repoPath: "C:\\repo",
    summary: "Pipeline #117 readiness inspected",
    workflowState: {
      status: "done",
      currentStep: "Pipeline #117 readiness inspected",
      workflowPhase: "pipeline_inspected",
    },
    tools: [
      {
        name: "ado_list_pipeline_runs",
        command: "internal ado_list_pipeline_runs",
        ok: true,
        stdout: JSON.stringify({ pipelineId: 117, runs, count: count ?? runs.length }),
        stderr: "",
        returncode: 0,
      },
    ],
    artifacts: [],
  };
}

describe("extractPipelineRunsFromInspectResult", () => {
  it("extracts runs from the ado_list_pipeline_runs tool stdout", () => {
    const runs = [run(4664), run(4665)];
    expect(extractPipelineRunsFromInspectResult(inspectBody(runs))).toEqual(runs);
  });

  it("returns an empty list when no inspect result is present", () => {
    expect(extractPipelineRunsFromInspectResult(null)).toEqual([]);
    expect(extractPipelineRunsFromInspectResult({ ok: true, tools: [] })).toEqual([]);
    expect(extractPipelineRunsFromInspectResult({ ok: true })).toEqual([]);
  });

  it("returns an empty list when the tool stdout is not the runs JSON", () => {
    expect(
      extractPipelineRunsFromInspectResult({
        ok: true,
        tools: [{ name: "ado_list_pipeline_runs", stdout: "not json" }],
      }),
    ).toEqual([]);
    expect(
      extractPipelineRunsFromInspectResult({
        ok: true,
        tools: [{ name: "ado_list_pipeline_runs", stdout: JSON.stringify({ pipelineId: 117, runs: "nope" }) }],
      }),
    ).toEqual([]);
    expect(
      extractPipelineRunsFromInspectResult({
        ok: true,
        tools: [{ name: "ado_list_pipeline_runs", stdout: JSON.stringify({ pipelineId: 117 }) }],
      }),
    ).toEqual([]);
  });

  it("ignores malformed entries and keeps valid runs", () => {
    const good = run(4665);
    const body = inspectBody([good]);
    const tools = (body as { tools: Array<{ stdout: string }> }).tools;
    tools[0].stdout = JSON.stringify({
      pipelineId: 117,
      runs: [{ id: "not-a-number" }, null, { id: 4665, name: good.name }, { noId: true }, good],
    });
    expect(extractPipelineRunsFromInspectResult(body)).toEqual([good]);
  });
});

describe("pickLatestPipelineRun", () => {
  it("returns the run with the highest id regardless of array order", () => {
    expect(pickLatestPipelineRun([run(4664), run(4665)])?.id).toBe(4665);
    expect(pickLatestPipelineRun([run(4665), run(4664)])?.id).toBe(4665);
    expect(pickLatestPipelineRun([run(4665)])?.id).toBe(4665);
  });

  it("returns undefined for an empty list", () => {
    expect(pickLatestPipelineRun([])).toBeUndefined();
  });
});

describe("classifyInspectFailure", () => {
  it("classifies ADO auth failures as app-auth (GAP-03 separation)", () => {
    const oauthUnavailable = classifyInspectFailure(401, {
      ok: false,
      action: "inspect_pipeline",
      summary: "Azure DevOps OAuth unavailable",
      workflowState: {
        status: "failed",
        currentStep: "Azure DevOps OAuth unavailable",
        workflowPhase: "auth_required",
        authStatus: "oauth_unavailable",
        authMode: "oauth",
        authMessage: "Azure DevOps OAuth unavailable",
        retryable: true,
      },
      tools: [],
    });
    expect(oauthUnavailable.stage).toBe("app-auth");
    expect(oauthUnavailable.detail).toContain("oauth_unavailable");

    const rejected = classifyInspectFailure(400, {
      ok: false,
      summary: "Azure DevOps OAuth access rejected",
      workflowState: {
        status: "failed",
        workflowPhase: "auth_required",
        authStatus: "oauth_no_org_access",
        authMessage: "Azure DevOps OAuth access rejected",
      },
      tools: [],
    });
    expect(rejected.stage).toBe("app-auth");
  });

  it("classifies other non-2xx responses as ado-read", () => {
    const generic = classifyInspectFailure(500, {
      ok: false,
      summary: "failed to list pipeline runs",
      workflowState: { status: "failed" },
      tools: [],
    });
    expect(generic.stage).toBe("ado-read");
    expect(generic.detail).toContain("failed to list pipeline runs");
  });

  it("classifies a 2xx response without a recognized failure shape as unexpected", () => {
    expect(classifyInspectFailure(200, { ok: false }).stage).toBe("unexpected");
  });
});
