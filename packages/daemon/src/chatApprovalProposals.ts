import {
  type ChatWorkflowState,
  type PendingToolAction,
} from "@mergepilot/core";
import type { InlineLlmConfig } from "./llmSettings.js";
import {
  loadSession,
  type InlineProjectLink,
  type StoredSession,
} from "./chatHistoryStore.js";
import { inferPendingAction } from "./chatPendingActions.js";
import {
  buildWorkflowState,
  clearStoredApprovalProposal,
  setStoredApprovalProposal,
  storedApprovalProposal,
} from "./chatWorkflowState.js";
import { workflowStateMetadata } from "./chatWorkflowMetadata.js";
import { saveSession } from "./chatSessionRecords.js";

export interface CreateStoredApprovalProposalInput {
  sessionId: string;
  repoPath: string;
  projectLinkId?: string;
  inlineProjectLink?: InlineProjectLink;
  llmConfig?: InlineLlmConfig;
  proposal: PendingToolAction;
  currentStep: string;
  riskLevel?: string;
  explanation?: string;
  completedTools?: string[];
}

export async function createStoredApprovalProposal(
  args: CreateStoredApprovalProposalInput,
): Promise<{ sessionId: string; workflowState: ChatWorkflowState }> {
  const session = await loadSession(args.sessionId);
  if (!session) throw new Error(`Chat session not found: ${args.sessionId}`);
  session.repoPath = args.repoPath || session.repoPath;
  if (args.projectLinkId) {
    session.projectLinkId = args.projectLinkId;
  }
  if (args.inlineProjectLink) {
    session.inlineProjectLink = args.inlineProjectLink;
  }
  if (args.llmConfig) session.llmConfig = args.llmConfig;

  setStoredApprovalProposal(session, args.proposal);
  const workflowState = buildWorkflowState(
    session.bubbles,
    args.proposal,
    "waiting_for_approval",
    args.currentStep,
    args.riskLevel ?? "medium",
    args.explanation ?? args.proposal.description,
  );
  if (args.completedTools) {
    workflowState.completedTools = Array.from(
      new Set([...workflowState.completedTools, ...args.completedTools]),
    );
  }
  session.workflowState = workflowState;
  await saveSession(session);
  return { sessionId: args.sessionId, workflowState };
}

export interface ResolvedStoredApprovalProposal {
  storedSession: StoredSession;
  pending: PendingToolAction;
}

export async function resolveStoredApprovalProposal(
  sessionId: string,
): Promise<ResolvedStoredApprovalProposal | undefined> {
  const storedSession = await loadSession(sessionId);
  const pending = storedSession
    ? storedApprovalProposal(storedSession) ?? inferPendingAction(storedSession.messages)
    : undefined;
  if (!storedSession || !pending) return undefined;
  return { storedSession, pending };
}

export async function markStoredApprovalProposalRunning(
  storedSession: StoredSession,
  pending: PendingToolAction,
): Promise<ChatWorkflowState> {
  clearStoredApprovalProposal(storedSession);
  const workflowState = buildWorkflowState(
    storedSession.bubbles,
    undefined,
    "running",
    pending.tool,
    "medium",
    "",
    workflowStateMetadata(pending, "running"),
  );
  storedSession.workflowState = workflowState;
  await saveSession(storedSession);
  return workflowState;
}
