import { ToolError } from "../tools/executor.js";
import type { AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT } from "./constants.js";
import { parseAdoJson } from "./response.js";

export interface PullRequestMutationIds {
  org: string;
  project: string;
  repository: string;
  pullRequestId: number;
}

export function pullRequestMutationIds(
  args: { organization: string; project: string; repository: string; pullRequestId: string | number },
  action: string,
): PullRequestMutationIds {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  if (!org || !project || !repository || !pullRequestId) {
    throw new ToolError(`ADO organization, project, repository, and pull request ID are required to ${action}.`);
  }
  return { org, project, repository, pullRequestId };
}

export function pullRequestReviewerUrl(ids: PullRequestMutationIds, reviewerId: string): string {
  return `${adoBase(ids.org)}/${encodeURIComponent(ids.project)}/_apis/git/repositories/` +
    `${encodeURIComponent(ids.repository)}/pullRequests/${ids.pullRequestId}/reviewers/${encodeURIComponent(reviewerId)}` +
    `?api-version=${API_VERSION_GIT}`;
}

export async function postAdoJson(url: string, body: unknown, auth: AdoAuth, action: string): Promise<unknown> {
  const resp = await adoFetch(url, auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseAdoJson(resp, action);
}

export async function putAdoJson(url: string, body: unknown, auth: AdoAuth, action: string): Promise<unknown> {
  const resp = await adoFetch(url, auth, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseAdoJson(resp, action);
}

export async function patchAdoJson(
  url: string,
  body: unknown,
  auth: AdoAuth,
  contentType: string,
  action: string,
): Promise<unknown> {
  const resp = await adoFetch(url, auth, {
    method: "PATCH",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
  return parseAdoJson(resp, action);
}
