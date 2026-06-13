import { describe, expect, it } from "vitest";
import { CHAT_CONTROL_JSON_MARKER, CHAT_FINAL_TOOL_NAME, ChatPlanner } from "../src/chatPlanner.js";
import type { ChatStreamEvent, LLMClient } from "../src/llm.js";
import { ToolExecutor, type Tool } from "../src/tools/executor.js";

function fakeLlm(json: string): LLMClient {
  return {
    configured: true,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      yield { type: "delta", delta: json };
      yield { type: "done", finishReason: "stop" };
    },
  } as unknown as LLMClient;
}

function fakeChunkedLlm(chunks: string[]): LLMClient {
  return {
    configured: true,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      for (const chunk of chunks) yield { type: "delta", delta: chunk };
      yield { type: "done", finishReason: "stop" };
    },
  } as unknown as LLMClient;
}

function fakeToolCallLlm(name: string, args: Record<string, unknown>): LLMClient {
  return {
    configured: true,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      yield {
        type: "tool_call",
        toolCalls: [{ id: "call_1", name, arguments: JSON.stringify(args) }],
      };
      yield { type: "done", finishReason: "tool_calls" };
    },
  } as unknown as LLMClient;
}

function fakeStreamingToolCallLlm(name: string, argumentChunks: string[]): LLMClient {
  return {
    configured: true,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      let accumulated = "";
      for (const chunk of argumentChunks) {
        accumulated += chunk;
        yield {
          type: "tool_call_delta",
          toolCalls: [{ id: "call_1", name, arguments: accumulated }],
        };
      }
      yield {
        type: "tool_call",
        toolCalls: [{ id: "call_1", name, arguments: accumulated }],
      };
      yield { type: "done", finishReason: "tool_calls" };
    },
  } as unknown as LLMClient;
}

function fakeSequenceLlm(
  sequences: ChatStreamEvent[][],
  calls?: Array<{ messages?: unknown[] }>,
): LLMClient {
  let index = 0;
  return {
    configured: true,
    async *chatStream(opts: { messages?: unknown[] }): AsyncGenerator<ChatStreamEvent> {
      calls?.push({ messages: opts.messages });
      const events = sequences[index++] ?? [];
      for (const event of events) yield event;
    },
  } as unknown as LLMClient;
}

function unavailableLlm(): LLMClient {
  return {
    configured: false,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      throw new Error("chatStream should not be called when unconfigured");
    },
  } as unknown as LLMClient;
}

async function runPlanner(json: string) {
  const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
  const planner = new ChatPlanner(fakeLlm(json), executor, { maxSteps: 1 });
  const events = [];
  for await (const event of planner.run("continue", [], ".", async () => true)) {
    events.push(event);
  }
  const done = events.find((event) => event.type === "done");
  if (!done || done.type !== "done") throw new Error("missing done event");
  return done.result;
}

async function runPlannerWithToolCall(
  tool: Tool,
  args: Record<string, unknown>,
  message = "run tool",
) {
  let called = false;
  const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
  executor.register({
    ...tool,
    handler: async (ctx, payload) => {
      called = true;
      return tool.handler(ctx, payload);
    },
  });
  const planner = new ChatPlanner(fakeToolCallLlm(tool.name, args), executor, { maxSteps: 1 });
  const events = [];
  for await (const event of planner.run(message, [], ".", async () => true)) {
    events.push(event);
  }
  const done = events.find((event) => event.type === "done");
  if (!done || done.type !== "done") throw new Error("missing done event");
  return { called, result: done.result, events };
}

