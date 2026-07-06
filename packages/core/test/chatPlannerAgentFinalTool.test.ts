import { describe, expect, it } from "vitest";
import { CHAT_FINAL_TOOL_NAME, ChatPlanner } from "../src/chatPlanner.js";
import {
  createToolExecutor,
  fakeSequenceLlm,
  fakeToolCallLlm,
} from "./chatPlannerTestDoubles.js";

describe("ChatPlanner agent_final tool finalization", () => {
  it("accepts structured finalization through the internal agent_final tool", async () => {
    const planner = new ChatPlanner(
      fakeToolCallLlm(CHAT_FINAL_TOOL_NAME, {
        response: "I found two modified files. Shall I stage them?",
        risk_level: "medium",
        actions_taken: ["git_status"],
        suggestions: [],
        sources: [
          {
            type: "source_document",
            title: "Chat.tsx",
            file: "apps/desktop/src/pages/Chat.tsx",
            line: 3590,
            snippet: "ConversationPartRenderer",
          },
          {
            type: "source_url",
            title: "AI SDK UIMessage",
            url: "https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message",
            domain: "ai-sdk.dev",
          },
        ],
        approval_proposal: {
          tool: "git_add",
          args: { paths: ["src/a.ts", "src/b.ts"] },
          description: "Stage selected files",
          nextHint: "commit",
        },
      }),
      createToolExecutor(),
      { maxSteps: 1 },
    );
    const events = [];

    for await (const event of planner.run("continue", [], ".", async () => true)) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "tool_start")).toBe(false);
    const control = events.find((event) => event.type === "assistant_control");
    const done = events.find((event) => event.type === "done");
    expect(control?.type).toBe("assistant_control");
    expect(done?.type).toBe("done");
    if (control?.type === "assistant_control") {
      expect(control.control.approvalProposal?.tool).toBe("git_add");
      expect(control.control.actionsTaken).toEqual(["git_status"]);
      expect(control.control.sources).toEqual([
        {
          type: "source_document",
          sourceId: "document-0",
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
    }
    if (done?.type === "done") {
      expect(done.result.response).toBe("I found two modified files. Shall I stage them?");
      expect(done.result.approvalProposal?.args).toEqual({ paths: ["src/a.ts", "src/b.ts"] });
      expect(done.result.finalizationMode).toBe("agent_final");
      expect(done.result.sources?.map((source) => source.type)).toEqual([
        "source_document",
        "source_url",
      ]);
    }
  });

  it("drops write approval proposals for review-only change requests", async () => {
    const planner = new ChatPlanner(
      fakeToolCallLlm(CHAT_FINAL_TOOL_NAME, {
        response: "I reviewed the modified files. Would you like me to stage these changes for a commit?",
        risk_level: "medium",
        actions_taken: ["git_status", "git_diff"],
        suggestions: [],
        approval_proposal: {
          tool: "git_add",
          args: {},
          description: "Stage all changes",
          nextHint: "commit",
        },
      }),
      createToolExecutor(),
      { maxSteps: 1 },
    );
    const events = [];

    for await (const event of planner.run("review my changes", [], ".", async () => true)) {
      events.push(event);
    }

    const control = events.find((event) => event.type === "assistant_control");
    const done = events.find((event) => event.type === "done");
    expect(control?.type).toBe("assistant_control");
    expect(done?.type).toBe("done");
    if (control?.type === "assistant_control") {
      expect(control.control.approvalProposal).toBeUndefined();
      expect(control.control.response).not.toContain("Would you like me to stage");
    }
    if (done?.type === "done") {
      expect(done.result.approvalProposal).toBeUndefined();
      expect(done.result.response).toBe("I reviewed the modified files.");
    }
  });

  it("drops binary media entries from structured final sources", async () => {
    const planner = new ChatPlanner(
      fakeToolCallLlm(CHAT_FINAL_TOOL_NAME, {
        response: "The project context is grounded in README.md.",
        risk_level: "low",
        actions_taken: [],
        suggestions: [],
        sources: [
          {
            type: "source_document",
            title: "README.md",
            file: "README.md",
            line: 1,
            snippet: "# ClaimBot API",
          },
          {
            type: "source_document",
            title: "otherClaims.png",
            file: "BotToSharePoint/images/icons/otherClaims.png",
            line: 1,
            snippet: "Static asset",
          },
        ],
      }),
      createToolExecutor(),
      { maxSteps: 1 },
    );
    const events = [];

    for await (const event of planner.run("explain architecture", [], ".", async () => true)) {
      events.push(event);
    }

    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.sources).toEqual([
        {
          type: "source_document",
          sourceId: "document-0",
          title: "README.md",
          file: "README.md",
          line: 1,
          snippet: "# ClaimBot API",
        },
      ]);
    }
  });

  it("nudges unfinished text turns toward agent_final before legacy fallback", async () => {
    const calls: Array<{ messages?: unknown[] }> = [];
    const planner = new ChatPlanner(
      fakeSequenceLlm(
        [
          [
            { type: "delta", delta: "I checked the workspace but did not finalize." },
            { type: "done", finishReason: "stop" },
          ],
          [
            {
              type: "tool_call",
              toolCalls: [
                {
                  id: "call_final",
                  name: CHAT_FINAL_TOOL_NAME,
                  arguments: JSON.stringify({
                    response: "I checked the workspace.",
                    risk_level: "low",
                    actions_taken: [],
                    suggestions: [],
                  }),
                },
              ],
            },
            { type: "done", finishReason: "tool_calls" },
          ],
        ],
        calls,
      ),
      createToolExecutor(),
      { maxSteps: 2 },
    );
    const events = [];

    for await (const event of planner.run("continue", [], ".", async () => true)) {
      events.push(event);
    }

    const secondCallMessages = calls[1]?.messages as
      | Array<{ role?: string; content?: unknown }>
      | undefined;
    const nudge = secondCallMessages?.findLast?.((message) => message.role === "user")?.content;
    expect(String(nudge)).toContain(`Call the ${CHAT_FINAL_TOOL_NAME} tool now`);
    expect(String(nudge)).not.toContain("Format: __CONTROL_JSON__");
    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe("I checked the workspace.");
      expect(done.result.finalizationMode).toBe("agent_final");
    }
  });

  it("passes image attachments to the model as multimodal user content", async () => {
    const calls: Array<{ messages?: unknown[] }> = [];
    const planner = new ChatPlanner(
      fakeSequenceLlm(
        [
          [
            {
              type: "tool_call",
              toolCalls: [
                {
                  id: "call_final",
                  name: CHAT_FINAL_TOOL_NAME,
                  arguments: JSON.stringify({
                    response: "I inspected the screenshot.",
                    risk_level: "low",
                    actions_taken: [],
                    suggestions: [],
                  }),
                },
              ],
            },
            { type: "done", finishReason: "tool_calls" },
          ],
        ],
        calls,
      ),
      createToolExecutor(),
      { maxSteps: 1 },
    );

    for await (const _event of planner.run(
      "What is visible here?",
      [],
      ".",
      async () => true,
      undefined,
      [
        {
          name: "screen.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
      ],
    )) {
      // Drain the planner stream.
    }

    const firstUserMessage = calls[0]?.messages?.findLast?.(
      (message) => (message as { role?: string }).role === "user",
    ) as { content?: unknown } | undefined;
    const content = firstUserMessage?.content as Array<{ type?: string; text?: string; image_url?: unknown }>;
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("Attached images: screen.png");
    expect(content[0]?.text).toContain("What is visible here?");
    expect(content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,aGVsbG8=", detail: "auto" },
    });
  });

  it("does not skip executable tools when agent_final appears in the same tool batch", async () => {
    let called = false;
    const executor = createToolExecutor();
    executor.register({
      name: "git_status",
      description: "Inspect repository state",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        called = true;
        return { ok: true, summary: "clean" };
      },
    });
    const planner = new ChatPlanner(
      fakeSequenceLlm([
        [
          {
            type: "tool_call",
            toolCalls: [
              {
                id: "call_final_ignored_until_tools_finish",
                name: CHAT_FINAL_TOOL_NAME,
                arguments: JSON.stringify({
                  response: "Premature final.",
                  risk_level: "low",
                  actions_taken: [],
                  suggestions: [],
                }),
              },
              {
                id: "call_probe",
                name: "git_status",
                arguments: "{}",
              },
            ],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
        [
          {
            type: "tool_call",
            toolCalls: [
              {
                id: "call_final",
                name: CHAT_FINAL_TOOL_NAME,
                arguments: JSON.stringify({
                  response: "Repository probe completed.",
                  risk_level: "low",
                  actions_taken: ["git_status"],
                  suggestions: [],
                }),
              },
            ],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
      ]),
      executor,
      { maxSteps: 2 },
    );
    const events = [];

    for await (const event of planner.run("continue", [], ".", async () => true)) {
      events.push(event);
    }

    expect(called).toBe(true);
    expect(events.some((event) => event.type === "tool_start" && event.name === "git_status")).toBe(
      true,
    );
    expect(events.some((event) => event.type === "progress")).toBe(true);
    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe("Repository probe completed.");
      expect(done.result.toolCallsMade).toEqual([{ name: "git_status", args: {}, ok: true }]);
    }
  });
});
