import { describe, expect, it } from "vitest";
import type { ChatWorkflowState, PendingToolAction, TurnTimelineEvent } from "@mergepilot/core";
import { workflowStateForSession } from "../src/chatWorkflowState.js";
import type { StoredSession } from "../src/chatHistoryStore.js";

function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: "s1",
    createdAt: 1,
    repoPath: "/repo",
    messages: [],
    bubbles: [],
    ...overrides,
  };
}

function ledgerWorkflow(
  workflow: ChatWorkflowState,
  sequence = 1,
): TurnTimelineEvent {
  return {
    type: "turn.workflow.updated",
    turnId: "t1",
    sequence,
    emittedAt: 100 + sequence,
    workflow,
  };
}

function proposal(): PendingToolAction {
  return {
    tool: "git_commit",
    args: { message: "feat: x" },
    description: "Commit staged changes",
  };
}

describe("workflowStateForSession", () => {
  const stagingForbiddenBubble = {
    role: "user" as const,
    content: "Commit what is staged. Do not stage anything. If nothing is staged, stop.",
    timestamp: 0,
  };

  it("returns undefined for a session with no proposal and no ledger transitions", () => {
    expect(workflowStateForSession(session())).toBeUndefined();
    expect(workflowStateForSession(session({ timelineEvents: [{ type: "turn.started", turnId: "t1", sequence: 0, emittedAt: 1 }] }))).toBeUndefined();
  });

  it("returns the last ledger workflow transition when no proposal is stored", () => {
    const running: ChatWorkflowState = {
      status: "running",
      currentStep: "git_push",
      completedTools: ["git_commit"],
      workflowKind: "commit",
      workflowPhase: "running_push",
    };
    const done: ChatWorkflowState = { status: "done", currentStep: "done", completedTools: [] };
    const derived = workflowStateForSession(session({
      timelineEvents: [
        ledgerWorkflow(running, 1),
        ledgerWorkflow(done, 2),
      ],
    }));
    expect(derived).toEqual(done);
  });

  it("derives the resume-inheritance running state from the ledger", () => {
    const running: ChatWorkflowState = {
      status: "running",
      currentStep: "git_push",
      completedTools: [],
      workflowKind: "commit",
      workflowPhase: "running_push",
    };
    const derived = workflowStateForSession(session({ timelineEvents: [ledgerWorkflow(running)] }));
    expect(derived?.status).toBe("running");
    expect(derived?.workflowKind).toBe("commit");
    expect(derived?.workflowPhase).toBe("running_push");
  });

  it("rebuilds a waiting card from the persisted proposal when the ledger is stale (workflow-action route)", () => {
    const staleDone: ChatWorkflowState = { status: "done", currentStep: "done", completedTools: [] };
    const derived = workflowStateForSession(session({
      approvalProposal: proposal(),
      timelineEvents: [ledgerWorkflow(staleDone)],
    }));
    expect(derived?.status).toBe("waiting_for_approval");
    expect(derived?.currentStep).toBe("Commit staged changes");
    expect(derived?.pendingApproval?.action.tool).toBe("git_commit");
    expect(derived?.pendingApproval?.action.description).toBe("Commit staged changes");
  });

  it("prefers the ledger waiting state when it already matches the stored proposal", () => {
    const waiting: ChatWorkflowState = {
      status: "waiting_for_approval",
      currentStep: "Commit staged changes",
      completedTools: [],
      riskLevel: "high",
      pendingApproval: {
        id: "approval_git_commit_abc",
        action: proposal(),
        riskLevel: "high",
      },
    };
    const derived = workflowStateForSession(session({
      approvalProposal: proposal(),
      timelineEvents: [ledgerWorkflow(waiting)],
    }));
    expect(derived).toEqual(waiting);
    expect(derived?.pendingApproval?.riskLevel).toBe("high");
  });

  it("returns the ledger state after the proposal was cleared", () => {
    const cancelled: ChatWorkflowState = { status: "done", currentStep: "cancelled", completedTools: [] };
    const derived = workflowStateForSession(session({
      timelineEvents: [ledgerWorkflow(cancelled)],
    }));
    expect(derived?.status).toBe("done");
    expect(derived?.currentStep).toBe("cancelled");
  });

  it("does not restore a persisted staging approval that violates the latest user scope", () => {
    const derived = workflowStateForSession(session({
      bubbles: [stagingForbiddenBubble],
      approvalProposal: {
        tool: "git_add",
        args: {},
        description: "Stage all changes",
      },
      timelineEvents: [ledgerWorkflow({ status: "done", currentStep: "done", completedTools: [] })],
    }));

    expect(derived?.status).toBe("done");
    expect(derived?.pendingApproval).toBeUndefined();
  });

  it("suppresses a legacy waiting ledger approval that violates the latest user scope", () => {
    const invalidApproval: PendingToolAction = {
      tool: "git_add",
      args: {},
      description: "Stage all changes",
    };
    const derived = workflowStateForSession(session({
      bubbles: [stagingForbiddenBubble],
      approvalProposal: invalidApproval,
      timelineEvents: [ledgerWorkflow({
        status: "waiting_for_approval",
        currentStep: "git_add",
        completedTools: ["git_status", "git_diff"],
        pendingApproval: {
          id: "approval_git_add_legacy",
          action: invalidApproval,
          riskLevel: "low",
        },
      })],
    }));

    expect(derived?.status).toBe("done");
    expect(derived?.currentStep).toBe("done");
    expect(derived?.pendingApproval).toBeUndefined();
  });

  it("keeps an explicit structured workspace approval separate from chat-text scope", () => {
    const structuredStage: PendingToolAction = {
      tool: "git_add",
      args: { paths: ["README.md"] },
      description: "Stage README.md",
      workflow: {
        kind: "commit",
        phase: "stage",
        message: "docs: update readme",
      },
    };
    const derived = workflowStateForSession(session({
      bubbles: [stagingForbiddenBubble],
      approvalProposal: structuredStage,
      timelineEvents: [ledgerWorkflow({ status: "done", currentStep: "done", completedTools: [] })],
    }));

    expect(derived?.status).toBe("waiting_for_approval");
    expect(derived?.pendingApproval?.action).toEqual(structuredStage);
  });
});
