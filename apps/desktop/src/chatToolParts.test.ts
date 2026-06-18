import { describe, expect, it } from "vitest";
import {
  appendToolOutputDeltaToConversationParts,
  groupConsecutiveToolCallParts,
  primaryToolCallPart,
  toolApprovalPartFromSnapshot,
  toolCallPartFromSnapshot,
  upsertToolCallPart,
} from "./chatBubbles.js";

describe("tool conversation parts", () => {
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
          {
            type: "tool_call",
            toolCallId: "tool-1",
            toolName: "git_status",
            state: "input-streaming",
            input: undefined,
            output: undefined,
            summary: undefined,
          },
          {
            type: "tool_call",
            toolCallId: "tool-2",
            toolName: "git_diff",
            state: "input-streaming",
            input: undefined,
            output: undefined,
            summary: undefined,
          },
        ],
      },
      { type: "part", part: { type: "markdown", markdown: "after" } },
      {
        type: "tool_group",
        parts: [
          {
            type: "tool_call",
            toolCallId: "tool-3",
            toolName: "git_log",
            state: "input-streaming",
            input: undefined,
            output: undefined,
            summary: undefined,
          },
        ],
      },
    ]);
  });
});
