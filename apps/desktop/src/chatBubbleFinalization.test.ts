import { describe, expect, it } from "vitest";
import {
  conversationPartsFromAssistantBubble,
  finaliseAssistantResponseBubbles,
  type ChatBubbleModel,
} from "./chatBubbles.js";

function assistant(text: string, streaming = false): ChatBubbleModel {
  return { id: `a-${text}`, kind: "assistant", text, streaming };
}

describe("chat bubble finalization", () => {
  it("attaches metadata to a streamed assistant bubble without duplicating the final response", () => {
    const meta = {
      riskLevel: "low",
      actionsTaken: ["repo_refresh_index"],
      suggestions: ["Repository context: semantic index used."],
    };
    const result = finaliseAssistantResponseBubbles(
      [assistant("Project context is ready.", true)],
      "Project context is ready.",
      meta,
      "Project context is ready.",
      (text, bubbleMeta): ChatBubbleModel => ({
        id: "new",
        kind: "assistant",
        text,
        streaming: false,
        meta: bubbleMeta,
      }),
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
      (text, bubbleMeta): ChatBubbleModel => ({
        id: "new",
        kind: "assistant",
        text,
        streaming: false,
        meta: bubbleMeta,
      }),
    );

    expect(result).toEqual([
      { id: "new", kind: "assistant", text: "Final answer.", streaming: false, meta: { riskLevel: "low" } },
    ]);
  });

  it("replaces the latest assistant bubble in the current turn when final text differs from streamed text", () => {
    const result = finaliseAssistantResponseBubbles(
      [
        { id: "u1", kind: "user", text: "Explain this project architecture" },
        {
          id: "a1",
          kind: "assistant",
          text: "This project is a ClaimsBot SharePoint API. It also includes Development Workflow details...",
          parts: [
            {
              type: "markdown",
              markdown: "This project is a ClaimsBot SharePoint API. It also includes Development Workflow details...",
            },
          ],
          streaming: false,
        },
      ],
      "This project is a ClaimsBot SharePoint API with controllers, models, SharePoint integration, and configuration layers.",
      { riskLevel: "low" },
      undefined,
      (text, bubbleMeta): ChatBubbleModel => ({
        id: "new",
        kind: "assistant",
        text,
        streaming: false,
        meta: bubbleMeta,
        parts: conversationPartsFromAssistantBubble({ text, meta: bubbleMeta }),
      }),
    );

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      id: "a1",
      kind: "assistant",
      text: "This project is a ClaimsBot SharePoint API with controllers, models, SharePoint integration, and configuration layers.",
      streaming: false,
      meta: { riskLevel: "low" },
    });
    expect(result[1]?.text).not.toContain("Development Workflow");
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

  it("normalizes CRLF line endings before comparing streamed and final text", () => {
    const result = finaliseAssistantResponseBubbles(
      [assistant("Line one\r\nLine two", true)],
      "Line one\nLine two",
      undefined,
      "Line one\nLine two",
      (text): ChatBubbleModel => ({ id: "new", kind: "assistant", text, streaming: false }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a-Line one\r\nLine two");
    expect(result[0]?.streaming).toBe(false);
  });

  it("deduplicates and cleans a streamed bubble with leaked finalization JSON residue", () => {
    const finalText = "It seems there was an issue retrieving the repository context automatically due to a technical error.";
    const result = finaliseAssistantResponseBubbles(
      [
        {
          id: "streamed",
          kind: "assistant",
          text: `${finalText}{"responsehere was an issue retrieving the repository context automatically"`,
          streaming: true,
        },
      ],
      finalText,
      { riskLevel: "low", actionsTaken: ["repo_refresh_index"] },
      finalText,
      (text, bubbleMeta): ChatBubbleModel => ({
        id: "new",
        kind: "assistant",
        text,
        streaming: false,
        meta: bubbleMeta,
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "streamed",
      kind: "assistant",
      text: finalText,
      streaming: false,
      meta: { riskLevel: "low", actionsTaken: ["repo_refresh_index"] },
    });
  });
});
