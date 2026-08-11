import { describe, expect, it } from "vitest";
import type { ChatEvent, ChatPlannerResult } from "@mergepilot/core";
import { streamPlannerAndPersist } from "../src/chatPlannerPersistence.js";
import type { StoredBubble, StoredSession } from "../src/chatHistoryStore.js";

describe("chat planner pending-action scope persistence", () => {
  it("does not turn a safe no-staged-changes conclusion into a staging approval", async () => {
    const message =
      "Commit staged changes with message \"chore: should not happen\". " +
      "Do not stage anything. If nothing is staged, explain and stop.";
    const response =
      "No staged changes were found, so I did not create a commit. " +
      "If you want me to create the commit anyway, ask me to stage all changes.";
    const bubbles: StoredBubble[] = [
      { role: "user", content: message, timestamp: 1 },
      {
        role: "tool",
        content: "Working tree clean",
        timestamp: 2,
        toolName: "git_status",
        toolOk: true,
      },
      {
        role: "tool",
        content: "No staged changes",
        timestamp: 3,
        toolName: "git_diff",
        toolArgs: { staged: true },
        toolOk: true,
      },
    ];
    const storedSession: StoredSession = {
      id: "s1",
      createdAt: 1,
      repoPath: "C:\\repo",
      messages: [{ role: "user", content: message, timestamp: 1 }],
      bubbles,
    };
    const events: ChatEvent[] = [];
    const planner = {
      async *run(): AsyncGenerator<ChatEvent> {
        yield { type: "done", result: plannerResult(response) };
      },
    };

    for await (const event of streamPlannerAndPersist({
      sessionId: "s1",
      message,
      history: [],
      repoPath: storedSession.repoPath,
      planner,
      waitForConfirm: async () => false,
      adapters: {
        appendBubble: async (_sessionId, bubble) => { bubbles.push(bubble); },
        appendMessage: async () => {},
        getBubbles: async () => bubbles,
        loadSession: async () => storedSession,
        saveSession: async () => {},
      },
    })) {
      events.push(event);
    }

    const workflow = events.find((event) => event.type === "workflow_state");
    expect(workflow?.type === "workflow_state" && workflow.state.status).toBe("done");
    expect(workflow?.type === "workflow_state" && workflow.state.pendingApproval).toBeUndefined();
    expect(events.some((event) => event.type === "approval_required")).toBe(false);
    expect(storedSession.approvalProposal).toBeUndefined();
    const done = events.find((event) => event.type === "done");
    expect(done?.type === "done" && done.result.response).toBe(response);
  });
});

function plannerResult(response: string): ChatPlannerResult {
  return {
    response,
    riskLevel: "low",
    actionsTaken: [],
    suggestions: [],
    toolCallsMade: [
      { name: "git_status", args: {}, ok: true },
      { name: "git_diff", args: { staged: true }, ok: true },
    ],
    usedLlm: true,
  };
}
