import { describe, expect, it } from "vitest";
import { ToolExecutor } from "@mergepilot/core";
import { streamAndPersistConfirmedAction } from "../src/chatConfirmedActions.js";
import { streamConfirmedToolExecution } from "../src/chatToolExecution.js";

describe("confirmed chat tool execution", () => {
  it("uses the model-authored approval as the public rationale instead of adding canned prose", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    executor.register({
      name: "publish_preview",
      description: "Publish the approved preview.",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true, summary: "Preview published." }),
    });

    const events = [];
    for await (const event of streamConfirmedToolExecution({
      actionExecutor: executor,
      pending: { tool: "publish_preview", args: {}, description: "Publish the preview" },
      toolCallId: "approval-1",
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "tool_group_start",
      "turn_step",
      "tool_start",
      "tool_end",
      "turn_step",
      "tool_group_end",
    ]);
    expect(events.some((event) => event.type === "work_statement")).toBe(false);
  });

  it("redacts approved-action evidence before it reaches the public event stream", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    executor.register({
      name: "publish_preview",
      description: "Publish the approved preview.",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true, stdout: "published\\napi_key=secret-value-12345" }),
    });

    const events = [];
    for await (const event of streamConfirmedToolExecution({
      actionExecutor: executor,
      pending: { tool: "publish_preview", args: {}, description: "Publish the preview" },
      toolCallId: "approval-2",
    })) events.push(event);

    const completed = events.find((event) => event.type === "tool_end");
    expect(completed).toMatchObject({ output: "published\\napi_key=***REDACTED***" });
    // The raw result remains available to the in-process workflow runner;
    // only the public `summary` and `output` fields cross the SSE boundary.
    expect(completed).toMatchObject({ summary: expect.stringContaining("***REDACTED***") });
  });

  it("does not persist an approved action's raw executor result", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    executor.register({
      name: "publish_preview",
      description: "Publish the approved preview.",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true, stdout: "published\\nauthorization: bearer confidential-token-12345" }),
    });
    const bubbles: Array<Record<string, unknown>> = [];
    const stream = streamAndPersistConfirmedAction({
      sessionId: "approval-session",
      actionExecutor: executor,
      pending: { tool: "publish_preview", args: {}, description: "Publish the preview" },
      toolCallId: "approval-3",
      historyLabel: "confirmed & executed",
      adapters: {
        appendBubble: async (_sessionId, bubble) => { bubbles.push(bubble); },
        appendMessage: async () => undefined,
      },
    });

    let completed = await stream.next();
    while (!completed.done) completed = await stream.next();

    // The generator return value is intentionally raw and remains in-process
    // for the immediate workflow continuation. The persisted bubble is the
    // public/recoverable boundary.
    expect(bubbles[0]?.toolResult).toMatchObject({
      ok: true,
      output: "published\\nauthorization: bearer ***REDACTED***",
    });
    expect(JSON.stringify(bubbles[0]?.toolResult)).not.toContain("confidential-token-12345");
    expect(JSON.stringify(bubbles[0]?.toolResult)).not.toContain("authorization: bearer confidential-token-12345");
  });
});
