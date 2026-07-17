import { readLlmConfig, readProjectLinkData } from "./localSettings.js";
import { RUNTIME_URL, messageFromErrorResponse } from "./runtime.js";
import type {
  PrInsightArtifactHistoryMeta,
  PrInsightArtifactRecord,
  PullRequestContext,
  PullRequestInsightPreview,
  PullRequestSummary,
} from "./pullRequestTypes.js";

const PROJECT_LINKS_PATH = "/project-links";

export async function fetchProjectLinkPullRequests(
  projectLinkId: string,
  status = "active",
): Promise<PullRequestSummary[]> {
  const projectLink = readProjectLinkData(projectLinkId);
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/pull-requests?status=${encodeURIComponent(status)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(projectLink ? { projectLink } : {}),
    }),
  });
  if (!r.ok) {
    throw new Error(await messageFromErrorResponse(`Pull Requests HTTP ${r.status}`, r));
  }
  const body = (await r.json()) as { pullRequests: PullRequestSummary[] };
  return body.pullRequests;
}

export async function fetchProjectLinkPullRequestContext(
  projectLinkId: string,
  pullRequestId: number,
): Promise<PullRequestContext> {
  const projectLink = readProjectLinkData(projectLinkId);
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/pull-requests/${pullRequestId}/context`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(projectLink ? { projectLink } : {}),
    }),
  });
  if (!r.ok) {
    throw new Error(await messageFromErrorResponse(`Pull Request context HTTP ${r.status}`, r));
  }
  return (await r.json()) as PullRequestContext;
}

export async function fetchProjectLinkPullRequestInsightPreview(
  projectLinkId: string,
  pullRequestId: number,
): Promise<PullRequestInsightPreview> {
  const projectLink = readProjectLinkData(projectLinkId);
  const llmConfig = readLlmConfig();
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/pull-requests/${pullRequestId}/insight-preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(llmConfig ? { llmConfig } : {}),
      ...(projectLink ? { projectLink } : {}),
    }),
  });
  if (!r.ok) {
    throw new Error(await messageFromErrorResponse(`Pull Request insight preview HTTP ${r.status}`, r));
  }
  return (await r.json()) as PullRequestInsightPreview;
}

export async function fetchProjectLinkPrInsightArtifacts(
  projectLinkId: string,
  pullRequestId?: number,
): Promise<PrInsightArtifactRecord[]> {
  return (await fetchProjectLinkPrInsightArtifactsWithHistory(projectLinkId, pullRequestId)).items;
}

export async function fetchProjectLinkPrInsightArtifactsWithHistory(
  projectLinkId: string,
  pullRequestId?: number,
): Promise<{ items: PrInsightArtifactRecord[]; history: PrInsightArtifactHistoryMeta[] }> {
  const suffix = pullRequestId === undefined ? "" : `?pullRequestId=${encodeURIComponent(String(pullRequestId))}`;
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/pr-insights${suffix}`);
  if (!r.ok) {
    throw new Error(await messageFromErrorResponse(`PR insight artifacts HTTP ${r.status}`, r));
  }
  const body = (await r.json()) as {
    items?: PrInsightArtifactRecord[];
    history?: PrInsightArtifactHistoryMeta[];
  };
  return {
    items: body.items ?? [],
    history: body.history ?? [],
  };
}

export async function fetchProjectLinkPrInsightArtifactById(
  projectLinkId: string,
  artifactId: string,
): Promise<PrInsightArtifactRecord> {
  const suffix = `?artifactId=${encodeURIComponent(artifactId)}`;
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/pr-insights/artifact${suffix}`);
  if (!r.ok) {
    throw new Error(await messageFromErrorResponse(`PR insight artifact HTTP ${r.status}`, r));
  }
  const body = (await r.json()) as { record?: PrInsightArtifactRecord };
  if (!body.record) throw new Error("PR insight artifact lookup response did not include a record");
  return body.record;
}

export async function saveProjectLinkPrInsightArtifact(
  projectLinkId: string,
  artifact: Omit<PrInsightArtifactRecord, "id" | "projectLinkId"> & {
    id?: string;
    projectLinkId?: string;
  },
): Promise<PrInsightArtifactRecord> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/pr-insights`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(artifact),
  });
  if (!r.ok) {
    throw new Error(await messageFromErrorResponse(`Save PR insight artifact HTTP ${r.status}`, r));
  }
  const body = (await r.json()) as { record?: PrInsightArtifactRecord };
  if (!body.record) throw new Error("PR insight artifact response did not include a record");
  return body.record;
}
