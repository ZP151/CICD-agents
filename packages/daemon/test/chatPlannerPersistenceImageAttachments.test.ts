import { describe, expect, it } from "vitest";
import type {
  ChatEvent,
  ChatImageAttachment,
  ChatMessage,
  ChatPlannerResult,
} from "@mergepilot/core";
import { streamPlannerAndPersist } from "../src/chatPlannerPersistence.js";
import type { StoredSession } from "../src/chatHistoryStore.js";

describe("chat planner persistence image attachments", () => {
  it("passes image attachments through to the planner without persisting image data", async () => {
    const imageAttachments: ChatImageAttachment[] = [
      {
        name: "screen.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,secret-image-bytes",
      },
    ];
    const plannerCalls: Array<{
      message: string;
      history: ChatMessage[];
      imageAttachments: ChatImageAttachment[];
    }> = [];
    const appendedMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    const appendedBubbles: Array<{ role: string; content: string }> = [];

    const planner = {
      async *run(
        message: string,
        history: ChatMessage[],
        _repoPath: string,
        _waitForConfirm: () => Promise<boolean>,
        _contextPrompt?: string,
        attachments: ChatImageAttachment[] = [],
      ): AsyncGenerator<ChatEvent> {
        plannerCalls.push({ message, history, imageAttachments: attachments });
        yield {
          type: "done",
          result: plannerResult("I can inspect the attached screenshot."),
        };
      },
    };

    for await (const _event of streamPlannerAndPersist({
      sessionId: "s1",
      message: "What does this screenshot show?",
      history: [{ role: "user", content: "previous text only", timestamp: 1 }],
      repoPath: "C:\\repo",
      planner,
      waitForConfirm: async () => false,
      imageAttachments,
      adapters: {
        appendBubble: async (_sessionId, bubble) => {
          appendedBubbles.push({ role: bubble.role, content: bubble.content });
        },
        appendMessage: async (_sessionId, role, content) => {
          appendedMessages.push({ role, content });
        },
        getBubbles: async () => [],
        loadSession: async () => null,
        saveSession: async (_session: StoredSession) => {},
      },
    })) {
      // Drain the async generator so the persistence side effects run.
    }

    expect(plannerCalls).toHaveLength(1);
    expect(plannerCalls[0]?.imageAttachments).toEqual(imageAttachments);
    expect(appendedBubbles.map((bubble) => bubble.content).join("\n")).not.toContain("secret-image-bytes");
    expect(appendedMessages.map((message) => message.content).join("\n")).not.toContain("secret-image-bytes");
  });
});

function plannerResult(response: string): ChatPlannerResult {
  return {
    response,
    riskLevel: "low",
    actionsTaken: [],
    suggestions: [],
    toolCallsMade: [],
    usedLlm: true,
  };
}
