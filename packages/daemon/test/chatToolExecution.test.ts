import { describe, expect, it } from "vitest";
import { ToolExecutor } from "@mergepilot/core";
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
});
