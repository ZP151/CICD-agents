import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT, API_VERSION_WI } from "./constants.js";
import { listAzureProjects } from "./core.js";
import { listAzureRepositories } from "./repositories.js";
import { parseAdoJson } from "./response.js";

export interface AzureWorkItemSummary {
  id: number;
  url: string;
  type: string;
  title: string;
  state: string;
  assignedTo: string;
  tags: string[];
}

export interface AzureWorkItemLinkResult {
  ok: boolean;
  work_item_id?: number;
  pull_request_id?: number;
  status_code?: number;
  error?: string;
}

export async function listAzurePullRequestWorkItems(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureWorkItemSummary[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  if (!org || !project || !repository || !pullRequestId) {
    throw new ToolError("ADO organization, project, repository, and pull request ID are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const refsUrl =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullrequests/${pullRequestId}/workitems?api-version=${API_VERSION_GIT}`;
  const refsResp = await adoFetch(refsUrl, auth);
  const refs = await parseAdoJson(refsResp, "list pull request work items") as {
    value?: Array<{ id?: string | number; url?: string }>;
  };
  const ids = (refs.value ?? [])
    .map((ref) => Number(ref.id ?? extractWorkItemId(ref.url ?? "")))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return [];

  const detailsUrl =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/workitems` +
    `?ids=${ids.join(",")}&$expand=Relations&api-version=${API_VERSION_WI}`;
  const detailsResp = await adoFetch(detailsUrl, auth);
  const details = await parseAdoJson(detailsResp, "get work item details") as {
    value?: Array<{
      id?: number;
      url?: string;
      fields?: Record<string, unknown>;
    }>;
  };
  return (details.value ?? []).map(toWorkItemSummary);
}

function toWorkItemSummary(item: {
  id?: number;
  url?: string;
  fields?: Record<string, unknown>;
}): AzureWorkItemSummary {
  const fields = item.fields ?? {};
  const assigned = fields["System.AssignedTo"];
  return {
    id: Number(item.id ?? 0),
    url: item.url ?? "",
    type: String(fields["System.WorkItemType"] ?? ""),
    title: String(fields["System.Title"] ?? ""),
    state: String(fields["System.State"] ?? ""),
    assignedTo: typeof assigned === "object" && assigned !== null
      ? String((assigned as Record<string, unknown>)["displayName"] ?? "")
      : String(assigned ?? ""),
    tags: String(fields["System.Tags"] ?? "")
      .split(";")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

export async function linkAzureWorkItemToPullRequest(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  workItemId: string | number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureWorkItemLinkResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  const workItemId = Number(args.workItemId ?? 0);
  if (!org || !project || !repository || !pullRequestId || !workItemId) {
    throw new ToolError("link_work_item requires 'repository', 'pull_request_id', 'work_item_id'.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const ids = await resolvePullRequestArtifactIds({ org, project, repository, auth });
  const artifactId = `vstfs:///Git/PullRequestId/${ids.projectId}%2F${ids.repositoryId}%2F${pullRequestId}`;
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}?api-version=${API_VERSION_WI}`;
  const body = [
    {
      op: "add",
      path: "/relations/-",
      value: { rel: "ArtifactLink", url: artifactId, attributes: { name: "Pull Request" } },
    },
  ];
  const resp = await adoFetch(url, auth, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    return { ok: false, status_code: resp.status, error: (await resp.text()).slice(0, 400) };
  }
  return { ok: true, work_item_id: workItemId, pull_request_id: pullRequestId };
}

async function resolvePullRequestArtifactIds(args: {
  org: string;
  project: string;
  repository: string;
  auth: AdoAuth;
}): Promise<{ projectId: string; repositoryId: string }> {
  const projects = await listAzureProjects({
    organization: args.org,
    auth: args.auth,
    top: 200,
  });
  const project = projects.find((candidate) =>
    candidate.id === args.project ||
    candidate.name.localeCompare(args.project, undefined, { sensitivity: "accent" }) === 0
  );
  const projectId = project?.id?.trim();
  if (!projectId) throw new ToolError(`Azure DevOps project '${args.project}' was not found while linking a work item.`);

  const repositories = await listAzureRepositories({
    organization: args.org,
    project: args.project,
    auth: args.auth,
    top: 500,
  });
  const repository = repositories.find((candidate) =>
    candidate.id === args.repository ||
    candidate.name.localeCompare(args.repository, undefined, { sensitivity: "accent" }) === 0
  );
  const repositoryId = repository?.id?.trim();
  if (!repositoryId) throw new ToolError(`Azure DevOps repository '${args.repository}' was not found while linking a work item.`);

  return { projectId, repositoryId };
}

function extractWorkItemId(url: string): string {
  return url.match(/workItems\/(\d+)/i)?.[1] ?? "";
}

export interface AzureWorkItemRead {
  id: number;
  revision: number;
  type: string;
  title: string;
  state: string;
  fields: Record<string, unknown>;
  relations: string[];
  comments: string[];
}

/** Read one work item with its current revision, fields and relations. */
export async function readAzureWorkItem(args: {
  organization: string;
  project: string;
  workItemId: string | number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureWorkItemRead> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const workItemId = Number(args.workItemId ?? 0);
  if (!org || !project || !workItemId) {
    throw new ToolError("ADO organization, project, and work item ID are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}` +
    `?$expand=Relations&api-version=${API_VERSION_WI}`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) {
    throw new ToolError(`read work item ${workItemId} failed (${resp.status}): ${(await resp.text()).slice(0, 400)}`);
  }
  const body = await parseAdoJson(resp, "get work item") as {
    id?: number;
    rev?: number;
    fields?: Record<string, unknown>;
    relations?: Array<{ rel?: string; url?: string }>;
  };
  return {
    id: Number(body.id ?? workItemId),
    revision: Number(body.rev ?? 0),
    type: String(body.fields?.["System.WorkItemType"] ?? ""),
    title: String(body.fields?.["System.Title"] ?? ""),
    state: String(body.fields?.["System.State"] ?? ""),
    fields: body.fields ?? {},
    relations: (body.relations ?? []).map((relation) => String(relation.url ?? "")),
    comments: await readWorkItemCommentTexts({ organization: org, project, workItemId, auth }),
  };
}

async function readWorkItemCommentTexts(args: {
  organization: string;
  project: string;
  workItemId: number;
  auth: AdoAuth;
}): Promise<string[]> {
  try {
    const url =
      `${adoBase(args.organization)}/${encodeURIComponent(args.project)}/_apis/wit/workItems/${args.workItemId}/comments` +
      `?api-version=${API_VERSION_WI}`;
    const resp = await adoFetch(url, args.auth);
    if (!resp.ok) return [];
    const body = await parseAdoJson(resp, "list work item comments") as {
      comments?: Array<{ text?: string }>;
    };
    return (body.comments ?? []).map((comment) => String(comment.text ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

export interface AzureWorkItemCommentResult {
  ok: boolean;
  revision?: number;
  commentId?: number;
  status_code?: number;
  error?: string;
}

/** Add a comment to a work item (low-risk, reversible fixture write). */
export async function addAzureWorkItemComment(args: {
  organization: string;
  project: string;
  workItemId: string | number;
  text: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureWorkItemCommentResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const workItemId = Number(args.workItemId ?? 0);
  const text = args.text.trim();
  if (!org || !project || !workItemId || !text) {
    throw new ToolError("add_work_item_comment requires organization, project, work_item_id, and text.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/workItems/${workItemId}/comments` +
    `?api-version=${API_VERSION_WI}`;
  const resp = await adoFetch(url, auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) {
    return {
      ok: false,
      status_code: resp.status,
      error: (await resp.text()).slice(0, 400),
    };
  }
  const body = await parseAdoJson(resp, "add work item comment") as {
    id?: number;
    workItemRevision?: number;
  };
  return {
    ok: true,
    commentId: Number(body.id ?? 0) || undefined,
    revision: Number(body.workItemRevision ?? 0) || undefined,
  };
}

export interface AzureWorkItemCreateResult {
  ok: boolean;
  id?: number;
  revision?: number;
  status_code?: number;
  error?: string;
}

/** Create a work item of the given type (Task/Bug) in the project. */
export async function createAzureWorkItem(args: {
  organization: string;
  project: string;
  type: "Task" | "Bug";
  title: string;
  description?: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureWorkItemCreateResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const title = args.title.trim();
  if (!org || !project || !title) {
    throw new ToolError("create work item requires organization, project, type, and title.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/$${args.type}` +
    `?api-version=${API_VERSION_WI}`;
  const body = [
    { op: "add", path: "/fields/System.Title", value: title },
    ...(args.description
      ? [{ op: "add", path: "/fields/System.Description", value: args.description }]
      : []),
  ];
  const resp = await adoFetch(url, auth, {
    method: "POST",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    return { ok: false, status_code: resp.status, error: (await resp.text()).slice(0, 400) };
  }
  const created = await parseAdoJson(resp, "create work item") as {
    id?: number;
    rev?: number;
  };
  return { ok: true, id: Number(created.id ?? 0) || undefined, revision: Number(created.rev ?? 0) || undefined };
}

export interface AzureWorkItemUpdateResult {
  ok: boolean;
  id?: number;
  revision?: number;
  status_code?: number;
  error?: string;
}

/** Update work item fields via JSON-patch (state transitions, titles, etc.). */
export async function updateAzureWorkItem(args: {
  organization: string;
  project: string;
  workItemId: string | number;
  fields: Record<string, string | number | boolean>;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureWorkItemUpdateResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const workItemId = Number(args.workItemId ?? 0);
  const entries = Object.entries(args.fields).filter(([, value]) => value !== undefined && value !== "");
  if (!org || !project || !workItemId || entries.length === 0) {
    throw new ToolError("update_work_item requires organization, project, work_item_id, and fields.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}` +
    `?api-version=${API_VERSION_WI}`;
  const body = entries.map(([path, value]) => ({
    op: "replace",
    path: `/fields/${path}`,
    value,
  }));
  const resp = await adoFetch(url, auth, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    return { ok: false, status_code: resp.status, error: (await resp.text()).slice(0, 400) };
  }
  const updated = await parseAdoJson(resp, "update work item") as { id?: number; rev?: number };
  return { ok: true, id: Number(updated.id ?? 0) || undefined, revision: Number(updated.rev ?? 0) || undefined };
}

export interface AzureWorkItemSummaryEntry {
  id: number;
  type: string;
  title: string;
  state: string;
  revision: number;
  iterationPath?: string;
  fields: Record<string, unknown>;
  relations: string[];
  comments: string[];
}

/** Query work items (WIQL) and batch-read their details. */
export async function queryAzureWorkItems(args: {
  organization: string;
  project: string;
  query: string;
  top?: number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureWorkItemSummaryEntry[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project) throw new ToolError("ADO organization and project are required to query work items.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const queryUrl = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.1`;
  const queryResp = await adoFetch(queryUrl, auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: args.query, top: args.top ?? 50 }),
  });
  if (!queryResp.ok) {
    throw new ToolError(`WIQL query failed (${queryResp.status}): ${(await queryResp.text()).slice(0, 400)}`);
  }
  const queryBody = await parseAdoJson(queryResp, "run work item query") as {
    workItems?: Array<{ id?: number }>;
  };
  const ids = (queryBody.workItems ?? []).map((entry) => Number(entry.id ?? 0)).filter((id) => id > 0);
  if (ids.length === 0) return [];
  const detailsUrl =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/workitems` +
    `?ids=${ids.join(",")}&$expand=Relations&api-version=${API_VERSION_WI}`;
  const detailsResp = await adoFetch(detailsUrl, auth);
  if (!detailsResp.ok) return [];
  const details = await parseAdoJson(detailsResp, "get work item details") as {
    value?: Array<{
      id?: number;
      rev?: number;
      fields?: Record<string, unknown>;
      relations?: Array<{ rel?: string; url?: string }>;
    }>;
  };
  const entries: AzureWorkItemSummaryEntry[] = [];
  for (const item of details.value ?? []) {
    const id = Number(item.id ?? 0);
    if (!id) continue;
    entries.push({
      id,
      type: String(item.fields?.["System.WorkItemType"] ?? ""),
      title: String(item.fields?.["System.Title"] ?? ""),
      state: String(item.fields?.["System.State"] ?? ""),
      revision: Number(item.rev ?? 0),
      iterationPath: item.fields?.["System.IterationPath"] ? String(item.fields["System.IterationPath"]) : undefined,
      fields: item.fields ?? {},
      relations: (item.relations ?? []).map((relation) => String(relation.url ?? "")),
      comments: await readWorkItemCommentTexts({ organization: org, project, workItemId: id, auth }),
    });
  }
  return entries;
}

export interface AzureWorkItemDeleteResult {
  ok: boolean;
  status_code?: number;
  error?: string;
}

/** Permanently delete a work item (fixture cleanup; ADO allows delete). */
export async function deleteAzureWorkItem(args: {
  organization: string;
  project: string;
  workItemId: string | number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureWorkItemDeleteResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const workItemId = Number(args.workItemId ?? 0);
  if (!org || !project || !workItemId) {
    throw new ToolError("delete work item requires organization, project, and work_item_id.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}` +
    `?api-version=7.1-preview.3`;
  const resp = await adoFetch(url, auth, { method: "DELETE" });
  if (!resp.ok) {
    return { ok: false, status_code: resp.status, error: (await resp.text()).slice(0, 400) };
  }
  return { ok: true };
}
