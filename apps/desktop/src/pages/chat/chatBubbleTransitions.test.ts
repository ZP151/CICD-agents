import { describe, expect, it } from "vitest";
import {
  appendVisibleAssistantDeltaTransition,
  showApprovalRequestTransition,
  stopStreamingTransition,
} from "./chatBubbleTransitions.js";
import type { ApprovalRequest, Bubble } from "./chat.types.js";

const makeId = (() => {
  let next = 0;
  return () => `id-${++next}`;
})();

describe("chat bubble transitions", () => {
  it("appends visible assistant deltas and finalizes interrupted streaming bubbles", () => {
    const first = appendVisibleAssistantDeltaTransition([], "Hel", makeId);
    const second = appendVisibleAssistantDeltaTransition(first, "lo", makeId);
    const stopped = stopStreamingTransition(second);

    expect(second).toEqual([
      expect.objectContaining({ kind: "assistant", text: "Hello", streaming: true }),
    ]);
    expect(stopped).toEqual([
      expect.objectContaining({ kind: "assistant", text: "Hello", streaming: false }),
    ]);
  });

  it("adds one approval bubble per waiting tool", () => {
    const approval: ApprovalRequest = {
      id: "approval-1",
      riskLevel: "high",
      explanation: "Review exact args",
      action: {
        tool: "git_push",
        args: { branch: "main" },
        description: "Push current branch",
      },
    };

    const first = showApprovalRequestTransition([], approval, makeId);
    const second = showApprovalRequestTransition(first, approval, makeId);

    expect(first).toHaveLength(1);
    expect(second).toBe(first);
    expect(first[0]).toMatchObject({
      kind: "pending_confirm",
      pendingTool: "git_push",
      pendingDescription: "Push current branch",
      pendingStatus: "waiting",
      riskLevel: "high",
    });
  });

  it("allows a revised approval for the same tool when the arguments change", () => {
    const firstApproval: ApprovalRequest = {
      id: "approval-readme",
      riskLevel: "medium",
      explanation: "Stage README",
      action: {
        tool: "git_add",
        args: { paths: ["README.md"] },
        description: "Stage README.md",
      },
    };
    const revisedApproval: ApprovalRequest = {
      id: "approval-notes",
      riskLevel: "medium",
      explanation: "Stage notes",
      action: {
        tool: "git_add",
        args: { paths: ["notes.txt"] },
        description: "Stage notes.txt",
      },
    };

    const first = showApprovalRequestTransition([], firstApproval, makeId);
    const cancelledFirst: Bubble[] = first.map((bubble) =>
      bubble.kind === "pending_confirm" ? { ...bubble, pendingStatus: "cancelled" } : bubble,
    );
    const second = showApprovalRequestTransition(cancelledFirst, revisedApproval, makeId);

    expect(second).toHaveLength(2);
    expect(second[1]).toMatchObject({
      kind: "pending_confirm",
      pendingTool: "git_add",
      pendingArgs: { paths: ["notes.txt"] },
      pendingStatus: "waiting",
    });
  });
});
