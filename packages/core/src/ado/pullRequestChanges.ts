import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT } from "./constants.js";
import { parseAdoJson } from "./response.js";

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
  let iterationInfo: PullRequestIterationPayload | undefined;

  if (!targetIteration) {
    const iterationsUrl =
      `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
      `${encodeURIComponent(repository)}/pullrequests/${pullRequestId}/iterations?api-version=${API_VERSION_GIT}`;
    const iterationsResp = await adoFetch(iterationsUrl, auth);
    const iterations = await parseAdoJson(iterationsResp, "list pull request iterations") as {
      value?: PullRequestIterationPayload[];
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
  const changes = await parseAdoJson(changesResp, "list pull request changes") as PullRequestChangesPayload;

  return {
    iterationId: targetIteration,
    sourceCommit: iterationInfo?.sourceRefCommit?.commitId ?? "",
    targetCommit: iterationInfo?.targetRefCommit?.commitId ?? "",
    commonCommit: iterationInfo?.commonRefCommit?.commitId ?? "",
    fileCount: changes.changeEntries?.length ?? 0,
    changes: (changes.changeEntries ?? []).map(toPullRequestChange),
    nextSkip: changes.nextSkip,
    nextTop: changes.nextTop,
  };
}

interface PullRequestIterationPayload {
  id?: number;
  sourceRefCommit?: { commitId?: string };
  targetRefCommit?: { commitId?: string };
  commonRefCommit?: { commitId?: string };
}

interface PullRequestChangesPayload {
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
}

function toPullRequestChange(entry: NonNullable<PullRequestChangesPayload["changeEntries"]>[number]): AzurePullRequestChange {
  return {
    changeId: Number(entry.changeId ?? 0),
    changeType: entry.changeType ?? "",
    path: entry.item?.path ?? "",
    originalPath: entry.originalPath ?? "",
    gitObjectType: entry.item?.gitObjectType ?? "",
    commitId: entry.item?.commitId ?? "",
  };
}
