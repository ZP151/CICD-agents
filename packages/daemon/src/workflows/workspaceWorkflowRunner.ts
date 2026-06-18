import type { ChatSessionManager } from "../chatSession.js";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";
import {
  gitOperationBlockForAction,
  gitOperationStateFromTools,
} from "./gitOperation.js";
import { runGitWorkflowProbes } from "./gitProbes.js";
import {
  isAdoPipelineWorkflowAction,
  isAdoPullRequestWorkflowAction,
} from "./workflowActions.js";
import { runAdoPipelineWorkflowAction } from "./pipelineWorkflow.js";
import { runAdoPullRequestWorkflowAction } from "./prWorkflow.js";
import { changedFilesFromGitOutputs } from "./validationPreflight.js";
import {
  buildWorkspaceWorkflowProposal,
  isGitRecoveryWorkflowAction,
  preflightFromTools,
  pushReadinessFromTools,
  summarizeWorkspaceWorkflow,
  workflowRiskForAction,
} from "./workspaceWorkflow.js";

export async function runWorkspaceWorkflowAction(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
) {
  const { action, repoPath } = payload;
  if (isAdoPullRequestWorkflowAction(action)) {
    return runAdoPullRequestWorkflowAction(chatSessions, payload);
  }
  if (isAdoPipelineWorkflowAction(action)) {
    return runAdoPipelineWorkflowAction(chatSessions, payload);
  }

  const { tools, failed } = await runGitWorkflowProbes(repoPath, action, {
    isRecoveryAction: isGitRecoveryWorkflowAction,
  });
  const currentBranch = tools.find((tool) => tool.name === "git_current_branch")?.stdout.trim() || "";
  const statusText = tools.find((tool) => tool.name === "git_status")?.stdout.trim() || "";
  const diffStat = tools.find((tool) => tool.name === "git_diff")?.stdout.trim() || "";
  const changedFiles = changedFilesFromGitOutputs(
    tools.find((tool) => tool.name === "git_diff_name_only")?.stdout ?? "",
    statusText,
  );
  const operationState = gitOperationStateFromTools(repoPath, statusText, tools);
  const operationBlock = gitOperationBlockForAction(action, operationState);

  if (!failed && operationBlock) {
    return {
      ok: false,
      action,
      repoPath,
      sessionId: payload.sessionId,
      summary: summarizeWorkspaceWorkflow(action, { currentBranch, statusText, diffStat, changedFiles, operationState }),
      workflowState: {
        status: "blocked",
        workflowKind: "git",
        workflowPhase: operationBlock.workflowPhase,
        currentStep: operationBlock.summary,
        completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
      },
      tools,
    };
  }

  const preflight = failed ? undefined : await preflightFromTools(chatSessions, action, payload, tools, statusText);
  const proposal = failed ? undefined : buildWorkspaceWorkflowProposal(
    action,
    payload,
    currentBranch,
    statusText,
    pushReadinessFromTools(tools),
    preflight,
    operationState,
  );
  if (proposal) {
    const { sessionId, workflowState } = await chatSessions.createApprovalProposal({
      sessionId: payload.sessionId,
      repoPath,
      projectLinkId: payload.projectLinkId,
      inlineProjectLink: payload.projectLink,
      proposal,
      currentStep: proposal.description,
      riskLevel: workflowRiskForAction(action, statusText, proposal.preflight),
      explanation: proposal.description,
      completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
    });
    return {
      ok: true,
      action,
      sessionId,
      repoPath,
      summary: summarizeWorkspaceWorkflow(action, { currentBranch, statusText, diffStat, changedFiles, operationState }),
      workflowState,
      tools,
    };
  }

  return {
    ok: !failed,
    action,
    repoPath,
    sessionId: payload.sessionId,
    summary: summarizeWorkspaceWorkflow(action, { currentBranch, statusText, diffStat, changedFiles, operationState }),
    workflowState: {
      status: failed ? "failed" : "done",
      currentStep: failed ? `${failed.name} failed` : `${action} complete`,
      completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
    },
    tools,
  };
}
