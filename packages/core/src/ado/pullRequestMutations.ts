import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT } from "./constants.js";
import {
  patchAdoJson,
  postAdoJson,
  pullRequestMutationIds,
  pullRequestReviewerUrl,
  putAdoJson,
} from "./pullRequestMutationSupport.js";

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

export interface AzurePullRequestCreateResult {
  pull_request_id: number;
  url: string;
  status: string;
  created_by: string;
}

export async function createAzurePullRequest(args: {
  organization: string;
  project: string;
  repository: string;
  sourceBranch: string;
  targetBranch?: string;
  title: string;
  description?: string;
  draft?: boolean;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePullRequestCreateResult> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const source = args.sourceBranch.trim();
  const target = (args.targetBranch ?? "main").trim();
  const title = args.title.trim();
  if (!org || !project || !repository) {
    throw new ToolError("ADO organization, project, and repository are required to create a pull request.");
  }
  if (!source || !title) {
    throw new ToolError("create_pull_request requires 'source_branch' and 'title'.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/pullrequests?api-version=${API_VERSION_GIT}`;
  const data = await postAdoJson(
    url,
    {
      sourceRefName: `refs/heads/${source}`,
      targetRefName: `refs/heads/${target}`,
      title,
      description: args.description ?? "",
      isDraft: Boolean(args.draft ?? false),
    },
    auth,
    "create_pull_request",
  ) as {
    pullRequestId?: number;
    status?: string;
    createdBy?: { displayName?: string };
  };
  const prId = Number(data.pullRequestId ?? 0);
  return {
    pull_request_id: prId,
    url: prId ? `${adoBase(org)}/${project}/_git/${repository}/pullrequest/${prId}` : "",
    status: data.status ?? "",
    created_by: data.createdBy?.displayName ?? "",
  };
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
  const ids = pullRequestMutationIds(args, "update a pull request");
  const body: Record<string, unknown> = {};
  if (args.title !== undefined) body["title"] = args.title;
  if (args.description !== undefined) body["description"] = args.description;
  if (args.status !== undefined) body["status"] = args.status;
  if (Object.keys(body).length === 0) {
    throw new ToolError("At least one pull request update field is required: title, description, or status.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(ids.org)}/${encodeURIComponent(ids.project)}/_apis/git/repositories/` +
    `${encodeURIComponent(ids.repository)}/pullrequests/${ids.pullRequestId}?api-version=${API_VERSION_GIT}`;
  const pr = await patchAdoJson(url, body, auth, "application/json", "update_pull_request") as {
    pullRequestId?: number;
    title?: string;
    description?: string;
    status?: string;
  };
  const id = Number(pr.pullRequestId ?? ids.pullRequestId);
  return {
    id,
    title: pr.title ?? args.title ?? "",
    description: pr.description ?? args.description ?? "",
    status: pr.status ?? args.status ?? "",
    url: `${adoBase(ids.org)}/${ids.project}/_git/${ids.repository}/pullrequest/${id}`,
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
  const ids = pullRequestMutationIds(args, "add a reviewer");
  const reviewerId = args.reviewerId.trim();
  if (!reviewerId) throw new ToolError("ADO reviewer ID is required to add a reviewer.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url = pullRequestReviewerUrl(ids, reviewerId);
  const body: Record<string, unknown> = {};
  if (args.vote !== undefined) body["vote"] = args.vote;
  if (args.isRequired !== undefined) body["isRequired"] = args.isRequired;
  const reviewer = await putAdoJson(url, body, auth, "add_pull_request_reviewer") as {
    id?: string;
    displayName?: string;
    uniqueName?: string;
    vote?: number;
    isRequired?: boolean;
  };
  return {
    pullRequestId: ids.pullRequestId,
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
  const ids = pullRequestMutationIds(args, "remove a reviewer");
  const reviewerId = args.reviewerId.trim();
  if (!reviewerId) throw new ToolError("ADO reviewer ID is required to remove a reviewer.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const resp = await adoFetch(pullRequestReviewerUrl(ids, reviewerId), auth, { method: "DELETE" });
  if (!resp.ok && resp.status !== 204) {
    throw new ToolError(`ADO remove_pull_request_reviewer failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  return {
    pullRequestId: ids.pullRequestId,
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
  const ids = pullRequestMutationIds(args, "add a pull request label");
  const label = args.label.trim();
  if (!label) throw new ToolError("ADO label is required to add a pull request label.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(ids.org)}/${encodeURIComponent(ids.project)}/_apis/git/repositories/` +
    `${encodeURIComponent(ids.repository)}/pullRequests/${ids.pullRequestId}/labels?api-version=${API_VERSION_GIT}`;
  const tag = await postAdoJson(url, { name: label }, auth, "add_pull_request_label") as {
    id?: string;
    name?: string;
    active?: boolean;
  };
  return {
    pullRequestId: ids.pullRequestId,
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
  const ids = pullRequestMutationIds(args, "remove a pull request label");
  const label = args.label.trim();
  if (!label) throw new ToolError("ADO label is required to remove a pull request label.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(ids.org)}/${encodeURIComponent(ids.project)}/_apis/git/repositories/` +
    `${encodeURIComponent(ids.repository)}/pullRequests/${ids.pullRequestId}/labels/${encodeURIComponent(label)}` +
    `?api-version=${API_VERSION_GIT}`;
  const resp = await adoFetch(url, auth, { method: "DELETE" });
  if (!resp.ok && resp.status !== 204) {
    throw new ToolError(`ADO remove_pull_request_label failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  return {
    pullRequestId: ids.pullRequestId,
    label,
    id: "",
    name: label,
    active: false,
    action: "removed",
  };
}
