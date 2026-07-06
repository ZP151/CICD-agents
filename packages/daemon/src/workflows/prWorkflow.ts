import {
  getAzureDevOpsAuth,
  getAzurePullRequestById,
  listAzureBuilds,
  listAzurePullRequests,
  listAzurePullRequestChanges,
  listAzurePullRequestPolicyEvaluations,
  listAzurePullRequestThreads,
  listAzurePullRequestWorkItems,
  type PendingToolAction,
} from "@mergepilot/core";
import type { ChatSessionManager } from "../chatSession.js";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";
import {
  buildWorkflowPrInsight,
  summarizePolicies,
  summarizeWorkItems,
} from "./prWorkflowInsight.js";

type WorkflowProjectLink = NonNullable<ChatWorkflowActionPayload["projectLink"]>;

export { buildWorkflowPrInsight } from "./prWorkflowInsight.js";

export async function runAdoPullRequestWorkflowAction(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
) {
  const { action, repoPath } = payload;
  const projectLink = adoProjectLinkFromWorkflowPayload(payload);
  const auth = await getAzureDevOpsAuth(projectLink.adoPat);
  const pullRequestId = await resolveWorkflowPullRequestId(projectLink, auth, payload.pullRequestId);
  const baseArgs = {
    organization: projectLink.adoOrgUrl,
    project: projectLink.adoProject,
    repository: projectLink.adoRepoName,
    pullRequestId,
    auth,
  };

  if (action === "link_work_item") {
    const workItemId = Number(payload.workItemId ?? 0);
    if (!workItemId) throw new Error("Work item ID is required before linking it to a pull request.");
    const proposal: PendingToolAction = {
      tool: "ado_link_work_item",
      args: {
        organization: projectLink.adoOrgUrl,
        project: projectLink.adoProject,
        repository: projectLink.adoRepoName,
        pull_request_id: pullRequestId,
        work_item_id: workItemId,
      },
      description: `Link work item ${workItemId} to pull request #${pullRequestId}.`,
      nextHint: "list linked work items",
      workflow: {
        kind: "pr",
        phase: "link_work_item",
        message: `Work item ${workItemId} -> PR #${pullRequestId}`,
      },
    };
    const { sessionId, workflowState } = await chatSessions.createApprovalProposal({
      sessionId: payload.sessionId,
      repoPath,
      projectLinkId: payload.projectLinkId,
      inlineProjectLink: payload.projectLink,
      proposal,
      currentStep: proposal.description,
      riskLevel: "high",
      explanation: proposal.description,
      completedTools: [],
    });
    return {
      ok: true,
      action,
      sessionId,
      repoPath,
      summary: proposal.description,
      workflowState,
      tools: [],
    };
  }

  if (action === "check_pr_policy") {
    const policies = await listAzurePullRequestPolicyEvaluations(baseArgs);
    const blocking = policies.filter((policy) => policy.isBlocking);
    return adoWorkflowDoneResult({
      action,
      repoPath,
      sessionId: payload.sessionId,
      phase: "policy_checked",
      currentStep: `Policy status checked for PR #${pullRequestId}`,
      summary: summarizePolicies(pullRequestId, policies),
      tools: [
        adoWorkflowTool("ado_list_pull_request_policy_evaluations", { policies, count: policies.length, blocking }),
      ],
    });
  }

  if (action === "list_pr_work_items") {
    const workItems = await listAzurePullRequestWorkItems(baseArgs);
    return adoWorkflowDoneResult({
      action,
      repoPath,
      sessionId: payload.sessionId,
      phase: "work_items_listed",
      currentStep: `Linked work items listed for PR #${pullRequestId}`,
      summary: summarizeWorkItems(pullRequestId, workItems),
      tools: [
        adoWorkflowTool("ado_list_pull_request_work_items", { workItems, count: workItems.length }),
      ],
    });
  }

  const pullRequest = await getAzurePullRequestById({
    organization: projectLink.adoOrgUrl,
    project: projectLink.adoProject,
    repository: projectLink.adoRepoName,
    pullRequestId,
    auth,
    includeWorkItemRefs: true,
  });
  const [threads, changes, workItems, policies, builds] = await Promise.all([
    listAzurePullRequestThreads({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      pullRequestId,
      auth,
      top: 100,
    }),
    listAzurePullRequestChanges({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      pullRequestId,
      auth,
      top: 100,
    }),
    listAzurePullRequestWorkItems({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      pullRequestId,
      auth,
    }).catch(() => []),
    listAzurePullRequestPolicyEvaluations({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      pullRequestId,
      auth,
    }).catch(() => []),
    listAzureBuilds({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      auth,
      branchName: pullRequest.sourceBranch,
      repositoryId: projectLink.adoRepoName,
      repositoryType: "TfsGit",
      top: 20,
    }).catch(() => []),
  ]);
  const insight = buildWorkflowPrInsight({ pullRequest, threads, changes, builds, workItems, policies });
  const result = adoWorkflowDoneResult({
    action,
    repoPath,
    sessionId: payload.sessionId,
    phase: "inspected",
    currentStep: `PR #${pullRequestId} insight inspected`,
    summary: insight.summary,
    tools: [
      adoWorkflowTool("ado_get_pull_request_by_id", pullRequest),
      adoWorkflowTool("ado_list_pull_request_threads", { threads, count: threads.length }),
      adoWorkflowTool("ado_get_pull_request_changes", changes),
      adoWorkflowTool("ado_pipelines_get_builds", { builds, count: builds.length }),
      adoWorkflowTool("ado_list_pull_request_work_items", { workItems, count: workItems.length }),
      adoWorkflowTool("ado_list_pull_request_policy_evaluations", { policies, count: policies.length }),
    ],
  });
  await appendWorkflowActionAssistantBubble(chatSessions, payload.sessionId, result.summary);
  return result;
}

