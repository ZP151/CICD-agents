import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT, API_VERSION_WI } from "./constants.js";
import { listAzureProjects } from "./core.js";
import { listAzureRepositories } from "./repositories.js";
import { listAzureBuilds } from "./builds.js";
import { getAzurePullRequestById } from "./pullRequests.js";
import { parseAdoJson } from "./response.js";

export const API_VERSION_TEST = "7.1";

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
  /** Typed relation edges (rel + url) kept for the Work Inspector. */
  relationLinks: Array<{ rel: string; url: string }>;
  comments: string[];
}

/**
 * A decoded work item relation edge. The Inspector groups these by kind:
 * hierarchy (parent/child), dependency edges, related/duplicate links, and
 * artifact links to pull requests, branches and builds.
 */
export type WorkItemRelationKind =
  | "parent"
  | "child"
  | "dependency"
  | "depended_on_by"
  | "related"
  | "duplicate"
  | "pull_request"
  | "branch"
  | "build"
  | "unknown";

export interface WorkItemRelationLink {
  rel: string;
  url: string;
  kind: WorkItemRelationKind;
  /** Parsed numeric id for work item / pull request / build edges. */
  id?: number;
  /** Human label derived from the artifact link (e.g. a branch name). */
  label?: string;
}

const HIERARCHY_FORWARD = "System.LinkTypes.Hierarchy-Forward";
const HIERARCHY_REVERSE = "System.LinkTypes.Hierarchy-Reverse";
const DEPENDENCY_FORWARD = "System.LinkTypes.Dependency-Forward";
const DEPENDENCY_REVERSE = "System.LinkTypes.Dependency-Reverse";
const RELATED = "System.LinkTypes.Related";
const DUPLICATE_FORWARD = "System.LinkTypes.Duplicate-Forward";
const DUPLICATE_REVERSE = "System.LinkTypes.Duplicate-Reverse";
const ARTIFACT = "ArtifactLink";

/**
 * ADO work item relation URLs are opaque artifact strings. Decode the ones
 * the Inspector can act on (hierarchy, dependencies, PRs, branches, builds)
 * and label the rest "unknown" rather than guessing.
 */
export function classifyWorkItemRelation(rel: string, url: string): Omit<WorkItemRelationLink, "rel" | "url"> {
  if (rel === HIERARCHY_FORWARD) return { kind: "child", id: workItemIdFromUrl(url) };
  if (rel === HIERARCHY_REVERSE) return { kind: "parent", id: workItemIdFromUrl(url) };
  if (rel === DEPENDENCY_FORWARD) return { kind: "dependency", id: workItemIdFromUrl(url) };
  if (rel === DEPENDENCY_REVERSE) return { kind: "depended_on_by", id: workItemIdFromUrl(url) };
  if (rel === RELATED) return { kind: "related", id: workItemIdFromUrl(url) };
  if (rel === DUPLICATE_FORWARD || rel === DUPLICATE_REVERSE) return { kind: "duplicate", id: workItemIdFromUrl(url) };
  if (rel === ARTIFACT) return classifyArtifactRelation(url);
  return { kind: "unknown" };
}

function classifyArtifactRelation(url: string): Omit<WorkItemRelationLink, "rel" | "url"> {
  const pullRequest = url.match(/\/PullRequest(?:Id)?\/(?:[^/]+?)(?:\/|%2F)([^/]+?)(?:\/|%2F)(\d+)$/);
  if (pullRequest) {
    return { kind: "pull_request", id: Number(pullRequest[2]), label: pullRequest[1] };
  }
  const build = url.match(/\/Build\/(\d+)$/);
  if (build) {
    return { kind: "build", id: Number(build[1]) };
  }
  const branch = url.match(/\/Git\/Ref\/([^/]+?)(?:\/|%2F)([^/]+?)(?:\/|%2F)(.+)$/);
  if (branch) {
    return { kind: "branch", label: decodeRefName(branch[3] ?? "") };
  }
  return { kind: "unknown" };
}

