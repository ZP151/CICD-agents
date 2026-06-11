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
});
