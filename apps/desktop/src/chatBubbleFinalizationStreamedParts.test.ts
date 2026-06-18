import { describe, expect, it } from "vitest";
import {
  finaliseAssistantResponseBubbles,
  toolCallPartFromSnapshot,
  type ChatBubbleModel,
} from "./chatBubbles.js";

describe("chat bubble finalization streamed parts", () => {
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
      streaming: false,
      meta: { riskLevel: "low" },
    });
    expect(result[0]?.parts).toEqual([
      { type: "markdown", markdown: "Reviewed the PR policy." },
      {
        type: "source_document",
        sourceId: "document-packages/core/src/tools/azuredevops.ts",
        title: "Policy status",
        file: "packages/core/src/tools/azureDevOps.ts",
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
      (text, bubbleMeta): ChatBubbleModel => ({
        id: "new",
        kind: "assistant",
        text,
        streaming: false,
        meta: bubbleMeta,
      }),
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
});
