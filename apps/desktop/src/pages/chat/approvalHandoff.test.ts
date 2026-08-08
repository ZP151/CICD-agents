import { describe, expect, it, vi } from "vitest";
import { APPROVAL_HANDOFF_KEY } from "../../checkpointHandoff.js";
import {
  APPROVAL_HANDOFF_STATUS_TEXT,
  approvalHandoffDraftToState,
  consumeApprovalHandoff,
  saveApprovalHandoff,
} from "./approvalHandoff.js";
import type { WorkflowEventState } from "./chat.types.js";

function storageWith(raw: string | null) {
  const values = new Map<string, string>();
  if (raw !== null) values.set(APPROVAL_HANDOFF_KEY, raw);
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function pendingApprovalWorkflowState(): WorkflowEventState {
  return {
    status: "done",
    currentStep: "Waiting for approval",
    completedTools: [],
    workflowKind: "ci",
    workflowPhase: "pipeline_trigger",
    pendingApproval: {
      id: "approval_ado_trigger_pipeline_abc123",
      riskLevel: "high",
      explanation: "Trigger Azure Pipeline #117.",
      action: {
        tool: "ado_trigger_pipeline",
        args: { pipelineId: 117 },
        description: "Trigger Azure Pipeline #117 (ClaimBot_API) on the default branch.",
      },
    },
  };
}

describe("approval handoff (MP-006)", () => {
  it("normalizes a pending-approval draft into the chat session patch", () => {
    expect(approvalHandoffDraftToState({
      sessionId: " session-1 ",
      repoPath: " C:\\repo ",
      activeProjectLinkId: " project-link-1 ",
      workflowState: pendingApprovalWorkflowState(),
    })).toEqual({
      sessionId: "session-1",
      repoPath: "C:\\repo",
      activeProjectLinkId: "project-link-1",
      workflowState: pendingApprovalWorkflowState(),
    });
  });

  it("rejects drafts without a live pending approval", () => {
    expect(approvalHandoffDraftToState({
      sessionId: "session-1",
      repoPath: "C:\\repo",
      workflowState: { status: "done", currentStep: "Finished", completedTools: [] },
    })).toBeNull();

    // An empty sessionId is the malformed-payload case the runtime guard
    // rejects (a stale draft whose session reference is gone).
    expect(approvalHandoffDraftToState({
      sessionId: "",
      repoPath: "C:\\repo",
      workflowState: pendingApprovalWorkflowState(),
    })).toBeNull();
  });

  it("round-trips through storage and consumes once", () => {
    const draft = {
      sessionId: "session-1",
      repoPath: "C:\\repo",
      workflowState: pendingApprovalWorkflowState(),
    };
    const storage = storageWith(null);
    saveApprovalHandoff(draft, storage);
    expect(storage.setItem).toHaveBeenCalledWith(APPROVAL_HANDOFF_KEY, JSON.stringify(draft));

    const consumed = consumeApprovalHandoff(storage);
    expect(consumed).toEqual({
      sessionId: "session-1",
      repoPath: "C:\\repo",
      workflowState: pendingApprovalWorkflowState(),
    });
    expect(consumed?.activeProjectLinkId).toBeUndefined();
    expect(storage.removeItem).toHaveBeenCalledWith(APPROVAL_HANDOFF_KEY);

    // A second consume must see nothing: the handoff is one-shot.
    expect(consumeApprovalHandoff(storage)).toBeNull();
  });

  it("ignores malformed or missing handoff payloads", () => {
    const malformed = storageWith("{bad-json");
    expect(consumeApprovalHandoff(malformed)).toBeNull();
    expect(malformed.removeItem).toHaveBeenCalledWith(APPROVAL_HANDOFF_KEY);

    const empty = storageWith(null);
    expect(consumeApprovalHandoff(empty)).toBeNull();
    expect(empty.removeItem).not.toHaveBeenCalled();
  });

  it("exposes the status text the chat page shows while the card is pending", () => {
    expect(APPROVAL_HANDOFF_STATUS_TEXT).toBe("Approval required");
  });
});
