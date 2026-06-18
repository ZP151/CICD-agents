import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT } from "./constants.js";
import { parseAdoJson } from "./response.js";

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
    value?: PullRequestThreadPayload[];
  };
  return trimThreads(data.value ?? [], args);
}

interface PullRequestThreadPayload {
  id?: number;
  publishedDate?: string;
  lastUpdatedDate?: string;
  status?: string | number;
  comments?: PullRequestCommentPayload[];
  threadContext?: unknown;
}

interface PullRequestCommentPayload {
  id?: number;
  isDeleted?: boolean;
  author?: { displayName?: string; uniqueName?: string };
  content?: string;
  publishedDate?: string;
  lastUpdatedDate?: string;
  lastContentUpdatedDate?: string;
}

function trimThreads(
  threads: PullRequestThreadPayload[],
  args: {
    top?: number;
    skip?: number;
    status?: string | number;
    authorEmail?: string;
    authorDisplayName?: string;
  },
): AzurePullRequestThread[] {
  const authorEmail = args.authorEmail?.toLowerCase();
  const authorDisplayName = args.authorDisplayName?.toLowerCase();
  const top = Math.max(1, args.top ?? 100);
  const skip = Math.max(0, args.skip ?? 0);
  return threads
    .filter((thread) => args.status === undefined || String(thread.status ?? "") === String(args.status))
    .filter((thread) => {
      const first = thread.comments?.[0];
      if (authorEmail && first?.author?.uniqueName?.toLowerCase() !== authorEmail) return false;
      if (authorDisplayName && !first?.author?.displayName?.toLowerCase().includes(authorDisplayName)) return false;
      return true;
    })
    .sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))
    .slice(skip, skip + top)
    .map(toThread);
}

function toThread(thread: PullRequestThreadPayload): AzurePullRequestThread {
  return {
    id: Number(thread.id ?? 0),
    publishedDate: thread.publishedDate ?? "",
    lastUpdatedDate: thread.lastUpdatedDate ?? "",
    status: thread.status ?? "",
    comments: (thread.comments ?? []).filter((comment) => !comment.isDeleted).map(toComment),
    threadContext: thread.threadContext ?? null,
  };
}

function toComment(comment: PullRequestCommentPayload): AzurePullRequestThread["comments"][number] {
  return {
    id: Number(comment.id ?? 0),
    author: {
      displayName: comment.author?.displayName ?? "",
      uniqueName: comment.author?.uniqueName ?? "",
    },
    content: comment.content ?? "",
    publishedDate: comment.publishedDate ?? "",
    lastUpdatedDate: comment.lastUpdatedDate ?? "",
    lastContentUpdatedDate: comment.lastContentUpdatedDate ?? "",
  };
}
