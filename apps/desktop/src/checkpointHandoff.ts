export const CHAT_HANDOFF_KEY = "dev_agent_chat_handoff_v1";
export const ACTIVITY_HANDOFF_KEY = "dev_agent_activity_handoff_v1";
export const PULL_REQUESTS_HANDOFF_KEY = "dev_agent_pull_requests_handoff_v1";

export interface ChatHandoffDraft {
  message?: string;
  repoPath?: string;
  profileId?: string;
  source?: string;
}

export interface ActivityHandoffDraft {
  kind: "pr_insight";
  artifactId: string;
  profileId?: string;
}

export interface PullRequestsHandoffDraft {
  kind: "pr";
  profileId: string;
  repository: string;
  pullRequestId: number;
  artifactId?: string;
}

export function buildActivityPrInsightHandoffDraft(input: {
  artifactId: string;
  profileId?: string;
}): ActivityHandoffDraft {
  return {
    kind: "pr_insight",
    artifactId: input.artifactId,
    profileId: input.profileId,
  };
}

export function buildPullRequestsPrHandoffDraft(input: {
  profileId: string;
  repository: string;
  pullRequestId: number;
  artifactId?: string;
}): PullRequestsHandoffDraft {
  return {
    kind: "pr",
    profileId: input.profileId,
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
  profileId?: string;
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
    profileId: input.profileId,
    source: "activity-checkpoint-rollback",
  };
}

export function buildPrInsightChatHandoffDraft(input: {
  pullRequestId: number;
  title: string;
  repository: string;
  repoPath: string;
  profileId?: string;
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
    profileId: input.profileId,
    source: "pull-requests-pr-insight",
  };
}
