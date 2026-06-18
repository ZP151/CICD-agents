import { describe, expect, it } from "vitest";
import { ChatPlanner } from "../src/chatPlanner.js";
import type { Tool } from "../src/tools/executor.js";
import {
  createToolExecutor,
  fakeSequenceLlm,
  runPlannerWithToolCall,
  unavailableLlm,
} from "./chatPlannerTestDoubles.js";

describe("ChatPlanner approval guards", () => {
  it("requires change inspection before approving direct git_add calls", async () => {
    const executor = createToolExecutor();
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
              name: "agent_final",
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
  ])("allows explicitly requested Azure DevOps approval-required tool calls for %s", async (
    name,
    args,
    message,
    riskLevel,
  ) => {
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
    const planner = new ChatPlanner(unavailableLlm(), createToolExecutor(), { maxSteps: 1 });
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
