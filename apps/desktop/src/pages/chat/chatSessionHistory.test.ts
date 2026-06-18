import { describe, expect, it } from "vitest";
import type { ChatHistoryEntry, ChatMessageEntry } from "../../api.js";
import {
  chatMessagesToBubbles,
  clampHistoryPage,
  removeHistoryEntry,
  upsertHistoryEntry,
} from "./chatSessionHistory.js";

function historyEntry(
  sessionId: string,
  overrides: Partial<ChatHistoryEntry> = {},
): ChatHistoryEntry {
  return {
    sessionId,
    title: undefined,
    preview: "",
    createdAt: 1,
    updatedAt: 1,
    pinned: false,
    ...overrides,
  };
}

describe("chat session history", () => {
  it("restores persisted messages into renderable bubbles", () => {
    let nextId = 0;
    const bubbles = chatMessagesToBubbles([
      { role: "user", content: "Review changes", timestamp: 1 },
      {
        role: "assistant",
        content: "I inspected the diff.",
        timestamp: 2,
        riskLevel: "low",
        suggestions: ["Repository context: src/app.ts"],
      },
      {
        role: "tool",
        content: "",
        timestamp: 3,
        toolName: "git_status",
        toolArgs: { short: true },
        toolOk: true,
        toolSummary: "2 modified",
        toolResult: { files: 2 },
      },
      { role: "system", content: "Session restored", timestamp: 4 },
      { role: "error", content: "Failed to load state", timestamp: 5 },
    ] satisfies ChatMessageEntry[], {
      makeId: () => `id-${++nextId}`,
      makeToolCallId: (toolName) => `tool-${toolName}`,
    });

    expect(bubbles).toEqual([
      expect.objectContaining({ id: "id-1", kind: "user", text: "Review changes" }),
      expect.objectContaining({
        id: "id-2",
        kind: "assistant",
        text: "I inspected the diff.",
        meta: expect.objectContaining({
          riskLevel: "low",
          suggestions: ["Repository context: src/app.ts"],
        }),
      }),
      expect.objectContaining({
        id: "id-3",
        kind: "tool",
        toolCallId: "tool-git_status",
        toolName: "git_status",
        toolOpen: false,
        parts: [expect.objectContaining({ type: "tool_call", state: "result" })],
      }),
      expect.objectContaining({ id: "id-4", kind: "system", text: "Session restored" }),
      expect.objectContaining({ id: "id-5", kind: "error", text: "Failed to load state" }),
    ]);
  });

  it("updates, removes, sorts, and clamps history state", () => {
    const base = [
      historyEntry("old", { updatedAt: 10 }),
      historyEntry("target", { updatedAt: 5 }),
    ];

    const upserted = upsertHistoryEntry(base, historyEntry("target", {
      title: "Pinned",
      pinned: true,
      updatedAt: 1,
    }));
    expect(upserted[0]).toMatchObject({ sessionId: "target", title: "Pinned", pinned: true });

    expect(removeHistoryEntry(upserted, "target").map((entry) => entry.sessionId)).toEqual(["old"]);
    expect(clampHistoryPage(99, 25, 12)).toBe(3);
    expect(clampHistoryPage(0, 25, 12)).toBe(1);
  });
});
