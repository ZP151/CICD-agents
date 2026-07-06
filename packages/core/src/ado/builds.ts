import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_BUILD, API_VERSION_BUILD_DIAGNOSTICS } from "./constants.js";
import { normalizeBranchRef, stripRef } from "./refs.js";
import { listAzureRepositories } from "./repositories.js";
import { parseAdoJson } from "./response.js";
import type { AzureDevOpsDiscoveryOption } from "./types.js";

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

export interface AzureBuildTimelineSummary {
  buildId: number;
  failedRecords: AzureBuildTimelineRecord[];
  errorIssues: AzureBuildTimelineIssue[];
  warningIssues: AzureBuildTimelineIssue[];
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
  const params = new URLSearchParams({ "api-version": API_VERSION_BUILD_DIAGNOSTICS });
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
      /failed|canceled|cancelled|error/i.test(`${record.result} ${record.state}`) ||
      record.issues.some((issue) => /error/i.test(issue.type)),
    ),
    errorIssues: issues.filter((issue) => /error/i.test(issue.type)),
    warningIssues: issues.filter((issue) => /warning/i.test(issue.type)),
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

export { getAzureBuildLogExcerpt } from "./buildLogs.js";
export type { AzureBuildLogExcerpt } from "./buildLogs.js";