export function parseWorkItemRelationLinks(
  relations: Array<{ rel?: string; url?: string }>,
): WorkItemRelationLink[] {
  return relations
    .map((relation) => {
      const rel = String(relation.rel ?? "");
      const url = String(relation.url ?? "");
      if (!rel || !url) return null;
      const classified = classifyWorkItemRelation(rel, url);
      return { rel, url, ...classified };
    })
    .filter((relation): relation is WorkItemRelationLink => relation !== null);
}

function workItemIdFromUrl(url: string): number | undefined {
  // API URLs (_apis/wit/workItems/123) and web URLs (_workitems/edit/123)
  // both end in a numeric work item id.
  const match = url.match(/\/(\d+)(?:\/|$)/);
  const id = match ? Number(match[1]) : NaN;
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function decodeRefName(value: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();
  return decoded.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
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
  const relations = (body.relations ?? []).map((relation) => ({
    rel: String(relation.rel ?? ""),
    url: String(relation.url ?? ""),
  }));
  return {
    id: Number(body.id ?? workItemId),
    revision: Number(body.rev ?? 0),
    type: String(body.fields?.["System.WorkItemType"] ?? ""),
    title: String(body.fields?.["System.Title"] ?? ""),
    state: String(body.fields?.["System.State"] ?? ""),
    fields: body.fields ?? {},
    relations: relations.map((relation) => relation.url),
    relationLinks: relations,
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

export interface AzureTestRunSummary {
  buildId: number;
  runCount: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
}

/**
 * Best-effort test evidence for a build: aggregate the published test runs
 * that reference the build artifact (bounded). Missing/empty runs return a
 * zero summary instead of failing the inspector read.
 */
export async function listAzureTestRunSummariesByBuild(args: {
  organization: string;
  project: string;
  buildId: string | number;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
}): Promise<AzureTestRunSummary> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const buildId = Number(args.buildId ?? 0);
  if (!org || !project || !buildId) {
    throw new ToolError("ADO organization, project, and build ID are required for test runs.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const buildUri = encodeURIComponent(`vstfs:///Build/Build/${buildId}`);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/test/runs` +
    `?buildUri=${buildUri}&$top=${args.top ?? 5}&api-version=${API_VERSION_TEST}`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) return { buildId, runCount: 0, totalTests: 0, passedTests: 0, failedTests: 0 };
  const body = await parseAdoJson(resp, "list test runs by build") as {
    value?: Array<{ totalTests?: number; passedTests?: number; failedTests?: number }>;
  };
  const runs = body.value ?? [];
  return {
    buildId,
    runCount: runs.length,
    totalTests: runs.reduce((sum, run) => sum + Number(run.totalTests ?? 0), 0),
    passedTests: runs.reduce((sum, run) => sum + Number(run.passedTests ?? 0), 0),
    failedTests: runs.reduce((sum, run) => sum + Number(run.failedTests ?? 0), 0),
  };
}

export interface AzureLinkedPullRequest {
  id: number;
  title: string;
  status: string;
  sourceBranch: string;
  targetBranch: string;
  url: string;
}

export interface AzureLinkedBuild {
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  definitionName: string;
  url: string;
}

export interface AzureWorkItemDetail {
  id: number;
  revision: number;
  type: string;
  title: string;
  state: string;
  description?: string;
  acceptanceCriteria?: string;
  iterationPath?: string;
  tags: string[];
  assignedTo: string;
  createdDate?: string;
  changedDate?: string;
  relations: WorkItemRelationLink[];
  linkedPullRequests: AzureLinkedPullRequest[];
  linkedBuilds: AzureLinkedBuild[];
  testEvidence: AzureTestRunSummary[];
  comments: string[];
}

/** Bounds keep an inspector read fast and polite to the ADO rate limit. */
const MAX_RELATIONS = 64;
const MAX_LINKED_PRS = 8;
const MAX_LINKED_BUILDS = 8;
const MAX_TEST_EVIDENCE_BUILDS = 3;
const MAX_COMMENTS = 50;

/**
 * Full inspector read for one work item: fields, typed relation edges,
 * resolved pull request / build artifacts, and test evidence for linked
 * builds. Resolutions are best-effort — one failing artifact (e.g. a deleted
 * PR) degrades that link to an empty row, never the whole detail.
 */
export async function readAzureWorkItemDetail(args: {
  organization: string;
  project: string;
  workItemId: string | number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureWorkItemDetail> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const workItemId = Number(args.workItemId ?? 0);
  if (!org || !project || !workItemId) {
    throw new ToolError("ADO organization, project, and work item ID are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const read = await readAzureWorkItem({ organization: org, project, workItemId, auth }).catch((err) => {
    if (err instanceof Error && /\(404\)/.test(err.message)) {
      throw new ToolError(`work_item_not_found: ${err.message}`);
    }
    throw err;
  });

  const fields = read.fields;
  const relations = parseWorkItemRelationLinks(read.relationLinks).slice(0, MAX_RELATIONS);

  const pullRequestEdges = relations
    .filter((relation) => relation.kind === "pull_request" && relation.id)
    .slice(0, MAX_LINKED_PRS);
  const linkedPullRequests: AzureLinkedPullRequest[] = [];
  for (const edge of pullRequestEdges) {
    try {
      const pr = await getAzurePullRequestById({
        organization: org,
        project,
        repository: edge.label ?? "",
        pullRequestId: edge.id!,
        auth,
      });
      linkedPullRequests.push({
        id: pr.id,
        title: pr.title,
        status: pr.status,
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        url: pr.url,
      });
    } catch {
      // A missing/renamed repository degrades this PR edge to a bare link.
    }
  }

  const buildEdges = relations
    .filter((relation) => relation.kind === "build" && relation.id)
    .slice(0, MAX_LINKED_BUILDS);
  const linkedBuilds = await listAzureBuilds({
    organization: org,
    project,
    buildIds: buildEdges.map((edge) => edge.id!),
    auth,
    top: MAX_LINKED_BUILDS,
  }).catch(() => [] as Awaited<ReturnType<typeof listAzureBuilds>>);

  const testEvidence: AzureTestRunSummary[] = [];
  for (const build of linkedBuilds.slice(0, MAX_TEST_EVIDENCE_BUILDS)) {
    try {
      testEvidence.push(await listAzureTestRunSummariesByBuild({ organization: org, project, buildId: build.id, auth }));
    } catch {
      // Test result access is not always granted; keep the build row.
    }
  }

  const assigned = fields["System.AssignedTo"];
  return {
    id: read.id,
    revision: read.revision,
    type: read.type,
    title: read.title,
    state: read.state,
    description: plainWorkItemDetailText(fields["System.Description"]),
    acceptanceCriteria: plainWorkItemDetailText(fields["Microsoft.VSTS.Common.AcceptanceCriteria"]),
    iterationPath: fields["System.IterationPath"] ? String(fields["System.IterationPath"]) : undefined,
    tags: String(fields["System.Tags"] ?? "")
      .split(";")
      .map((tag) => tag.trim())
      .filter(Boolean),
    assignedTo: typeof assigned === "object" && assigned !== null
      ? String((assigned as Record<string, unknown>)["displayName"] ?? "")
      : typeof assigned === "string"
        ? assigned
        : "",
    createdDate: fields["System.CreatedDate"] ? String(fields["System.CreatedDate"]) : undefined,
    changedDate: fields["System.ChangedDate"] ? String(fields["System.ChangedDate"]) : undefined,
    relations,
    linkedPullRequests,
    linkedBuilds: linkedBuilds.map((build) => ({
      id: build.id,
      buildNumber: build.buildNumber,
      status: build.status,
      result: build.result,
      definitionName: build.definitionName,
      url: build.url,
    })),
    testEvidence,
    comments: read.comments.slice(0, MAX_COMMENTS),
  };
}

function plainWorkItemDetailText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
  return text || undefined;
}
