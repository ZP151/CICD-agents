/**
 * Azure Pipelines environments and deployment approvals (Cycle 05).
 * YAML-pipeline environments; Classic Releases are evaluated separately.
 */
import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { parseAdoJson } from "./response.js";

export interface AzureEnvironmentSummary {
  id: number;
  name: string;
  description: string;
  createdBy?: string;
  createdOn?: string;
  url: string;
}

export interface AzureDeploymentSummary {
  id: number;
  name: string;
  status: string;
  result?: string;
  requestedFor?: string;
  createdOn?: string;
  definitionEnvironmentId: number;
}

export interface AzureApprovalSummary {
  id: number;
  status: "pending" | "approved" | "rejected";
  approver?: string;
  approvalType?: string;
  createdOn?: string;
}

export async function listAzureEnvironments(args: {
  organization: string;
  project: string;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
}): Promise<AzureEnvironmentSummary[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project) throw new ToolError("ADO organization and project are required to list environments.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/pipelines/environments` +
    `?api-version=7.1-preview.1&$top=${args.top ?? 50}`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) return [];
  const body = await parseAdoJson(resp, "list environments") as {
    value?: Array<{
      id?: number;
      name?: string;
      description?: string;
      createdBy?: { displayName?: string };
      createdOn?: string;
      _links?: { web?: { href?: string } };
    }>;
  };
  return (body.value ?? []).map((entry) => ({
    id: Number(entry.id ?? 0),
    name: entry.name ?? "",
    description: entry.description ?? "",
    createdBy: entry.createdBy?.displayName,
    createdOn: entry.createdOn,
    url: entry._links?.web?.href ?? "",
  })).filter((entry) => entry.id > 0);
}

export async function listAzureDeployments(args: {
  organization: string;
  project: string;
  environmentId: number;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
}): Promise<AzureDeploymentSummary[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project || !args.environmentId) {
    throw new ToolError("ADO organization, project, and environment id are required to list deployments.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/pipelines/environments/${args.environmentId}/deployments` +
    `?api-version=7.1-preview.1&$top=${args.top ?? 10}`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) return [];
  const body = await parseAdoJson(resp, "list deployments") as {
    value?: Array<{
      id?: number;
      name?: string;
      status?: string;
      result?: string;
      requestedFor?: { displayName?: string };
      createdOn?: string;
      definitionEnvironmentId?: number;
    }>;
  };
  return (body.value ?? []).map((entry) => ({
    id: Number(entry.id ?? 0),
    name: entry.name ?? "",
    status: entry.status ?? "",
    result: entry.result,
    requestedFor: entry.requestedFor?.displayName,
    createdOn: entry.createdOn,
    definitionEnvironmentId: Number(entry.definitionEnvironmentId ?? args.environmentId),
  })).filter((entry) => entry.id > 0);
}

export async function listAzureEnvironmentApprovals(args: {
  organization: string;
  project: string;
  environmentId: number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureApprovalSummary[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project || !args.environmentId) {
    throw new ToolError("ADO organization, project, and environment id are required to list approvals.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/pipelines/approvals` +
    `?api-version=7.1-preview.2&environmentId=${args.environmentId}`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) return [];
  const body = await parseAdoJson(resp, "list approvals") as {
    value?: Array<{
      id?: number;
      status?: string;
      approver?: { displayName?: string };
      approvalType?: string;
      createdOn?: string;
    }>;
  };
  return (body.value ?? []).map((entry) => {
    const status = entry.status === "approved" || entry.status === "rejected" || entry.status === "pending"
      ? entry.status
      : "pending";
    return {
      id: Number(entry.id ?? 0),
      status: status as AzureApprovalSummary["status"],
      approver: entry.approver?.displayName,
      approvalType: entry.approvalType,
      createdOn: entry.createdOn,
    };
  }).filter((entry) => entry.id > 0);
}

export interface AzureApprovalUpdateResult {
  ok: boolean;
  id?: number;
  status?: string;
  status_code?: number;
  error?: string;
}

/** Approve or reject a pending environment approval (controlled CD action). */
export async function updateAzureDeploymentApproval(args: {
  organization: string;
  project: string;
  approvalId: number;
  status: "approved" | "rejected";
  comment?: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureApprovalUpdateResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project || !args.approvalId) {
    throw new ToolError("ADO organization, project, and approval id are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/pipelines/approvals/${args.approvalId}` +
    `?api-version=7.1-preview.2`;
  const resp = await adoFetch(url, auth, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: args.status,
      comments: args.comment ?? "",
    }),
  });
  if (!resp.ok) {
    return { ok: false, status_code: resp.status, error: (await resp.text()).slice(0, 400) };
  }
  const body = await parseAdoJson(resp, "update approval") as { id?: number; status?: string };
  return { ok: true, id: Number(body.id ?? 0) || undefined, status: body.status };
}

export interface AzureBuildCancelResult {
  ok: boolean;
  status_code?: number;
  error?: string;
}

/** Cancel a build/run (controlled CD action). */
export async function cancelAzureBuild(args: {
  organization: string;
  project: string;
  buildId: number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureBuildCancelResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project || !args.buildId) {
    throw new ToolError("ADO organization, project, and build id are required to cancel a run.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/build/builds/${args.buildId}?api-version=7.1`;
  const resp = await adoFetch(url, auth, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cancelling" }),
  });
  if (!resp.ok) {
    return { ok: false, status_code: resp.status, error: (await resp.text()).slice(0, 400) };
  }
  return { ok: true };
}
