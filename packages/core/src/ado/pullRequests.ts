import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT } from "./constants.js";
import { stripRef } from "./refs.js";
import { parseAdoJson } from "./response.js";

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

export interface AzurePullRequestDetail extends AzurePullRequestSummary {
  codeReviewId: number;
  projectId: string;
  project: string;
  description: string;
  closedDate: string;
  workItemRefs: Array<{ id: string; url: string }>;
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
    value?: PullRequestPayload[];
  };
  return (data.value ?? []).map((pr) => toPullRequestSummary(pr, org, project, repository));
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
  const pr = await parseAdoJson(resp, "get pull request") as PullRequestPayload;
  return toPullRequestDetail(pr, org, project, repository, pullRequestId);
}

interface PullRequestPayload {
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
}

function toPullRequestSummary(
  pr: PullRequestPayload,
  org: string,
  project: string,
  repository: string,
): AzurePullRequestSummary {
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
    voteSummary: summarizeVotes(reviewers),
  };
}

function toPullRequestDetail(
  pr: PullRequestPayload,
  org: string,
  project: string,
  repository: string,
  fallbackPullRequestId: number,
): AzurePullRequestDetail {
  const summary = toPullRequestSummary(
    { ...pr, pullRequestId: pr.pullRequestId ?? fallbackPullRequestId },
    org,
    project,
    repository,
  );
  return {
    ...summary,
    codeReviewId: Number(pr.codeReviewId ?? 0),
    description: pr.description ?? "",
    closedDate: pr.closedDate ?? "",
    projectId: pr.repository?.project?.id ?? "",
    project: pr.repository?.project?.name ?? project,
    workItemRefs: (pr.workItemRefs ?? []).map((ref) => ({
      id: ref.id ?? "",
      url: ref.url ?? "",
    })).filter((ref) => ref.id || ref.url),
  };
}

function summarizeVotes(reviewers: Array<{ vote?: number }>): AzurePullRequestSummary["voteSummary"] {
  return {
    approved: reviewers.filter((r) => Number(r.vote ?? 0) > 0).length,
    waiting: reviewers.filter((r) => Number(r.vote ?? 0) === 0).length,
    rejected: reviewers.filter((r) => Number(r.vote ?? 0) < 0).length,
  };
}
