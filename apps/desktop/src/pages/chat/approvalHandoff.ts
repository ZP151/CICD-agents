import {
  APPROVAL_HANDOFF_KEY,
  type ApprovalHandoffDraft,
} from "../../checkpointHandoff.js";
import type { WorkflowEventState } from "./chat.types.js";

export const APPROVAL_HANDOFF_STATUS_TEXT = "Approval required";

export interface ConsumedApprovalHandoff {
  sessionId: string;
  repoPath: string;
  activeProjectLinkId?: string;
  workflowState: WorkflowEventState;
}

type ApprovalHandoffStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function approvalHandoffDraftToState(
  draft: ApprovalHandoffDraft,
): ConsumedApprovalHandoff | null {
  const sessionId = typeof draft.sessionId === "string" ? draft.sessionId.trim() : "";
  const workflowState = draft.workflowState;
  // Only a live pending approval is worth handing off; anything else would
  // open Chat with a stale card and a dead session reference.
  if (!sessionId || !workflowState?.pendingApproval) return null;
  const repoPath = typeof draft.repoPath === "string" ? draft.repoPath.trim() : "";
  const projectLinkId =
    typeof draft.activeProjectLinkId === "string" ? draft.activeProjectLinkId.trim() : "";
  return {
    sessionId,
    repoPath,
    activeProjectLinkId: projectLinkId || undefined,
    // The draft is a JSON round-trip of the daemon's ChatWorkflowState; the
    // structural types agree on the fields the chat page consumes.
    workflowState: workflowState as WorkflowEventState,
  };
}

export function consumeApprovalHandoff(
  storage: ApprovalHandoffStorage = sessionStorage,
): ConsumedApprovalHandoff | null {
  const raw = storage.getItem(APPROVAL_HANDOFF_KEY);
  if (!raw) return null;
  storage.removeItem(APPROVAL_HANDOFF_KEY);
  try {
    return approvalHandoffDraftToState(JSON.parse(raw) as ApprovalHandoffDraft);
  } catch {
    return null;
  }
}

export function saveApprovalHandoff(
  draft: ApprovalHandoffDraft,
  storage: ApprovalHandoffStorage = sessionStorage,
): void {
  storage.setItem(APPROVAL_HANDOFF_KEY, JSON.stringify(draft));
}
