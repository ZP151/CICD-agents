import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { stripRef } from "./refs.js";
import { parseAdoJson } from "./response.js";

export interface AzurePipelineRunSummary {
  id: number;
  name: string;
  state: string;
  result: string;
  createdDate: string;
  finishedDate: string;
  sourceBranch: string;
  url: string;
}

export interface AzurePipelineTriggerResult {
  run_id?: number;
  state?: string;
  name?: string;
  url: string;
}

export async function listAzurePipelineRuns(args: {
  organization: string;
  project: string;
  pipelineId: string | number;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
}): Promise<AzurePipelineRunSummary[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const pipelineId = String(args.pipelineId ?? "").trim();
  if (!org || !project || !pipelineId) {
    throw new ToolError("ADO organization, project, and pipeline ID are required to list pipeline runs.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);

  const params = new URLSearchParams({
    "api-version": "7.1",
  });
  if (args.top) params.set("$top", String(args.top));

  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/pipelines/` +
    `${encodeURIComponent(pipelineId)}/runs?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = (await parseAdoJson(resp, "list pipeline runs")) as {
    value?: AzurePipelineRunPayload[];
  };
  return (data.value ?? []).map(toPipelineRunSummary);
}

export async function getAzurePipelineRun(args: {
  organization: string;
  project: string;
  pipelineId: string | number;
  runId: string | number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePipelineRunSummary> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const pipelineId = String(args.pipelineId ?? "").trim();
  const runId = String(args.runId ?? "").trim();
  if (!org || !project || !pipelineId || !runId) {
    throw new ToolError("ADO organization, project, pipeline ID, and run ID are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({ "api-version": "7.1" });
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/pipelines/` +
    `${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(runId)}?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  return toPipelineRunSummary(await parseAdoJson(resp, "get pipeline run") as AzurePipelineRunPayload);
}

export async function triggerAzurePipelineRun(args: {
  organization: string;
  project: string;
  pipelineId: string | number;
  branch?: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePipelineTriggerResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const pipelineId = Number(args.pipelineId ?? 0);
  const branch = args.branch?.trim() ?? "";
  if (!org || !project || !pipelineId) {
    throw new ToolError("trigger_pipeline_run requires 'pipeline_id'.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/pipelines/${pipelineId}/runs?api-version=7.1-preview.1`;
  const body: Record<string, unknown> = {};
  if (branch) {
    body["resources"] = { repositories: { self: { refName: `refs/heads/${branch}` } } };
  }
  const resp = await adoFetch(url, auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseAdoJson(resp, "trigger_pipeline_run") as {
    id?: number;
    state?: string;
    name?: string;
    _links?: { web?: { href?: string } };
  };
  return {
    run_id: data.id,
    state: data.state,
    name: data.name,
    url: data._links?.web?.href ?? "",
  };
}

interface AzurePipelineRunPayload {
  id?: number;
  name?: string;
  state?: string;
  result?: string;
  createdDate?: string;
  finishedDate?: string;
  _links?: { web?: { href?: string } };
  resources?: { repositories?: { self?: { refName?: string } } };
}

function toPipelineRunSummary(run: AzurePipelineRunPayload): AzurePipelineRunSummary {
  return {
    id: Number(run.id ?? 0),
    name: run.name ?? "",
    state: run.state ?? "",
    result: run.result ?? "",
    createdDate: run.createdDate ?? "",
    finishedDate: run.finishedDate ?? "",
    sourceBranch: stripRef(run.resources?.repositories?.self?.refName ?? ""),
    url: run._links?.web?.href ?? "",
  };
}
