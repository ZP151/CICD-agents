import { describe, expect, it } from "vitest";
import type { Bubble } from "../chat.types.js";
import { toAssistantUiThreadMessages } from "./mergepilotThreadMessages.js";

describe("toAssistantUiThreadMessages", () => {
  it("maps the existing transcript to assistant-ui roles without changing the SSE model", () => {
    const messages = toAssistantUiThreadMessages([
      { id: "user-1", kind: "user", text: "Check the pull request" },
      {
        id: "assistant-1",
        kind: "assistant",
        parts: [
          { type: "markdown", markdown: "I found one blocking check." },
          { type: "process_step", status: "done", label: "Fetched CI status" },
        ],
      },
    ] satisfies Bubble[]);

    expect(messages).toEqual([
      expect.objectContaining({ id: "user-1", role: "user", content: "Check the pull request" }),
      expect.objectContaining({
        id: "assistant-1",
        role: "assistant",
        content: "I found one blocking check.\n\nFetched CI status",
      }),
    ]);
  });

  it("models a pending MergePilot action as a standard tool approval", () => {
    const [message] = toAssistantUiThreadMessages([
      {
        id: "approval-1",
        kind: "pending_confirm",
        pendingTool: "git_push",
        pendingArgs: { remote: "origin", branch: "codex/desktop-workbench-ux" },
        pendingDescription: "Push the UX branch to origin",
        riskLevel: "high",
        pendingStatus: "waiting",
      },
    ] satisfies Bubble[]);

    expect(message).toMatchObject({
      id: "approval-1",
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "approval-1",
          toolName: "git_push",
          argsText: '{"remote":"origin","branch":"codex/desktop-workbench-ux"}',
          approval: {
            id: "approval-1",
            options: [
              { id: "approve", kind: "allow-once" },
              { id: "skip", kind: "reject-once" },
            ],
          },
        },
      ],
      metadata: {
        custom: {
          mergepilot: {
            riskLevel: "high",
            pendingDescription: "Push the UX branch to origin",
          },
        },
      },
    });
  });

  it("keeps tool errors machine-readable while retaining the local result", () => {
    const [message] = toAssistantUiThreadMessages([
      {
        id: "tool-1",
        kind: "tool",
        toolCallId: "call-1",
        toolName: "run_validation",
        toolArgs: { command: "pnpm test" },
        toolOk: false,
        toolSummary: "Validation failed",
        toolResult: { exitCode: 1 },
      },
    ] satisfies Bubble[]);

    expect(message).toMatchObject({
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "run_validation",
          isError: true,
          result: { exitCode: 1 },
        },
      ],
    });
  });
});
