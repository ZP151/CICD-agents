import {
  getAzurePullRequestById,
  listAzureBuilds,
  listAzurePullRequestChanges,
  listAzurePullRequestPolicyEvaluations,
  listAzurePullRequestThreads,
  listAzurePullRequestWorkItems,
  LLMClient,
  type Settings,
} from "@mergepilot/core";
import type { InlineLlmConfig } from "../chatSession.js";
import type { AdoAuth, PullRequestProjectLink } from "./pullRequestRouteSupport.js";
import {
  buildPrInsightPrompt,
  buildPrInsightSignals,
  buildPrReadinessSignalMetadata,
  heuristicPrInsight,
} from "./pullRequestInsightSignals.js";

export async function loadPullRequestContext(args: {
  projectLink: PullRequestProjectLink;
  pullRequestId: number;
  adoAuth: AdoAuth;
}) {
  const { projectLink, pullRequestId, adoAuth } = args;
  const pullRequest = await getAzurePullRequestById({
    organization: projectLink.adoOrgUrl,
    project: projectLink.adoProject,
    repository: projectLink.adoRepoName,
    pullRequestId,
    auth: adoAuth,
    includeWorkItemRefs: true,
  });
  const [threads, changes, builds, workItems, policies] = await Promise.all([
    listAzurePullRequestThreads({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      pullRequestId,
      auth: adoAuth,
      top: 100,
    }),
    listAzurePullRequestChanges({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      pullRequestId,
      auth: adoAuth,
      top: 100,
    }),
    projectLink.adoPipelineId
      ? listAzureBuilds({
        organization: projectLink.adoOrgUrl,
        project: projectLink.adoProject,
        auth: adoAuth,
        definitions: [projectLink.adoPipelineId],
        branchName: pullRequest.sourceBranch,
        top: 20,
      })
      : Promise.resolve([]),
    listAzurePullRequestWorkItems({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      pullRequestId,
      auth: adoAuth,
    }).catch(() => []),
    listAzurePullRequestPolicyEvaluations({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      pullRequestId,
      auth: adoAuth,
    }).catch(() => []),
  ]);
  return { pullRequest, threads, changes, builds, workItems, policies };
}

export async function buildPullRequestInsightPreview(args: {
  projectLink: PullRequestProjectLink;
  pullRequestId: number;
  adoAuth: AdoAuth;
  llmConfig?: InlineLlmConfig;
  buildReviewLlmSettings(override?: InlineLlmConfig): Settings;
}) {
  const context = await loadPullRequestContext(args);
  const { pullRequest, threads, changes, builds, workItems, policies } = context;
  const failedBuildCount = builds.filter((build) => build.result === "failed" || build.result === "canceled").length;
  const threadCount = threads.filter((thread) => thread.comments.length > 0).length;
  const unresolvedThreadCount = threads.filter((thread) => thread.comments.length > 0 && String(thread.status) !== "2").length;
  const failedPolicyCount = policies.filter((policy) => /failed|rejected|error/i.test(policy.status)).length;
  const workItemCount = workItems.length || pullRequest.workItemRefs.length;
  const changedPaths = changes.changes.map((change) => change.path || change.originalPath).filter(Boolean);
  const readinessSignals = buildPrReadinessSignalMetadata({ builds, policies, threads, workItems });
  const fallbackSummary = heuristicPrInsight({
    title: pullRequest.title,
    description: pullRequest.description,
    fileCount: changes.fileCount,
    threadCount,
    unresolvedThreadCount,
    failedBuildCount,
    changedPaths,
  });
  const insightSignals = buildPrInsightSignals({
    description: pullRequest.description,
    fileCount: changes.fileCount,
    threadCount,
    unresolvedThreadCount,
    failedBuildCount,
    workItemCount,
    changedPaths,
  });
  if (failedPolicyCount > 0) {
    insightSignals.categories.blocking.push(`${failedPolicyCount} failed/error policy evaluation(s)`);
    insightSignals.risks.push(`${failedPolicyCount} failed/error policy evaluation(s)`);
    insightSignals.readiness = "blocked";
  }

  const effectiveSettings = args.buildReviewLlmSettings(args.llmConfig);
  const llm = new LLMClient(effectiveSettings);
  const signals = {
    fileCount: changes.fileCount,
    threadCount,
    failedBuildCount,
    workItemCount,
    ...readinessSignals,
  };
  if (!llm.configured) {
    return {
      source: "heuristic" as const,
      summary: fallbackSummary,
      readiness: insightSignals.readiness,
      risks: insightSignals.risks,
      categories: insightSignals.categories,
      signals,
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  const result = await llm.chat({
    messages: [
      { role: "system", content: "You summarize Azure DevOps pull request metadata for developer review readiness." },
      { role: "user", content: buildPrInsightPrompt({
        pullRequest,
        changes,
        builds,
        policies,
        workItems,
        changedPaths,
        threadCount,
        unresolvedThreadCount,
        failedBuildCount,
        failedPolicyCount,
      }) },
    ],
    temperature: 0.1,
    maxTokens: 700,
  });

  return {
    source: "llm" as const,
    summary: result.content || fallbackSummary,
    readiness: insightSignals.readiness,
    risks: insightSignals.risks,
    categories: insightSignals.categories,
    signals,
    tokensIn: llm.usage.promptTokens,
    tokensOut: llm.usage.completionTokens,
  };
}