describe("ChatPlanner approval proposal parsing", () => {
  it("parses approval_proposal from the current JSON protocol", async () => {
    const result = await runPlanner(
      JSON.stringify({
        response: "Shall I stage everything?",
        risk_level: "medium",
        actions_taken: [],
        suggestions: [],
        approval_proposal: {
          tool: "git_add",
          args: {},
          description: "Stage all changes",
          nextHint: "commit",
        },
      }),
    );

    expect(result.approvalProposal?.tool).toBe("git_add");
    expect(result.approvalProposal?.description).toBe("Stage all changes");
  });

  it("streams only the response field, never structured planner JSON", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    const plannerJson = JSON.stringify({
      response: "I checked the project context.",
      risk_level: "low",
      actions_taken: [],
      suggestions: [],
    });
    const planner = new ChatPlanner(fakeLlm(plannerJson), executor, { maxSteps: 1 });
    const events = [];

    for await (const event of planner.run("understand project", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta)
      .join("");
    expect(deltas).toBe("I checked the project context.");
    expect(deltas).not.toContain("\"response\"");
    expect(deltas).not.toContain("risk_level");
    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe("I checked the project context.");
      expect(done.result.streamedResponse).toBe("I checked the project context.");
      expect(done.result.finalizationMode).toBe("plain_json");
    }
    const controlIndex = events.findIndex((event) => event.type === "assistant_control");
    const doneIndex = events.findIndex((event) => event.type === "done");
    expect(controlIndex).toBeGreaterThanOrEqual(0);
    expect(controlIndex).toBeLessThan(doneIndex);
    const control = events[controlIndex];
    if (control?.type === "assistant_control") {
      expect(control.control.response).toBe("I checked the project context.");
      expect(control.control.riskLevel).toBe("low");
    }
  });

  it("streams response text incrementally across JSON chunks", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    const chunks = [
      "{\"response\":\"Hel",
      "lo\\npro",
      "ject\",\"risk_level\":\"low\",\"actions_taken\":[],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeChunkedLlm(chunks), executor, { maxSteps: 1 });
    const deltas: string[] = [];

    for await (const event of planner.run("understand project", [], ".", async () => true)) {
      if (event.type === "assistant_delta") deltas.push(event.delta);
    }

    expect(deltas.join("")).toBe("Hello\nproject");
    expect(deltas.length).toBeGreaterThan(1);
  });

  it("streams response text from finalization tool-call argument deltas", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    const chunks = [
      "{\"response\":\"Hel",
      "lo from ",
      "agent final\",\"risk_level\":\"low\",\"actions_taken\":[],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeStreamingToolCallLlm(CHAT_FINAL_TOOL_NAME, chunks), executor, { maxSteps: 1 });
    const events = [];

    for await (const event of planner.run("understand project", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta);
    expect(deltas.join("")).toBe("Hello from agent final");
    expect(deltas.length).toBeGreaterThan(1);
    const firstDeltaIndex = events.findIndex((event) => event.type === "assistant_delta");
    const doneIndex = events.findIndex((event) => event.type === "done");
    expect(firstDeltaIndex).toBeGreaterThanOrEqual(0);
    expect(firstDeltaIndex).toBeLessThan(doneIndex);
    const done = events[doneIndex];
    if (done?.type !== "done") throw new Error("missing done");
    expect(done.result.response).toBe("Hello from agent final");
    expect(done.result.streamedResponse).toBe("Hello from agent final");
    expect(done.result.finalizationMode).toBe("agent_final");
  });

  it("streams visible prose before the control JSON marker", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    const chunks = [
      "I checked ",
      "the project.",
      `\n${CHAT_CONTROL_JSON_MARKER}`,
      "{\"response\":\"I checked the project.\",\"risk_level\":\"low\",\"actions_taken\":[\"repo_refresh_index\"],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeChunkedLlm(chunks), executor, { maxSteps: 1 });
    const events = [];

    for await (const event of planner.run("understand project", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta)
      .join("");
    expect(deltas).toBe("I checked the project.\n");
    expect(deltas).not.toContain(CHAT_CONTROL_JSON_MARKER);
    expect(deltas).not.toContain("risk_level");

    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe("I checked the project.");
      expect(done.result.actionsTaken).toEqual(["repo_refresh_index"]);
      expect(done.result.finalizationMode).toBe("control_marker");
    }
  });

  it("does not leak partial control marker chunks into visible prose", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    const chunks = [
      "Ready.",
      "\n__CON",
      "TROL_JSON__",
      "{\"response\":\"Ready.\",\"risk_level\":\"low\",\"actions_taken\":[],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeChunkedLlm(chunks), executor, { maxSteps: 1 });
    const deltas: string[] = [];

    for await (const event of planner.run("continue", [], ".", async () => true)) {
      if (event.type === "assistant_delta") deltas.push(event.delta);
    }

    expect(deltas.join("")).toBe("Ready.\n");
  });

  it("keeps legacy pending_action output as parser fallback", async () => {
    const result = await runPlanner(
      JSON.stringify({
        response: "Shall I push this branch?",
        risk_level: "high",
        actions_taken: [],
        suggestions: [],
        pending_action: {
          tool: "git_push",
          args: { branch: "feature/x" },
          description: "Push branch",
        },
      }),
    );

    expect(result.approvalProposal?.tool).toBe("git_push");
    expect(result.approvalProposal?.args).toEqual({ branch: "feature/x" });
  });

  it("accepts structured finalization through the internal agent_final tool", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
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
      executor,
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
      expect(done.result.sources?.map((source) => source.type)).toEqual(["source_document", "source_url"]);
    }
  });

  it("nudges unfinished text turns toward agent_final before legacy fallback", async () => {
    const calls: Array<{ messages?: unknown[] }> = [];
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    const planner = new ChatPlanner(
      fakeSequenceLlm([
        [
          { type: "delta", delta: "I checked the workspace but did not finalize." },
          { type: "done", finishReason: "stop" },
        ],
        [
          {
            type: "tool_call",
            toolCalls: [{
              id: "call_final",
              name: CHAT_FINAL_TOOL_NAME,
              arguments: JSON.stringify({
                response: "I checked the workspace.",
                risk_level: "low",
                actions_taken: [],
                suggestions: [],
              }),
            }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
      ], calls),
      executor,
      { maxSteps: 2 },
    );
    const events = [];

    for await (const event of planner.run("continue", [], ".", async () => true)) {
      events.push(event);
    }

    const secondCallMessages = calls[1]?.messages as Array<{ role?: string; content?: unknown }> | undefined;
    const nudge = secondCallMessages?.findLast?.((message) => message.role === "user")?.content;
    expect(String(nudge)).toContain(`Call the ${CHAT_FINAL_TOOL_NAME} tool now`);
    expect(String(nudge)).not.toContain(`Format: ${CHAT_CONTROL_JSON_MARKER}`);
    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe("I checked the workspace.");
      expect(done.result.finalizationMode).toBe("agent_final");
    }
  });

  it("does not skip executable tools when agent_final appears in the same tool batch", async () => {
    let called = false;
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
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
            toolCalls: [{
              id: "call_final",
              name: CHAT_FINAL_TOOL_NAME,
              arguments: JSON.stringify({
                response: "Repository probe completed.",
                risk_level: "low",
                actions_taken: ["git_status"],
                suggestions: [],
              }),
            }],
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
    expect(events.some((event) => event.type === "tool_start" && event.name === "git_status")).toBe(true);
    expect(events.some((event) => event.type === "progress")).toBe(true);
    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe("Repository probe completed.");
      expect(done.result.toolCallsMade).toEqual([
        { name: "git_status", args: {}, ok: true },
      ]);
    }
  });

  it("requires change inspection before approving direct git_add calls", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    executor.register({
      name: "git_add",
      description: "Stage files",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    });
    const planner = new ChatPlanner(
      fakeSequenceLlm([
        [
          {
            type: "tool_call",
            toolCalls: [{
              id: "call_add",
              name: "git_add",
              arguments: "{}",
            }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
        [
          {
            type: "tool_call",
            toolCalls: [{
              id: "call_final",
              name: CHAT_FINAL_TOOL_NAME,
              arguments: JSON.stringify({
                response: "I need to inspect the current diff before staging anything.",
                risk_level: "low",
                actions_taken: [],
                suggestions: [],
              }),
            }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
      ]),
      executor,
      { maxSteps: 2 },
    );
    const events = [];

    for await (const event of planner.run("stage changes, commit and push", [], ".", async () => true)) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "tool_start" && event.name === "git_add")).toBe(false);
    expect(events.some((event) => event.type === "progress" && event.message.includes("git_status"))).toBe(true);
    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.approvalProposal).toBeUndefined();
      expect(done.result.response).toContain("inspect the current diff");
    }
  });

  it.each([
    ["git_fetch", { remote: "origin", prune: true }, "medium"],
    ["git_commit", { message: "feat: test approval" }, "medium"],
    ["git_push", { branch: "feature/x" }, "high"],
    ["git_rebase", { onto: "origin/main", autostash: true }, "high"],
  ])("blocks direct approval-required tool calls for %s", async (name, args, riskLevel) => {
    const tool: Tool = {
      name,
      description: `Execute ${name}`,
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    };

    const { called, result, events } = await runPlannerWithToolCall(tool, args);

    expect(called).toBe(false);
    expect(events.some((event) => event.type === "tool_start")).toBe(false);
    expect(result.riskLevel).toBe(riskLevel);
    expect(result.approvalProposal).toEqual({
      tool: name,
      args,
      description: `Execute ${name}`,
      nextHint: "continue workflow",
    });
    expect(result.response).toContain("requires approval");
  });

  it.each([
    ["ado_create_pr", { source_branch: "feature/x", title: "Test PR" }, "create a PR", "high"],
    ["ado_trigger_pipeline", { branch: "feature/x" }, "trigger the pipeline", "high"],
  ])("allows explicitly requested Azure DevOps approval-required tool calls for %s", async (name, args, message, riskLevel) => {
    const tool: Tool = {
      name,
      description: `Execute ${name}`,
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    };

    const { called, result, events } = await runPlannerWithToolCall(tool, args, message);

    expect(called).toBe(false);
    expect(events.some((event) => event.type === "tool_start")).toBe(false);
    expect(result.riskLevel).toBe(riskLevel);
    expect(result.approvalProposal).toEqual({
      tool: name,
      args,
      description: `Execute ${name}`,
      nextHint: "continue workflow",
    });
    expect(result.response).toContain("requires approval");
  });

  it("blocks out-of-scope Azure DevOps write actions", async () => {
    const tool: Tool = {
      name: "ado_create_pr",
      description: "Create pull request",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    };

    const { called, result } = await runPlannerWithToolCall(
      tool,
      { source_branch: "feature/x", title: "Test PR" },
      "stage changes, commit and push",
    );

    expect(called).toBe(false);
    expect(result.approvalProposal).toBeUndefined();
    expect(result.response).toContain("does not include creating a pull request");
  });

  it("does not turn offline fallback into a deterministic Git workflow plan", async () => {
    const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
    const planner = new ChatPlanner(unavailableLlm(), executor, { maxSteps: 1 });
    const events = [];

    for await (const event of planner.run("push and create PR for branch feature/chat-agent", [], ".", async () => true)) {
      events.push(event);
    }

    const done = events.find((event) => event.type === "done");
    if (!done || done.type !== "done") throw new Error("missing done event");

    expect(done.result.usedLlm).toBe(false);
    expect(done.result.toolCallsMade).toEqual([]);
    expect(done.result.actionsTaken).toEqual([]);
    expect(done.result.approvalProposal).toBeUndefined();
    expect(done.result.response).toContain("did not infer or execute a Git/PR workflow");
    expect(done.result.response).not.toContain("git_push");
    expect(done.result.response).not.toContain("ado_create_pr");
    expect(done.result.suggestions).toEqual([
      "Review changes",
      "Check branch status",
      "Restore model connection",
    ]);
  });
});
