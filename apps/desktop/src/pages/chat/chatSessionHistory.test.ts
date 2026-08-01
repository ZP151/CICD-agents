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
  it("replays a persisted public Timeline into one sealed Turn and an external final", () => {
    const bubbles = chatMessagesToBubbles({
      bubbles: [{ role: "user", content: "Inspect the branch", timestamp: 1 }],
      timelineEvents: [
        { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 },
        { type: "turn.work.statement", turnId: "turn-1", sequence: 1, emittedAt: 1_020, blockId: "inspect", message: "Checking the branch state first." },
        { type: "turn.tool_group.started", turnId: "turn-1", sequence: 2, emittedAt: 1_040, groupId: "inspect" },
        { type: "turn.tool.started", turnId: "turn-1", sequence: 3, emittedAt: 1_060, groupId: "inspect", commandId: "git-1", name: "git_status", args: { short: true } },
        { type: "turn.tool.completed", turnId: "turn-1", sequence: 4, emittedAt: 1_100, groupId: "inspect", commandId: "git-1", ok: true, summary: "Working tree inspected." },
        { type: "turn.execution.completed", turnId: "turn-1", sequence: 5, emittedAt: 1_120, elapsedMs: 120 },
        { type: "turn.final.completed", turnId: "turn-1", sequence: 6, emittedAt: 1_140, finalText: "The branch is clean." },
        { type: "turn.finished", turnId: "turn-1", sequence: 7, emittedAt: 1_160, elapsedMs: 160, status: "completed" },
      ],
    }, { makeId: (() => { let id = 0; return () => `timeline-${++id}`; })() });

    expect(bubbles.map((bubble) => bubble.kind)).toEqual(["user", "system", "assistant"]);
    expect(bubbles[1]?.turnTranscript).toMatchObject({
      status: "completed",
      executionSealed: true,
      blocks: [
        { kind: "statement", text: "Checking the branch state first." },
        { kind: "tool_group", commands: [expect.objectContaining({ name: "git_status", status: "succeeded" })] },
      ],
    });
    expect(bubbles[2]?.text).toBe("The branch is clean.");
  });

  it("replays each Turn by sequence even when persisted timestamps arrive out of order", () => {
    const bubbles = chatMessagesToBubbles({
      bubbles: [{ role: "user", content: "Inspect the branch", timestamp: 1 }],
      timelineEvents: [
        { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 },
        { type: "turn.execution.completed", turnId: "turn-1", sequence: 3, emittedAt: 1_010, elapsedMs: 60 },
        { type: "turn.work.statement", turnId: "turn-1", sequence: 1, emittedAt: 1_040, blockId: "inspect", message: "Checking the branch state first." },
        { type: "turn.tool.started", turnId: "turn-1", sequence: 2, emittedAt: 1_020, groupId: "inspect", commandId: "git-1", name: "git_status", args: { short: true } },
        { type: "turn.final.completed", turnId: "turn-1", sequence: 4, emittedAt: 1_050, finalText: "The branch is clean." },
        { type: "turn.finished", turnId: "turn-1", sequence: 5, emittedAt: 1_060, elapsedMs: 60, status: "completed" },
      ],
    });

    expect(bubbles[1]?.turnTranscript?.blocks).toEqual([
      expect.objectContaining({ kind: "statement", id: "inspect" }),
      expect.objectContaining({ kind: "tool_group", id: "inspect" }),
    ]);
    expect(bubbles[1]?.turnTranscript).toMatchObject({ status: "completed", executionSealed: true });
  });

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
        id: "id-3",
        kind: "system",
        text: "Worked for 1s",
        turnTranscript: expect.objectContaining({
          status: "completed",
          elapsedMs: 1_000,
          blocks: [expect.objectContaining({ kind: "tool_group", commands: [expect.objectContaining({ name: "git_status" })] })],
        }),
      }),
      expect.objectContaining({
        id: "id-2",
        kind: "assistant",
        text: "I inspected the diff.",
        meta: expect.objectContaining({
          riskLevel: "low",
          suggestions: ["Repository context: src/app.ts"],
          timestamp: 2_000,
        }),
      }),
      expect.objectContaining({ id: "id-5", kind: "system", text: "Session restored" }),
      expect.objectContaining({ id: "id-6", kind: "error", text: "Failed to load state" }),
    ]);
  });

  it("restores independent activity durations for consecutive turns", () => {
    const bubbles = chatMessagesToBubbles([
      { role: "user", content: "First", timestamp: 100 },
      { role: "tool", content: "", timestamp: 102, toolName: "git_status", toolOk: true },
      { role: "assistant", content: "First answer", timestamp: 107 },
      { role: "user", content: "Second", timestamp: 120 },
      { role: "assistant", content: "Second answer", timestamp: 123 },
    ] satisfies ChatMessageEntry[], { makeId: (() => { let id = 0; return () => `turn-${++id}`; })() });

    const activities = bubbles.filter((bubble) => bubble.turnTranscript);
    expect(activities).toHaveLength(2);
    expect(activities).toEqual([
      expect.objectContaining({ text: "Worked for 7s", turnTranscript: expect.objectContaining({ elapsedMs: 7_000 }) }),
      expect.objectContaining({ text: "Worked for 3s", turnTranscript: expect.objectContaining({ elapsedMs: 3_000 }) }),
    ]);
  });

  it("closes an incomplete restored turn rather than leaving it thinking", () => {
    const bubbles = chatMessagesToBubbles([
      { role: "user", content: "Still running?", timestamp: 100 },
      { role: "tool", content: "", timestamp: 102, toolName: "git_status", toolOk: true },
    ] satisfies ChatMessageEntry[]);

    expect(bubbles.find((bubble) => bubble.turnTranscript)).toEqual(expect.objectContaining({
      text: "Stopped for 0s",
      turnTranscript: expect.objectContaining({ status: "failed", elapsedMs: 0 }),
    }));
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
