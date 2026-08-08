export const CHAT_HANDOFF_KEY = "dev_agent_chat_handoff_v1";
export const ACTIVITY_HANDOFF_KEY = "dev_agent_activity_handoff_v1";
export const PULL_REQUESTS_HANDOFF_KEY = "dev_agent_pull_requests_handoff_v1";
export const APPROVAL_HANDOFF_KEY = "dev_agent_approval_handoff_v1";

/** V2 Pipelines page -> Chat handoff carrying a pending approval (MP-006). */
export interface ApprovalHandoffDraft {
  sessionId: string;
  repoPath: string;
  activeProjectLinkId?: string;
  workflowState: {
    status: string;
    currentStep: string;
    completedTools: string[];
    workflowKind?: string;
    workflowPhase?: string;
    pendingApproval?: {
      id: string;
      riskLevel?: string;
      explanation?: string;
      action: {
        tool: string;
        args: Record<string, unknown>;
        description: string;
        nextHint?: string;
        workflow?: { kind?: string; phase?: string; branch?: string; message?: string };
      };
    };
  };
}

export interface ChatHandoffDraft {
  message?: string;
  repoPath?: string;
  projectLinkId?: string;
  source?: string;
}

export interface ActivityHandoffDraft {
  kind: "pr_insight";
  artifactId: string;
  projectLinkId?: string;
  source?: "chat";
}

export interface PullRequestsHandoffDraft {
  kind: "pr";
  projectLinkId?: string;
  repository: string;
  pullRequestId: number;
  artifactId?: string;
}

export function handoffProjectLinkId(input: { projectLinkId?: string }): string {
  return input.projectLinkId ?? "";
}

export function buildActivityPrInsightHandoffDraft(input: {
  artifactId: string;
  projectLinkId?: string;
  source?: "chat";
}): ActivityHandoffDraft {
  const projectLinkId = handoffProjectLinkId(input);
  const draft: ActivityHandoffDraft = {
    kind: "pr_insight",
    artifactId: input.artifactId,
    projectLinkId,
  };
  if (input.source) draft.source = input.source;
  return draft;
}

export function buildPullRequestsPrHandoffDraft(input: {
  projectLinkId?: string;
  repository: string;
  pullRequestId: number;
  artifactId?: string;
}): PullRequestsHandoffDraft {
  const projectLinkId = handoffProjectLinkId(input);
  return {
    kind: "pr",
    projectLinkId,
    repository: input.repository,
    pullRequestId: input.pullRequestId,
    artifactId: input.artifactId,
  };
}

export interface CheckpointRollbackProposal {
  tool: string;
  args: Record<string, unknown>;
  description: string;
  nextHint?: string;
}

export function buildCheckpointRollbackHandoffDraft(input: {
  proposal: CheckpointRollbackProposal;
  checkpointId: string;
  repoPath: string;
  projectLinkId?: string;
}): ChatHandoffDraft {
  const { proposal } = input;
  const message = [
    "Prepare this checkpoint rollback for confirmation.",
    "",
    "Use an approval_proposal for the exact tool and args below. Do not execute it until I approve.",
    "",
    `Tool: ${proposal.tool}`,
    `Args: ${JSON.stringify(proposal.args)}`,
    `Description: ${proposal.description}`,
    proposal.nextHint ? `Next hint: ${proposal.nextHint}` : "",
    "",
    `Checkpoint: ${input.checkpointId}`,
    `Repository: ${input.repoPath}`,
  ].filter(Boolean).join("\n");

  return {
    message,
    repoPath: input.repoPath,
    projectLinkId: input.projectLinkId,
    source: "activity-checkpoint-rollback",
  };
}

/** MP-006: explicit Pipeline page -> Chat handoff with a source reference. */
export function buildPipelineChatHandoffDraft(input: {
  pipelineId: string;
  pipelineName: string;
  project: string;
  repository: string;
  repoPath: string;
  projectLinkId?: string;
  summary?: string;
}): ChatHandoffDraft {
  const message = [
    `Continue from the pipeline inspection for #${input.pipelineId} (${input.pipelineName}).`,
    "",
    "Summarize the current pipeline state from the page result below, then recommend the next practical action.",
    "Do not rerun Azure DevOps analysis unless I explicitly ask for a fresh result.",
    "",
    `Project: ${input.project}`,
    `Repository: ${input.repository}`,
    `Pipeline: #${input.pipelineId} ${input.pipelineName}`,
    input.summary ? `Page summary: ${input.summary}` : "",
  ].filter(Boolean).join("\n");

  return {
    message,
    repoPath: input.repoPath,
    projectLinkId: input.projectLinkId,
    source: "pipelines-inspection",
  };
}

export function buildPrInsightChatHandoffDraft(input: {
  pullRequestId: number;
  title: string;
  repository: string;
  repoPath: string;
  projectLinkId?: string;
  kind?: "insight_preview" | "review_run";
  artifactId?: string;
}): ChatHandoffDraft {
  const message = [
    `Use the saved AI insight for PR #${input.pullRequestId}.`,
    "",
    "Summarize the last saved conclusion, explain the main risks, and recommend the next practical action.",
    "Do not rerun Azure DevOps or LLM analysis unless I explicitly ask for a fresh result.",
    "",
    `Repository: ${input.repository}`,
    `PR: #${input.pullRequestId}`,
    `Title: ${input.title || "(untitled)"}`,
    input.kind ? `Saved insight type: ${input.kind === "review_run" ? "full review" : "preview"}` : "",
    input.artifactId ? `Saved insight artifact: ${input.artifactId}` : "",
  ].filter(Boolean).join("\n");

  return {
    message,
    repoPath: input.repoPath,
    projectLinkId: input.projectLinkId,
    source: "pull-requests-pr-insight",
  };
}