function adoProjectLinkFromWorkflowPayload(payload: ChatWorkflowActionPayload): WorkflowProjectLink {
  const projectLink = payload.projectLink;
  const missing = [
    !projectLink?.adoOrgUrl ? "Azure DevOps organization URL" : "",
    !projectLink?.adoProject ? "ADO project" : "",
    !projectLink?.adoRepoName ? "ADO repository" : "",
  ].filter(Boolean);
  if (missing.length > 0 || !projectLink) {
    throw new Error(`Project Link is missing ${missing.join(", ") || "Azure DevOps details"} before PR workflow actions can run.`);
  }
  return projectLink;
}

async function resolveWorkflowPullRequestId(
  projectLink: WorkflowProjectLink,
  auth: Awaited<ReturnType<typeof getAzureDevOpsAuth>>,
  explicitPullRequestId?: number,
): Promise<number> {
  if (explicitPullRequestId) return explicitPullRequestId;
  const pullRequests = await listAzurePullRequests({
    organization: projectLink.adoOrgUrl,
    project: projectLink.adoProject,
    repository: projectLink.adoRepoName,
    auth,
    status: "active",
    top: 1,
  });
  const latest = pullRequests[0]?.id ?? 0;
  if (!latest) throw new Error("No active pull request was found for this Project Link. Select or provide a pull request ID.");
  return latest;
}

function adoWorkflowTool(name: string, result: unknown) {
  return {
    name,
    command: `internal ${name}`,
    ok: true,
    stdout: JSON.stringify(result),
    stderr: "",
    returncode: 0,
  };
}

function adoWorkflowDoneResult(args: {
  action: ChatWorkflowActionPayload["action"];
  repoPath: string;
  sessionId?: string;
  phase: string;
  currentStep: string;
  summary: string;
  tools: Array<ReturnType<typeof adoWorkflowTool>>;
}) {
  return {
    ok: true,
    action: args.action,
    repoPath: args.repoPath,
    sessionId: args.sessionId,
    summary: args.summary,
    workflowState: {
      status: "done" as const,
      currentStep: args.currentStep,
      completedTools: args.tools.map((tool) => tool.name),
      workflowKind: "pr" as const,
      workflowPhase: args.phase,
    },
    tools: args.tools,
  };
}

async function appendWorkflowActionAssistantBubble(
  chatSessions: ChatSessionManager,
  sessionId: string | undefined,
  content: string,
): Promise<void> {
  if (!sessionId) return;
  await chatSessions.appendBubble(sessionId, {
    role: "assistant",
    content,
    timestamp: Math.floor(Date.now() / 1000),
  });
}
