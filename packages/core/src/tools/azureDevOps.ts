import { getSettings } from "../settings.js";
import { getAzureDevOpsToken, isAzureAuthenticationRequiredError } from "../store/azureAuth.js";
import { ToolError, type Tool, type ToolContext } from "./executor.js";

export const PAT_KEYRING_SERVICE = "cicd-agent";
export const PAT_KEYRING_USER = "azure-devops-pat";

const API_VERSION_GIT = "7.1-preview.1";
const API_VERSION_WI = "7.1-preview.3";
const API_VERSION_PIPELINES = "7.1-preview.1";
const API_VERSION_CORE = "7.1-preview.4";
const API_VERSION_BUILD = "7.1-preview.7";
const API_VERSION_POLICY = "7.1-preview.1";

export type PatProvider = () => Promise<string>;
export type AdoAuthMode = "oauth" | "pat";
export type AdoAuthStatus =
  | "ok"
  | "oauth_unavailable"
  | "oauth_no_org_access"
  | "pat_invalid_or_missing_scope"
  | "unknown_error";

export interface AdoAuth {
  mode: AdoAuthMode;
  header: string;
}

export interface AdoAuthDiagnostic {
  status: AdoAuthStatus;
  authMode?: AdoAuthMode;
  message: string;
  retryable: boolean;
}

export class AdoAuthDiagnosticError extends ToolError {
  readonly diagnostic: AdoAuthDiagnostic;

