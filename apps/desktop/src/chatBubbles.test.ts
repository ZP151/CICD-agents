import { describe, expect, it } from "vitest";
import {
  appendTextDeltaToConversationParts,
  appendToolOutputDeltaToConversationParts,
  assistantBubbleMetaFromUnknown,
  conversationPartsFromAssistantBubble,
  conversationTextFromParts,
  finaliseAssistantResponseBubbles,
  groupConsecutiveToolCallParts,
  mergeAssistantBubbleMeta,
  mergeAssistantMetadataIntoLatestBubble,
  primaryToolCallPart,
  toolApprovalPartFromSnapshot,
  toolCallPartFromSnapshot,
  upsertToolCallPart,
  type ChatBubbleModel,
} from "./chatBubbles.js";

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

  it("finalizes a parts-only streamed assistant bubble without duplicating the final response", () => {
    const result = finaliseAssistantResponseBubbles(
      [
        {
          id: "streamed",
          kind: "assistant",
          text: "",
          parts: [{ type: "markdown", markdown: "Streamed from typed parts." }],
          streaming: true,
        },
      ],
      "Streamed from typed parts.",
      { riskLevel: "low" },
      "Streamed from typed parts.",
      (text, bubbleMeta): ChatBubbleModel => ({ id: "new", kind: "assistant", text, streaming: false, meta: bubbleMeta }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "streamed",
      kind: "assistant",
      text: "Streamed from typed parts.",
      streaming: false,
      meta: { riskLevel: "low" },
    });
    expect(result[0]?.parts).toEqual([
      { type: "markdown", markdown: "Streamed from typed parts." },
      {
        type: "metadata",
        riskLevel: "low",
        actionsTaken: undefined,
        suggestions: undefined,
      },
    ]);
  });

  it("attaches final sources after a UI text-end already stopped the streamed bubble", () => {
    const result = finaliseAssistantResponseBubbles(
      [
        {
          id: "streamed",
          kind: "assistant",
          text: "Reviewed the PR policy.",
          parts: [{ type: "markdown", markdown: "Reviewed the PR policy." }],
          streaming: false,
        },
      ],
      "Reviewed the PR policy.",
      {
        riskLevel: "low",
        sources: [
          {
            type: "source_document",
            sourceId: "policy",
            title: "Policy status",
            file: "packages/core/src/tools/azureDevOps.ts",
            line: 42,
          },
        ],
      },
      "Reviewed the PR policy.",
      (text, bubbleMeta): ChatBubbleModel => ({ id: "new", kind: "assistant", text, streaming: false, meta: bubbleMeta }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "streamed",
      kind: "assistant",
      streaming: false,
      meta: { riskLevel: "low" },
    });
    expect(result[0]?.parts).toEqual([
      { type: "markdown", markdown: "Reviewed the PR policy." },
      {
        type: "source_document",
        sourceId: "policy",
        title: "Policy status",
        file: "packages/core/src/tools/azureDevOps.ts",
        line: 42,
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

  it("finalizes the matching streamed assistant bubble even when a tool bubble followed it", () => {
    const result = finaliseAssistantResponseBubbles(
      [
        {
          id: "streamed",
          kind: "assistant",
          text: "I checked streamed tool output.",
          parts: [{ type: "markdown", markdown: "I checked streamed tool output." }],
          streaming: false,
          meta: {
            riskLevel: "low",
            actionsTaken: ["git_status"],
            sources: [
              {
                type: "source_document",
                sourceId: "status-source",
                title: "Chat.tsx",
                file: "apps/desktop/src/pages/Chat.tsx",
              },
            ],
          },
        },
        {
          id: "tool",
          kind: "tool",
          parts: [
            toolCallPartFromSnapshot({
              toolCallId: "call_status_1",
              toolName: "git_status",
              state: "result",
              output: { stdout: "## main\n" },
            }),
          ],
        },
      ],
      "I checked streamed tool output.",
      {
        riskLevel: "low",
        actionsTaken: ["git_status"],
        suggestions: ["Review diff"],
        sources: [
          {
            type: "source_document",
            sourceId: "status-source",
            title: "Chat.tsx",
            file: "apps/desktop/src/pages/Chat.tsx",
          },
        ],
      },
      "I checked streamed tool output.",
      (text, bubbleMeta): ChatBubbleModel => ({ id: "new", kind: "assistant", text, streaming: false, meta: bubbleMeta }),
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "streamed",
      kind: "assistant",
      streaming: false,
      meta: { riskLevel: "low", actionsTaken: ["git_status"], suggestions: ["Review diff"] },
    });
    expect(result[0]?.parts?.filter((part) => part.type === "source_document")).toHaveLength(1);
    expect(result[1]).toMatchObject({ id: "tool", kind: "tool" });
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
});

describe("conversation parts", () => {
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
        sourceId: "doc-1",
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
        snippet: undefined,
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

  it("normalizes planner metadata chunks into assistant bubble metadata", () => {
    expect(
      assistantBubbleMetaFromUnknown({
        risk_level: "medium",
        finalization_mode: "agent_final",
        actions_taken: ["git_status", ""],
        suggestions: ["Review diff"],
        sources: [
          {
            type: "source_document",
            source_id: "doc-1",
            title: "Git tools",
            file: "packages/core/src/tools/git.ts",
            line: 42,
            snippet: "git_diff",
          },
          {
            type: "source_url",
            title: "AI SDK",
            url: "https://ai-sdk.dev",
            domain: "ai-sdk.dev",
          },
          {
            type: "source_url",
            title: "",
            url: "https://ignored.invalid",
          },
        ],
        artifacts: [
          {
            type: "artifact",
            artifact_id: "validation-build-failed-abc",
            title: "Build failure report",
            artifact_type: "markdown",
            status: "error",
            content: "# Build Failure Report",
          },
        ],
      }),
    ).toEqual({
      riskLevel: "medium",
      finalizationMode: "agent_final",
      actionsTaken: ["git_status"],
      suggestions: ["Review diff"],
      sources: [
        {
          type: "source_document",
          sourceId: "doc-1",
          title: "Git tools",
          file: "packages/core/src/tools/git.ts",
          line: 42,
          snippet: "git_diff",
        },
        {
          type: "source_url",
          sourceId: undefined,
          title: "AI SDK",
          url: "https://ai-sdk.dev",
          domain: "ai-sdk.dev",
          snippet: undefined,
        },
      ],
      artifacts: [
        {
          type: "artifact",
          artifactId: "validation-build-failed-abc",
          title: "Build failure report",
          artifactType: "markdown",
          status: "error",
          content: "# Build Failure Report",
        },
      ],
      timestamp: undefined,
    });
  });

  it("merges metadata chunks into the latest assistant bubble without duplicating sources", () => {
    const result = mergeAssistantMetadataIntoLatestBubble(
      [
        {
          id: "a1",
          kind: "assistant",
          text: "Reviewed changes.",
          parts: [
            { type: "markdown", markdown: "Reviewed changes." },
            {
              type: "source_document",
              sourceId: "doc-1",
              title: "Existing source",
              file: "src/existing.ts",
            },
          ],
          streaming: false,
          meta: {
            riskLevel: "low",
            actionsTaken: ["git_status"],
            sources: [
              {
                type: "source_document",
                sourceId: "doc-1",
                title: "Existing source",
                file: "src/existing.ts",
              },
            ],
          },
        },
        { id: "tool", kind: "tool" },
      ],
      {
        riskLevel: "medium",
        actionsTaken: ["git_status", "git_diff"],
        suggestions: ["Stage selected files"],
        sources: [
          {
            type: "source_document",
            sourceId: "doc-1",
            title: "Existing source",
            file: "src/existing.ts",
          },
          {
            type: "source_url",
            sourceId: "url-1",
            title: "External reference",
            url: "https://example.com/reference",
          },
        ],
        artifacts: [
          {
            type: "artifact",
            artifactId: "validation-test-failed-123",
            title: "Test failure report",
            artifactType: "markdown",
            status: "error",
          },
        ],
      },
    );

    expect(result[0]).toMatchObject({
      id: "a1",
      kind: "assistant",
      meta: {
        riskLevel: "medium",
        actionsTaken: ["git_status", "git_diff"],
        suggestions: ["Stage selected files"],
      },
    });
    expect(result[0]?.parts).toEqual([
      { type: "markdown", markdown: "Reviewed changes." },
      {
        type: "source_document",
        sourceId: "doc-1",
        title: "Existing source",
        file: "src/existing.ts",
      },
      {
        type: "source_url",
        sourceId: "url-1",
        title: "External reference",
        url: "https://example.com/reference",
        domain: undefined,
        snippet: undefined,
      },
      {
        type: "artifact",
        artifactId: "validation-test-failed-123",
        title: "Test failure report",
        artifactType: "markdown",
        status: "error",
      },
      {
        type: "metadata",
        riskLevel: "medium",
        actionsTaken: ["git_status", "git_diff"],
        suggestions: ["Stage selected files"],
      },
    ]);
    expect(result[1]).toEqual({ id: "tool", kind: "tool" });
  });

  it("merges assistant metadata lists and source identities", () => {
    expect(
      mergeAssistantBubbleMeta(
        {
          actionsTaken: ["git_status"],
          suggestions: ["Review"],
          sources: [{ type: "source_document", sourceId: "doc-1", title: "A", file: "a.ts" }],
        },
        {
          actionsTaken: ["git_status", "git_diff"],
          suggestions: ["Review", "Stage"],
          sources: [
            { type: "source_document", sourceId: "doc-1", title: "A", file: "a.ts" },
            { type: "source_document", title: "B", file: "b.ts", line: 12 },
          ],
        },
      ),
    ).toEqual({
      actionsTaken: ["git_status", "git_diff"],
      suggestions: ["Review", "Stage"],
      sources: [
        { type: "source_document", sourceId: "doc-1", title: "A", file: "a.ts" },
        { type: "source_document", title: "B", file: "b.ts", line: 12 },
      ],
    });
  });

  it("creates and replaces tool call parts by tool call id", () => {
    const first = upsertToolCallPart(undefined, {
      toolCallId: "tool-1",
      toolName: "git_status",
      state: "input-available",
      input: { porcelain: true },
    });
    const second = upsertToolCallPart(first, {
      toolCallId: "tool-1",
      toolName: "git_status",
      state: "result",
      input: { porcelain: true },
      output: { stdout: "## main" },
      summary: "clean",
    });

    expect(second).toEqual([
      {
        type: "tool_call",
        toolCallId: "tool-1",
        toolName: "git_status",
        state: "result",
        input: { porcelain: true },
        output: { stdout: "## main" },
        summary: "clean",
      },
    ]);
  });

  it("appends streamed tool output into the matching tool call part", () => {
    const first = appendToolOutputDeltaToConversationParts(
      [toolCallPartFromSnapshot({ toolCallId: "tool-1", toolName: "git_diff", input: { nameOnly: false } })],
      { toolCallId: "tool-1", toolName: "git_diff" },
      "stdout",
      "diff --git",
    );
    const second = appendToolOutputDeltaToConversationParts(
      first,
      { toolCallId: "tool-1", toolName: "git_diff" },
      "stderr",
      "warning",
    );

    expect(second).toEqual([
      {
        type: "tool_call",
        toolCallId: "tool-1",
        toolName: "git_diff",
        state: "running",
        input: { nameOnly: false },
        output: { stdout: "diff --git", stderr: "warning" },
        summary: undefined,
      },
    ]);
  });

  it("normalizes approval parts for the renderer contract", () => {
    expect(
      toolApprovalPartFromSnapshot({
        approvalId: "approval-1",
        toolName: "git_add",
        description: "Stage selected files",
        args: { paths: ["src/app.ts"] },
        riskLevel: "unexpected",
      }),
    ).toEqual({
      type: "tool_approval",
      approvalId: "approval-1",
      toolName: "git_add",
      description: "Stage selected files",
      args: { paths: ["src/app.ts"] },
      riskLevel: "medium",
    });
  });

  it("returns the latest tool call part as the primary tool part", () => {
    expect(
      primaryToolCallPart([
        { type: "markdown", markdown: "before" },
        toolCallPartFromSnapshot({ toolCallId: "tool-1", toolName: "git_status" }),
        toolCallPartFromSnapshot({ toolCallId: "tool-2", toolName: "git_diff" }),
      ]),
    ).toMatchObject({ type: "tool_call", toolCallId: "tool-2", toolName: "git_diff" });
  });

  it("groups consecutive tool call parts without swallowing text parts", () => {
    const grouped = groupConsecutiveToolCallParts([
      { type: "markdown", markdown: "before" },
      toolCallPartFromSnapshot({ toolCallId: "tool-1", toolName: "git_status" }),
      toolCallPartFromSnapshot({ toolCallId: "tool-2", toolName: "git_diff" }),
      { type: "markdown", markdown: "after" },
      toolCallPartFromSnapshot({ toolCallId: "tool-3", toolName: "git_log" }),
    ]);

    expect(grouped).toEqual([
      { type: "part", part: { type: "markdown", markdown: "before" } },
      {
        type: "tool_group",
        parts: [
          { type: "tool_call", toolCallId: "tool-1", toolName: "git_status", state: "input-streaming", input: undefined, output: undefined, summary: undefined },
          { type: "tool_call", toolCallId: "tool-2", toolName: "git_diff", state: "input-streaming", input: undefined, output: undefined, summary: undefined },
        ],
      },
      { type: "part", part: { type: "markdown", markdown: "after" } },
      {
        type: "tool_group",
        parts: [
          { type: "tool_call", toolCallId: "tool-3", toolName: "git_log", state: "input-streaming", input: undefined, output: undefined, summary: undefined },
        ],
      },
    ]);
  });
});
