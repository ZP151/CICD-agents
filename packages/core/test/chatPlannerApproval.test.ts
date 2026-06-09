import { describe, expect, it } from "vitest";
import { ChatPlanner } from "../src/chatPlanner.js";
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

async function runPlannerWithToolCall(tool: Tool, args: Record<string, unknown>) {
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
  for await (const event of planner.run("run tool", [], ".", async () => true)) {
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

  it.each([
    ["git_fetch", { remote: "origin", prune: true }, "medium"],
    ["git_commit", { message: "feat: test approval" }, "medium"],
    ["git_push", { branch: "feature/x" }, "high"],
    ["git_rebase", { onto: "origin/main", autostash: true }, "high"],
    ["ado_create_pr", { source_branch: "feature/x", title: "Test PR" }, "high"],
    ["ado_trigger_pipeline", { branch: "feature/x" }, "high"],
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
});
