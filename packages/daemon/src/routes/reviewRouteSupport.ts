import {
  AdoClient,
  COMMENT_TYPE_TEXT,
  getAzureDevOpsAuth,
  getProjectLink,
  isAzureAuthenticationRequiredError,
  THREAD_STATUS_ACTIVE,
  type ReviewHistoryRecord,
  type Settings,
} from "@mergepilot/core";
import {
  buildAdoThreadUrl,
  extractAdoOrg,
  extractAdoThreadId,
  extractAdoThreadUrl,
} from "../adoThreadLinks.js";
import type { ProjectLinkStoreAdapter } from "../projectLinkStore.js";
import type { ReviewDispositionUpsert, ReviewHistoryUpsert } from "./review.schemas.js";

export const PROJECT_LINK_NOT_FOUND = "project_link_not_found";
export const PROJECT_LINK_REPOSITORY_MISSING = "project_link_repository_missing";

export interface ReviewRouteDependencies {
  settings: Settings;
  projectLinkStore: ProjectLinkStoreAdapter;
}

export function reviewHistoryRecord(
  repository: string,
  data: ReviewHistoryUpsert,
): ReviewHistoryRecord {
  return {
    repository,
    pullRequestId: data.pullRequestId,
    lastIterationId: data.lastIterationId,
    findingCount: data.findingCount,
    lastRunAt: data.lastRunAt,
    sourceCommit: data.sourceCommit,
    decisionQueue: data.decisionQueue,
    decisionRiskLevel: data.decisionRiskLevel,
    decisionReason: data.decisionReason,
    decisionReasonCodes: data.decisionReasonCodes,
    contextConfidence: data.contextConfidence,
    autoApprovedAt: data.autoApprovedAt,
    autoApprovalActor: data.autoApprovalActor,
    lastTokensIn: data.lastTokensIn,
    lastTokensOut: data.lastTokensOut,
    discardedFindingCount: data.discardedFindingCount,
    hunkCoverageFiles: data.hunkCoverageFiles,
    wholeFileFallbackFiles: data.wholeFileFallbackFiles,
    changedHunkLines: data.changedHunkLines,
    manualDisposition: data.manualDisposition,
    manualDispositionAt: data.manualDispositionAt,
    manualDispositionActor: data.manualDispositionActor,
    manualDispositionNote: data.manualDispositionNote,
    manualDispositionEvents: data.manualDispositionEvents,
    manualDispositionWriteBackAttempted: data.manualDispositionWriteBackAttempted,
    manualDispositionWriteBackOk: data.manualDispositionWriteBackOk,
    manualDispositionWriteBackError: data.manualDispositionWriteBackError,
    manualDispositionWriteBackAt: data.manualDispositionWriteBackAt,
    manualDispositionWriteBackThreadId: data.manualDispositionWriteBackThreadId,
    manualDispositionWriteBackUrl: data.manualDispositionWriteBackUrl,
    manualDispositionWriteBackEvents: data.manualDispositionWriteBackEvents,
  };
}

export function localProjectLinkRepository(settings: Settings, projectLinkId: string) {
  const projectLink = getProjectLink(settings.dataDir, projectLinkId);
  if (!projectLink) return { error: PROJECT_LINK_NOT_FOUND };
  const repository = projectLink.adoRepoName.trim();
  if (!repository) return { error: PROJECT_LINK_REPOSITORY_MISSING };
  return { projectLink, repository };
}

export async function cloudPreferredProjectLink(
  settings: Settings,
  projectLinkStore: ProjectLinkStoreAdapter,
  projectLinkId: string,
  options: { throwOnAzureAuthFailure: boolean },
) {
  const tableStore = projectLinkStore.getTableStore();
  if (tableStore) {
    try {
      const cloudProjectLink = await tableStore.get(projectLinkId);
      if (cloudProjectLink) return projectLinkStore.injectAdoPat(cloudProjectLink);
    } catch (err) {
      if (options.throwOnAzureAuthFailure && isAzureAuthenticationRequiredError(err)) throw err;
    }
  }
  return getProjectLink(settings.dataDir, projectLinkId);
}

export async function writeDispositionToAdo(args: {
  projectLink: NonNullable<ReturnType<typeof getProjectLink>>;
  pullRequestId: number;
  manualDisposition: ReviewDispositionUpsert["manualDisposition"];
  manualDispositionNote: string;
  decisionReason: string;
  manualDispositionActor: string;
}) {
  const { projectLink } = args;
  if (!projectLink.adoOrgUrl || !projectLink.adoProject || !projectLink.adoRepoName) {
    throw new Error("Project Link is missing Azure DevOps organization, project, or repository.");
  }
  const ado = new AdoClient({
    organization: extractAdoOrg(projectLink.adoOrgUrl),
    authHeaderProvider: async () => (await getAzureDevOpsAuth(projectLink.adoPat)).header,
  });
  const thread = await ado.createThread({
    project: projectLink.adoProject,
    repositoryId: projectLink.adoRepoName,
    pullRequestId: args.pullRequestId,
    body: {
      status: THREAD_STATUS_ACTIVE,
      comments: [{
        commentType: COMMENT_TYPE_TEXT,
        content: [
          `**Review Queue disposition: ${args.manualDisposition.replace(/_/g, " ")}**`,
          "",
          args.manualDispositionNote || args.decisionReason || "No note provided.",
          "",
          `Actor: ${args.manualDispositionActor || "MergePilot"}`,
        ].join("\n"),
      }],
    },
  });
  const threadId = extractAdoThreadId(thread);
  return {
    attempted: true,
    ok: true,
    at: new Date().toISOString(),
    threadId,
    url: extractAdoThreadUrl(thread) || buildAdoThreadUrl({
      orgUrl: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      pullRequestId: args.pullRequestId,
      threadId,
    }),
  };
}
