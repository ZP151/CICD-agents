import { describe, expect, it } from "vitest";
import { chatEventsToUiChunks, type ChatEvent, type ChatUiChunk } from "../src/index.js";

async function collect(events: ChatEvent[]): Promise<ChatUiChunk[]> {
  async function* source() {
    for (const event of events) yield event;
  }
  const chunks: ChatUiChunk[] = [];
  for await (const chunk of chatEventsToUiChunks(source())) chunks.push(chunk);
  return chunks;
}

describe("chatEventsToUiChunks", () => {
  it("wraps assistant deltas in a text lifecycle", async () => {
    const chunks = await collect([
      { type: "assistant_delta", delta: "Hello" },
      { type: "assistant_delta", delta: " world" },
      {
        type: "done",
        result: {
          response: "Hello world",
          riskLevel: "low",
          actionsTaken: [],
          suggestions: [],
          toolCallsMade: [],
          usedLlm: true,
        },
      },
    ]);

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "start",
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "finish",
    ]);
    expect(chunks[2]).toMatchObject({ type: "text-delta", delta: "Hello" });
    expect(chunks[3]).toMatchObject({ type: "text-delta", delta: " world" });
  });

  it("closes text before progress and tool lifecycle chunks", async () => {
    const chunks = await collect([
      { type: "assistant_delta", delta: "Let me check" },
      { type: "progress", message: "Checking Git status" },
      { type: "tool_start", name: "git_status", args: { short: true } },
      { type: "tool_output_delta", name: "git_status", stream: "stdout", delta: "## main\n" },
      { type: "tool_end", name: "git_status", ok: true, summary: "clean", result: { stdout: "" } },
    ]);

    const types = chunks.map((chunk) => chunk.type);
    expect(types).toEqual([
      "start",
      "text-start",
      "text-delta",
      "text-end",
      "progress",
      "tool-input-start",
      "tool-input-available",
      "tool-output-delta",
      "tool-output-available",
    ]);
    expect(chunks.find((chunk) => chunk.type === "tool-input-available")).toMatchObject({
      toolName: "git_status",
      input: { short: true },
    });
    expect(chunks.find((chunk) => chunk.type === "tool-output-delta")).toMatchObject({
      toolName: "git_status",
      stream: "stdout",
      delta: "## main\n",
    });
  });

  it("maps deterministic fallback messages into text chunks", async () => {
    const chunks = await collect([
      { type: "message", text: "Offline fallback response" },
      {
        type: "done",
        result: {
          response: "Offline fallback response",
          riskLevel: "low",
          actionsTaken: [],
          suggestions: [],
          toolCallsMade: [],
          usedLlm: false,
        },
      },
    ]);

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "start",
      "text-start",
      "text-delta",
      "text-end",
      "finish",
    ]);
    expect(chunks[2]).toMatchObject({ type: "text-delta", delta: "Offline fallback response" });
  });

  it("maps assistant control metadata into a UI metadata chunk", async () => {
    const chunks = await collect([
      {
        type: "assistant_control",
        control: {
          response: "Ready",
          riskLevel: "low",
          actionsTaken: [],
          suggestions: [],
          toolCallsMade: [],
          usedLlm: true,
        },
      },
    ]);

    expect(chunks).toEqual([
      { type: "start" },
      {
        type: "metadata-available",
        metadata: {
          response: "Ready",
          riskLevel: "low",
          actionsTaken: [],
          suggestions: [],
          toolCallsMade: [],
          usedLlm: true,
        },
      },
    ]);
  });

  it("maps failed tools and approval events into UI chunks", async () => {
    const chunks = await collect([
      { type: "tool_start", name: "ado_create_pr", args: {} },
      { type: "tool_end", name: "ado_create_pr", ok: false, summary: "error", result: { error: "missing credentials" } },
      {
        type: "approval_required",
        approval: {
          id: "approval_1",
          action: { tool: "git_push", args: { branch: "feature/x" }, description: "Push" },
          riskLevel: "high",
          explanation: "Push branch",
        },
      },
    ]);

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "start",
      "tool-input-start",
      "tool-input-available",
      "tool-output-error",
      "approval-required",
    ]);
    expect(chunks[3]).toMatchObject({ type: "tool-output-error", errorText: "missing credentials" });
  });

  it("summarizes installed-daemon native binding failures for UI chunks", async () => {
    const chunks = await collect([
      {
        type: "tool_end",
        name: "repo_refresh_index",
        ok: false,
        summary: "error",
        result: {
          error:
            "Could not locate the bindings file. Tried:\n -> C:\\snapshot\\CICD-agents\\node_modules\\better-sqlite3\\build\\Release\\better_sqlite3.node",
        },
      },
    ]);

    expect(chunks.find((chunk) => chunk.type === "tool-output-error")).toMatchObject({
      type: "tool-output-error",
      errorText: "Repository index storage is unavailable because the installed daemon could not load its native SQLite binding.",
    });
  });

  it("preserves explicit tool call ids across repeated same-name tools", async () => {
    const chunks = await collect([
      { type: "tool_start", name: "git_status", args: { short: true }, toolCallId: "call_1" },
      { type: "tool_output_delta", name: "git_status", stream: "stdout", delta: "first\n", toolCallId: "call_1" },
      { type: "tool_end", name: "git_status", ok: true, summary: "first", result: { stdout: "first\n" }, toolCallId: "call_1" },
      { type: "tool_start", name: "git_status", args: { short: true }, toolCallId: "call_2" },
      { type: "tool_output_delta", name: "git_status", stream: "stdout", delta: "second\n", toolCallId: "call_2" },
      { type: "tool_end", name: "git_status", ok: true, summary: "second", result: { stdout: "second\n" }, toolCallId: "call_2" },
    ]);

    const lifecycleChunks = chunks.filter((chunk) => "toolCallId" in chunk);

    expect(lifecycleChunks.map((chunk) => chunk.toolCallId)).toEqual([
      "call_1",
      "call_1",
      "call_1",
      "call_1",
      "call_2",
      "call_2",
      "call_2",
      "call_2",
    ]);
  });
});
