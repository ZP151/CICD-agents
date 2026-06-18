import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT, API_VERSION_WI } from "./constants.js";
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
  const artifactId = `vstfs:///Git/PullRequestId/${project}%2F${repository}%2F${pullRequestId}`;
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

function extractWorkItemId(url: string): string {
  return url.match(/workItems\/(\d+)/i)?.[1] ?? "";
}
