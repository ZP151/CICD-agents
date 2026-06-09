import { getSettings } from "../settings.js";
import { getAzureDevOpsToken, isAzureAuthenticationRequiredError } from "../store/azureAuth.js";
import { ToolError, type Tool, type ToolContext } from "./executor.js";

export const PAT_KEYRING_SERVICE = "cicd-agent";
export const PAT_KEYRING_USER = "azure-devops-pat";

const API_VERSION_GIT = "7.1-preview.1";
const API_VERSION_WI = "7.1-preview.3";
const API_VERSION_PIPELINES = "7.1-preview.1";

export type PatProvider = () => Promise<string>;
export type AdoAuthMode = "oauth" | "pat";

export interface AdoAuth {
  mode: AdoAuthMode;
  header: string;
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
    throw new ToolError(
      auth.mode === "oauth"
        ? "ADO OAuth authentication failed (redirect to sign-in). Sign in again and make sure your account can access this Azure DevOps organization."
        : "ADO authentication failed (redirect to sign-in). Check org URL, PAT value, and Code (Read) scope.",
    );
  }
  return resp;
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

function stripRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
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
