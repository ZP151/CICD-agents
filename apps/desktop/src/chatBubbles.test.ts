import { describe, expect, it } from "vitest";
import { finaliseAssistantResponseBubbles, type ChatBubbleModel } from "./chatBubbles.js";

function assistant(text: string, streaming = false): ChatBubbleModel {
  return { id: `a-${text}`, kind: "assistant", text, streaming };
}

describe("chat bubble finalization", () => {
  it("attaches metadata to a streamed assistant bubble without duplicating the final response", () => {
    const meta = { riskLevel: "low", actionsTaken: ["repo_refresh_index"], suggestions: ["Repository context: semantic index used."] };
    const result = finaliseAssistantResponseBubbles(
      [assistant("Project context is ready.", true)],
      "Project context is ready.",
      meta,
      "Project context is ready.",
      (text, bubbleMeta): ChatBubbleModel => ({ id: "new", kind: "assistant", text, streaming: false, meta: bubbleMeta }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "assistant",
      text: "Project context is ready.",
      streaming: false,
      meta,
    });
  });

  it("adds a final assistant bubble when no matching streamed response exists", () => {
    const result = finaliseAssistantResponseBubbles(
      [],
      "Final answer.",
      { riskLevel: "low" },
      undefined,
      (text, bubbleMeta): ChatBubbleModel => ({ id: "new", kind: "assistant", text, streaming: false, meta: bubbleMeta }),
    );

    expect(result).toEqual([
      { id: "new", kind: "assistant", text: "Final answer.", streaming: false, meta: { riskLevel: "low" } },
    ]);
  });

  it("does not add duplicate text when an approval card already explains the pending action", () => {
    const result = finaliseAssistantResponseBubbles(
      [{ id: "p1", kind: "pending_confirm", pendingStatus: "waiting" }],
      "Shall I push this branch?",
      undefined,
      undefined,
      (text): ChatBubbleModel => ({ id: "new", kind: "assistant", text, streaming: false }),
    );

    expect(result).toEqual([{ id: "p1", kind: "pending_confirm", pendingStatus: "waiting" }]);
  });
});