  constructor(diagnostic: AdoAuthDiagnostic) {
    super(diagnostic.message);
    this.name = "AdoAuthDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

let patProvider: PatProvider = async () => {
  // Default: read from keyring via dynamic import; injectable in tests.
  try {
    const keytarMod = await import("keytar");
    const keytar = keytarMod.default ?? keytarMod;
    const pat = (await keytar.getPassword(PAT_KEYRING_SERVICE, PAT_KEYRING_USER)) ?? "";
    if (!pat) {
      throw new ToolError("Azure DevOps PAT not configured. Run `dev-agent configure-pat`.");
    }
    return pat;
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw new ToolError(
      `could not read PAT from keyring: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

export function setPatProvider(provider: PatProvider): void {
  patProvider = provider;
}

function patAuth(pat: string): AdoAuth {
  return { mode: "pat", header: `Basic ${Buffer.from(`:${pat}`).toString("base64")}` };
}

function bearerAuth(token: string): AdoAuth {
  return { mode: "oauth", header: `Bearer ${token}` };
}

function authHeader(auth: AdoAuth): Record<string, string> {
  return { Authorization: auth.header };
}

const ADO_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** ADO returns 302 to a sign-in page when PAT auth fails; do not follow that redirect. */
async function adoFetch(url: string, auth: AdoAuth, init: RequestInit = {}): Promise<Response> {
  const resp = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      ...authHeader(auth),
      ...(init.headers ?? {}),
    },
  });
  if (ADO_REDIRECT_STATUSES.has(resp.status)) {
    throw new AdoAuthDiagnosticError(auth.mode === "oauth"
      ? {
        status: "oauth_no_org_access",
        authMode: "oauth",
        message: "ADO OAuth redirected to sign-in. Sign in again and confirm this account can access the Azure DevOps organization.",
        retryable: true,
      }
      : {
        status: "pat_invalid_or_missing_scope",
        authMode: "pat",
        message: "ADO PAT authentication redirected to sign-in. Check the organization URL, PAT value, and required scopes.",
        retryable: false,
      });
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new AdoAuthDiagnosticError(auth.mode === "oauth"
      ? {
        status: "oauth_no_org_access",
        authMode: "oauth",
        message: `ADO OAuth was rejected with HTTP ${resp.status}. Confirm organization access and Azure DevOps OAuth consent.`,
        retryable: true,
      }
      : {
        status: "pat_invalid_or_missing_scope",
        authMode: "pat",
        message: `ADO PAT was rejected with HTTP ${resp.status}. Check the PAT value and scopes.`,
        retryable: false,
      });
  }
  return resp;
}

export function adoAuthDiagnosticFromError(err: unknown, authMode?: AdoAuthMode): AdoAuthDiagnostic {
  if (err instanceof AdoAuthDiagnosticError) return err.diagnostic;
  if (isAzureAuthenticationRequiredError(err)) {
    return {
      status: "oauth_unavailable",
      authMode: "oauth",
      message: err instanceof Error ? err.message : "Azure DevOps OAuth token is unavailable. Sign in again or configure a PAT fallback.",
      retryable: true,
    };
  }
  if (err instanceof ToolError && /PAT|scope|sign-in|authentication/i.test(err.message)) {
    return {
      status: authMode === "oauth" ? "oauth_no_org_access" : "pat_invalid_or_missing_scope",
      authMode,
      message: err.message,
      retryable: authMode !== "pat",
    };
  }
  return {
    status: "unknown_error",
    authMode,
    message: err instanceof Error ? err.message : String(err),
    retryable: true,
  };
}

function adoBase(org: string): string {
  // Accept either a full URL (https://tebssg.visualstudio.com or
  // https://dev.azure.com/myorg) or a bare org slug.
  if (org.startsWith("http://") || org.startsWith("https://")) {
    return org.replace(/\/$/, "");
  }
  return `https://dev.azure.com/${org}`;
}

export interface AzurePullRequestSummary {
  id: number;
  title: string;
  status: string;
  isDraft: boolean;
  sourceBranch: string;
  targetBranch: string;
  createdBy: string;
  creationDate: string;
  repository: string;
  url: string;
  reviewerCount: number;
  voteSummary: {
    approved: number;
    waiting: number;
    rejected: number;
  };
}

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

export interface AzureBuildTimelineIssue {
  type: string;
  category: string;
  message: string;
}

export interface AzureBuildTimelineRecord {
  id: string;
  parentId: string;
  type: string;
  name: string;
  state: string;
  result: string;
  startTime: string;
  finishTime: string;
  logId: number;
  logUrl: string;
  issues: AzureBuildTimelineIssue[];
}

export interface AzureBuildLogExcerpt {
  buildId: number;
  logId: number;
  lineCount: number;
  startLine: number;
  endLine: number;
  excerpt: string;
  truncated: boolean;
  url: string;
}

export interface AzureBuildTimelineSummary {
  buildId: number;
  failedRecords: AzureBuildTimelineRecord[];
  errorIssues: AzureBuildTimelineIssue[];
  warningIssues: AzureBuildTimelineIssue[];
}

export interface AzurePullRequestDetail extends AzurePullRequestSummary {
  codeReviewId: number;
  projectId: string;
  project: string;
  description: string;
  closedDate: string;
  workItemRefs: Array<{ id: string; url: string }>;
}

export interface AzurePullRequestUpdateResult {
  id: number;
  title: string;
  description: string;
  status: string;
  url: string;
}

export interface AzurePullRequestReviewerUpdateResult {
  pullRequestId: number;
  reviewerId: string;
  displayName: string;
  uniqueName: string;
  vote: number;
  isRequired: boolean;
  action: "added" | "removed";
}

export interface AzurePullRequestLabelUpdateResult {
  pullRequestId: number;
  label: string;
  id: string;
  name: string;
  active: boolean;
  action: "added" | "removed";
}

export interface AzurePullRequestThread {
  id: number;
  publishedDate: string;
  lastUpdatedDate: string;
  status: string | number;
  comments: Array<{
    id: number;
    author: {
      displayName: string;
      uniqueName: string;
    };
    content: string;
    publishedDate: string;
    lastUpdatedDate: string;
    lastContentUpdatedDate: string;
  }>;
  threadContext: unknown;
}

export interface AzurePullRequestChange {
  changeId: number;
  changeType: string | number;
  path: string;
  originalPath: string;
  gitObjectType: string;
  commitId: string;
}

export interface AzurePullRequestChanges {
  iterationId: number;
  sourceCommit: string;
  targetCommit: string;
  commonCommit: string;
  fileCount: number;
  changes: AzurePullRequestChange[];
  nextSkip?: number;
  nextTop?: number;
}

export interface AzureBuildSummary {
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  queueTime: string;
  startTime: string;
  finishTime: string;
  sourceBranch: string;
  sourceVersion: string;
  definitionName: string;
  repository: string;
  requestedFor: string;
  url: string;
}

export interface AzureWorkItemSummary {
  id: number;
  url: string;
  type: string;
  title: string;
  state: string;
  assignedTo: string;
  tags: string[];
}

export interface AzurePullRequestPolicyEvaluation {
  id: string;
  status: string;
  startedDate: string;
  completedDate: string;
  displayName: string;
  typeName: string;
  configurationId: number;
  isBlocking: boolean;
}

export interface AzureDevOpsDiscoveryOption {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface AzureDevOpsToolHealth {
  ok: boolean;
  source: "internal";
  authMode: AdoAuthMode;
  authStatus: AdoAuthStatus;
  authMessage: string;
  toolCount: number;
  tools: Array<{ name: string; description: string }>;
  projectCount: number;
}

export const INTERNAL_AZURE_DEVOPS_TOOL_MANIFEST: Array<{ name: string; description: string }> = [
  { name: "ado_core_list_projects", description: "List Azure DevOps projects." },
  { name: "ado_repo_list_repos_by_project", description: "List Azure Repos repositories by project." },
  { name: "ado_pipelines_get_build_definitions", description: "List Azure Pipelines build definitions." },
  { name: "ado_list_pull_requests", description: "List Azure DevOps pull requests." },
  { name: "ado_get_pull_request_by_id", description: "Get Azure DevOps pull request details." },
  { name: "ado_list_pull_request_threads", description: "List Azure DevOps pull request comment threads." },
  { name: "ado_get_pull_request_changes", description: "Get Azure DevOps pull request changed files." },
  { name: "ado_list_pull_request_work_items", description: "List work item details linked to an Azure DevOps pull request." },
  { name: "ado_list_pull_request_policy_evaluations", description: "List branch policy evaluations for an Azure DevOps pull request." },
  { name: "ado_pipelines_get_builds", description: "List Azure DevOps builds." },
  { name: "ado_pipelines_get_run", description: "Get an Azure Pipeline run." },
  { name: "ado_list_pipeline_runs", description: "List Azure Pipeline runs." },
  { name: "ado_get_build_timeline", description: "Get failed task and issue details from an Azure DevOps build timeline." },
  { name: "ado_get_build_log_excerpt", description: "Get a concise diagnostic excerpt from an Azure DevOps build log." },
  { name: "ado_create_pr", description: "Create an Azure DevOps pull request." },
  { name: "ado_update_pull_request", description: "Update an Azure DevOps pull request title, description, or status." },
  { name: "ado_add_pull_request_reviewer", description: "Add a reviewer to an Azure DevOps pull request or set the caller's reviewer vote." },
  { name: "ado_remove_pull_request_reviewer", description: "Remove a reviewer from an Azure DevOps pull request." },
  { name: "ado_add_pull_request_label", description: "Add a label/tag to an Azure DevOps pull request." },
  { name: "ado_remove_pull_request_label", description: "Remove a label/tag from an Azure DevOps pull request." },
  { name: "ado_link_work_item", description: "Attach a work item to a pull request." },
  { name: "ado_trigger_pipeline", description: "Queue a run of an Azure DevOps pipeline." },
];

function resolveOrgProject(ctx: ToolContext, payload: Record<string, unknown>): {
  org: string;
  project: string;
} {
  const settings = getSettings();
  const org =
    String(payload["organization"] ?? "") ||
    String(ctx.extra["ado_org"] ?? "") ||
    settings.azureDevOpsOrg;
  const project =
    String(payload["project"] ?? "") ||
    String(ctx.extra["ado_project"] ?? "") ||
    settings.azureDevOpsProject;
  if (!org || !project) {
    throw new ToolError(
      "Azure DevOps org/project missing. Set AZURE_DEVOPS_ORG and AZURE_DEVOPS_PROJECT, or pass them in the payload.",
    );
  }
  return { org, project };
}

async function resolveAdoAuth(ctx: ToolContext): Promise<AdoAuth> {
  const ctxPat = String(ctx.extra?.["ado_pat"] ?? "").trim();
  if (ctxPat) return patAuth(ctxPat);

  try {
    return bearerAuth(await getAzureDevOpsToken({ interactive: false }));
  } catch (err) {
    if (!isAzureAuthenticationRequiredError(err)) throw err;
  }

  try {
    return patAuth(await patProvider());
  } catch (err) {
    if (err instanceof ToolError) {
      throw new ToolError(
        "Azure DevOps OAuth token is unavailable and no PAT fallback is configured. Sign in again or configure an ADO PAT.",
      );
    }
    throw err;
  }
}

export async function getAzureDevOpsAuth(preferredPat?: string): Promise<AdoAuth> {
  const pat = preferredPat?.trim();
  if (pat) return patAuth(pat);
  return bearerAuth(await getAzureDevOpsToken({ interactive: false }));
}

async function postJson(url: string, body: unknown, auth: AdoAuth): Promise<Response> {
  return adoFetch(url, auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchJson(url: string, body: unknown, auth: AdoAuth, contentType: string): Promise<Response> {
  return adoFetch(url, auth, {
    method: "PATCH",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

export async function listAzurePullRequests(args: {
  organization: string;
  project: string;
  repository: string;
  pat?: string;
  auth?: AdoAuth;
  status?: "active" | "completed" | "abandoned" | "all";
  top?: number;
  creatorId?: string;
  reviewerId?: string;
}): Promise<AzurePullRequestSummary[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  if (!org || !project || !repository) {
    throw new ToolError("ADO organization, project, and repository are required to list pull requests.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);

  const params = new URLSearchParams({
    "searchCriteria.status": args.status ?? "active",
    "$top": String(args.top ?? 50),
    "api-version": API_VERSION_GIT,
  });
  if (args.creatorId) params.set("searchCriteria.creatorId", args.creatorId);
  if (args.reviewerId) params.set("searchCriteria.reviewerId", args.reviewerId);

  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullrequests?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = (await parseAdoJson(resp, "list pull requests")) as {
    value?: Array<{
      pullRequestId?: number;
      title?: string;
      status?: string;
      isDraft?: boolean;
      sourceRefName?: string;
      targetRefName?: string;
      creationDate?: string;
      createdBy?: { displayName?: string };
      repository?: { name?: string };
      reviewers?: Array<{ vote?: number }>;
    }>;
  };
  return (data.value ?? []).map((pr) => {
    const id = Number(pr.pullRequestId ?? 0);
    const reviewers = pr.reviewers ?? [];
    return {
      id,
      title: pr.title ?? "",
      status: pr.status ?? "",
      isDraft: Boolean(pr.isDraft ?? false),
      sourceBranch: stripRef(pr.sourceRefName ?? ""),
      targetBranch: stripRef(pr.targetRefName ?? ""),
      createdBy: pr.createdBy?.displayName ?? "",
      creationDate: pr.creationDate ?? "",
      repository: pr.repository?.name ?? repository,
      url: id ? `${adoBase(org)}/${project}/_git/${repository}/pullrequest/${id}` : "",
      reviewerCount: reviewers.length,
      voteSummary: {
        approved: reviewers.filter((r) => Number(r.vote ?? 0) > 0).length,
        waiting: reviewers.filter((r) => Number(r.vote ?? 0) === 0).length,
        rejected: reviewers.filter((r) => Number(r.vote ?? 0) < 0).length,
      },
    };
  });
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
    value?: Array<{
      id?: number;
      name?: string;
      state?: string;
      result?: string;
      createdDate?: string;
      finishedDate?: string;
      _links?: { web?: { href?: string } };
      resources?: { repositories?: { self?: { refName?: string } } };
    }>;
  };
  return (data.value ?? []).map((run) => ({
    id: Number(run.id ?? 0),
    name: run.name ?? "",
    state: run.state ?? "",
    result: run.result ?? "",
    createdDate: run.createdDate ?? "",
    finishedDate: run.finishedDate ?? "",
    sourceBranch: stripRef(run.resources?.repositories?.self?.refName ?? ""),
    url: run._links?.web?.href ?? "",
  }));
}

export async function getAzurePullRequestById(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  pat?: string;
  auth?: AdoAuth;
  includeWorkItemRefs?: boolean;
}): Promise<AzurePullRequestDetail> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  if (!org || !project || !repository || !pullRequestId) {
    throw new ToolError("ADO organization, project, repository, and pull request ID are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({
    "api-version": API_VERSION_GIT,
  });
  if (args.includeWorkItemRefs) params.set("includeWorkItemRefs", "true");
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullrequests/${pullRequestId}?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const pr = await parseAdoJson(resp, "get pull request") as {
    pullRequestId?: number;
    codeReviewId?: number;
    title?: string;
    description?: string;
    status?: string;
    isDraft?: boolean;
    sourceRefName?: string;
    targetRefName?: string;
    creationDate?: string;
    closedDate?: string;
    createdBy?: { displayName?: string };
    repository?: { name?: string; project?: { id?: string; name?: string } };
    reviewers?: Array<{ vote?: number }>;
    workItemRefs?: Array<{ id?: string; url?: string }>;
  };
  const reviewers = pr.reviewers ?? [];
  const id = Number(pr.pullRequestId ?? pullRequestId);
  return {
    id,
    codeReviewId: Number(pr.codeReviewId ?? 0),
    title: pr.title ?? "",
    description: pr.description ?? "",
    status: pr.status ?? "",
    isDraft: Boolean(pr.isDraft ?? false),
    sourceBranch: stripRef(pr.sourceRefName ?? ""),
    targetBranch: stripRef(pr.targetRefName ?? ""),
    createdBy: pr.createdBy?.displayName ?? "",
    creationDate: pr.creationDate ?? "",
    closedDate: pr.closedDate ?? "",
    repository: pr.repository?.name ?? repository,
    projectId: pr.repository?.project?.id ?? "",
    project: pr.repository?.project?.name ?? project,
    url: `${adoBase(org)}/${project}/_git/${repository}/pullrequest/${id}`,
    reviewerCount: reviewers.length,
    voteSummary: {
      approved: reviewers.filter((r) => Number(r.vote ?? 0) > 0).length,
      waiting: reviewers.filter((r) => Number(r.vote ?? 0) === 0).length,
      rejected: reviewers.filter((r) => Number(r.vote ?? 0) < 0).length,
    },
    workItemRefs: (pr.workItemRefs ?? []).map((ref) => ({
      id: ref.id ?? "",
      url: ref.url ?? "",
    })).filter((ref) => ref.id || ref.url),
  };
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
  return (details.value ?? []).map((item) => {
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
  });
}

export async function updateAzurePullRequest(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  title?: string;
  description?: string;
  status?: "active" | "abandoned" | "completed";
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePullRequestUpdateResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  if (!org || !project || !repository || !pullRequestId) {
    throw new ToolError("ADO organization, project, repository, and pull request ID are required to update a pull request.");
  }
  const body: Record<string, unknown> = {};
  if (args.title !== undefined) body["title"] = args.title;
  if (args.description !== undefined) body["description"] = args.description;
  if (args.status !== undefined) body["status"] = args.status;
  if (Object.keys(body).length === 0) {
    throw new ToolError("At least one pull request update field is required: title, description, or status.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullrequests/${pullRequestId}?api-version=${API_VERSION_GIT}`;
  const resp = await patchJson(url, body, auth, "application/json");
  if (!resp.ok) {
    throw new ToolError(`ADO update_pull_request failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  const pr = await resp.json() as {
    pullRequestId?: number;
    title?: string;
    description?: string;
    status?: string;
  };
  const id = Number(pr.pullRequestId ?? pullRequestId);
  return {
    id,
    title: pr.title ?? args.title ?? "",
    description: pr.description ?? args.description ?? "",
    status: pr.status ?? args.status ?? "",
    url: `${adoBase(org)}/${project}/_git/${repository}/pullrequest/${id}`,
  };
}

export async function addAzurePullRequestReviewer(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  reviewerId: string;
  vote?: number;
  isRequired?: boolean;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePullRequestReviewerUpdateResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  const reviewerId = args.reviewerId.trim();
  if (!org || !project || !repository || !pullRequestId || !reviewerId) {
    throw new ToolError("ADO organization, project, repository, pull request ID, and reviewer ID are required to add a reviewer.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullRequests/${pullRequestId}/reviewers/${encodeURIComponent(reviewerId)}` +
    `?api-version=${API_VERSION_GIT}`;
  const body: Record<string, unknown> = {};
  if (args.vote !== undefined) body["vote"] = args.vote;
  if (args.isRequired !== undefined) body["isRequired"] = args.isRequired;
  const resp = await adoFetch(url, auth, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new ToolError(`ADO add_pull_request_reviewer failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  const reviewer = await resp.json() as {
    id?: string;
    displayName?: string;
    uniqueName?: string;
    vote?: number;
    isRequired?: boolean;
  };
  return {
    pullRequestId,
    reviewerId: reviewer.id ?? reviewerId,
    displayName: reviewer.displayName ?? "",
    uniqueName: reviewer.uniqueName ?? "",
    vote: Number(reviewer.vote ?? args.vote ?? 0),
    isRequired: Boolean(reviewer.isRequired ?? args.isRequired ?? false),
    action: "added",
  };
}

export async function removeAzurePullRequestReviewer(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  reviewerId: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePullRequestReviewerUpdateResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  const reviewerId = args.reviewerId.trim();
  if (!org || !project || !repository || !pullRequestId || !reviewerId) {
    throw new ToolError("ADO organization, project, repository, pull request ID, and reviewer ID are required to remove a reviewer.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullRequests/${pullRequestId}/reviewers/${encodeURIComponent(reviewerId)}` +
    `?api-version=${API_VERSION_GIT}`;
  const resp = await adoFetch(url, auth, { method: "DELETE" });
  if (!resp.ok && resp.status !== 204) {
    throw new ToolError(`ADO remove_pull_request_reviewer failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  return {
    pullRequestId,
    reviewerId,
    displayName: "",
    uniqueName: "",
    vote: 0,
    isRequired: false,
    action: "removed",
  };
}

export async function addAzurePullRequestLabel(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  label: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePullRequestLabelUpdateResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  const label = args.label.trim();
  if (!org || !project || !repository || !pullRequestId || !label) {
    throw new ToolError("ADO organization, project, repository, pull request ID, and label are required to add a pull request label.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullRequests/${pullRequestId}/labels?api-version=${API_VERSION_GIT}`;
  const resp = await postJson(url, { name: label }, auth);
  if (!resp.ok) {
    throw new ToolError(`ADO add_pull_request_label failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  const tag = await resp.json() as { id?: string; name?: string; active?: boolean };
  return {
    pullRequestId,
    label,
    id: tag.id ?? "",
    name: tag.name ?? label,
    active: Boolean(tag.active ?? true),
    action: "added",
  };
}

export async function removeAzurePullRequestLabel(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  label: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePullRequestLabelUpdateResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  const label = args.label.trim();
  if (!org || !project || !repository || !pullRequestId || !label) {
    throw new ToolError("ADO organization, project, repository, pull request ID, and label are required to remove a pull request label.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullRequests/${pullRequestId}/labels/${encodeURIComponent(label)}` +
    `?api-version=${API_VERSION_GIT}`;
  const resp = await adoFetch(url, auth, { method: "DELETE" });
  if (!resp.ok && resp.status !== 204) {
    throw new ToolError(`ADO remove_pull_request_label failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  return {
    pullRequestId,
    label,
    id: "",
    name: label,
    active: false,
    action: "removed",
  };
}

export async function listAzurePullRequestPolicyEvaluations(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePullRequestPolicyEvaluation[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  if (!org || !project || !repository || !pullRequestId) {
    throw new ToolError("ADO organization, project, repository, and pull request ID are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const pr = await getAzurePullRequestById({
    organization: org,
    project,
    repository,
    pullRequestId,
    auth,
  });
  const projectArtifactPart = pr.projectId || project;
  const codeReviewId = pr.codeReviewId || pullRequestId;
  const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectArtifactPart}/${codeReviewId}`;
  const params = new URLSearchParams({
    artifactId,
    "api-version": API_VERSION_POLICY,
  });
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/policy/evaluations?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = await parseAdoJson(resp, "list pull request policy evaluations") as {
    value?: Array<{
      evaluationId?: string;
      id?: string;
      status?: string;
      startedDate?: string;
      completedDate?: string;
      configuration?: {
        id?: number;
        isBlocking?: boolean;
        settings?: { displayName?: string };
        type?: { displayName?: string };
      };
    }>;
  };
  return (data.value ?? []).map((policy) => ({
    id: policy.evaluationId ?? policy.id ?? "",
    status: policy.status ?? "",
    startedDate: policy.startedDate ?? "",
    completedDate: policy.completedDate ?? "",
    displayName: policy.configuration?.settings?.displayName ?? policy.configuration?.type?.displayName ?? "",
    typeName: policy.configuration?.type?.displayName ?? "",
    configurationId: Number(policy.configuration?.id ?? 0),
    isBlocking: Boolean(policy.configuration?.isBlocking ?? false),
  }));
}

export async function listAzurePullRequestThreads(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
  skip?: number;
  status?: string | number;
  authorEmail?: string;
  authorDisplayName?: string;
}): Promise<AzurePullRequestThread[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  if (!org || !project || !repository || !pullRequestId) {
    throw new ToolError("ADO organization, project, repository, and pull request ID are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({ "api-version": API_VERSION_GIT });
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullrequests/${pullRequestId}/threads?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = await parseAdoJson(resp, "list pull request threads") as {
    value?: Array<{
      id?: number;
      publishedDate?: string;
      lastUpdatedDate?: string;
      status?: string | number;
      comments?: Array<{
        id?: number;
        isDeleted?: boolean;
        author?: { displayName?: string; uniqueName?: string };
        content?: string;
        publishedDate?: string;
        lastUpdatedDate?: string;
        lastContentUpdatedDate?: string;
      }>;
      threadContext?: unknown;
    }>;
  };
  const authorEmail = args.authorEmail?.toLowerCase();
  const authorDisplayName = args.authorDisplayName?.toLowerCase();
  const status = args.status;
  const top = Math.max(1, args.top ?? 100);
  const skip = Math.max(0, args.skip ?? 0);
  return (data.value ?? [])
    .filter((thread) => status === undefined || String(thread.status ?? "") === String(status))
    .filter((thread) => {
      const first = thread.comments?.[0];
      if (authorEmail && first?.author?.uniqueName?.toLowerCase() !== authorEmail) return false;
      if (authorDisplayName && !first?.author?.displayName?.toLowerCase().includes(authorDisplayName)) return false;
      return true;
    })
    .sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))
    .slice(skip, skip + top)
    .map((thread) => ({
      id: Number(thread.id ?? 0),
      publishedDate: thread.publishedDate ?? "",
      lastUpdatedDate: thread.lastUpdatedDate ?? "",
      status: thread.status ?? "",
      comments: (thread.comments ?? [])
        .filter((comment) => !comment.isDeleted)
        .map((comment) => ({
          id: Number(comment.id ?? 0),
          author: {
            displayName: comment.author?.displayName ?? "",
            uniqueName: comment.author?.uniqueName ?? "",
          },
          content: comment.content ?? "",
          publishedDate: comment.publishedDate ?? "",
          lastUpdatedDate: comment.lastUpdatedDate ?? "",
          lastContentUpdatedDate: comment.lastContentUpdatedDate ?? "",
        })),
      threadContext: thread.threadContext ?? null,
    }));
}

export async function listAzurePullRequestChanges(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  pat?: string;
  auth?: AdoAuth;
  iterationId?: string | number;
  compareTo?: string | number;
  top?: number;
  skip?: number;
}): Promise<AzurePullRequestChanges> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  if (!org || !project || !repository || !pullRequestId) {
    throw new ToolError("ADO organization, project, repository, and pull request ID are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  let targetIteration = args.iterationId ? Number(args.iterationId) : 0;
  let iterationInfo: {
    id?: number;
    sourceRefCommit?: { commitId?: string };
    targetRefCommit?: { commitId?: string };
    commonRefCommit?: { commitId?: string };
  } | undefined;

  if (!targetIteration) {
    const iterationsUrl =
      `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
      `${encodeURIComponent(repository)}/pullrequests/${pullRequestId}/iterations?api-version=${API_VERSION_GIT}`;
    const iterationsResp = await adoFetch(iterationsUrl, auth);
    const iterations = await parseAdoJson(iterationsResp, "list pull request iterations") as {
      value?: Array<{
        id?: number;
        sourceRefCommit?: { commitId?: string };
        targetRefCommit?: { commitId?: string };
        commonRefCommit?: { commitId?: string };
      }>;
    };
    iterationInfo = iterations.value?.[iterations.value.length - 1];
    targetIteration = Number(iterationInfo?.id ?? 0);
  }

  if (!targetIteration) throw new ToolError("No iterations found for this pull request.");

  const params = new URLSearchParams({
    "api-version": API_VERSION_GIT,
  });
  if (args.top) params.set("$top", String(args.top));
  if (args.skip) params.set("$skip", String(args.skip));
  if (args.compareTo) params.set("$compareTo", String(args.compareTo));
  const changesUrl =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullrequests/${pullRequestId}/iterations/${targetIteration}/changes?${params.toString()}`;
  const changesResp = await adoFetch(changesUrl, auth);
  const changes = await parseAdoJson(changesResp, "list pull request changes") as {
    changeEntries?: Array<{
      changeId?: number;
      changeType?: string | number;
      originalPath?: string;
      item?: {
        path?: string;
        gitObjectType?: string;
        commitId?: string;
      };
    }>;
    nextSkip?: number;
    nextTop?: number;
  };

  return {
    iterationId: targetIteration,
    sourceCommit: iterationInfo?.sourceRefCommit?.commitId ?? "",
    targetCommit: iterationInfo?.targetRefCommit?.commitId ?? "",
    commonCommit: iterationInfo?.commonRefCommit?.commitId ?? "",
    fileCount: changes.changeEntries?.length ?? 0,
    changes: (changes.changeEntries ?? []).map((entry) => ({
      changeId: Number(entry.changeId ?? 0),
      changeType: entry.changeType ?? "",
      path: entry.item?.path ?? "",
      originalPath: entry.originalPath ?? "",
      gitObjectType: entry.item?.gitObjectType ?? "",
      commitId: entry.item?.commitId ?? "",
    })),
    nextSkip: changes.nextSkip,
    nextTop: changes.nextTop,
  };
}

export async function listAzureProjects(args: {
  organization: string;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
}): Promise<AzureDevOpsDiscoveryOption[]> {
  const org = args.organization.trim();
  if (!org) throw new ToolError("ADO organization is required to list projects.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({
    "$top": String(args.top ?? 100),
    "api-version": API_VERSION_CORE,
  });
  const url = `${adoBase(org)}/_apis/projects?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = (await parseAdoJson(resp, "list projects")) as {
    value?: Array<{ id?: string; name?: string; description?: string; url?: string }>;
  };
  return (data.value ?? []).map((project) => ({
    id: project.id ?? project.name ?? "",
    name: project.name ?? project.id ?? "",
    description: project.description ?? "",
    url: project.url ?? "",
  })).filter((project) => project.id || project.name);
}

export async function listAzureRepositories(args: {
  organization: string;
  project: string;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
}): Promise<AzureDevOpsDiscoveryOption[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project) throw new ToolError("ADO organization and project are required to list repositories.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({ "api-version": API_VERSION_GIT });
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = (await parseAdoJson(resp, "list repositories")) as {
    value?: Array<{ id?: string; name?: string; defaultBranch?: string; webUrl?: string; remoteUrl?: string; url?: string }>;
  };
  return (data.value ?? []).slice(0, args.top ?? 100).map((repo) => ({
    id: repo.id ?? repo.name ?? "",
    name: repo.name ?? repo.id ?? "",
    description: stripRef(repo.defaultBranch ?? ""),
    url: repo.webUrl ?? repo.remoteUrl ?? repo.url ?? "",
  })).filter((repo) => repo.id || repo.name);
}

export async function listAzureBuildDefinitions(args: {
  organization: string;
  project: string;
  repositoryId?: string;
  repositoryType?: string;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
}): Promise<AzureDevOpsDiscoveryOption[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project) throw new ToolError("ADO organization and project are required to list build definitions.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({
    "$top": String(args.top ?? 100),
    "api-version": API_VERSION_BUILD,
  });
  const repository = args.repositoryId?.trim();
  if (repository) {
    params.set("repositoryId", await resolveRepositoryId(org, project, repository, auth));
    params.set("repositoryType", args.repositoryType?.trim() || "TfsGit");
  }
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/build/definitions?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = (await parseAdoJson(resp, "list build definitions")) as {
    value?: Array<{
      id?: number;
      name?: string;
      path?: string;
      url?: string;
      repository?: { id?: string; name?: string; type?: string };
      process?: { yamlFilename?: string };
      _links?: { web?: { href?: string } };
    }>;
  };
  return (data.value ?? []).map((definition) => {
    const id = String(definition.id ?? definition.name ?? "");
    const descriptionParts = [
      definition.path,
      definition.repository?.name ? `repo:${definition.repository.name}` : "",
      definition.repository?.type ? `type:${definition.repository.type}` : "",
      definition.process?.yamlFilename ? `yaml:${definition.process.yamlFilename}` : "",
    ].filter(Boolean);
    return {
      id,
      name: definition.name ?? id,
      description: descriptionParts.join(" · "),
      url: definition._links?.web?.href ?? definition.url ?? "",
    };
  }).filter((definition) => definition.id || definition.name);
}

export async function listAzureBuilds(args: {
  organization: string;
  project: string;
  pat?: string;
  auth?: AdoAuth;
  definitions?: Array<string | number>;
  branchName?: string;
  repositoryId?: string;
  repositoryType?: string;
  top?: number;
  buildIds?: Array<string | number>;
}): Promise<AzureBuildSummary[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project) throw new ToolError("ADO organization and project are required to list builds.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({
    "queryOrder": "queueTimeDescending",
    "$top": String(args.top ?? 50),
    "api-version": API_VERSION_BUILD,
  });
  if (args.definitions?.length) params.set("definitions", args.definitions.map(String).join(","));
  if (args.buildIds?.length) params.set("buildIds", args.buildIds.map(String).join(","));
  if (args.branchName) params.set("branchName", normalizeBranchRef(args.branchName));
  if (args.repositoryId) params.set("repositoryId", args.repositoryId);
  if (args.repositoryType) params.set("repositoryType", args.repositoryType);
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/build/builds?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = await parseAdoJson(resp, "list builds") as {
    value?: Array<{
      id?: number;
      buildNumber?: string;
      status?: string;
      result?: string;
      queueTime?: string;
      startTime?: string;
      finishTime?: string;
      sourceBranch?: string;
      sourceVersion?: string;
      definition?: { name?: string };
      repository?: { name?: string };
      requestedFor?: { displayName?: string };
      _links?: { web?: { href?: string } };
      url?: string;
    }>;
  };
  return (data.value ?? []).map((build) => ({
    id: Number(build.id ?? 0),
    buildNumber: build.buildNumber ?? "",
    status: build.status ?? "",
    result: build.result ?? "",
    queueTime: build.queueTime ?? "",
    startTime: build.startTime ?? "",
    finishTime: build.finishTime ?? "",
    sourceBranch: stripRef(build.sourceBranch ?? ""),
    sourceVersion: build.sourceVersion ?? "",
    definitionName: build.definition?.name ?? "",
    repository: build.repository?.name ?? "",
    requestedFor: build.requestedFor?.displayName ?? "",
    url: build._links?.web?.href ?? build.url ?? "",
  }));
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
  const run = await parseAdoJson(resp, "get pipeline run") as {
    id?: number;
    name?: string;
    state?: string;
    result?: string;
    createdDate?: string;
    finishedDate?: string;
    _links?: { web?: { href?: string } };
    resources?: { repositories?: { self?: { refName?: string } } };
  };
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

export async function getAzureBuildTimeline(args: {
  organization: string;
  project: string;
  buildId: string | number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureBuildTimelineSummary> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const buildId = Number(args.buildId ?? 0);
  if (!org || !project || !buildId) {
    throw new ToolError("ADO organization, project, and build ID are required to read the build timeline.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({ "api-version": API_VERSION_BUILD });
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/build/builds/${buildId}/timeline?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = await parseAdoJson(resp, "get build timeline") as {
    records?: Array<{
      id?: string;
      parentId?: string;
      type?: string;
      name?: string;
      state?: string;
      result?: string;
      startTime?: string;
      finishTime?: string;
      log?: { id?: number; url?: string };
      issues?: Array<{ type?: string; category?: string; message?: string }>;
    }>;
  };
  const records: AzureBuildTimelineRecord[] = (data.records ?? []).map((record) => ({
    id: record.id ?? "",
    parentId: record.parentId ?? "",
    type: record.type ?? "",
    name: record.name ?? "",
    state: record.state ?? "",
    result: record.result ?? "",
    startTime: record.startTime ?? "",
    finishTime: record.finishTime ?? "",
    logId: Number(record.log?.id ?? 0),
    logUrl: record.log?.url ?? "",
    issues: (record.issues ?? []).map((issue) => ({
      type: issue.type ?? "",
      category: issue.category ?? "",
      message: issue.message ?? "",
    })).filter((issue) => issue.type || issue.category || issue.message),
  }));
  const issues = records.flatMap((record) => record.issues);
  return {
    buildId,
    failedRecords: records.filter((record) =>
      /failed|canceled|cancelled|error/i.test(`${record.result} ${record.state}`) || record.issues.some((issue) => /error/i.test(issue.type)),
    ),
    errorIssues: issues.filter((issue) => /error/i.test(issue.type)),
    warningIssues: issues.filter((issue) => /warning/i.test(issue.type)),
  };
}

export async function getAzureBuildLogExcerpt(args: {
  organization: string;
  project: string;
  buildId: string | number;
  logId: string | number;
  pat?: string;
  auth?: AdoAuth;
  maxChars?: number;
}): Promise<AzureBuildLogExcerpt> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const buildId = Number(args.buildId ?? 0);
  const logId = Number(args.logId ?? 0);
  if (!org || !project || !buildId || !logId) {
    throw new ToolError("ADO organization, project, build ID, and log ID are required to read a build log.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({ "api-version": API_VERSION_BUILD });
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/build/builds/${buildId}/logs/${logId}` +
    `?${params.toString()}`;
  const resp = await adoFetch(url, auth, { headers: { Accept: "text/plain" } });
  if (!resp.ok) {
    throw new ToolError(`ADO get build log failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  const text = await resp.text();
  const excerpt = selectBuildLogExcerpt(text, args.maxChars ?? 6000);
  return {
    buildId,
    logId,
    url,
    ...excerpt,
  };
}

function selectBuildLogExcerpt(text: string, maxChars: number): Omit<AzureBuildLogExcerpt, "buildId" | "logId" | "url"> {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const diagnostics = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) =>
      /##\[error\]|\b(error|failed|failure|exception|assertionerror|traceback)\b|npm ERR!|\bFAIL\b/i.test(line),
    );
  const anchor = diagnostics.at(-1)?.index ?? lines.length - 1;
  const targetLineCount = 80;
  const before = diagnostics.length > 0 ? 24 : targetLineCount;
  const after = diagnostics.length > 0 ? 56 : 0;
  let start = Math.max(0, anchor - before);
  let end = Math.min(lines.length, anchor + after + 1);
  if (end - start > targetLineCount) start = Math.max(0, end - targetLineCount);
  let excerpt = lines.slice(start, end).join("\n").trim();
  let charTruncated = false;
  if (excerpt.length > maxChars) {
    excerpt = excerpt.slice(Math.max(0, excerpt.length - maxChars)).trimStart();
    charTruncated = true;
  }
  return {
    lineCount: lines.length,
    startLine: start + 1,
    endLine: end,
    excerpt,
    truncated: start > 0 || end < lines.length || charTruncated,
  };
}

export async function checkAzureDevOpsTools(args: {
  organization: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureDevOpsToolHealth> {
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const projects = await listAzureProjects({
    organization: args.organization,
    auth,
    top: 1,
  });
  return {
    ok: true,
    source: "internal",
    authMode: auth.mode,
    authStatus: "ok",
    authMessage: `ADO tools are reachable via ${auth.mode === "oauth" ? "OAuth" : "PAT fallback"}.`,
    toolCount: INTERNAL_AZURE_DEVOPS_TOOL_MANIFEST.length,
    tools: INTERNAL_AZURE_DEVOPS_TOOL_MANIFEST,
    projectCount: projects.length,
  };
}

async function resolveRepositoryId(
  organization: string,
  project: string,
  repository: string,
  auth: AdoAuth,
): Promise<string> {
  const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(repository);
  if (isGuid) return repository;
  const repos = await listAzureRepositories({ organization, project, auth });
  return repos.find((repo) => repo.name === repository || repo.id === repository)?.id ?? repository;
}

function stripRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

function normalizeBranchRef(branch: string): string {
  const trimmed = branch.trim();
  if (!trimmed || trimmed.startsWith("refs/")) return trimmed;
  return `refs/heads/${trimmed}`;
}

function extractWorkItemId(url: string): string {
  return url.match(/workItems\/(\d+)/i)?.[1] ?? "";
}

/** Parse an ADO REST response; surface HTML auth pages as a clear ToolError. */
async function parseAdoJson(resp: Response, action: string): Promise<unknown> {
  const text = await resp.text();
  if (!resp.ok) {
    throw new ToolError(`ADO ${action} failed: HTTP ${resp.status}: ${text.slice(0, 400)}`);
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    throw new ToolError(
      `ADO ${action} returned HTML instead of JSON (often a sign-in or error page). ` +
        "Check adoOrgUrl, project, repository, and PAT scopes (Code: Read).",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ToolError(
      `ADO ${action} returned invalid JSON. Body starts with: ${text.slice(0, 200)}`,
    );
  }
}

export function azureDevOpsTools(): Tool[] {
  return [
    {
      name: "ado_list_pull_request_work_items",
      description: "List work item details linked to an Azure DevOps pull request.",
      parameters: {
        type: "object",
        required: ["pull_request_id"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          repository: { type: "string" },
          pull_request_id: { type: "integer" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const repository =
          String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
        const pullRequestId = Number(payload["pull_request_id"] ?? 0);
        if (!repository || !pullRequestId) {
          throw new ToolError("list_pull_request_work_items requires 'repository' and 'pull_request_id'.");
        }
        const auth = await resolveAdoAuth(ctx);
        const workItems = await listAzurePullRequestWorkItems({
          organization: org,
          project,
          repository,
          pullRequestId,
          auth,
        });
        return {
          workItems,
          count: workItems.length,
        };
      },
    },
    {
      name: "ado_list_pull_request_policy_evaluations",
      description: "List branch policy evaluations for an Azure DevOps pull request.",
      parameters: {
        type: "object",
        required: ["pull_request_id"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          repository: { type: "string" },
          pull_request_id: { type: "integer" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const repository =
          String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
        const pullRequestId = Number(payload["pull_request_id"] ?? 0);
        if (!repository || !pullRequestId) {
          throw new ToolError("list_pull_request_policy_evaluations requires 'repository' and 'pull_request_id'.");
        }
        const auth = await resolveAdoAuth(ctx);
        const policies = await listAzurePullRequestPolicyEvaluations({
          organization: org,
          project,
          repository,
          pullRequestId,
          auth,
        });
        return {
          policies,
          count: policies.length,
          blocking: policies.filter((policy) => policy.isBlocking),
        };
      },
    },
    {
      name: "ado_create_pr",
      description: "Create an Azure DevOps pull request.",
      parameters: {
        type: "object",
        required: ["source_branch", "title"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          repository: { type: "string" },
          source_branch: { type: "string" },
          target_branch: { type: "string", default: "main" },
          title: { type: "string" },
          description: { type: "string" },
          draft: { type: "boolean", default: false },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const repository =
          String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
        if (!repository) throw new ToolError("create_pull_request requires 'repository'.");
        const source = String(payload["source_branch"] ?? "");
        const target = String(payload["target_branch"] ?? "main");
        const title = String(payload["title"] ?? "");
        const description = String(payload["description"] ?? "");
        const draft = Boolean(payload["draft"] ?? false);
        if (!source || !title) {
          throw new ToolError("create_pull_request requires 'source_branch' and 'title'.");
        }
        const auth = await resolveAdoAuth(ctx);
        const url =
          `${adoBase(org)}/${project}/_apis/git/repositories/${repository}/pullrequests` +
          `?api-version=${API_VERSION_GIT}`;
        const resp = await postJson(
          url,
          {
            sourceRefName: `refs/heads/${source}`,
            targetRefName: `refs/heads/${target}`,
            title,
            description,
            isDraft: draft,
          },
          auth,
        );
        if (!resp.ok) {
          throw new ToolError(
            `ADO create_pull_request failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`,
          );
        }
        const data = (await resp.json()) as {
          pullRequestId?: number;
          status?: string;
          createdBy?: { displayName?: string };
        };
        const prId = Number(data.pullRequestId ?? 0);
        return {
          pull_request_id: prId,
          url: prId
            ? `${adoBase(org)}/${project}/_git/${repository}/pullrequest/${prId}`
            : "",
          status: data.status ?? "",
          created_by: data.createdBy?.displayName ?? "",
        };
      },
    },
    {
      name: "ado_update_pull_request",
      description: "Update an Azure DevOps pull request title, description, or status.",
      parameters: {
        type: "object",
        required: ["pull_request_id"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          repository: { type: "string" },
          pull_request_id: { type: "integer" },
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["active", "abandoned", "completed"] },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const repository =
          String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
        const pullRequestId = Number(payload["pull_request_id"] ?? 0);
        if (!repository || !pullRequestId) {
          throw new ToolError("update_pull_request requires 'repository' and 'pull_request_id'.");
        }
        const auth = await resolveAdoAuth(ctx);
        const result = await updateAzurePullRequest({
          organization: org,
          project,
          repository,
          pullRequestId,
          title: payload["title"] === undefined ? undefined : String(payload["title"]),
          description: payload["description"] === undefined ? undefined : String(payload["description"]),
          status: payload["status"] === undefined
            ? undefined
            : String(payload["status"]) as "active" | "abandoned" | "completed",
          auth,
        });
        return { ...result };
      },
    },
    {
      name: "ado_add_pull_request_reviewer",
      description: "Add a reviewer to an Azure DevOps pull request or set the caller's reviewer vote.",
      parameters: {
        type: "object",
        required: ["pull_request_id", "reviewer_id"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          repository: { type: "string" },
          pull_request_id: { type: "integer" },
          reviewer_id: { type: "string" },
          vote: { type: "integer" },
          is_required: { type: "boolean" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const repository =
          String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
        const pullRequestId = Number(payload["pull_request_id"] ?? 0);
        const reviewerId = String(payload["reviewer_id"] ?? "");
        if (!repository || !pullRequestId || !reviewerId) {
          throw new ToolError("add_pull_request_reviewer requires 'repository', 'pull_request_id', and 'reviewer_id'.");
        }
        const auth = await resolveAdoAuth(ctx);
        const result = await addAzurePullRequestReviewer({
          organization: org,
          project,
          repository,
          pullRequestId,
          reviewerId,
          vote: payload["vote"] === undefined ? undefined : Number(payload["vote"]),
          isRequired: payload["is_required"] === undefined ? undefined : Boolean(payload["is_required"]),
          auth,
        });
        return { ...result };
      },
    },
    {
      name: "ado_remove_pull_request_reviewer",
      description: "Remove a reviewer from an Azure DevOps pull request.",
      parameters: {
        type: "object",
        required: ["pull_request_id", "reviewer_id"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          repository: { type: "string" },
          pull_request_id: { type: "integer" },
          reviewer_id: { type: "string" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const repository =
          String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
        const pullRequestId = Number(payload["pull_request_id"] ?? 0);
        const reviewerId = String(payload["reviewer_id"] ?? "");
        if (!repository || !pullRequestId || !reviewerId) {
          throw new ToolError("remove_pull_request_reviewer requires 'repository', 'pull_request_id', and 'reviewer_id'.");
        }
        const auth = await resolveAdoAuth(ctx);
        const result = await removeAzurePullRequestReviewer({
          organization: org,
          project,
          repository,
          pullRequestId,
          reviewerId,
          auth,
        });
        return { ...result };
      },
    },
    {
      name: "ado_add_pull_request_label",
      description: "Add a label/tag to an Azure DevOps pull request.",
      parameters: {
        type: "object",
        required: ["pull_request_id", "label"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          repository: { type: "string" },
          pull_request_id: { type: "integer" },
          label: { type: "string" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const repository =
          String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
        const pullRequestId = Number(payload["pull_request_id"] ?? 0);
        const label = String(payload["label"] ?? "");
        if (!repository || !pullRequestId || !label) {
          throw new ToolError("add_pull_request_label requires 'repository', 'pull_request_id', and 'label'.");
        }
        const auth = await resolveAdoAuth(ctx);
        const result = await addAzurePullRequestLabel({
          organization: org,
          project,
          repository,
          pullRequestId,
          label,
          auth,
        });
        return { ...result };
      },
    },
    {
      name: "ado_remove_pull_request_label",
      description: "Remove a label/tag from an Azure DevOps pull request.",
      parameters: {
        type: "object",
        required: ["pull_request_id", "label"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          repository: { type: "string" },
          pull_request_id: { type: "integer" },
          label: { type: "string" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const repository =
          String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
        const pullRequestId = Number(payload["pull_request_id"] ?? 0);
        const label = String(payload["label"] ?? "");
        if (!repository || !pullRequestId || !label) {
          throw new ToolError("remove_pull_request_label requires 'repository', 'pull_request_id', and 'label'.");
        }
        const auth = await resolveAdoAuth(ctx);
        const result = await removeAzurePullRequestLabel({
          organization: org,
          project,
          repository,
          pullRequestId,
          label,
          auth,
        });
        return { ...result };
      },
    },
    {
      name: "ado_link_work_item",
      description: "Attach a work item to a pull request via ArtifactLink.",
      parameters: {
        type: "object",
        required: ["pull_request_id", "work_item_id"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          repository: { type: "string" },
          pull_request_id: { type: "integer" },
          work_item_id: { type: "integer" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const repository =
          String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
        const prId = Number(payload["pull_request_id"] ?? 0);
        const workItemId = Number(payload["work_item_id"] ?? 0);
        if (!repository || !prId || !workItemId) {
          throw new ToolError(
            "link_work_item requires 'repository', 'pull_request_id', 'work_item_id'.",
          );
        }
        const auth = await resolveAdoAuth(ctx);
        const artifactId = `vstfs:///Git/PullRequestId/${project}%2F${repository}%2F${prId}`;
        const url = `${adoBase(org)}/${project}/_apis/wit/workitems/${workItemId}?api-version=${API_VERSION_WI}`;
        const body = [
          {
            op: "add",
            path: "/relations/-",
            value: { rel: "ArtifactLink", url: artifactId, attributes: { name: "Pull Request" } },
          },
        ];
        const resp = await patchJson(url, body, auth, "application/json-patch+json");
        if (!resp.ok) {
          return { ok: false, status_code: resp.status, error: (await resp.text()).slice(0, 400) };
        }
        return { ok: true, work_item_id: workItemId, pull_request_id: prId };
      },
    },
    {
      name: "ado_get_build_timeline",
      description: "Get failed task and issue details from an Azure DevOps build timeline.",
      parameters: {
        type: "object",
        required: ["build_id"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          build_id: { type: "integer" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const buildId = Number(payload["build_id"] ?? 0);
        if (!buildId) throw new ToolError("get_build_timeline requires 'build_id'.");
        const auth = await resolveAdoAuth(ctx);
        const timeline = await getAzureBuildTimeline({
          organization: org,
          project,
          buildId,
          auth,
        });
        return {
          buildId: timeline.buildId,
          failedRecords: timeline.failedRecords,
          errorIssues: timeline.errorIssues,
          warningIssues: timeline.warningIssues,
        };
      },
    },
    {
      name: "ado_get_build_log_excerpt",
      description: "Get a concise diagnostic excerpt from an Azure DevOps build log.",
      parameters: {
        type: "object",
        required: ["build_id", "log_id"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          build_id: { type: "integer" },
          log_id: { type: "integer" },
          max_chars: { type: "integer" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const buildId = Number(payload["build_id"] ?? 0);
        const logId = Number(payload["log_id"] ?? 0);
        if (!buildId || !logId) throw new ToolError("get_build_log_excerpt requires 'build_id' and 'log_id'.");
        const auth = await resolveAdoAuth(ctx);
        const excerpt = await getAzureBuildLogExcerpt({
          organization: org,
          project,
          buildId,
          logId,
          maxChars: Number(payload["max_chars"] ?? 6000),
          auth,
        });
        return { ...excerpt };
      },
    },
    {
      name: "ado_trigger_pipeline",
      description: "Queue a run of an Azure DevOps pipeline.",
      parameters: {
        type: "object",
        required: ["pipeline_id"],
        properties: {
          organization: { type: "string" },
          project: { type: "string" },
          pipeline_id: { type: "integer" },
          branch: { type: "string" },
        },
      },
      handler: async (ctx, payload) => {
        const { org, project } = resolveOrgProject(ctx, payload);
        const pipelineId = Number(payload["pipeline_id"] ?? 0);
        const branch = String(payload["branch"] ?? "");
        if (!pipelineId) throw new ToolError("trigger_pipeline_run requires 'pipeline_id'.");
        const auth = await resolveAdoAuth(ctx);
        const url = `${adoBase(org)}/${project}/_apis/pipelines/${pipelineId}/runs?api-version=${API_VERSION_PIPELINES}`;
        const body: Record<string, unknown> = {};
        if (branch) {
          body["resources"] = { repositories: { self: { refName: `refs/heads/${branch}` } } };
        }
        const resp = await postJson(url, body, auth);
        if (!resp.ok) {
          throw new ToolError(
            `ADO trigger_pipeline_run failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`,
          );
        }
        const data = (await resp.json()) as {
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
      },
    },
  ];
}
