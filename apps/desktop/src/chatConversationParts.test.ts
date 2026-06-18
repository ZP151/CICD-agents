import { describe, expect, it } from "vitest";
import {
  appendTextDeltaToConversationParts,
  conversationPartsFromAssistantBubble,
  conversationTextFromParts,
  toolCallPartFromSnapshot,
} from "./chatBubbles.js";

describe("conversation part composition", () => {
  it("adapts legacy assistant text into a markdown conversation part", () => {
    expect(conversationPartsFromAssistantBubble({ text: "Hello\nworld" })).toEqual([
      { type: "markdown", markdown: "Hello\nworld" },
    ]);
  });

  it("preserves existing conversation parts instead of rebuilding from text", () => {
    const parts = [{ type: "code" as const, code: "const ok = true;", language: "ts" }];

    expect(conversationPartsFromAssistantBubble({ text: "ignored", parts })).toBe(parts);
  });

  it("merges final metadata sources into existing streamed parts", () => {
    const parts = [{ type: "markdown" as const, markdown: "Streamed answer." }];

    expect(
      conversationPartsFromAssistantBubble({
        text: "ignored",
        parts,
        meta: {
          riskLevel: "low",
          sources: [
            {
              type: "source_document",
              sourceId: "doc-1",
              title: "chatBubbles.ts",
              file: "apps/desktop/src/chatBubbles.ts",
            },
          ],
        },
      }),
    ).toEqual([
      { type: "markdown", markdown: "Streamed answer." },
      {
        type: "source_document",
        sourceId: "document-apps/desktop/src/chatbubbles.ts",
        title: "chatBubbles.ts",
        file: "apps/desktop/src/chatBubbles.ts",
        line: undefined,
        snippet: undefined,
      },
      {
        type: "metadata",
        riskLevel: "low",
        actionsTaken: undefined,
        suggestions: undefined,
      },
    ]);
  });

  it("appends streaming text deltas to one active markdown part", () => {
    const first = appendTextDeltaToConversationParts(undefined, "Hello");
    const second = appendTextDeltaToConversationParts(first, " world");

    expect(second).toEqual([{ type: "markdown", markdown: "Hello world" }]);
  });

  it("extracts visible streamed text from markdown and text parts", () => {
    expect(
      conversationTextFromParts([
        { type: "markdown", markdown: "Hello " },
        toolCallPartFromSnapshot({ toolCallId: "tool-1", toolName: "git_status" }),
        { type: "text", text: "world" },
      ]),
    ).toBe("Hello world");
  });

  it("adds metadata as a structured part when assistant metadata exists", () => {
    expect(
      conversationPartsFromAssistantBubble({
        text: "Done.",
        meta: { riskLevel: "low", actionsTaken: ["git_status"], suggestions: ["Review diff"] },
      }),
    ).toEqual([
      { type: "markdown", markdown: "Done." },
      {
        type: "metadata",
        riskLevel: "low",
        actionsTaken: ["git_status"],
        suggestions: ["Review diff"],
      },
    ]);
  });

  it("adapts assistant metadata sources into source conversation parts", () => {
    expect(
      conversationPartsFromAssistantBubble({
        text: "The chat flow is rendered through Chat.tsx.",
        meta: {
          sources: [
            {
              type: "source_document",
              sourceId: "doc-1",
              title: "Chat.tsx",
              file: "apps/desktop/src/pages/Chat.tsx",
              line: 3590,
              snippet: "ConversationPartRenderer",
            },
            {
              type: "source_url",
              sourceId: "url-1",
              title: "AI SDK UIMessage",
              url: "https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message",
              domain: "ai-sdk.dev",
            },
          ],
        },
      }),
    ).toEqual([
      { type: "markdown", markdown: "The chat flow is rendered through Chat.tsx." },
      {
        type: "source_document",
        sourceId: "document-apps/desktop/src/pages/chat.tsx",
        title: "Chat.tsx",
        file: "apps/desktop/src/pages/Chat.tsx",
        line: undefined,
        snippet: "ConversationPartRenderer",
      },
      {
        type: "source_url",
        sourceId: "url-1",
        title: "AI SDK UIMessage",
        url: "https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message",
        domain: "ai-sdk.dev",
        snippet: undefined,
      },
    ]);
  });

  it("collapses multiple document source chunks into one file-level reference", () => {
    expect(
      conversationPartsFromAssistantBubble({
        text: "ClaimController manages claims.",
        meta: {
          sources: [
            {
              type: "source_document",
              sourceId: "chunk-1",
              title: "ClaimController.cs:42",
              file: "BotToSharePoint/Controllers/ClaimController.cs",
              line: 42,
              snippet: "public ActionResult GetClaim()",
            },
            {
              type: "source_document",
              sourceId: "chunk-2",
              title: "ClaimController.cs:201",
              file: "BotToSharePoint/Controllers/ClaimController.cs",
              line: 201,
              snippet: "public ActionResult SaveClaim()",
            },
          ],
        },
      }),
    ).toEqual([
      { type: "markdown", markdown: "ClaimController manages claims." },
      {
        type: "source_document",
        sourceId: "document-bottosharepoint/controllers/claimcontroller.cs",
        title: "ClaimController.cs",
        file: "BotToSharePoint/Controllers/ClaimController.cs",
        line: undefined,
        snippet: "public ActionResult GetClaim()\n\npublic ActionResult SaveClaim()",
      },
    ]);
  });

  it("adapts assistant metadata artifacts into selectable conversation parts", () => {
    expect(
      conversationPartsFromAssistantBubble({
        text: "Tests failed. I prepared a failure report.",
        meta: {
          artifacts: [
            {
              type: "artifact",
              artifactId: "validation-test-failed-123",
              title: "Test failure report",
              artifactType: "markdown",
              status: "error",
              content: "# Test Failure Report",
            },
          ],
        },
      }),
    ).toEqual([
      { type: "markdown", markdown: "Tests failed. I prepared a failure report." },
      {
        type: "artifact",
        artifactId: "validation-test-failed-123",
        title: "Test failure report",
        artifactType: "markdown",
        status: "error",
        content: "# Test Failure Report",
      },
    ]);
  });
});
