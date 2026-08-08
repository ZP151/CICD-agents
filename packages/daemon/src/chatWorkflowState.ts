import crypto from "node:crypto";
import {
  type ChatPlannerResult,
  type ChatVerifiedAction,
  type ChatWorkflowState,
  type PendingToolAction,
} from "@mergepilot/core";
import {
  generateCommitMessageForRepo,
  pushReadinessForRepo,
} from "./chatGitWorkflow.js";
import type { StoredBubble, StoredSession } from "./chatHistoryStore.js";
export { structuredDoneAfterConfirmedAction } from "./chatStructuredDone.js";
import { workflowStateMetadata } from "./chatWorkflowMetadata.js";

export function approvalIdFor(action: PendingToolAction): string {
  return `approval_${action.tool}_${hashShort(JSON.stringify(action.args ?? {}))}`;
}

export function approvalProposalFromResult(result: ChatPlannerResult): PendingToolAction | undefined {
  return result.approvalProposal;
}

export function storedApprovalProposal(session: StoredSession): PendingToolAction | undefined {
  return session.approvalProposal;
}

export function setStoredApprovalProposal(session: StoredSession, proposal: PendingToolAction | undefined): void {
  session.approvalProposal = proposal;
}

export function clearStoredApprovalProposal(session: StoredSession): void {
  setStoredApprovalProposal(session, undefined);
}

export function buildWorkflowState(
  bubbles: StoredBubble[],
  approvalProposal: PendingToolAction | undefined,
  status: ChatWorkflowState["status"],
  currentStep: string,
  riskLevel = "medium",
  explanation = "",
  metadata: Pick<ChatWorkflowState, "workflowKind" | "workflowPhase"> = {},
  verifiedActions: ChatVerifiedAction[] = [],
): ChatWorkflowState {
  const completedTools = bubbles
    .filter((b) => b.role === "tool" && b.toolName && b.toolOk !== false)
    .map((b) => b.toolName as string);
  return {
    status,
    currentStep,
    completedTools,
    ...(verifiedActions.length > 0 ? { verifiedActions } : {}),
    ...workflowStateMetadata(approvalProposal, status),
    ...metadata,
    pendingApproval: approvalProposal
      ? {
          id: approvalIdFor(approvalProposal),
          action: approvalProposal,
          riskLevel,
          explanation,
        }
      : undefined,
  };
}

export function mergePlannerSources(
  primary: ChatPlannerResult["sources"] = [],
  secondary: ChatPlannerResult["sources"] = [],
  maxSources = 10,
): ChatPlannerResult["sources"] {
  const out: NonNullable<ChatPlannerResult["sources"]> = [];
  const seen = new Set<string>();
  for (const source of [...primary, ...secondary]) {
    const key = source.type === "source_url"
      ? source.url
      : `${source.file ?? source.title}:${source.line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
    if (out.length >= maxSources) break;
  }
  return out.length ? out : undefined;
}

export async function nextStructuredApprovalAfterConfirmedAction(
  action: PendingToolAction,
  repoPath: string,
): Promise<{
  proposal: PendingToolAction;
  currentStep: string;
  riskLevel: string;
  explanation: string;
} | undefined> {
  const workflow = action.workflow;
  if (workflow?.kind !== "commit") return undefined;
  const branch = workflow.branch?.trim();
  const message = workflow.message?.trim() || await generateCommitMessageForRepo(repoPath);
  if (action.tool === "git_add" && workflow.phase === "stage") {
    const proposal: PendingToolAction = {
      tool: "git_commit",
      args: { message },
      description: workflow.message?.trim()
        ? `Commit staged changes with message: ${message}`
        : `Commit staged changes with generated message: ${message}`,
      nextHint: workflow.pushAfterCommit ? "push the branch" : "done",
      workflow: {
        kind: "commit",
        phase: "commit",
        branch,
        message,
        pushAfterCommit: workflow.pushAfterCommit,
      },
    };
    return {
      proposal,
      currentStep: proposal.description,
      riskLevel: "medium",
      explanation: proposal.description,
    };
  }

  if (action.tool === "git_commit" && workflow.phase === "commit" && workflow.pushAfterCommit && branch) {
    const readiness = await pushReadinessForRepo(repoPath);
    const readinessSummary = readiness?.summary ? ` ${readiness.summary}` : "";
    const proposal: PendingToolAction = {
      tool: "git_push",
      args: { branch, setUpstream: true },
      description: `Push branch ${branch} to origin.${readinessSummary}`,
      nextHint: "report push result",
      readiness,
      workflow: {
        kind: "commit",
        phase: "push",
        branch,
        message: workflow.message,
        pushAfterCommit: true,
      },
    };
    return {
      proposal,
      currentStep: proposal.description,
      riskLevel: "high",
      explanation: proposal.description,
    };
  }

  return undefined;
}

function hashShort(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}
